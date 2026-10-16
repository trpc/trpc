import { afterAll, assert, describe, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Cookies from "effect/http/Cookies"
import * as HttpEffect from "effect/http/HttpEffect"
import * as HttpMiddleware from "effect/http/HttpMiddleware"
import * as HttpPlatform from "effect/http/HttpPlatform"
import * as HttpServer from "effect/http/HttpServer"
import type { HttpServerRequest } from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Latch from "effect/Latch"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"

const bigText = "All work and no play makes Jack a dull boy. ".repeat(100)
const bigJson = JSON.stringify({ text: bigText })

const bigJsonApp = Effect.succeed(HttpServerResponse.text(bigJson, { contentType: "application/json" }))

type App = Effect.Effect<HttpServerResponse.HttpServerResponse, any, HttpServerRequest>
type CompressionOptions = Parameters<typeof HttpMiddleware.compression>[0]

const get = (
  handler: (request: Request) => Promise<Response>,
  headers?: Record<string, string>,
  method?: string
) =>
  handler(
    new Request("http://localhost/", {
      method: method ?? "GET",
      ...(headers === undefined ? {} : { headers })
    })
  )

const decompress = (data: ArrayBuffer, format: "gzip" | "deflate"): Promise<string> =>
  new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream(format))).text()

const platformContext = (compression: HttpPlatform.Compression): Context.Context<HttpPlatform.HttpPlatform> =>
  Context.make(
    HttpPlatform.HttpPlatform,
    HttpPlatform.HttpPlatform.of({
      platform: "web",
      compression,
      fileResponse: () => Effect.die("not implemented"),
      fileWebResponse: () => Effect.die("not implemented")
    })
  )

// A platform stub used to exercise negotiation against algorithms the Web
// implementation does not support. It only marks the chosen algorithm.
const negotiationPlatformContext = (algorithms: ReadonlyArray<HttpPlatform.CompressionAlgorithm>) =>
  platformContext({
    algorithms: new Set(algorithms),
    compressResponse: (response, algorithm) =>
      Effect.succeed(HttpServerResponse.setHeader(response, "content-encoding", algorithm))
  })

const makeHandler = (
  app: App,
  options?: CompressionOptions,
  context?: Context.Context<HttpPlatform.HttpPlatform>
) => {
  const self = app as Effect.Effect<HttpServerResponse.HttpServerResponse, any, HttpServerRequest | Scope.Scope>
  const middleware = HttpMiddleware.compression(options)
  if (context !== undefined) {
    return HttpEffect.toWebHandlerWith<HttpPlatform.HttpPlatform, HttpServerRequest | Scope.Scope>(context)(
      self,
      middleware
    )
  }
  const { dispose, handler } = HttpEffect.toWebHandlerLayer(self, HttpServer.layerServices, { middleware })
  disposers.push(dispose)
  return handler
}

const disposers: Array<() => Promise<void>> = []

afterAll(() => Promise.all(disposers.map((dispose) => dispose())))

const randomBytes = (length: number): Uint8Array => {
  const data = new Uint8Array(length)
  let state = 0x9e3779b9
  for (let i = 0; i < length; i++) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    data[i] = state & 0xff
  }
  return data
}

describe("HttpCompression", () => {
  for (
    const [name, makeResponse] of [
      ["Stream", () => HttpServerResponse.stream(Stream.succeed(new TextEncoder().encode(bigJson)))],
      ["Uint8Array", () => HttpServerResponse.uint8Array(new TextEncoder().encode(bigJson))],
      ["Raw", () => HttpServerResponse.raw(new Response(bigJson).body, { contentType: "text/plain" })]
    ] as const
  ) {
    it(`preserves a Content-Type header override when compressing web ${name} responses`, async () => {
      const original = HttpServerResponse.setHeader(makeResponse(), "content-type", "application/json")
      assert.strictEqual(original.headers["content-type"], "application/json")
      const handler = makeHandler(Effect.succeed(original))

      const compressed = await get(handler, { "accept-encoding": "gzip" })
      assert.strictEqual(compressed.headers.get("content-encoding"), "gzip")
      assert.strictEqual(await decompress(await compressed.arrayBuffer(), "gzip"), bigJson)
      assert.strictEqual(compressed.headers.get("content-type"), original.headers["content-type"])
    })
  }

  it("preserves a header-only Content-Type when compressing web Raw responses", async () => {
    const handler = makeHandler(
      Effect.sync(() =>
        HttpServerResponse.raw(new Response(bigJson).body, { headers: { "content-type": "application/json" } })
      )
    )
    const uncompressed = await get(handler, { "accept-encoding": "identity" })
    assert.strictEqual(uncompressed.headers.get("content-type"), "application/json")
    assert.strictEqual(await uncompressed.text(), bigJson)

    const compressed = await get(handler, { "accept-encoding": "gzip" })
    assert.strictEqual(compressed.headers.get("content-encoding"), "gzip")
    assert.strictEqual(await decompress(await compressed.arrayBuffer(), "gzip"), bigJson)
    assert.strictEqual(compressed.headers.get("content-type"), uncompressed.headers.get("content-type"))
  })

  it("compresses a compressible response with gzip", async () => {
    const response = await get(makeHandler(bigJsonApp), { "accept-encoding": "gzip" })
    assert.strictEqual(response.status, 200)
    assert.strictEqual(response.headers.get("content-encoding"), "gzip")
    assert.strictEqual(response.headers.get("vary"), "Accept-Encoding")
    assert.strictEqual(response.headers.get("content-length"), null)
    const text = await decompress(await response.arrayBuffer(), "gzip")
    assert.strictEqual(text, bigJson)
  })

  it("compresses with deflate when requested", async () => {
    const response = await get(makeHandler(bigJsonApp), { "accept-encoding": "deflate" })
    assert.strictEqual(response.headers.get("content-encoding"), "deflate")
    const text = await decompress(await response.arrayBuffer(), "deflate")
    assert.strictEqual(text, bigJson)
  })

  it("server preference order picks br over gzip when supported", async () => {
    const response = await get(
      makeHandler(bigJsonApp, undefined, negotiationPlatformContext(["gzip", "deflate", "br", "zstd"])),
      { "accept-encoding": "gzip, br" }
    )
    assert.strictEqual(response.headers.get("content-encoding"), "br")
  })

  it("client q-values decide acceptability only, server order decides ranking", async () => {
    const response = await get(
      makeHandler(bigJsonApp, undefined, negotiationPlatformContext(["gzip", "deflate", "br", "zstd"])),
      { "accept-encoding": "gzip;q=1, br;q=0.5" }
    )
    assert.strictEqual(response.headers.get("content-encoding"), "br")
  })

  it("q=0 makes a coding unacceptable", async () => {
    const response = await get(makeHandler(bigJsonApp), { "accept-encoding": "gzip;q=0" })
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(response.headers.get("vary"), "Accept-Encoding")
    assert.strictEqual(await response.text(), bigJson)
  })

  it("falls through server order past q=0 codings", async () => {
    const response = await get(makeHandler(bigJsonApp), { "accept-encoding": "gzip;q=0, deflate" })
    assert.strictEqual(response.headers.get("content-encoding"), "deflate")
  })

  it("wildcard matches unlisted codings", async () => {
    const response = await get(makeHandler(bigJsonApp), { "accept-encoding": "*" })
    assert.strictEqual(response.headers.get("content-encoding"), "gzip")
  })

  it("wildcard with q=0 disables unlisted codings", async () => {
    const response = await get(makeHandler(bigJsonApp), { "accept-encoding": "*;q=0" })
    assert.strictEqual(response.status, 200)
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(await response.text(), bigJson)
  })

  it("sends identity with 200 when nothing is acceptable, never 406", async () => {
    const response = await get(makeHandler(bigJsonApp), { "accept-encoding": "br, identity;q=0" })
    assert.strictEqual(response.status, 200)
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(response.headers.get("vary"), "Accept-Encoding")
    assert.strictEqual(await response.text(), bigJson)
  })

  it("treats a malformed Accept-Encoding as absent", async () => {
    const response = await get(makeHandler(bigJsonApp), { "accept-encoding": "gzip;q=oops" })
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(await response.text(), bigJson)
  })

  it("treats an out-of-range q-value as absent", async () => {
    const response = await get(makeHandler(bigJsonApp), { "accept-encoding": "gzip;q=1.5" })
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(await response.text(), bigJson)
  })

  it("does not compress without an Accept-Encoding header", async () => {
    const response = await get(makeHandler(bigJsonApp))
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(response.headers.get("vary"), "Accept-Encoding")
    assert.strictEqual(await response.text(), bigJson)
  })

  it("skips bodies below minSize but still sets Vary", async () => {
    const app = Effect.succeed(HttpServerResponse.text("{}", { contentType: "application/json" }))
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(response.headers.get("vary"), "Accept-Encoding")
    assert.strictEqual(response.headers.get("content-length"), "2")
    assert.strictEqual(await response.text(), "{}")
  })

  it("respects a custom minSize", async () => {
    const app = Effect.succeed(HttpServerResponse.text("{}", { contentType: "application/json" }))
    const response = await get(makeHandler(app, { minSize: 1 }), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("content-encoding"), "gzip")
  })

  it("ignores malformed content lengths when checking minSize", async () => {
    for (const contentLength of ["1e3", "1.5"]) {
      const app = Effect.succeed(
        HttpServerResponse.stream(Stream.succeed(new TextEncoder().encode(bigJson)), {
          contentType: "application/json",
          headers: { "content-length": contentLength }
        })
      )
      const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
      assert.strictEqual(response.headers.get("content-encoding"), "gzip")
    }
  })

  it("skips non-compressible content types without Vary", async () => {
    const app = Effect.succeed(
      HttpServerResponse.uint8Array(randomBytes(2048), { contentType: "image/png" })
    )
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(response.headers.get("vary"), null)
  })

  it("supports a custom compressible predicate", async () => {
    const app = Effect.succeed(
      HttpServerResponse.uint8Array(randomBytes(2048), { contentType: "image/png" })
    )
    const response = await get(
      makeHandler(app, { compressible: (contentType) => contentType === "image/png" }),
      { "accept-encoding": "gzip" }
    )
    assert.strictEqual(response.headers.get("content-encoding"), "gzip")
  })

  it("leaves already-encoded responses untouched", async () => {
    const app = Effect.succeed(
      HttpServerResponse.text(bigJson, {
        contentType: "application/json",
        headers: { "content-encoding": "br" }
      })
    )
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("content-encoding"), "br")
    assert.strictEqual(response.headers.get("vary"), null)
    assert.strictEqual(await response.text(), bigJson)
  })

  it("does not stamp headers when a Raw body cannot be transformed", async () => {
    const app = Effect.succeed(
      HttpServerResponse.raw(new Response(null), {
        contentType: "application/json",
        headers: { etag: "\"abc\"" }
      })
    )
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(response.headers.get("vary"), null)
    assert.strictEqual(response.headers.get("etag"), "\"abc\"")
    assert.strictEqual(await response.text(), "")
  })

  it("strips a Content-Encoding: identity opt-out before sending", async () => {
    const app = Effect.succeed(
      HttpServerResponse.text(bigJson, {
        contentType: "application/json",
        headers: { "content-encoding": "identity" }
      })
    )
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(await response.text(), bigJson)
  })

  it("honors Cache-Control: no-transform", async () => {
    const app = Effect.succeed(
      HttpServerResponse.text(bigJson, {
        contentType: "application/json",
        headers: { "cache-control": "public, no-transform" }
      })
    )
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("content-encoding"), null)
    assert.strictEqual(await response.text(), bigJson)
  })

  it("leaves 204, 304, and 206 responses untouched", async () => {
    for (const status of [204, 304]) {
      const response = await get(
        makeHandler(Effect.succeed(HttpServerResponse.empty({ status }))),
        { "accept-encoding": "gzip" }
      )
      assert.strictEqual(response.status, status)
      assert.strictEqual(response.headers.get("content-encoding"), null)
      assert.strictEqual(response.headers.get("vary"), null)
    }
    const partial = await get(
      makeHandler(Effect.succeed(HttpServerResponse.text(bigJson, {
        status: 206,
        contentType: "application/json"
      }))),
      { "accept-encoding": "gzip" }
    )
    assert.strictEqual(partial.status, 206)
    assert.strictEqual(partial.headers.get("content-encoding"), null)
    assert.strictEqual(await partial.text(), bigJson)
  })

  it("mirrors GET headers for HEAD requests without a body", async () => {
    const response = await get(makeHandler(bigJsonApp), { "accept-encoding": "gzip" }, "HEAD")
    assert.strictEqual(response.headers.get("content-encoding"), "gzip")
    assert.strictEqual(response.headers.get("vary"), "Accept-Encoding")
    assert.strictEqual(await response.text(), "")
  })

  it("compresses unknown-length streams incrementally", async () => {
    const latch = Latch.makeUnsafe(false)
    const first = randomBytes(1 << 17)
    const second = randomBytes(1 << 10)
    const app = Effect.succeed(HttpServerResponse.stream(
      Stream.concat(
        Stream.succeed(first),
        Stream.concat(Stream.drain(Stream.fromEffect(latch.await)), Stream.succeed(second))
      ),
      { contentType: "text/event-stream" }
    ))
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("content-encoding"), "gzip")
    assert.strictEqual(response.headers.get("content-length"), null)
    const reader = response.body!.getReader()
    const chunks: Array<Uint8Array> = []
    // the first compressed chunk must arrive while the source stream is
    // still open, i.e. before the latch is released
    const initial = await reader.read()
    assert.isFalse(initial.done)
    chunks.push(initial.value!)
    latch.openUnsafe()
    let result = await reader.read()
    while (!result.done) {
      chunks.push(result.value!)
      result = await reader.read()
    }
    const decompressed = new Uint8Array(
      await new Response(
        new Blob(chunks as Array<BlobPart>).stream().pipeThrough(new DecompressionStream("gzip"))
      ).arrayBuffer()
    )
    assert.strictEqual(decompressed.length, first.length + second.length)
    assert.deepStrictEqual(decompressed.slice(0, first.length), first)
    assert.deepStrictEqual(decompressed.slice(first.length), second)
  })

  it("weakens a strong ETag on compressed responses", async () => {
    const app = Effect.succeed(
      HttpServerResponse.text(bigJson, {
        contentType: "application/json",
        headers: { etag: "\"abc\"" }
      })
    )
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("etag"), "W/\"abc\"")
  })

  it("leaves a weak ETag unchanged on compressed responses", async () => {
    const app = Effect.succeed(
      HttpServerResponse.text(bigJson, {
        contentType: "application/json",
        headers: { etag: "W/\"abc\"" }
      })
    )
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("etag"), "W/\"abc\"")
  })

  it("leaves the ETag of skipped responses unchanged", async () => {
    const app = Effect.succeed(
      HttpServerResponse.text(bigJson, {
        contentType: "application/json",
        headers: { etag: "\"abc\"" }
      })
    )
    const response = await get(makeHandler(app), { "accept-encoding": "identity" })
    assert.strictEqual(response.headers.get("etag"), "\"abc\"")
  })

  it("falls through to a supported algorithm when the preferred one is unavailable", async () => {
    const response = await get(
      makeHandler(bigJsonApp, { algorithms: ["zstd", "br", "gzip"] }),
      { "accept-encoding": "zstd, br, gzip" }
    )
    assert.strictEqual(response.headers.get("content-encoding"), "gzip")
  })

  it("appends Accept-Encoding to an existing Vary header", async () => {
    const app = Effect.succeed(
      HttpServerResponse.text(bigJson, {
        contentType: "application/json",
        headers: { vary: "Origin" }
      })
    )
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("vary"), "Origin, Accept-Encoding")
  })

  it("does not duplicate Accept-Encoding in Vary and leaves Vary: * alone", async () => {
    const existing = await get(
      makeHandler(Effect.succeed(
        HttpServerResponse.text(bigJson, {
          contentType: "application/json",
          headers: { vary: "accept-encoding" }
        })
      )),
      { "accept-encoding": "gzip" }
    )
    assert.strictEqual(existing.headers.get("vary"), "accept-encoding")

    const star = await get(
      makeHandler(Effect.succeed(
        HttpServerResponse.text(bigJson, {
          contentType: "application/json",
          headers: { vary: "*" }
        })
      )),
      { "accept-encoding": "gzip" }
    )
    assert.strictEqual(star.headers.get("vary"), "*")
  })

  it("preserves cookies on compressed responses", async () => {
    const app = Effect.succeed(
      HttpServerResponse.text(bigJson, {
        contentType: "application/json",
        cookies: Cookies.fromSetCookie(["session=abc"])
      })
    )
    const response = await get(makeHandler(app), { "accept-encoding": "gzip" })
    assert.strictEqual(response.headers.get("content-encoding"), "gzip")
    assert.deepStrictEqual(response.headers.getSetCookie(), ["session=abc"])
  })
})
