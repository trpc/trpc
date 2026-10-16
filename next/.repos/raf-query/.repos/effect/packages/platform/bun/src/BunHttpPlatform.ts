/**
 * Bun implementation of the Effect HTTP platform service.
 *
 * This module provides one `layer` for `HttpPlatform`. It implements file
 * responses with `Bun.file`, supports sliced file responses for byte ranges,
 * and returns Web `File` values as raw HTTP server responses. The layer also
 * provides the Bun file-system layer and ETag generator required by
 * `HttpPlatform`.
 *
 * @since 4.0.0
 */
import * as NodeHttpCompression from "@effect/platform-node-shared/NodeHttpCompression"
import type * as Effect from "effect/Effect"
import type { FileSystem } from "effect/FileSystem"
import * as Etag from "effect/http/Etag"
import * as Platform from "effect/http/HttpPlatform"
import * as Response from "effect/http/HttpServerResponse"
import * as Layer from "effect/Layer"
import * as BunFileSystem from "./BunFileSystem.ts"

// Bun's CompressionStream supports an extended format set covering brotli and
// zstd
const compression = NodeHttpCompression.make(Platform.makeCompressionWeb({
  algorithms: ["gzip", "deflate", "br", "zstd"],
  transform: (algorithm) => Platform.compressionTransformWeb(algorithm === "br" ? "brotli" : algorithm)
}))

/**
 * @category constructors
 * @since 4.0.0
 */
const make: Effect.Effect<
  Platform.HttpPlatform["Service"],
  never,
  FileSystem | Etag.Generator
> = Platform.make({
  platform: "bun",
  compression,
  fileResponse(path, status, statusText, headers, start, end, contentLength) {
    let file = Bun.file(path)
    if (start > 0 || end !== undefined) {
      file = file.slice(start, end)
    }
    return Response.raw(file, {
      headers: { ...headers, "content-length": contentLength.toString() },
      status,
      statusText
    })
  },
  fileWebResponse(file, status, statusText, headers, options) {
    const start = options?.offset ?? 0
    const end = options?.bytesToRead !== undefined ? start + options.bytesToRead : undefined
    const body = start > 0 || end !== undefined
      ? (file as File).slice(start, end, file.type)
      : file
    return Response.raw(body, { headers, status, statusText })
  }
})

/**
 * Layer that provides the Bun `HttpPlatform`, including file responses backed by `Bun.file`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = Layer.effect(Platform.HttpPlatform)(make).pipe(
  Layer.provide(BunFileSystem.layer),
  Layer.provide(Etag.layer)
)
