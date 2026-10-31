import { NodeHttpServer } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { ByteSize, Effect, Layer, Stream } from "effect"
import {
  HttpBody,
  HttpClient,
  type HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
  HttpRouter,
  HttpServer
} from "effect/http"
import type * as NetAddress from "effect/net/NetAddress"
import { OtlpProxy } from "effect/observability"
import * as Http from "node:http"

describe("OtlpProxy on NodeHttpServer", () => {
  it.effect("applies an explicit maxBodySize above the ambient MaxBodySize to declared and chunked bodies", () =>
    Effect.gen(function*() {
      const forwarded: Array<HttpClientRequest.HttpClientRequest> = []
      const upstream = HttpClient.make((request) => {
        forwarded.push(request)
        return Effect.succeed(HttpClientResponse.fromWeb(request, new Response()))
      })
      yield* OtlpProxy.layer({ baseUrl: "http://upstream.example", maxBodySize: 8 }).pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, upstream)),
        (proxy) =>
          HttpRouter.serve(proxy, {
            disableLogger: true,
            middleware: Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(4))
          }),
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6])

      const declared = yield* client.post("/v1/traces", {
        body: HttpBody.uint8Array(bytes, "application/x-protobuf")
      })
      const chunked = yield* client.post("/v1/traces", {
        body: HttpBody.stream(Stream.make(bytes), "application/x-protobuf")
      })

      assert.deepStrictEqual([declared.status, chunked.status], [200, 200])
      assert.strictEqual(forwarded.length, 2)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect.each([
    { name: "", headers: {} },
    { name: " with Expect: 100-continue", headers: { expect: "100-continue" } }
  ])(
    "rejects an over-limit content-length before the body arrives$name",
    ({ headers }) =>
      Effect.gen(function*() {
        const forwarded: Array<HttpClientRequest.HttpClientRequest> = []
        const upstream = HttpClient.make((request) => {
          forwarded.push(request)
          return Effect.succeed(HttpClientResponse.fromWeb(request, new Response()))
        })
        yield* OtlpProxy.layer({ baseUrl: "http://upstream.example", maxBodySize: 4 }).pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, upstream)),
          (proxy) => HttpRouter.serve(proxy, { disableLogger: true }),
          Layer.build
        )
        const server = yield* HttpServer.HttpServer
        const port = (server.address as NetAddress.InetAddress).port

        const response = yield* headersOnlyRequest(port, headers)
        assert.deepStrictEqual(response, { status: 413, continues: 0 })
        assert.strictEqual(forwarded.length, 0)
      }).pipe(Effect.provide(NodeHttpServer.layerTest))
  )
})

// Declares a 100-byte body but never sends it, so only the headers can be rejected.
const headersOnlyRequest = (port: number, headers: Http.OutgoingHttpHeaders) =>
  Effect.callback<{ status: number | undefined; continues: number }, Error>((resume) => {
    let continues = 0
    const request = Http.request({
      host: "127.0.0.1",
      port,
      path: "/v1/traces",
      method: "POST",
      headers: {
        "content-type": "application/x-protobuf",
        "content-length": 100,
        ...headers
      },
      agent: false
    }, (response) => {
      response.on("error", (error) => resume(Effect.fail(error)))
      response.on("end", () => resume(Effect.succeed({ status: response.statusCode, continues })))
      response.resume()
    })
    request.on("continue", () => {
      continues++
    })
    request.on("error", (error) => resume(Effect.fail(error)))
    request.setTimeout(3000, () => request.destroy(new Error("no response before the body was sent")))
    request.flushHeaders()
    return Effect.sync(() => request.destroy())
  })
