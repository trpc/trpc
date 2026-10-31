import { afterAll, assert, describe, it } from "@effect/vitest"
import * as ByteSize from "effect/ByteSize"
import * as Effect from "effect/Effect"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpEffect from "effect/http/HttpEffect"
import * as HttpIncomingMessage from "effect/http/HttpIncomingMessage"
import * as HttpMiddleware from "effect/http/HttpMiddleware"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServer from "effect/http/HttpServer"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"

const bigJson = JSON.stringify({ text: "All work and no play makes Jack a dull boy. ".repeat(100) })

type Format = "gzip" | "deflate"
type DecompressionOptions = Parameters<typeof HttpMiddleware.decompression>[0]

const compress = async (data: string | Uint8Array, formats: ReadonlyArray<Format>): Promise<Uint8Array> => {
  let body = new Blob([data as BlobPart]).stream()
  for (const format of formats) {
    body = body.pipeThrough(new CompressionStream(format))
  }
  return new Uint8Array(await new Response(body).arrayBuffer())
}

const post = (
  handler: (request: Request) => Promise<Response>,
  body: Uint8Array | string,
  headers?: Record<string, string>,
  path = "/"
) =>
  handler(
    new Request(`http://localhost${path}`, {
      method: "POST",
      body: body as BodyInit,
      ...(headers === undefined ? {} : { headers })
    })
  )

const readers = {
  json: (request: HttpServerRequest.HttpServerRequest) => Effect.map(request.json, (json) => JSON.stringify(json)),
  text: (request: HttpServerRequest.HttpServerRequest) => request.text,
  arrayBuffer: (request: HttpServerRequest.HttpServerRequest) =>
    Effect.map(request.arrayBuffer, (buffer) => new TextDecoder().decode(buffer)),
  stream: (request: HttpServerRequest.HttpServerRequest) =>
    Effect.map(Stream.mkUint8Array(request.stream), (bytes) => new TextDecoder().decode(bytes))
} as const

type Accessor = keyof typeof readers

// Echoes the body read through `accessor`, along with the request's
// Content-Encoding and Content-Length as the app sees them.
const echo = (accessor: Accessor) => (request: HttpServerRequest.HttpServerRequest) =>
  Effect.map(readers[accessor](request), (body) =>
    HttpServerResponse.text(body, {
      headers: {
        "x-content-encoding": request.headers["content-encoding"] ?? "",
        "x-content-length": request.headers["content-length"] ?? ""
      }
    }))

const echoApp = (accessor: Accessor) => HttpServerRequest.HttpServerRequest.use(echo(accessor))

const disposers: Array<() => Promise<void>> = []

afterAll(() => Promise.all(disposers.map((dispose) => dispose())))

const makeHandler = (
  app: Effect.Effect<HttpServerResponse.HttpServerResponse, any, HttpServerRequest.HttpServerRequest>,
  options?: DecompressionOptions,
  maxBodySize?: ByteSize.ByteSize
) => {
  const { dispose, handler } = HttpEffect.toWebHandlerLayer(
    app,
    Layer.merge(HttpServer.layerServices, Layer.succeed(HttpIncomingMessage.MaxBodySize, maxBodySize)),
    { middleware: HttpMiddleware.decompression(options) }
  )
  disposers.push(dispose)
  return handler
}

describe("HttpDecompression", () => {
  it.effect("keeps headers-only toWeb lazy", () =>
    Effect.gen(function*() {
      const payload = "compressed payload"
      const body = yield* Effect.promise(() => compress(payload, ["gzip"]))
      const request = HttpServerRequest.fromClientRequest(
        HttpClientRequest.post("http://localhost/").pipe(
          HttpClientRequest.setHeader("content-encoding", "gzip"),
          HttpClientRequest.setHeader("x-test", "headers-only"),
          HttpClientRequest.bodyStream(Stream.succeed(body))
        )
      )
      yield* Effect.gen(function*() {
        const decompressed = yield* HttpServerRequest.HttpServerRequest
        const web = yield* HttpServerRequest.toWeb(decompressed)
        assert.strictEqual(web.headers.get("x-test"), "headers-only")
        yield* Effect.yieldNow
        assert.strictEqual(yield* decompressed.text, payload)
        return HttpServerResponse.empty()
      }).pipe(
        HttpMiddleware.decompression(),
        Effect.provideService(HttpServerRequest.HttpServerRequest, request)
      )
    }))

  for (const accessor of ["json", "text", "arrayBuffer", "stream"] as const) {
    it(`decompresses a gzip body read via ${accessor} and hides the encoding headers`, async () => {
      const response = await post(
        makeHandler(echoApp(accessor)),
        await compress(bigJson, ["gzip"]),
        { "content-type": "application/json", "content-encoding": "gzip" }
      )
      assert.strictEqual(response.status, 200)
      assert.strictEqual(await response.text(), bigJson)
      assert.strictEqual(response.headers.get("x-content-encoding"), "")
      assert.strictEqual(response.headers.get("x-content-length"), "")
    })
  }

  for (const formats of [["deflate"], ["deflate", "gzip"]] as const) {
    it(`decodes Content-Encoding: ${formats.join(", ")}`, async () => {
      const response = await post(
        makeHandler(echoApp("text")),
        await compress(bigJson, formats),
        { "content-encoding": formats.join(", ") }
      )
      assert.strictEqual(response.status, 200)
      assert.strictEqual(await response.text(), bigJson)
    })
  }

  it("passes through bodies without a coding or with identity", async () => {
    const handler = makeHandler(echoApp("text"))

    const plain = await post(handler, bigJson)
    assert.strictEqual(plain.status, 200)
    assert.strictEqual(await plain.text(), bigJson)

    const identity = await post(handler, bigJson, { "content-encoding": "identity" })
    assert.strictEqual(identity.status, 200)
    assert.strictEqual(await identity.text(), bigJson)
  })

  it("rejects unsupported codings with 415 before running the app", async () => {
    let ran = false
    const app = Effect.sync(() => {
      ran = true
      return HttpServerResponse.empty()
    })
    const response = await post(makeHandler(app), bigJson, { "content-encoding": "br" })
    assert.strictEqual(response.status, 415)
    assert.strictEqual(response.headers.get("accept-encoding"), "gzip, deflate")
    assert.isFalse(ran)
  })

  it("fails corrupt gzip bodies with 400", async () => {
    const response = await post(makeHandler(echoApp("text")), "not gzip", { "content-encoding": "gzip" })
    assert.strictEqual(response.status, 400)
  })

  for (const accessor of ["text", "stream"] as const) {
    it(`enforces maxDecompressedSize when reading via ${accessor}`, async () => {
      const body = await compress(bigJson, ["gzip"])
      // the limit must apply to the inflated size, not the size on the wire
      assert.isBelow(body.length, 1024)
      const response = await post(
        makeHandler(echoApp(accessor), { maxDecompressedSize: 1024 }),
        body,
        { "content-encoding": "gzip" }
      )
      assert.strictEqual(response.status, 413)
    })
  }

  it("falls back to the MaxBodySize reference", async () => {
    const response = await post(
      makeHandler(
        echoApp("text"),
        undefined,
        ByteSize.bytes(1024)
      ),
      await compress(bigJson, ["gzip"]),
      { "content-encoding": "gzip" }
    )
    assert.strictEqual(response.status, 413)
  })

  it("maps multipart decompression failures to client errors", async () => {
    const multipart = new FormData()
    multipart.append("text", bigJson)
    const encoded = new Response(multipart)
    const headers = { "content-type": encoded.headers.get("content-type")!, "content-encoding": "gzip" }
    const body = new Uint8Array(await encoded.arrayBuffer())
    const handler = makeHandler(
      HttpServerRequest.HttpServerRequest.use((request) =>
        Effect.as(Stream.runDrain(request.multipartStream), HttpServerResponse.empty())
      ),
      { maxDecompressedSize: 1024 }
    )

    const corrupt = await post(handler, "not gzip", headers)
    assert.strictEqual(corrupt.status, 400)

    const tooLarge = await post(handler, await compress(body, ["gzip"]), headers)
    assert.strictEqual(tooLarge.status, 413)
  })

  it("cancels the request body when a stream read stops early", async () => {
    const compressed = await compress(bigJson, ["gzip"])
    let onCancel!: () => void
    const cancelled = new Promise<void>((resolve) => {
      onCancel = resolve
    })
    // never closes, so the upstream only finishes if cancellation propagates
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(compressed)
      },
      cancel() {
        onCancel()
      }
    })
    const handler = makeHandler(
      HttpServerRequest.HttpServerRequest.use((request) =>
        Effect.as(Stream.runHead(request.stream), HttpServerResponse.empty())
      )
    )
    const response = await handler(
      new Request("http://localhost/", {
        method: "POST",
        body,
        headers: { "content-encoding": "gzip" },
        duplex: "half"
      } as RequestInit)
    )
    assert.strictEqual(response.status, 204)
    await cancelled
  })

  it("decompresses bodies for routes under a prefixed router", async () => {
    const { dispose, handler } = HttpRouter.toWebHandler(
      HttpRouter.use((router) => router.prefixed("/api").add("POST", "/echo", echo("text"))),
      { middleware: HttpMiddleware.decompression(), disableLogger: true }
    )
    disposers.push(dispose)
    const response = await post(handler, await compress(bigJson, ["gzip"]), { "content-encoding": "gzip" }, "/api/echo")
    assert.strictEqual(response.status, 200)
    assert.strictEqual(await response.text(), bigJson)
  })
})
