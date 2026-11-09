import * as ByteSize from "../../ByteSize.ts"
import * as Effect from "../../Effect.ts"
import * as Inspectable from "../../Inspectable.ts"
import type * as Option from "../../Option.ts"
import type { ReadonlyRecord } from "../../Record.ts"
import type * as Schema from "../../Schema.ts"
import type * as Socket from "../../socket/Socket.ts"
import * as Stream from "../../Stream.ts"
import * as Headers from "../Headers.ts"
import * as HttpIncomingMessage from "../HttpIncomingMessage.ts"
import { HttpServerError, RequestParseError } from "../HttpServerError.ts"
import * as HttpServerRequest from "../HttpServerRequest.ts"
import * as Multipart from "../Multipart.ts"
import * as UrlParams from "../UrlParams.ts"
import * as lazyStream from "./lazyStream.ts"
import * as internalUrlParams from "./urlParams.ts"

/**
 * @internal
 */
export type Coding = "gzip" | "deflate"

const defaultMaxDecompressedSize = ByteSize.mebibytes(10)

/**
 * Parses a `Content-Encoding` header into the codings to undo, in the order
 * they were applied. `identity` members are dropped. Returns `undefined` if
 * any member is unsupported.
 *
 * @internal
 */
export const parseContentEncoding = (header: string): ReadonlyArray<Coding> | undefined => {
  const codings: Array<Coding> = []
  for (const member of header.split(",")) {
    const coding = member.trim().toLowerCase()
    if (coding === "" || coding === "identity") continue
    if (coding !== "gzip" && coding !== "deflate") return undefined
    codings.push(coding)
  }
  return codings
}

/**
 * Wraps a request so that its body accessors yield the decompressed body.
 * Decompression happens lazily, when a body accessor is read.
 *
 * @internal
 */
export class DecompressedRequest extends Inspectable.Class implements HttpServerRequest.HttpServerRequest {
  readonly [HttpServerRequest.TypeId]: typeof HttpServerRequest.TypeId
  readonly [HttpIncomingMessage.TypeId]: typeof HttpIncomingMessage.TypeId
  readonly inner: HttpServerRequest.HttpServerRequest
  readonly codings: ReadonlyArray<Coding>
  readonly maxDecompressedSize: ByteSize.ByteSize | undefined
  readonly headers: Headers.Headers

  constructor(
    inner: HttpServerRequest.HttpServerRequest,
    codings: ReadonlyArray<Coding>,
    maxDecompressedSize: ByteSize.ByteSize | undefined
  ) {
    super()
    this[HttpServerRequest.TypeId] = HttpServerRequest.TypeId
    this[HttpIncomingMessage.TypeId] = HttpIncomingMessage.TypeId
    this.inner = inner
    this.codings = codings
    this.maxDecompressedSize = maxDecompressedSize
    this.headers = Headers.removeMany(inner.headers, ["content-encoding", "content-length"])
  }

  toJSON(): unknown {
    return HttpIncomingMessage.inspect(this, {
      _id: "HttpServerRequest",
      method: this.method,
      url: this.originalUrl
    })
  }

  modify(
    options: {
      readonly url?: string
      readonly headers?: Headers.Headers
      readonly remoteAddress?: Option.Option<string>
      readonly peerAddress?: Option.Option<string>
      readonly protocol?: "http" | "https"
    }
  ): HttpServerRequest.HttpServerRequest {
    return new DecompressedRequest(this.inner.modify(options), this.codings, this.maxDecompressedSize)
  }

  get source(): object {
    return this.inner.source
  }

  get url(): string {
    return this.inner.url
  }

  get originalUrl(): string {
    return this.inner.originalUrl
  }

  get method(): string {
    return this.inner.method
  }

  get cookies(): ReadonlyRecord<string, string> {
    return this.inner.cookies
  }

  get remoteAddress(): Option.Option<string> {
    return this.inner.remoteAddress
  }

  get peerAddress(): Option.Option<string> {
    return this.inner.peerAddress
  }

  get protocol(): "http" | "https" | undefined {
    return this.inner.protocol
  }

  get upgrade(): Effect.Effect<Socket.Socket, HttpServerError> {
    return this.inner.upgrade
  }

  upgradeWith(
    options: { readonly headers?: Headers.Input | undefined }
  ): Effect.Effect<Socket.Socket, HttpServerError> {
    return this.inner.upgradeWith(options)
  }

  // Platform accessors such as `NodeHttpServerRequest.toServerResponse` read
  // the response handle from the request.
  get response(): unknown {
    return (this.inner as any).response
  }

  get stream(): Stream.Stream<Uint8Array, HttpServerError> {
    // Read the inner body only once the decompressed body is pulled.
    return lazyStream.openOnFirstPull(Stream.unwrap(Effect.withFiber((fiber) => {
      const limit = this.maxDecompressedSize ?? fiber.getRef(HttpIncomingMessage.MaxBodySize) ??
        defaultMaxDecompressedSize
      return Effect.succeed(Stream.fromReadableStream({
        evaluate: () => {
          let body = Stream.toReadableStreamWith(this.inner.stream, fiber.context)
          for (let i = this.codings.length - 1; i >= 0; i--) {
            body = body.pipeThrough(
              new DecompressionStream(this.codings[i]) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
            )
          }
          let size = 0
          return body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform: (chunk, controller) => {
                size += chunk.byteLength
                if (size > limit) {
                  controller.error(
                    this.parseError(undefined, `Decompressed request body exceeds ${limit} bytes`, "BodyTooLarge")
                  )
                } else {
                  controller.enqueue(chunk)
                }
              }
            })
          )
        },
        onError: (cause) => cause instanceof HttpServerError ? cause : this.parseError(cause)
      }))
    })))
  }

  private bytesEffect: Effect.Effect<Uint8Array, HttpServerError> | undefined
  private get bytes(): Effect.Effect<Uint8Array, HttpServerError> {
    return this.bytesEffect ??= Effect.runSync(Effect.cached(Stream.mkUint8Array(this.stream)))
  }

  get text(): Effect.Effect<string, HttpServerError> {
    return Effect.map(this.bytes, (bytes) => textDecoder.decode(bytes))
  }

  get json(): Effect.Effect<Schema.Json, HttpServerError> {
    return Effect.flatMap(this.text, (text) =>
      Effect.try({
        try: () => text === "" ? null : JSON.parse(text) as Schema.Json,
        catch: (cause) => this.parseError(cause)
      }))
  }

  get urlParamsBody(): Effect.Effect<UrlParams.UrlParams, HttpServerError> {
    return Effect.flatMap(this.bytes, (bytes) =>
      Effect.try({
        try: () => UrlParams.fromInput(internalUrlParams.fromBody(bytes)),
        catch: (cause) => this.parseError(cause)
      }))
  }

  get arrayBuffer(): Effect.Effect<ArrayBuffer, HttpServerError> {
    return Effect.map(
      this.bytes,
      (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    )
  }

  get multipartStream(): Stream.Stream<Multipart.Part, Multipart.MultipartError> {
    return Stream.pipeThroughChannel(
      Stream.mapError(this.stream, (cause) =>
        // Failures raised by this request come from the client's data. Failures
        // passed through from the inner request are transport errors.
        Multipart.MultipartError.fromReason(
          cause.reason instanceof RequestParseError && cause.reason.request === this
            ? cause.reason.reason ?? "Parse"
            : "InternalError",
          cause
        )),
      Multipart.makeChannel(this.headers)
    )
  }

  private multipartEffect: HttpServerRequest.HttpServerRequest["multipart"] | undefined
  get multipart(): HttpServerRequest.HttpServerRequest["multipart"] {
    return this.multipartEffect ??= Effect.runSync(Effect.cached(Multipart.toPersisted(this.multipartStream)))
  }

  private parseError(
    cause: unknown,
    description?: string,
    reason: RequestParseError["reason"] = "Parse"
  ): HttpServerError {
    return new HttpServerError({
      reason: new RequestParseError({
        request: this,
        reason,
        ...(description === undefined ? undefined : { description }),
        ...(cause === undefined ? undefined : { cause })
      })
    })
  }
}

const textDecoder = new TextDecoder()
