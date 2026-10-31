import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { afterEach, vi } from "vitest"

const NativeRequest = globalThis.Request

const makeFetch = (
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): typeof globalThis.fetch => Object.assign(fetch, { preconnect: () => {} })

// Model browsers that stringify stream bodies and never read the duplex option,
// then load a fresh module so support is detected against the stub.
const loadUnsupportedRuntime = () => {
  vi.stubGlobal(
    "Request",
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, {
          method: init?.method ?? "GET",
          headers: init?.headers ?? {},
          body: init?.body instanceof ReadableStream ? String(init.body) : init?.body ?? null
        })
      }
    }
  )
  vi.resetModules()
  return Effect.promise(() => import("effect/http/FetchHttpClient"))
}

const streamRequest = () =>
  HttpClientRequest.post("https://example.test/upload").pipe(
    HttpClientRequest.bodyStream(Stream.make(new Uint8Array([104, 101]), new Uint8Array([108, 108, 111])), {
      contentType: "application/octet-stream"
    })
  )

describe("FetchHttpClient", { concurrent: false }, () => {
  it.effect("sends bodies from Web requests", () =>
    Effect.gen(function*() {
      const request = HttpClientRequest.fromWeb(
        new Request("https://example.test/?existing=1#fragment", { method: "POST", body: "hello" })
      ).pipe(HttpClientRequest.setUrlParam("value", "a#b"))
      const client = yield* HttpClient.HttpClient
      const response = yield* client.execute(request)
      assert.strictEqual(response.url, "https://example.test/?existing=1&value=a%23b")
      assert.strictEqual(yield* response.text, "hello")
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(
        FetchHttpClient.Fetch,
        makeFetch(async (...args) => new Response(await new Request(...args).text()))
      )
    ))

  it.effect("exposes the original Web response body", () => {
    const source = new Response(new Uint8Array([1, 2, 3]))
    return Effect.gen(function*() {
      const response = yield* HttpClient.get("https://example.test/archive.tgz")
      const web = Option.getOrThrow(HttpClientResponse.toWeb(response))
      // Runtimes like workerd only accept the original body for known-length writes.
      assert.strictEqual(web.body, source.body)
      assert.deepStrictEqual(new Uint8Array(yield* Effect.promise(() => web.arrayBuffer())), new Uint8Array([1, 2, 3]))
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(
        FetchHttpClient.Fetch,
        Object.assign(async () => source, { preconnect: () => {} })
      )
    )
  })

  it.effect("exposes the original Web response body while streaming an upload", () => {
    const source = new Response("done")
    return Effect.gen(function*() {
      const response = yield* HttpClient.execute(
        HttpClientRequest.post("https://example.test/upload").pipe(
          HttpClientRequest.bodyStream(Stream.make(new Uint8Array([1, 2, 3])))
        )
      )
      const web = Option.getOrThrow(HttpClientResponse.toWeb(response))
      assert.strictEqual(web.body, source.body)
      assert.strictEqual(yield* Effect.promise(() => web.text()), "done")
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(
        FetchHttpClient.Fetch,
        Object.assign(async () => source, { preconnect: () => {} })
      )
    )
  })

  describe("streaming request bodies", () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it.effect("rejects unsupported streaming without sending the request", () =>
      Effect.gen(function*() {
        const FetchHttpClient = yield* loadUnsupportedRuntime()
        const error = yield* HttpClient.execute(streamRequest()).pipe(
          Effect.provide(FetchHttpClient.layer),
          Effect.provideService(FetchHttpClient.Fetch, makeFetch(() => assert.fail("fetch must not be called"))),
          Effect.flip
        )

        assert.strictEqual(error.reason._tag, "EncodeError")
        assert.strictEqual(error.reason.description, "Streaming request bodies are not supported in this runtime")
      }))

    it.effect("buffers unsupported streaming only when explicitly opted in", () =>
      Effect.gen(function*() {
        const FetchHttpClient = yield* loadUnsupportedRuntime()
        const response = yield* HttpClient.execute(streamRequest()).pipe(
          Effect.provide(FetchHttpClient.layer),
          Effect.provideService(
            FetchHttpClient.Fetch,
            makeFetch(async (_input, init) => {
              assert.instanceOf(init?.body, ArrayBuffer)
              assert.deepStrictEqual(new Uint8Array(init.body), new Uint8Array([104, 101, 108, 108, 111]))
              assert.strictEqual(new Headers(init.headers).get("content-type"), "application/octet-stream")
              return new Response(init.body)
            })
          ),
          Effect.provideService(FetchHttpClient.StreamBodyFallback, "buffer")
        )

        assert.strictEqual(yield* response.text, "hello")
      }))

    it.effect("keeps supported request bodies streaming with duplex half", () =>
      Effect.gen(function*() {
        const response = yield* HttpClient.execute(streamRequest()).pipe(
          Effect.provide(FetchHttpClient.layer),
          Effect.provideService(
            FetchHttpClient.Fetch,
            makeFetch(async (input, init) => {
              assert.instanceOf(init?.body, ReadableStream)
              assert.strictEqual((init as RequestInit & { duplex?: string }).duplex, "half")
              return new Response(await new NativeRequest(input, init).text())
            })
          )
        )

        assert.strictEqual(yield* response.text, "hello")
      }))
  })
})
