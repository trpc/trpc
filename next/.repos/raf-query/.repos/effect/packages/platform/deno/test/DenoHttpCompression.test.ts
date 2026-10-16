import * as DenoHttpPlatform from "@effect/platform-deno/DenoHttpPlatform"
import * as DenoHttpServer from "@effect/platform-deno/DenoHttpServer"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpEffect from "effect/http/HttpEffect"
import * as HttpMiddleware from "effect/http/HttpMiddleware"
import * as HttpPlatform from "effect/http/HttpPlatform"
import * as HttpRouter from "effect/http/HttpRouter"
import type { HttpServerRequest } from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { fileURLToPath } from "node:url"
import * as Zlib from "node:zlib"

const bigJson = JSON.stringify({ text: "All work and no play makes Jack a dull boy. ".repeat(100) })
const bigJsonApp = Effect.succeed(HttpServerResponse.text(bigJson, { contentType: "application/json" }))

const zstdSupported = typeof Zlib.zstdCompress === "function"

type App = Effect.Effect<HttpServerResponse.HttpServerResponse, any, any>
type CompressionOptions = Parameters<typeof HttpMiddleware.compression>[0]

const withHandler = async (
  app: App,
  options: CompressionOptions,
  run: (handler: (request: Request) => Promise<Response>) => Promise<void>
) => {
  const { dispose, handler } = HttpEffect.toWebHandlerLayer(
    app as Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpServerRequest>,
    DenoHttpPlatform.layer,
    { middleware: HttpMiddleware.compression(options) }
  )
  try {
    await run(handler)
  } finally {
    await dispose()
  }
}

const get = (
  handler: (request: Request) => Promise<Response>,
  headers?: Record<string, string>
) => handler(new Request("http://localhost/", headers === undefined ? {} : { headers }))

describe("DenoHttpCompression", () => {
  it.effect("advertises supported algorithms", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      assert.isTrue(platform.compression.algorithms.has("gzip"))
      assert.isTrue(platform.compression.algorithms.has("deflate"))
      assert.isTrue(platform.compression.algorithms.has("br"))
      assert.strictEqual(platform.compression.algorithms.has("zstd"), zstdSupported)
    }).pipe(Effect.provide(DenoHttpPlatform.layer)))

  it("compresses one-shot bodies asynchronously with gzip and an exact Content-Length", () =>
    withHandler(bigJsonApp, undefined, async (handler) => {
      const response = await get(handler, { "accept-encoding": "gzip" })
      assert.strictEqual(response.headers.get("content-encoding"), "gzip")
      assert.strictEqual(response.headers.get("vary"), "Accept-Encoding")
      const compressed = new Uint8Array(await response.arrayBuffer())
      assert.strictEqual(response.headers.get("content-length"), compressed.byteLength.toString())
      assert.strictEqual(Zlib.gunzipSync(compressed).toString(), bigJson)
    }))

  it("prefers br over gzip in server order", () =>
    withHandler(bigJsonApp, undefined, async (handler) => {
      const response = await get(handler, { "accept-encoding": "gzip, br" })
      assert.strictEqual(response.headers.get("content-encoding"), "br")
      const compressed = new Uint8Array(await response.arrayBuffer())
      assert.strictEqual(response.headers.get("content-length"), compressed.byteLength.toString())
      assert.strictEqual(Zlib.brotliDecompressSync(compressed).toString(), bigJson)
    }))

  it.skipIf(!zstdSupported)(
    "compresses with zstd when opted in",
    () =>
      withHandler(bigJsonApp, { algorithms: ["zstd", "gzip"] }, async (handler) => {
        const response = await get(handler, { "accept-encoding": "zstd" })
        assert.strictEqual(response.headers.get("content-encoding"), "zstd")
        const compressed = new Uint8Array(await response.arrayBuffer())
        assert.strictEqual(response.headers.get("content-length"), compressed.byteLength.toString())
        assert.strictEqual(Zlib.zstdDecompressSync(compressed).toString(), bigJson)
      })
  )

  it("compresses stream bodies with gzip via CompressionStream", () =>
    withHandler(
      Effect.succeed(HttpServerResponse.stream(
        Stream.fromArray([new TextEncoder().encode(bigJson)]),
        { contentType: "application/json" }
      )),
      undefined,
      async (handler) => {
        const response = await get(handler, { "accept-encoding": "gzip" })
        assert.strictEqual(response.headers.get("content-encoding"), "gzip")
        assert.strictEqual(response.headers.get("content-length"), null)
        assert.strictEqual(Zlib.gunzipSync(new Uint8Array(await response.arrayBuffer())).toString(), bigJson)
      }
    ))

  it("compresses stream bodies with br via node:zlib streams", () =>
    withHandler(
      Effect.succeed(HttpServerResponse.stream(
        Stream.fromArray([new TextEncoder().encode(bigJson)]),
        { contentType: "application/json" }
      )),
      undefined,
      async (handler) => {
        const response = await get(handler, { "accept-encoding": "br" })
        assert.strictEqual(response.headers.get("content-encoding"), "br")
        assert.strictEqual(response.headers.get("content-length"), null)
        assert.strictEqual(Zlib.brotliDecompressSync(new Uint8Array(await response.arrayBuffer())).toString(), bigJson)
      }
    ))

  it("compresses file responses through the streaming path and weakens the ETag", async () => {
    const path = fileURLToPath(new URL("./DenoHttpCompression.test.ts", import.meta.url))
    const contents = await Deno.readTextFile(path)
    await withHandler(
      HttpServerResponse.file(path, { headers: { "content-type": "text/plain" } }),
      undefined,
      async (handler) => {
        const response = await get(handler, { "accept-encoding": "gzip" })
        assert.strictEqual(response.headers.get("content-encoding"), "gzip")
        assert.strictEqual(response.headers.get("content-length"), null)
        assert.isTrue(response.headers.get("etag")!.startsWith("W/"))
        assert.strictEqual(Zlib.gunzipSync(new Uint8Array(await response.arrayBuffer())).toString(), contents)
      }
    )
  })

  it.effect("compresses end-to-end through the Deno HTTP server", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add("GET", "/json", bigJsonApp).pipe(
        (self) =>
          HttpRouter.serve(self, {
            middleware: HttpMiddleware.compression({ algorithms: ["zstd", "br", "gzip", "deflate"] })
          }),
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      // Deno's fetch transparently decompresses gzip and strips the
      // Content-Encoding header, so assert on the round-tripped body
      const gzip = yield* client.get("/json", { headers: { "accept-encoding": "gzip" } })
      assert.strictEqual(gzip.headers["vary"], "Accept-Encoding")
      assert.strictEqual(yield* gzip.text, bigJson)
      if (zstdSupported) {
        // Deno's fetch does not decode zstd, so the raw compressed payload and
        // its headers are observable
        const zstd = yield* client.get("/json", { headers: { "accept-encoding": "zstd" } })
        assert.strictEqual(zstd.headers["content-encoding"], "zstd")
        const compressed = new Uint8Array(yield* zstd.arrayBuffer)
        assert.strictEqual(Zlib.zstdDecompressSync(compressed).toString(), bigJson)
      }
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))
})
