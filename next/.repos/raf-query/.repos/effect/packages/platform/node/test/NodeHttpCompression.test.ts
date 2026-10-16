import { NodeHttpServer } from "@effect/platform-node"
import * as NodeHttpPlatform from "@effect/platform-node/NodeHttpPlatform"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpEffect from "effect/http/HttpEffect"
import * as HttpMiddleware from "effect/http/HttpMiddleware"
import * as HttpPlatform from "effect/http/HttpPlatform"
import * as HttpRouter from "effect/http/HttpRouter"
import type { HttpServerRequest } from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import * as Fs from "node:fs"
import * as Os from "node:os"
import * as Path from "node:path"
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
    NodeHttpPlatform.layer,
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

describe("NodeHttpCompression", () => {
  for (
    const [name, makeResponse] of [
      ["Stream", () => HttpServerResponse.stream(Stream.succeed(new TextEncoder().encode(bigJson)))],
      ["Uint8Array", () => HttpServerResponse.uint8Array(new TextEncoder().encode(bigJson))]
    ] as const
  ) {
    it(`preserves a Content-Type header override when compressing ${name} responses`, () => {
      const original = HttpServerResponse.setHeader(makeResponse(), "content-type", "application/json")
      assert.strictEqual(original.headers["content-type"], "application/json")
      return withHandler(
        Effect.succeed(original),
        undefined,
        async (handler) => {
          const compressed = await get(handler, { "accept-encoding": "gzip" })
          assert.strictEqual(compressed.headers.get("content-encoding"), "gzip")
          assert.strictEqual(Zlib.gunzipSync(new Uint8Array(await compressed.arrayBuffer())).toString(), bigJson)
          assert.strictEqual(compressed.headers.get("content-type"), original.headers["content-type"])
        }
      )
    })
  }

  it.effect("advertises supported algorithms", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      assert.isTrue(platform.compression.algorithms.has("gzip"))
      assert.isTrue(platform.compression.algorithms.has("deflate"))
      assert.isTrue(platform.compression.algorithms.has("br"))
      assert.strictEqual(platform.compression.algorithms.has("zstd"), zstdSupported)
    }).pipe(Effect.provide(NodeHttpPlatform.layer)))

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

  it("compresses with deflate", () =>
    withHandler(bigJsonApp, undefined, async (handler) => {
      const response = await get(handler, { "accept-encoding": "deflate" })
      assert.strictEqual(response.headers.get("content-encoding"), "deflate")
      const compressed = new Uint8Array(await response.arrayBuffer())
      assert.strictEqual(response.headers.get("content-length"), compressed.byteLength.toString())
      assert.strictEqual(Zlib.inflateSync(compressed).toString(), bigJson)
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

  it("excludes zstd unless opted in", () =>
    withHandler(bigJsonApp, undefined, async (handler) => {
      const response = await get(handler, { "accept-encoding": "zstd, gzip" })
      assert.strictEqual(response.headers.get("content-encoding"), "gzip")
    }))

  it("compresses stream bodies without a Content-Length", () =>
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

  it("compresses file responses through the streaming path and weakens the ETag", async () => {
    const path = fileURLToPath(new URL("./NodeHttpCompression.test.ts", import.meta.url))
    const contents = Fs.readFileSync(path).toString()
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

  it.effect("preserves the Content-Type of file responses when compressed with Brotli", () =>
    Effect.gen(function*() {
      const directory = Fs.mkdtempSync(Path.join(Os.tmpdir(), "effect-http-compression-"))
      yield* Effect.addFinalizer(() => Effect.sync(() => Fs.rmSync(directory, { recursive: true })))
      const path = Path.join(directory, "index.html")
      const contents = `<!doctype html><html><body>${"<p>Hello world</p>".repeat(100)}</body></html>`
      Fs.writeFileSync(path, contents)

      yield* HttpRouter.add("GET", "/file", HttpServerResponse.file(path)).pipe(
        (self) => HttpRouter.serve(self, { middleware: HttpMiddleware.compression() }),
        Layer.build
      )

      const uncompressed = yield* HttpClient.get("/file", { headers: { "accept-encoding": "identity" } })
      assert.strictEqual(uncompressed.status, 200)
      assert.strictEqual(uncompressed.headers["content-encoding"], undefined)
      assert.strictEqual(uncompressed.headers["content-type"], "text/html")
      assert.strictEqual(yield* uncompressed.text, contents)

      const compressed = yield* HttpClient.get("/file", { headers: { "accept-encoding": "br" } })
      assert.strictEqual(compressed.status, 200)
      assert.strictEqual(compressed.headers["content-encoding"], "br")
      assert.strictEqual(yield* compressed.text, contents)
      assert.strictEqual(compressed.headers["content-type"], uncompressed.headers["content-type"])
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it("does not acquire file bodies for compressed HEAD requests", async () => {
    let acquired = 0
    class CountingFile extends File {
      override stream() {
        acquired++
        return super.stream()
      }
    }
    const file = new CountingFile(["abc"], "test.txt")
    await withHandler(HttpServerResponse.fileWeb(file), { minSize: 0 }, async (handler) => {
      const head = await handler(
        new Request("http://localhost/", {
          method: "HEAD",
          headers: { "accept-encoding": "gzip" }
        })
      )
      assert.strictEqual(head.status, 200)
      assert.strictEqual(await head.text(), "")
      assert.strictEqual(acquired, 0)
    })
  })

  it.effect("flushes compressed chunks incrementally over the wire", () =>
    Effect.gen(function*() {
      const latch = yield* Latch.make(false)
      const encoder = new TextEncoder()
      yield* HttpRouter.add(
        "GET",
        "/sse",
        Effect.succeed(HttpServerResponse.stream(
          Stream.concat(
            Stream.succeed(encoder.encode("data: first\n\n")),
            Stream.concat(
              Stream.drain(Stream.fromEffect(latch.await)),
              Stream.succeed(encoder.encode("data: second\n\n"))
            )
          ),
          { contentType: "text/event-stream" }
        ))
      ).pipe(
        (self) => HttpRouter.serve(self, { middleware: HttpMiddleware.compression() }),
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/sse", { headers: { "accept-encoding": "gzip" } })
      assert.strictEqual(response.headers["content-encoding"], "gzip")
      // the source stream only ends after the latch opens, and the latch only
      // opens once the first decoded event arrives, so this deadlocks unless
      // compressed chunks flush incrementally
      const received: Array<string> = []
      yield* response.stream.pipe(
        Stream.runForEach((chunk) =>
          Effect.suspend(() => {
            received.push(new TextDecoder().decode(chunk))
            return latch.open
          })
        )
      )
      assert.strictEqual(received.join(""), "data: first\n\ndata: second\n\n")
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))
})
