/**
 * Node.js implementation of the Effect HTTP platform service.
 *
 * This module connects the portable `HttpPlatform` file response helpers to
 * Node runtime primitives. It serves local files through Node readable streams,
 * supports byte ranges, converts Web `File` values to readable streams, and
 * fills in content type and content length headers when needed.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as NodeHttpCompression from "@effect/platform-node-shared/NodeHttpCompression"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as EtagImpl from "effect/http/Etag"
import * as Headers from "effect/http/Headers"
import * as HttpBody from "effect/http/HttpBody"
import * as Platform from "effect/http/HttpPlatform"
import * as ServerResponse from "effect/http/HttpServerResponse"
import * as Mime from "effect/http/Mime"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Fs from "node:fs"
import { pipeline, Readable } from "node:stream"
import * as NodeFileSystem from "./NodeFileSystem.ts"
import * as NodeStream from "./NodeStream.ts"

// Keep the native Raw/pipeline path without opening discarded response bodies.
const lazyReadable = (evaluate: () => Readable, onDestroy?: () => void): Readable => {
  let source: Readable | undefined
  return new Readable({
    read() {
      if (source === undefined) {
        try {
          source = evaluate()
        } catch (cause) {
          this.destroy(cause instanceof Error ? cause : new Error(String(cause)))
          return
        }
        source.on("data", (chunk) => {
          if (!this.push(chunk)) source!.pause()
        })
        source.once("end", () => this.push(null))
        source.once("error", (cause) => this.destroy(cause))
        source.once("close", () => {
          if (!source!.readableEnded) this.destroy(new Error("Response stream closed prematurely"))
        })
      }
      source.resume()
    },
    destroy(error, callback) {
      source?.destroy(error ?? undefined)
      onDestroy?.()
      callback(error)
    }
  })
}

// replaces the response body while keeping every other field, dropping the
// now-stale Content-Length header
const compressedBody = (
  response: ServerResponse.HttpServerResponse,
  body: HttpBody.HttpBody
): ServerResponse.HttpServerResponse =>
  ServerResponse.removeHeader(ServerResponse.setBody(response, body), "content-length")

const compression = NodeHttpCompression.make({
  algorithms: NodeHttpCompression.algorithms,
  compressResponse(response, algorithm, options) {
    const body = response.body
    switch (body._tag) {
      case "Stream": {
        return Effect.succeed(compressedBody(
          response,
          HttpBody.stream(
            NodeStream.pipeThroughDuplex(body.stream, {
              evaluate: () => NodeHttpCompression.compressTransform(algorithm, options)
            }),
            response.headers["content-type"] ?? body.contentType
          )
        ))
      }
      case "Raw": {
        let readable = body.body instanceof Readable ? body.body : undefined
        const compressed = lazyReadable(() => {
          const transform = NodeHttpCompression.compressTransform(algorithm, options)
          readable ??= Readable.fromWeb(new Response(body.body as BodyInit).body as any)
          return pipeline(readable, transform, (cause) => {
            if (cause) compressed.destroy(cause)
          })
        }, () => readable?.destroy())
        return Effect.succeed(
          compressedBody(
            response,
            HttpBody.raw(compressed, {
              contentType: response.headers["content-type"] ?? body.contentType
            })
          )
        )
      }
      default: {
        return Effect.succeed(response)
      }
    }
  }
})

/**
 * Creates the Node `HttpPlatform`, serving file responses from Node readable
 * streams and adding MIME type and content-length headers when needed.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Platform.make({
  platform: "node",
  compression,
  fileResponse(path, status, statusText, headers, start, end, contentLength) {
    const stream = lazyReadable(() =>
      contentLength === BigInt(0)
        ? Readable.from([])
        : Fs.createReadStream(path, { start, end: end === undefined ? undefined : end - 1 })
    )
    return ServerResponse.raw(stream, {
      headers: {
        ...headers,
        "content-type": headers["content-type"] ??
          Option.getOrElse(Mime.getType(path), () => "application/octet-stream"),
        "content-length": contentLength.toString()
      },
      status,
      statusText
    })
  },
  fileWebResponse(file, status, statusText, headers, _options) {
    return ServerResponse.raw(
      lazyReadable(() => Readable.fromWeb(file.stream() as any)),
      {
        headers: Headers.merge(
          headers,
          Headers.fromRecordUnsafe({
            "content-type": headers["content-type"] ??
              (file.type === ""
                ? Option.getOrElse(Mime.getType(file.name), () => "application/octet-stream")
                : file.type),
            "content-length": file.size.toString()
          })
        ),
        status,
        statusText
      }
    )
  }
})

/**
 * Provides the Node `HttpPlatform` together with the filesystem and ETag
 * services it needs for file responses.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Platform.HttpPlatform> = pipe(
  Layer.effect(Platform.HttpPlatform)(make),
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(EtagImpl.layer)
)
