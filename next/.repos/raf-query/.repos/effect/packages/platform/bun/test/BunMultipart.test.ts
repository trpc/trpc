import * as BunMultipart from "@effect/platform-bun/BunMultipart"
import { describe, it } from "@effect/vitest"
import { assertTrue, strictEqual } from "@effect/vitest/utils"
import { Effect, Stream } from "effect"

describe("BunMultipart", () => {
  it.live("propagates a request body read error while consuming an active file", () =>
    Effect.gen(function*() {
      const cause = new Error("body-read-failed")
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(
            "--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.txt\"\r\n\r\nhello"
          ))
        },
        pull(controller) {
          controller.error(cause)
        }
      }, {
        // Delay the error until the file bytes are consumed.
        highWaterMark: 0
      })
      const request = new Request("http://localhost/upload", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=b" },
        body
      })
      let bytesRead = 0

      const error = yield* BunMultipart.stream(request).pipe(
        Stream.runForEach((part) =>
          part._tag === "File"
            ? Stream.runForEach(part.content, (chunk) =>
              Effect.sync(() => {
                bytesRead += chunk.length
              }))
            : Effect.die("expected file")
        ),
        Effect.timeout("1 second"),
        Effect.flip
      )

      strictEqual(bytesRead, 5)
      assertTrue(error._tag === "MultipartError")
      strictEqual(error.reason._tag, "InternalError")
      strictEqual(error.reason.cause, cause)
    }))
})
