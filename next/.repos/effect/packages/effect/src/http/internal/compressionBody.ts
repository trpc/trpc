import * as Effect from "../../Effect.ts"
import { identity } from "../../Function.ts"
import * as Stream from "../../Stream.ts"
import * as HttpBody from "../HttpBody.ts"
import type { CompressionAlgorithm, CompressionOptions } from "../HttpClientRequest.ts"

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
export const singleChunkStream = (data: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    }
  })

/**
 * @internal
 */
export const compressBody = (
  body: HttpBody.HttpBody,
  algorithm: CompressionAlgorithm,
  options?: CompressionOptions | undefined
): Effect.Effect<HttpBody.HttpBody> => {
  if (body._tag !== "Uint8Array" && body._tag !== "Stream") {
    return Effect.succeed(body)
  }
  if (body.contentLength !== undefined && body.contentLength < (options?.minSize ?? 1024)) {
    return Effect.succeed(body)
  }
  if (body._tag === "Uint8Array") {
    return Effect.map(
      Effect.promise(() =>
        new globalThis.Response(compressionTransformWeb(algorithm)(singleChunkStream(body.body))).arrayBuffer()
      ),
      (buffer) => HttpBody.uint8Array(new Uint8Array(buffer), body.contentType)
    )
  }
  return Effect.succeed(HttpBody.stream(
    Stream.fromReadableStream({
      evaluate: () => compressionTransformWeb(algorithm)(Stream.toReadableStream(body.stream)),
      onError: identity
    }),
    body.contentType
  ))
}
