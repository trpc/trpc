import { assert, describe, it } from "@effect/vitest"
import { ByteSize, Effect, Stream } from "effect"
import { HttpClientRequest, HttpEffect, HttpIncomingMessage, HttpServerRequest, HttpServerResponse } from "effect/http"

const payload = "hello"
const fromClient = () =>
  HttpServerRequest.fromClientRequest(
    HttpClientRequest.post("http://localhost/upload").pipe(
      HttpClientRequest.setHeader("x-test", "headers-only"),
      HttpClientRequest.bodyStream(Stream.succeed(new TextEncoder().encode(payload)), { contentType: "text/plain" })
    )
  )

const chunked = (chunks: ReadonlyArray<string>, close = true) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      if (close) controller.close()
    }
  })

// never ends, and its cancellation never settles
const stalled = (chunks: ReadonlyArray<string>) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
    },
    cancel: () => new Promise<void>(() => {})
  })

const post = (
  handler: (request: Request) => Promise<Response>,
  body: string | ReadableStream<Uint8Array>,
  headers?: Record<string, string>
) => handler(new Request("http://localhost/upload", { method: "POST", body, headers, duplex: "half" } as RequestInit))

describe("request body", () => {
  it.effect("fromWebHandler can inspect headers without reading the body", () =>
    Effect.gen(function*() {
      const request = fromClient()
      const response = yield* HttpEffect.fromWebHandler(async (web) => {
        assert.strictEqual(web.headers.get("x-test"), "headers-only")
        return new Response(null, { status: 204 })
      }).pipe(Effect.provideService(HttpServerRequest.HttpServerRequest, request))
      assert.strictEqual(response.status, 204)
      assert.strictEqual(yield* request.text, payload)
    }))

  it.effect("fromClientRequest fails buffered reads over MaxBodySize", () =>
    Effect.gen(function*() {
      const error = yield* fromClient().text.pipe(
        Effect.flip,
        Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(4))
      )
      assert(error.reason._tag === "RequestParseError")
      assert.strictEqual(error.reason.reason, "BodyTooLarge")
    }))

  for (const accessor of ["arrayBuffer", "text"] as const) {
    describe(`MaxBodySize via ${accessor}`, () => {
      const handler = HttpEffect.toWebHandler(
        HttpServerRequest.HttpServerRequest.use((request) =>
          Effect.gen(function*() {
            yield* request[accessor]
            return HttpServerResponse.empty()
          })
        )
          .pipe(Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(4)))
      )

      it("reads a body at the limit", async () => {
        const response = await post(handler, "1234", { "content-length": "4" })
        assert.strictEqual(response.status, 204)
      })

      it("returns 413 for a content-length over the limit without reading the body", async () => {
        // the body never ends, so only the declared length can reject it
        const response = await post(handler, chunked([], false), { "content-length": "5" })
        assert.strictEqual(response.status, 413)
      })

      it("returns 413 for a chunked body over the limit", async () => {
        const response = await post(handler, stalled(["123", "45"]))
        assert.strictEqual(response.status, 413)
      })

      it("returns 413 when the body is longer than its content-length", async () => {
        const response = await post(handler, stalled(["12345"]), { "content-length": "4" })
        assert.strictEqual(response.status, 413)
      })
    })
  }
})
