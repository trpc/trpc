import * as Effect from "../../Effect.ts"
import { identity } from "../../Function.ts"
import * as Stream from "../../Stream.ts"
import type * as Headers from "../Headers.ts"
import * as HttpBody from "../HttpBody.ts"
import type { Compression, CompressionAlgorithm, CompressionOptions } from "../HttpPlatform.ts"
import * as Response from "../HttpServerResponse.ts"

/**
 * @internal
 */
export const varyWith = (headers: Headers.Headers, dimension: string): string => {
  const vary = headers["vary"]
  if (vary === undefined) {
    return dimension
  }
  const members = vary.split(",").map((member) => member.trim().toLowerCase())
  return members.includes("*") || members.includes(dimension.toLowerCase()) ? vary : `${vary}, ${dimension}`
}

/**
 * @internal
 */
export const wrapCompression = (impl: Compression): Compression => ({
  algorithms: impl.algorithms,
  compressResponse(response, algorithm, options) {
    return Effect.map(impl.compressResponse(response, algorithm, options), (compressed) => {
      if (compressed === response) {
        return response
      }
      const headers: Record<string, string> = {
        "content-encoding": algorithm,
        vary: varyWith(compressed.headers, "Accept-Encoding")
      }
      const etag = compressed.headers["etag"]
      if (etag !== undefined && !etag.startsWith("W/")) {
        headers["etag"] = `W/${etag}`
      }
      return Response.setHeaders(compressed, headers)
    })
  }
})

/**
 * @internal
 */
export const compressionTransformWeb =
  (format: string) => (stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> =>
    stream.pipeThrough(
      new CompressionStream(format as CompressionFormat) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
    )

/**
 * @internal
 */
export const setBodyWithoutLength = (
  response: Response.HttpServerResponse,
  body: HttpBody.HttpBody
): Response.HttpServerResponse => Response.removeHeader(Response.setBody(response, body), "content-length")

/**
 * @internal
 */
export const makeCompressionWeb = (options: {
  readonly algorithms: Iterable<CompressionAlgorithm>
  readonly transform: (
    algorithm: CompressionAlgorithm,
    options?: CompressionOptions | undefined
  ) => (stream: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>
}): Compression => ({
  algorithms: new Set(options.algorithms),
  compressResponse(response, algorithm, opts) {
    const body = response.body
    switch (body._tag) {
      case "Uint8Array": {
        const data = body.body
        return Effect.succeed(streamBody(
          response,
          () => options.transform(algorithm, opts)(singleChunkStream(data)),
          response.headers["content-type"] ?? body.contentType
        ))
      }
      case "Stream": {
        const stream = body.stream
        return Effect.succeed(streamBody(
          response,
          () => options.transform(algorithm, opts)(Stream.toReadableStream(stream)),
          response.headers["content-type"] ?? body.contentType
        ))
      }
      case "Raw": {
        const readable = rawReadableStream(body.body)
        if (readable === undefined) {
          return Effect.succeed(response)
        }
        return Effect.succeed(setBodyWithoutLength(
          response,
          HttpBody.raw(options.transform(algorithm, opts)(readable), {
            contentType: response.headers["content-type"] ?? body.contentType
          })
        ))
      }
      default: {
        return Effect.succeed(response)
      }
    }
  }
})

const streamBody = (
  response: Response.HttpServerResponse,
  evaluate: () => ReadableStream<Uint8Array>,
  contentType: string | undefined
): Response.HttpServerResponse =>
  setBodyWithoutLength(
    response,
    HttpBody.stream(Stream.fromReadableStream({ evaluate, onError: identity }), contentType)
  )

const singleChunkStream = (data: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    }
  })

const rawReadableStream = (raw: unknown): ReadableStream<Uint8Array> | undefined => {
  if (typeof ReadableStream !== "undefined" && raw instanceof ReadableStream) {
    return raw
  } else if (raw instanceof globalThis.Response) {
    return raw.body ?? undefined
  }
  return new globalThis.Response(raw as BodyInit).body ?? undefined
}

/**
 * @internal
 */
export const compressionWeb: Compression = makeCompressionWeb({
  algorithms: ["gzip", "deflate"],
  transform: (algorithm) => compressionTransformWeb(algorithm)
})

/**
 * @internal
 */
export const defaultCompressible = (contentType: string): boolean => {
  const semi = contentType.indexOf(";")
  const type = (semi === -1 ? contentType : contentType.slice(0, semi)).trim().toLowerCase()
  if (type.startsWith("text/")) {
    return true
  }
  switch (type) {
    case "application/json":
    case "application/javascript":
    case "application/xml":
    case "image/svg+xml":
    case "application/wasm": {
      return true
    }
  }
  return type.endsWith("+json") || type.endsWith("+xml")
}

const acceptMember = /^([a-z0-9!#$%&'*+.^_`|~-]+)(?:;q=(0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?))?$/

/**
 * @internal
 */
export const parseAcceptEncoding = (header: string): ReadonlyMap<string, number> | undefined => {
  const trimmed = header.trim()
  if (trimmed === "") {
    return undefined
  }
  const accepted = new Map<string, number>()
  for (const part of trimmed.split(",")) {
    const member = part.trim().toLowerCase().replace(/[ \t]*;[ \t]*/g, ";")
    const match = acceptMember.exec(member)
    if (match === null) {
      return undefined
    }
    accepted.set(match[1], match[2] === undefined ? 1 : Number(match[2]))
  }
  return accepted
}

/**
 * @internal
 */
export const negotiate = (
  header: string | undefined,
  preferred: ReadonlyArray<CompressionAlgorithm>,
  supported: ReadonlySet<CompressionAlgorithm>
): CompressionAlgorithm | undefined => {
  if (header === undefined) {
    return undefined
  }
  const accepted = parseAcceptEncoding(header)
  if (accepted === undefined) {
    return undefined
  }
  for (const algorithm of preferred) {
    if (!supported.has(algorithm)) {
      continue
    }
    const quality = accepted.get(algorithm) ?? accepted.get("*")
    if (quality !== undefined && quality > 0) {
      return algorithm
    }
  }
  return undefined
}
