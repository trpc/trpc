/**
 * Deno implementation of the Effect HTTP platform service.
 *
 * File responses use `Deno.FsFile.readable` directly so full-file responses
 * retain Deno's resource-backed fast path. Deno closes the file after the body
 * is sent, but server adapters must cancel a raw body when they do not send it,
 * including when handling `HEAD` requests.
 *
 * The provided layer uses strong ETags, unlike the portable `HttpPlatform`
 * layer, which uses weak ETags.
 *
 * @since 4.0.0
 */
import * as NodeHttpCompression from "@effect/platform-node-shared/NodeHttpCompression"
import { contentType } from "@std/media-types"
import { extname } from "@std/path"
import { ByteSliceStream } from "@std/streams"
import * as Etag from "effect/http/Etag"
import * as Platform from "effect/http/HttpPlatform"
import * as Response from "effect/http/HttpServerResponse"
import * as Layer from "effect/Layer"
import * as DenoFileSystem from "./DenoFileSystem.ts"

// gzip and deflate use the native CompressionStream, which does not expose a
// per-chunk flush control. br and zstd go through node:zlib compatibility
// streams and flush each input chunk.
const compression = NodeHttpCompression.make(Platform.makeCompressionWeb({
  algorithms: NodeHttpCompression.algorithms,
  transform: (algorithm, options) =>
    algorithm === "gzip" || algorithm === "deflate"
      ? Platform.compressionTransformWeb(algorithm)
      : NodeHttpCompression.compressTransformWeb(algorithm, options)
}))

/**
 * Creates the Deno `HttpPlatform`, serving file responses from resource-backed
 * readable streams and adding content type and content length headers.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = Platform.make({
  platform: "deno",
  compression,
  fileResponse(path, status, statusText, headers, start, end, contentLength) {
    let body: ReadableStream<Uint8Array>
    if (contentLength === BigInt(0)) {
      body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close()
        }
      })
    } else {
      const file = Deno.openSync(path)
      file.seekSync(start, Deno.SeekMode.Start)
      body = end === undefined
        ? file.readable
        : file.readable.pipeThrough(new ByteSliceStream(0, end - start - 1))
    }
    return Response.raw(body, {
      headers: {
        ...headers,
        "content-type": headers["content-type"] ?? contentType(extname(path)) ?? "application/octet-stream",
        "content-length": contentLength.toString()
      },
      status,
      statusText
    })
  },
  fileWebResponse(file, status, statusText, headers, options) {
    const offset = options?.offset ?? 0
    const available = Math.max(0, file.size - offset)
    const contentLength = options?.bytesToRead === undefined
      ? available
      : Math.min(available, Math.max(0, options.bytesToRead))
    let body: typeof file | ReadableStream<Uint8Array> = file
    if (contentLength === 0) {
      body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close()
        }
      })
    } else if (offset > 0 || options?.bytesToRead !== undefined) {
      body = (file.stream() as ReadableStream<Uint8Array>).pipeThrough(
        new ByteSliceStream(offset, offset + contentLength - 1)
      )
    }
    return Response.raw(body, {
      headers: {
        ...headers,
        "content-type": headers["content-type"] ??
          (file.type === "" ? contentType(extname(file.name)) ?? "application/octet-stream" : file.type),
        "content-length": contentLength.toString()
      },
      status,
      statusText
    })
  }
})

/**
 * Provides the Deno `HttpPlatform` together with its filesystem and strong ETag
 * services.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Platform.HttpPlatform> = Layer.effect(Platform.HttpPlatform)(make).pipe(
  Layer.provide(DenoFileSystem.layer),
  Layer.provide(Etag.layer)
)
