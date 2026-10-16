import * as BunHttpPlatform from "@effect/platform-bun/BunHttpPlatform"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as HttpEffect from "effect/http/HttpEffect"
import * as HttpMiddleware from "effect/http/HttpMiddleware"
import * as HttpPlatform from "effect/http/HttpPlatform"
import type { HttpServerRequest } from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Stream from "effect/Stream"
import * as Fs from "node:fs"
import { fileURLToPath } from "node:url"
import * as Zlib from "node:zlib"

const bigJson = JSON.stringify({ text: "All work and no play makes Jack a dull boy. ".repeat(100) })
const bigJsonApp = Effect.succeed(HttpServerResponse.text(bigJson, { contentType: "application/json" }))

type App = Effect.Effect<HttpServerResponse.HttpServerResponse, any, any>
type CompressionOptions = Parameters<typeof HttpMiddleware.compression>[0]
type Algorithm = HttpPlatform.CompressionAlgorithm

const algorithms: ReadonlyArray<Algorithm> = ["gzip", "deflate", "br", "zstd"]

const decompress = (algorithm: Algorithm, data: Uint8Array): string => {
  switch (algorithm) {
    case "gzip":
      return Zlib.gunzipSync(data).toString()
    case "deflate":
      return Zlib.inflateSync(data).toString()
    case "br":
      return Zlib.brotliDecompressSync(data).toString()
    case "zstd":
      return Zlib.zstdDecompressSync(data).toString()
  }
}

const withHandler = async (
  app: App,
  options: CompressionOptions,
  run: (handler: (request: Request) => Promise<Response>) => Promise<void>
) => {
  const { dispose, handler } = HttpEffect.toWebHandlerLayer(
    app as Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpServerRequest>,
    BunHttpPlatform.layer,
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
  algorithm: Algorithm
) => handler(new Request("http://localhost/", { headers: { "accept-encoding": algorithm } }))

// Bun's CompressionStream does not expose an explicit flush operation, so
// incremental SSE-style delivery is runtime-defined and intentionally is not
// guaranteed by this suite.
describe("BunHttpCompression", () => {
  it.effect("advertises Bun's supported algorithms", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      assert.deepStrictEqual([...platform.compression.algorithms], algorithms)
    }).pipe(Effect.provide(BunHttpPlatform.layer)))

  for (const algorithm of algorithms) {
    it(`compresses one-shot bodies with ${algorithm}`, () =>
      withHandler(bigJsonApp, { algorithms }, async (handler) => {
        const response = await get(handler, algorithm)
        assert.strictEqual(response.headers.get("content-encoding"), algorithm)
        assert.strictEqual(response.headers.get("vary"), "Accept-Encoding")
        const compressed = new Uint8Array(await response.arrayBuffer())
        assert.strictEqual(response.headers.get("content-length"), compressed.byteLength.toString())
        assert.strictEqual(decompress(algorithm, compressed), bigJson)
      }))

    it(`compresses stream bodies with ${algorithm}`, () =>
      withHandler(
        Effect.succeed(HttpServerResponse.stream(
          Stream.fromArray([new TextEncoder().encode(bigJson)]),
          { contentType: "application/json" }
        )),
        { algorithms },
        async (handler) => {
          const response = await get(handler, algorithm)
          assert.strictEqual(response.headers.get("content-encoding"), algorithm)
          assert.strictEqual(response.headers.get("content-length"), null)
          assert.strictEqual(decompress(algorithm, new Uint8Array(await response.arrayBuffer())), bigJson)
        }
      ))
  }

  it("compresses Bun.file responses", async () => {
    const path = fileURLToPath(new URL("./BunHttpCompression.test.ts", import.meta.url))
    const contents = Fs.readFileSync(path, "utf8")
    await withHandler(
      HttpServerResponse.file(path, { headers: { "content-type": "text/plain" } }),
      { algorithms, minSize: 0 },
      async (handler) => {
        const response = await get(handler, "gzip")
        assert.strictEqual(response.headers.get("content-encoding"), "gzip")
        assert.strictEqual(response.headers.get("content-length"), null)
        assert.isTrue(response.headers.get("etag")!.startsWith("W/"))
        assert.strictEqual(decompress("gzip", new Uint8Array(await response.arrayBuffer())), contents)
      }
    )
  })
})
