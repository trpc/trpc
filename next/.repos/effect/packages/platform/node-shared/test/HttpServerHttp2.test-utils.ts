import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { constVoid } from "effect/Function"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as HttpServer from "effect/http/HttpServer"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import type * as NetAddress from "effect/net/NetAddress"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as Http2 from "node:http2"
import { Readable } from "node:stream"

/**
 * Runs tests of a platform `HttpServer` over one protocol. The layer provides
 * the server and an `HttpClient` that reaches it over that protocol.
 */
export const describeHttpServerProtocol = (
  label: string,
  layer: Layer.Layer<HttpServer.HttpServer | HttpClient.HttpClient, unknown>
) =>
  describe(label, () => {
    it.effect("exposes the request URL to web APIs", () =>
      Effect.gen(function*() {
        yield* HttpServer.serveEffect(
          HttpServerRequest.HttpServerRequest.use((request) =>
            Effect.map(
              HttpServerRequest.toWeb(request),
              (web) => HttpServerResponse.text(`${Option.getOrThrow(HttpServerRequest.toURL(request)).href} ${web.url}`)
            )
          )
        )
        const response = yield* HttpClient.get("/path")
        assert.strictEqual(yield* response.text, `${response.request.url} ${response.request.url}`)
      }).pipe(Effect.provide(layer)))

    it.effect("answers a response that carries connection-specific headers", () =>
      Effect.gen(function*() {
        yield* HttpServer.serveEffect(
          Effect.succeed(HttpServerResponse.text("ok", { headers: { "keep-alive": "timeout=5" } }))
        )
        const response = yield* HttpClient.get("/")
        assert.strictEqual(response.status, 200)
        assert.strictEqual(yield* response.text, "ok")
      }).pipe(Effect.provide(layer)))

    it.effect("fails the response body when the body stream fails after the first chunk", () =>
      Effect.gen(function*() {
        const headersReceived = Latch.makeUnsafe()
        yield* HttpServer.serveEffect(
          Effect.succeed(HttpServerResponse.stream(Stream.concat(
            Stream.make(new TextEncoder().encode("first")),
            Stream.fromEffect(Effect.andThen(headersReceived.await, Effect.fail(new Error("boom"))))
          )))
        )
        const response = yield* HttpClient.get("/")
        headersReceived.openUnsafe()
        assert.isTrue(Exit.isFailure(yield* Effect.exit(response.text)))
      }).pipe(Effect.provide(layer)))
  })

/**
 * Prefixes requests with the loopback origin of the current server, using the
 * given scheme.
 */
export const layerTestClient = (
  scheme: "http" | "https"
): Layer.Layer<HttpClient.HttpClient, never, HttpServer.HttpServer | HttpClient.HttpClient> =>
  Layer.effect(HttpClient.HttpClient)(Effect.gen(function*() {
    const server = yield* HttpServer.HttpServer
    const client = yield* HttpClient.HttpClient
    const { port } = server.address as NetAddress.InetAddress
    return HttpClient.mapRequest(client, HttpClientRequest.prependUrl(`${scheme}://127.0.0.1:${port}`))
  }))

/**
 * An `HttpClient` that sends each request over its own `node:http2` session.
 * Pass `ca` to trust a test certificate for `https` URLs.
 */
export const layerHttp2Client = (options?: Http2.SecureClientSessionOptions): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(HttpClient.HttpClient)(
    HttpClient.make((request, url) =>
      Effect.callback<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>((resume) => {
        const fail = (cause: unknown) =>
          resume(Effect.fail(
            new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
          ))
        const session = Http2.connect(url.origin, options)
        session.on("error", constVoid)
        const stream = session.request({
          ...request.headers,
          ":method": request.method,
          ":path": url.pathname + url.search
        })
        stream.on("response", (headers) => {
          const responseHeaders = new Headers()
          for (const [name, value] of Object.entries(headers)) {
            if (name[0] !== ":" && value !== undefined) responseHeaders.set(name, String(value))
          }
          resume(Effect.succeed(HttpClientResponse.fromWeb(
            request,
            new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
              status: headers[":status"]!,
              headers: responseHeaders
            })
          )))
        })
        stream.on("error", fail)
        stream.on("close", () => {
          session.close()
          fail(new Error(`HTTP/2 stream closed with code ${stream.rstCode}`))
        })
        stream.end(request.body._tag === "Uint8Array" ? request.body.body : undefined)
        return Effect.sync(() => session.destroy())
      })
    )
  )

/**
 * Sends one HTTP/2 request with the given pseudo-headers to a cleartext server
 * and returns the response body.
 */
export const http2Get = (port: number, headers: Http2.OutgoingHttpHeaders) =>
  Effect.acquireUseRelease(
    Effect.sync(() => Http2.connect(`http://127.0.0.1:${port}`)),
    (session) =>
      Effect.callback<string, Error>((resume) => {
        const stream = session.request(headers)
        let body = ""
        stream.setEncoding("utf8")
        stream.on("data", (chunk: string) => {
          body += chunk
        })
        stream.on("end", () => resume(Effect.succeed(body)))
        stream.on("error", (error) => resume(Effect.fail(error)))
      }),
    (session) => Effect.callback<void>((resume) => session.close(() => resume(Effect.void)))
  )
