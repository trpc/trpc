import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { HttpClient, HttpClientError, type HttpClientRequest, HttpClientResponse, HttpRouter } from "effect/http"
import { OtlpProxy } from "effect/observability"

const makeUpstream = (
  respond: (
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<Response, HttpClientError.HttpClientError> = () => Effect.succeed(new Response())
) => {
  const requests: Array<HttpClientRequest.HttpClientRequest> = []
  const client = HttpClient.make((request) => {
    requests.push(request)
    return Effect.map(respond(request), (response) => HttpClientResponse.fromWeb(request, response))
  })
  return { client, requests } as const
}

const serve = <E>(
  proxy: Layer.Layer<never, E, HttpRouter.HttpRouter | HttpClient.HttpClient>,
  client: HttpClient.HttpClient,
  request: Request
) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        proxy.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client))),
        { disableLogger: true }
      )
    ),
    ({ handler }) =>
      Effect.promise(async () => {
        const response = await handler(request)
        return {
          status: response.status,
          headers: response.headers,
          body: new Uint8Array(await response.arrayBuffer())
        }
      }),
    ({ dispose }) => Effect.promise(dispose)
  )

const post = (path: string, body: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-protobuf", ...headers }
  })

describe("OtlpProxy", () => {
  it.effect("forwards the body and allow-listed headers to the configured signal endpoint", () =>
    Effect.gen(function*() {
      const upstream = makeUpstream()
      const response = yield* serve(
        OtlpProxy.layer({
          baseUrl: "https://otlp.example/base",
          headers: { authorization: "Bearer server" },
          prefix: "/otlp"
        }),
        upstream.client,
        post("/otlp/v1/traces?target=https://attacker.example", new Uint8Array([1, 2, 3]), {
          "content-encoding": "gzip",
          "accept-encoding": "gzip, br",
          authorization: "Bearer client",
          cookie: "session=secret",
          traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
          "x-forwarded-for": "203.0.113.1"
        })
      )

      assert.strictEqual(response.status, 200)
      assert.strictEqual(upstream.requests.length, 1)
      const request = upstream.requests[0]
      assert.strictEqual(request.method, "POST")
      assert.strictEqual(request.url, "https://otlp.example/base/v1/traces")
      assert.strictEqual(request.urlParams.params.length, 0)
      // No client credentials, cookies or trace context, and no trace context
      // from the proxy's own outbound span either. The response is requested
      // uncompressed so its body can be returned without a content-encoding.
      assert.deepStrictEqual(Object.fromEntries(Object.entries(request.headers)), {
        "content-type": "application/x-protobuf",
        "content-encoding": "gzip",
        "content-length": "3",
        "accept-encoding": "identity",
        authorization: "Bearer server"
      })
      assert.strictEqual(request.body._tag, "Uint8Array")
      assert.deepStrictEqual(request.body._tag === "Uint8Array" && request.body.body, new Uint8Array([1, 2, 3]))
    }))

  it.effect("returns the upstream status and body with only content-type and retry-after headers", () =>
    Effect.gen(function*() {
      const upstream = makeUpstream(() =>
        Effect.succeed(
          new Response(new Uint8Array([4, 5]), {
            status: 429,
            headers: {
              "content-type": "application/x-protobuf",
              "retry-after": "5",
              "set-cookie": "vendor=1",
              "content-encoding": "gzip",
              "x-vendor": "1"
            }
          })
        )
      )
      const response = yield* serve(
        OtlpProxy.layer({ baseUrl: "https://otlp.example" }),
        upstream.client,
        post("/v1/logs", new Uint8Array([1]))
      )

      assert.strictEqual(response.status, 429)
      assert.strictEqual(response.headers.get("content-type"), "application/x-protobuf")
      assert.strictEqual(response.headers.get("retry-after"), "5")
      assert.strictEqual(response.headers.get("set-cookie"), null)
      assert.strictEqual(response.headers.get("content-encoding"), null)
      assert.strictEqual(response.headers.get("x-vendor"), null)
      assert.deepStrictEqual(response.body, new Uint8Array([4, 5]))
    }))

  it.effect("rejects unsupported content types with 415 without contacting upstream", () =>
    Effect.gen(function*() {
      const upstream = makeUpstream()
      const response = yield* serve(
        OtlpProxy.layer({ baseUrl: "https://otlp.example" }),
        upstream.client,
        post("/v1/metrics", new Uint8Array([1]), { "content-type": "text/plain" })
      )

      assert.strictEqual(response.status, 415)
      assert.strictEqual(upstream.requests.length, 0)
    }))

  it.effect("accepts a body at maxBodySize and rejects larger ones with 413 without contacting upstream", () =>
    Effect.gen(function*() {
      const upstream = makeUpstream()
      const atLimit = yield* serve(
        OtlpProxy.layer({ baseUrl: "https://otlp.example", maxBodySize: 4 }),
        upstream.client,
        post("/v1/traces", new Uint8Array([1, 2, 3, 4]), { "content-length": "4" })
      )
      assert.strictEqual(atLimit.status, 200)
      assert.strictEqual(upstream.requests.length, 1)

      const response = yield* serve(
        OtlpProxy.layer({ baseUrl: "https://otlp.example", maxBodySize: 4 }),
        upstream.client,
        post("/v1/traces", new Uint8Array([1, 2, 3, 4, 5]))
      )

      assert.strictEqual(response.status, 413)
      assert.strictEqual(upstream.requests.length, 1)
    }))

  it.effect("stops reading early when content-length understates the body", () =>
    Effect.gen(function*() {
      for (const [contentLength, status] of [["0", 400], ["1", 400], ["4", 413]] as const) {
        const upstream = makeUpstream()
        let pulls = 0
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (++pulls > 10) return controller.close()
            controller.enqueue(new Uint8Array([1, 2]))
          }
        })
        const response = yield* serve(
          OtlpProxy.layer({ baseUrl: "https://otlp.example", maxBodySize: 4 }),
          upstream.client,
          new Request("http://localhost/v1/traces", {
            method: "POST",
            body,
            duplex: "half",
            headers: { "content-type": "application/x-protobuf", "content-length": contentLength }
          } as RequestInit)
        )

        // Overrunning the declared length is a parse error unless the body is also over the limit.
        assert.strictEqual(response.status, status, `content-length: ${contentLength}`)
        assert.strictEqual(upstream.requests.length, 0)
        // Reading stops once the declared length or limit is crossed instead of buffering all ten chunks.
        assert.isAtMost(pulls, 4, `content-length: ${contentLength}`)
      }
    }))

  it.effect("maps upstream transport failures to 502 and timeouts to 504", () =>
    Effect.gen(function*() {
      const failing = makeUpstream((request) =>
        Effect.fail(new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request }) }))
      )
      const failed = yield* serve(
        OtlpProxy.layer({ baseUrl: "https://otlp.example" }),
        failing.client,
        post("/v1/traces", new Uint8Array([1]))
      )
      assert.strictEqual(failed.status, 502)

      const hanging = makeUpstream(() => Effect.never)
      const timedOut = yield* serve(
        OtlpProxy.layer({ baseUrl: "https://otlp.example", timeout: "10 millis" }),
        hanging.client,
        post("/v1/traces", new Uint8Array([1]))
      )
      assert.strictEqual(timedOut.status, 504)
    }))

  it.effect("layerFromConfig resolves the upstream endpoint and headers per signal", () =>
    Effect.gen(function*() {
      const upstream = makeUpstream()
      const proxy = OtlpProxy.layerFromConfig().pipe(
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({
          env: {
            OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.example",
            OTEL_EXPORTER_OTLP_HEADERS: "authorization=Basic%20c2hhcmVk",
            OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "http://logs.example/custom",
            OTEL_EXPORTER_OTLP_LOGS_HEADERS: "authorization=Basic%20bG9ncw=="
          }
        })))
      )

      yield* serve(proxy, upstream.client, post("/v1/logs", new Uint8Array([1])))
      yield* serve(proxy, upstream.client, post("/v1/metrics", new Uint8Array([1])))

      assert.deepStrictEqual(
        upstream.requests.map((request) => [request.url, request.headers.authorization]),
        [
          ["http://logs.example/custom", "Basic bG9ncw=="],
          ["http://collector.example/v1/metrics", "Basic c2hhcmVk"]
        ]
      )
    }))
})
