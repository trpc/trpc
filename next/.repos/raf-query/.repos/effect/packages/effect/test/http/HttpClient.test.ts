import { assert, describe, it } from "@effect/vitest"
import { strictEqual } from "@effect/vitest/utils"
import { Clock, Duration, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { RateLimiter } from "effect/persistence"
import { TestClock } from "effect/testing"
import * as Tracer from "effect/Tracer"

const makeStatusClient = Effect.fnUntraced(function*(status: number) {
  const attempts = yield* Ref.make(0)
  const client = HttpClient.make((request) =>
    Effect.gen(function*() {
      yield* Ref.update(attempts, (n) => n + 1)
      return HttpClientResponse.fromWeb(request, new Response(null, { status }))
    })
  )
  return { attempts, client } as const
})

const makeRedirectClient = Effect.fnUntraced(function*(status: number, location: string | ReadonlyArray<string>) {
  const locations = typeof location === "string" ? [location] : location
  const requests = yield* Ref.make<Array<HttpClientRequest.HttpClientRequest>>([])
  const client = HttpClient.make((request) =>
    Effect.map(
      Ref.updateAndGet(requests, (requests) => [...requests, request]),
      (requests) =>
        HttpClientResponse.fromWeb(
          request,
          requests.length <= locations.length
            ? new Response(null, { status, headers: { location: locations[requests.length - 1] } })
            : new Response(null, { status: 200 })
        )
    )
  ).pipe(HttpClient.followRedirects())
  return { client, requests } as const
})

const RateLimiterTestLayer = RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory))

describe("HttpClient", () => {
  it.effect("applies JSON revivers to response schema decoders", () =>
    Effect.gen(function*() {
      const makeResponse = () =>
        HttpClientResponse.fromWeb(
          HttpClientRequest.get("https://example.com"),
          new Response("{\"value\":\"original\"}")
        )
      const options = {
        reviver: (key: string, value: unknown) => key === "value" ? "revived" : value
      }

      assert.deepStrictEqual(
        yield* HttpClientResponse.schemaBodyJson(Schema.Struct({ value: Schema.String }), options)(makeResponse()),
        { value: "revived" }
      )
      assert.deepStrictEqual(
        yield* HttpClientResponse.schemaJson(
          Schema.Struct({ body: Schema.Struct({ value: Schema.String }) }),
          options
        )(makeResponse()),
        { body: { value: "revived" } }
      )
    }))

  it.effect("forwards parse options to response schema decoders", () =>
    Effect.gen(function*() {
      const response = HttpClientResponse.fromWeb(
        HttpClientRequest.get("https://example.com"),
        new Response("{}")
      )
      const error = yield* HttpClientResponse.schemaJson(
        Schema.Struct({
          body: Schema.Struct({
            a: Schema.String,
            b: Schema.String
          })
        }),
        { errors: "all" }
      )(response).pipe(Effect.flip)

      assert.strictEqual(
        error.message,
        `Missing key
  at ["body"]["a"]
Missing key
  at ["body"]["b"]`
      )
    }))

  it.effect("forwards parse options to response schema decoders without a body", () =>
    Effect.gen(function*() {
      const response = HttpClientResponse.fromWeb(
        HttpClientRequest.get("https://example.com"),
        new Response(null)
      )
      const error = yield* HttpClientResponse.schemaNoBody(
        Schema.Struct({
          headers: Schema.Struct({
            a: Schema.String,
            b: Schema.String
          })
        }),
        { errors: "all" }
      )(response).pipe(Effect.flip)

      assert.strictEqual(
        error.message,
        `Missing key
  at ["headers"]["a"]
Missing key
  at ["headers"]["b"]`
      )
    }))

  it.effect("preserves a raw large integer through schemaBodyJson reviver context", () =>
    Effect.gen(function*() {
      const response = HttpClientResponse.fromWeb(
        HttpClientRequest.get("https://example.com"),
        new Response("{\"value\":9223372036854775807}")
      )
      const reviver = ((key: string, value: unknown, context: { readonly source: string }) =>
        key === "value" ? context.source : value) as Parameters<typeof JSON.parse>[1]

      const decoded = yield* HttpClientResponse.schemaBodyJson(
        Schema.Struct({ value: Schema.String }),
        { reviver }
      )(response)

      assert.strictEqual(decoded.value, "9223372036854775807")
    }))

  it.effect("preserves source bytes after reading response text", () =>
    Effect.gen(function*() {
      const response = HttpClientResponse.fromWeb(
        HttpClientRequest.get("https://example.com"),
        new Response(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))
      )
      yield* response.text
      const bytes = new Uint8Array(yield* response.arrayBuffer)
      assert.deepStrictEqual(Array.from(bytes), [0xef, 0xbb, 0xbf, 0x61])
    }))

  describe("tracer", () => {
    it.effect("includes request and response headers by default", () =>
      Effect.gen(function*() {
        let clientSpan: Tracer.NativeSpan | undefined
        const tracer = Tracer.make({
          span(options) {
            clientSpan = new Tracer.NativeSpan(options)
            return clientSpan
          }
        })
        const client = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(null, {
                headers: { "x-response-default": "response" }
              })
            )
          )
        )

        yield* client.get("http://test/", {
          headers: { "x-request-default": "request" }
        }).pipe(Effect.provideService(Tracer.Tracer, tracer))

        assert(clientSpan !== undefined)
        assert.strictEqual(clientSpan.attributes.get("http.request.header.x-request-default"), "request")
        assert.strictEqual(clientSpan.attributes.get("http.response.header.x-response-default"), "response")
      }))

    it.effect("filters request and response header span attributes", () =>
      Effect.gen(function*() {
        let clientSpan: Tracer.NativeSpan | undefined
        const tracer = Tracer.make({
          span(options) {
            clientSpan = new Tracer.NativeSpan(options)
            return clientSpan
          }
        })
        const client = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(null, {
                headers: {
                  "x-response-drop": "drop",
                  "x-response-keep": "keep"
                }
              })
            )
          )
        )

        yield* client.get("http://test/", {
          headers: {
            "x-request-drop": "drop",
            "x-request-keep": "keep"
          }
        }).pipe(
          Effect.provideService(HttpClient.TracerHeaderFilter, (name) => name.endsWith("-keep")),
          Effect.provideService(Tracer.Tracer, tracer)
        )

        assert(clientSpan !== undefined)
        assert.strictEqual(clientSpan.attributes.get("http.request.header.x-request-drop"), undefined)
        assert.strictEqual(clientSpan.attributes.get("http.request.header.x-request-keep"), "keep")
        assert.strictEqual(clientSpan.attributes.get("http.response.header.x-response-drop"), undefined)
        assert.strictEqual(clientSpan.attributes.get("http.response.header.x-response-keep"), "keep")
      }))

    it.effect("filters the same header name independently by phase", () =>
      Effect.gen(function*() {
        let clientSpan: Tracer.NativeSpan | undefined
        const tracer = Tracer.make({
          span(options) {
            clientSpan = new Tracer.NativeSpan(options)
            return clientSpan
          }
        })
        const client = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(null, {
                headers: { "x-phase-filter": "response" }
              })
            )
          )
        )

        yield* client.get("http://test/", {
          headers: { "x-phase-filter": "request" }
        }).pipe(
          Effect.provideService(HttpClient.TracerHeaderFilter, (_name, phase) => phase === "response"),
          Effect.provideService(Tracer.Tracer, tracer)
        )

        assert(clientSpan !== undefined)
        assert.strictEqual(clientSpan.attributes.get("http.request.header.x-phase-filter"), undefined)
        assert.strictEqual(clientSpan.attributes.get("http.response.header.x-phase-filter"), "response")
      }))
  })

  describe("followRedirects", () => {
    it.effect("preserves preprocessing error recovery", () =>
      Effect.gen(function*() {
        const request = HttpClientRequest.get("https://origin.test/")
        const recovered = HttpClientResponse.fromWeb(request, new Response(null, { status: 418 }))
        const client = HttpClient.make((request) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })))
        ).pipe(
          HttpClient.mapRequestEffect(() => Effect.fail("preprocessing failed")),
          HttpClient.catch(() => Effect.succeed(recovered)),
          HttpClient.followRedirects()
        )

        const response = yield* client.execute(request)

        assert.strictEqual(response, recovered)
      }))

    it.effect("preserves credential headers on same-origin redirects", () =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeRedirectClient(302, "https://origin.test/destination")
        yield* client.get("https://origin.test/start", {
          headers: {
            Authorization: "Bearer secret",
            Cookie: "session=secret"
          }
        })

        const redirected = (yield* Ref.get(requests))[1]
        assert.strictEqual(redirected.headers.authorization, "Bearer secret")
        assert.strictEqual(redirected.headers.cookie, "session=secret")
      }))

    it.effect("strips credential headers on cross-origin redirects", () =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeRedirectClient(302, "https://redirect.test/destination")
        yield* client.get("https://origin.test/start", {
          headers: {
            Authorization: "Bearer secret",
            Cookie: "session=secret",
            "Proxy-Authorization": "Basic secret",
            "X-Test": "retained"
          }
        })

        const redirected = (yield* Ref.get(requests))[1]
        assert.isUndefined(redirected.headers.authorization)
        assert.isUndefined(redirected.headers.cookie)
        assert.isUndefined(redirected.headers["proxy-authorization"])
        assert.strictEqual(redirected.headers["x-test"], "retained")
      }))

    it.effect("strips credential headers on scheme downgrade redirects", () =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeRedirectClient(302, "http://origin.test/destination")
        yield* client.get("https://origin.test/start", {
          headers: {
            Authorization: "Bearer secret",
            Cookie: "session=secret",
            "Proxy-Authorization": "Basic secret"
          }
        })

        const redirected = (yield* Ref.get(requests))[1]
        assert.isUndefined(redirected.headers.authorization)
        assert.isUndefined(redirected.headers.cookie)
        assert.isUndefined(redirected.headers["proxy-authorization"])
      }))

    it.effect("resolves relative locations against the current hop", () =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeRedirectClient(302, ["../next/step", "destination"])
        yield* client.get("https://origin.test/path/start", {
          headers: { Authorization: "Bearer secret" }
        })

        const redirected = (yield* Ref.get(requests))[2]
        assert.strictEqual(redirected.url, "https://origin.test/next/destination")
        assert.strictEqual(redirected.headers.authorization, "Bearer secret")
      }))

    it.effect("switches 303 requests to GET and drops the body", () =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeRedirectClient(303, "/destination")
        yield* HttpClientRequest.post("https://origin.test/start").pipe(
          HttpClientRequest.bodyText("payload"),
          client.execute
        )

        const redirected = (yield* Ref.get(requests))[1]
        assert.strictEqual(redirected.method, "GET")
        assert.strictEqual(redirected.body._tag, "Empty")
        assert.isUndefined(redirected.headers["content-type"])
        assert.isUndefined(redirected.headers["content-length"])
      }))

    it.effect.each([301, 302])("switches POST to GET on %s redirects", (status) =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeRedirectClient(status, "/destination")
        yield* HttpClientRequest.post("https://origin.test/start").pipe(
          HttpClientRequest.bodyText("payload"),
          client.execute
        )

        const redirected = (yield* Ref.get(requests))[1]
        assert.strictEqual(redirected.method, "GET")
        assert.strictEqual(redirected.body._tag, "Empty")
      }))

    it.effect.each([301, 302])("preserves non-POST methods on %s redirects", (status) =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeRedirectClient(status, "/destination")
        yield* HttpClientRequest.put("https://origin.test/start").pipe(
          HttpClientRequest.bodyText("payload"),
          client.execute
        )

        const redirected = (yield* Ref.get(requests))[1]
        assert.strictEqual(redirected.method, "PUT")
        assert.strictEqual(redirected.body._tag, "Uint8Array")
      }))
  })

  describe("retryTransient", () => {
    it.effect("retries transient responses with retryOn errors-and-responses", () =>
      Effect.gen(function*() {
        const { attempts, client } = yield* makeStatusClient(503)
        const retryClient = client.pipe(HttpClient.retryTransient({ retryOn: "errors-and-responses", times: 2 }))
        yield* retryClient.get("http://test/").pipe(Effect.ignore)
        strictEqual(yield* Ref.get(attempts), 3)
      }))

    it.effect("does not retry transient responses with retryOn errors-only", () =>
      Effect.gen(function*() {
        const { attempts, client } = yield* makeStatusClient(503)
        const retryClient = client.pipe(HttpClient.retryTransient({ retryOn: "errors-only", times: 2 }))
        yield* retryClient.get("http://test/").pipe(Effect.ignore)
        strictEqual(yield* Ref.get(attempts), 1)
      }))
  })

  describe("stream", () => {
    it.effect("aborts the request when the response stream ends early", () =>
      Effect.gen(function*() {
        let signal: AbortSignal | undefined
        const client = HttpClient.make((request, _url, requestSignal) =>
          Effect.sync(() => {
            signal = requestSignal
            return HttpClientResponse.fromWeb(
              request,
              new Response(
                new ReadableStream<Uint8Array>({
                  pull(controller) {
                    controller.enqueue(Uint8Array.of(1))
                  }
                }),
                { status: 200 }
              )
            )
          })
        )

        const response = yield* client.get("http://test/")
        const chunks = yield* response.stream.pipe(
          Stream.take(5),
          Stream.runCollect
        )

        assert.strictEqual(Array.from(chunks).length, 5)
        assert.isTrue(signal!.aborted)
      }))
  })

  describe("withRateLimiter", () => {
    it.effect("delays requests above the configured limit", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const client = HttpClient.make((request) =>
          Effect.gen(function*() {
            yield* Ref.update(attempts, (n) => n + 1)
            return HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
          })
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "test",
            limit: 1,
            window: "1 minute"
          })
        )

        const fiber = yield* client.get("http://test/").pipe(
          Effect.andThen(client.get("http://test/")),
          Effect.forkChild
        )

        yield* TestClock.adjust("59 seconds")
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("1 second")
        yield* Fiber.join(fiber)

        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("updates limits from response headers by default", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const client = HttpClient.make((request) =>
          Effect.flatMap(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  attempt === 1
                    ? new Response(null, {
                      status: 200,
                      headers: {
                        "x-ratelimit-limit": "1",
                        "x-ratelimit-reset": "60"
                      }
                    })
                    : new Response(null, { status: 200 })
                )
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "test",
            limit: 10,
            window: "1 minute"
          })
        )

        const fiber = yield* client.get("http://test/").pipe(
          Effect.andThen(client.get("http://test/")),
          Effect.forkChild
        )

        yield* TestClock.adjust("5 seconds")
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("1 minute")
        yield* Fiber.join(fiber)
        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("updates limits from custom response headers", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const client = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 200,
                    headers: {
                      "x-vendor-limit": "1",
                      "x-vendor-reset": "60"
                    }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "custom-limit",
            limit: 10,
            window: "1 minute",
            responseHeaders: {
              limit: "X-Vendor-Limit",
              reset: "X-Vendor-Reset"
            }
          })
        )

        const fiber = yield* client.get("http://test/").pipe(
          Effect.andThen(client.get("http://test/")),
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust("5 seconds")
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("1 minute")
        yield* Fiber.join(fiber)
        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("inspects remaining headers to infer updated limits", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const limiter = yield* RateLimiter.RateLimiter
        const client = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 200,
                    headers: {
                      "x-ratelimit-remaining": "0",
                      "x-ratelimit-reset-after": "60"
                    }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter,
            key: "test",
            limit: 10,
            window: "1 minute"
          })
        )

        const fiber = yield* client.get("http://test/").pipe(
          Effect.andThen(client.get("http://test/")),
          Effect.forkChild({ startImmediately: true })
        )

        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("10 seconds")
        yield* Fiber.join(fiber)
        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("inspects custom remaining and reset-after headers", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const limiter = yield* RateLimiter.RateLimiter
        const client = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 200,
                    headers: {
                      "x-vendor-remaining": "0",
                      "x-vendor-reset-after": "60"
                    }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter,
            key: "custom-remaining",
            limit: 10,
            window: "1 minute",
            responseHeaders: {
              remaining: "X-Vendor-Remaining",
              resetAfter: "X-Vendor-Reset-After"
            }
          })
        )

        const fiber = yield* client.get("http://test/").pipe(
          Effect.andThen(client.get("http://test/")),
          Effect.forkChild({ startImmediately: true })
        )

        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("10 seconds")
        yield* Fiber.join(fiber)
        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("uses custom header overrides without falling back to built-in names", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const client = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 200,
                    headers: {
                      "x-ratelimit-limit": "1",
                      "x-ratelimit-reset": "60"
                    }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "custom-override",
            limit: 10,
            window: "1 minute",
            responseHeaders: {
              limit: "X-Vendor-Limit"
            }
          })
        )

        yield* client.get("http://test/")
        yield* client.get("http://test/")

        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("can disable response header inspection", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const limiter = yield* RateLimiter.RateLimiter
        const client = HttpClient.make((request) =>
          Effect.flatMap(
            Ref.updateAndGet(attempts, (n) => n + 1),
            () =>
              Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  new Response(null, {
                    status: 200,
                    headers: {
                      "x-ratelimit-limit": "1",
                      "x-ratelimit-reset": "60"
                    }
                  })
                )
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter,
            key: "test",
            limit: 10,
            window: "1 minute",
            disableResponseInspection: true
          })
        )

        yield* client.get("http://test/")
        yield* client.get("http://test/")

        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("retries 429 responses through the limiter", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const limiter = yield* RateLimiter.RateLimiter
        const client = HttpClient.make((request) =>
          Effect.flatMap(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  new Response(null, {
                    status: attempt === 1 ? 429 : 200
                  })
                )
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter,
            key: "test",
            limit: 1,
            window: "1 minute",
            disableResponseInspection: true
          })
        )

        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild)

        yield* TestClock.adjust("59 seconds")
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("1 second")
        const response = yield* Fiber.join(fiber)

        strictEqual(response.status, 200)
        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("retries HttpClientError 429 failures through the limiter", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const limiter = yield* RateLimiter.RateLimiter
        const client = HttpClient.make((request) =>
          Effect.flatMap(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  new Response(null, {
                    status: attempt === 1 ? 429 : 200
                  })
                )
              )
          )
        ).pipe(
          HttpClient.filterStatusOk,
          HttpClient.withRateLimiter({
            limiter,
            key: "test",
            limit: 1,
            window: "1 minute",
            disableResponseInspection: true
          })
        )

        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild)

        yield* TestClock.adjust("59 seconds")
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("1 second")
        const response = yield* Fiber.join(fiber)

        strictEqual(response.status, 200)
        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("bounds automatic 429 response retries", () =>
      Effect.gen(function*() {
        const { attempts, client } = yield* makeStatusClient(429)
        const limitedClient = client.pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "bounded-response",
            limit: 100,
            window: "1 minute",
            times: 2,
            disableResponseInspection: true
          })
        )

        const response = yield* limitedClient.get("http://test/")

        strictEqual(response.status, 429)
        strictEqual(yield* Ref.get(attempts), 3)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("bounds automatic HttpClientError 429 retries", () =>
      Effect.gen(function*() {
        const { attempts, client } = yield* makeStatusClient(429)
        const limitedClient = client.pipe(
          HttpClient.filterStatusOk,
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "bounded-error",
            limit: 100,
            window: "1 minute",
            times: 2,
            disableResponseInspection: true
          })
        )

        const error = yield* limitedClient.get("http://test/").pipe(Effect.flip)

        strictEqual(error._tag, "HttpClientError")
        strictEqual(error.reason._tag, "StatusCodeError")
        if (error.reason._tag === "StatusCodeError") {
          strictEqual(error.reason.response.status, 429)
        }
        strictEqual(yield* Ref.get(attempts), 3)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("uses a custom Retry-After header", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const client = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 429,
                    headers: { "x-vendor-retry-after": "10" }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "custom-retry-after",
            limit: 100,
            window: "1 minute",
            times: 1,
            responseHeaders: {
              retryAfter: "X-Vendor-Retry-After"
            },
            disableAdaptiveLearning: true
          })
        )

        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("9 seconds")
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("1 second")
        const response = yield* Fiber.join(fiber)

        strictEqual(response.status, 200)
        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("applies adaptive cooldown to requests delayed by the configured limiter", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make<Array<number>>([])
        const limiter = yield* RateLimiter.RateLimiter
        let previous: number | undefined
        const client = HttpClient.make((request) =>
          Effect.gen(function*() {
            const now = yield* Clock.currentTimeMillis
            const status = previous !== undefined && now - previous < 2_000 ? 429 : 200
            previous = now
            yield* Ref.update(attempts, (statuses) => [...statuses, status])
            return HttpClientResponse.fromWeb(
              request,
              status === 429
                ? new Response(null, { status, headers: { "retry-after": "2" } })
                : new Response(null, { status })
            )
          })
        ).pipe(
          HttpClient.withRateLimiter({
            limiter,
            key: "adaptive-delayed",
            limit: 1,
            window: "1 second"
          })
        )

        const fiber = yield* Effect.all([
          client.get("http://test/1"),
          client.get("http://test/2"),
          client.get("http://test/3"),
          client.get("http://test/4"),
          client.get("http://test/5")
        ], { concurrency: "unbounded" }).pipe(Effect.forkChild({ startImmediately: true }))

        strictEqual((yield* Ref.get(attempts)).length, 1)

        yield* TestClock.adjust("1 second")
        strictEqual((yield* Ref.get(attempts)).length, 2)

        yield* TestClock.adjust("1 second")
        strictEqual((yield* Ref.get(attempts)).length, 2)

        yield* TestClock.adjust("1 second")
        assert.deepStrictEqual(yield* Ref.get(attempts), [200, 429, 200, 429])

        yield* TestClock.adjust("6 seconds")
        yield* Fiber.join(fiber)

        const statuses = yield* Ref.get(attempts)
        assert.strictEqual(statuses.filter((status) => status === 429).length, 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("coordinates Retry-After cooldown across clients sharing a memory store", () =>
      Effect.gen(function*() {
        const attemptsA = yield* Ref.make(0)
        const attemptsB = yield* Ref.make(0)
        const limiterA = yield* RateLimiter.make
        const limiterB = yield* RateLimiter.make
        const clientA = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attemptsA, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 429,
                    headers: { "retry-after": "10" }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: limiterA,
            key: "shared",
            limit: 100,
            window: "1 minute"
          })
        )
        const clientB = HttpClient.make((request) =>
          Effect.as(
            Ref.update(attemptsB, (n) => n + 1),
            HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: limiterB,
            key: "shared",
            limit: 100,
            window: "1 minute"
          })
        )

        const fiberA = yield* clientA.get("http://test/a").pipe(Effect.forkChild({ startImmediately: true }))
        strictEqual(yield* Ref.get(attemptsA), 1)

        const fiberB = yield* clientB.get("http://test/b").pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust("9 seconds")
        strictEqual(yield* Ref.get(attemptsB), 0)

        yield* TestClock.adjust("1 second")
        yield* Fiber.join(fiberA)
        yield* Fiber.join(fiberB)

        strictEqual(yield* Ref.get(attemptsA), 2)
        strictEqual(yield* Ref.get(attemptsB), 1)
      }).pipe(Effect.provide(RateLimiter.layerStoreMemory)))

    it.effect("applies Retry-After feedback when automatic retries are disabled", () =>
      Effect.gen(function*() {
        const attemptsB = yield* Ref.make(0)
        const limiterA = yield* RateLimiter.make
        const limiterB = yield* RateLimiter.make
        const clientA = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(null, {
                status: 429,
                headers: { "retry-after": "10" }
              })
            )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: limiterA,
            key: "terminal-feedback",
            limit: 100,
            window: "1 minute",
            times: 0
          })
        )
        const clientB = HttpClient.make((request) =>
          Effect.as(
            Ref.update(attemptsB, (n) => n + 1),
            HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: limiterB,
            key: "terminal-feedback",
            limit: 100,
            window: "1 minute"
          })
        )

        const response = yield* clientA.get("http://test/a")
        strictEqual(response.status, 429)

        const fiberB = yield* clientB.get("http://test/b").pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust("9 seconds")
        strictEqual(yield* Ref.get(attemptsB), 0)

        yield* TestClock.adjust("1 second")
        yield* Fiber.join(fiberB)
        strictEqual(yield* Ref.get(attemptsB), 1)
      }).pipe(Effect.provide(RateLimiter.layerStoreMemory)))

    it.effect("learns adaptive pacing from Retry-After feedback", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const limiter = yield* RateLimiter.make
        const client = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1 || attempt === 4
                  ? new Response(null, {
                    status: 429,
                    headers: { "retry-after": "10" }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter,
            key: "learned",
            limit: 100,
            window: "1 minute"
          })
        )

        const first = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        strictEqual(yield* Ref.get(attempts), 1)
        yield* TestClock.adjust("10 seconds")
        yield* Fiber.join(first)
        strictEqual(yield* Ref.get(attempts), 2)

        yield* client.get("http://test/")
        strictEqual(yield* Ref.get(attempts), 3)

        const learning = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        strictEqual(yield* Ref.get(attempts), 4)
        yield* TestClock.adjust("10 seconds")
        yield* Fiber.join(learning)
        strictEqual(yield* Ref.get(attempts), 5)

        const paced = yield* client.get("http://test/").pipe(
          Effect.andThen(client.get("http://test/")),
          Effect.forkChild({ startImmediately: true })
        )
        strictEqual(yield* Ref.get(attempts), 6)

        yield* TestClock.adjust("9 seconds")
        strictEqual(yield* Ref.get(attempts), 6)

        yield* TestClock.adjust("1 second")
        yield* Fiber.join(paced)
        strictEqual(yield* Ref.get(attempts), 7)
      }).pipe(Effect.provide(RateLimiter.layerStoreMemory)))

    it.effect("applies Retry-After feedback from HttpClientError response failures", () =>
      Effect.gen(function*() {
        const attemptsA = yield* Ref.make(0)
        const attemptsB = yield* Ref.make(0)
        const limiterA = yield* RateLimiter.make
        const limiterB = yield* RateLimiter.make
        const clientA = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attemptsA, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 429,
                    headers: { "retry-after": "10" }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.filterStatusOk,
          HttpClient.withRateLimiter({
            limiter: limiterA,
            key: "failure",
            limit: 100,
            window: "1 minute"
          })
        )
        const clientB = HttpClient.make((request) =>
          Effect.as(
            Ref.update(attemptsB, (n) => n + 1),
            HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: limiterB,
            key: "failure",
            limit: 100,
            window: "1 minute"
          })
        )

        const fiberA = yield* clientA.get("http://test/a").pipe(Effect.forkChild({ startImmediately: true }))
        strictEqual(yield* Ref.get(attemptsA), 1)

        const fiberB = yield* clientB.get("http://test/b").pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust("9 seconds")
        strictEqual(yield* Ref.get(attemptsB), 0)

        yield* TestClock.adjust("1 second")
        yield* Fiber.join(fiberA)
        yield* Fiber.join(fiberB)

        strictEqual(yield* Ref.get(attemptsA), 2)
        strictEqual(yield* Ref.get(attemptsB), 1)
      }).pipe(Effect.provide(RateLimiter.layerStoreMemory)))

    it.effect("does not send adaptive feedback when response inspection is disabled", () =>
      Effect.gen(function*() {
        const disabledAttempts = yield* Ref.make(0)
        const enabledAttempts = yield* Ref.make(0)
        const disabledLimiter = yield* RateLimiter.make
        const enabledLimiter = yield* RateLimiter.make
        const disabledClient = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(disabledAttempts, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 429,
                    headers: { "retry-after": "10" }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: disabledLimiter,
            key: "disabled",
            limit: 100,
            window: "1 minute",
            disableResponseInspection: true
          })
        )
        const enabledClient = HttpClient.make((request) =>
          Effect.as(
            Ref.update(enabledAttempts, (n) => n + 1),
            HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: enabledLimiter,
            key: "disabled",
            limit: 100,
            window: "1 minute"
          })
        )

        const disabledResponse = yield* disabledClient.get("http://test/disabled")
        strictEqual(disabledResponse.status, 200)
        strictEqual(yield* Ref.get(disabledAttempts), 2)

        const fiber = yield* enabledClient.get("http://test/enabled").pipe(Effect.forkChild({ startImmediately: true }))
        strictEqual(yield* Ref.get(enabledAttempts), 1)
        yield* Fiber.join(fiber)
      }).pipe(Effect.provide(RateLimiter.layerStoreMemory)))

    it.effect("can disable adaptive learning without disabling response inspection", () =>
      Effect.gen(function*() {
        const disabledAttempts = yield* Ref.make(0)
        const enabledAttempts = yield* Ref.make(0)
        const disabledLimiter = yield* RateLimiter.make
        const enabledLimiter = yield* RateLimiter.make
        const disabledClient = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(disabledAttempts, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 429,
                    headers: { "retry-after": "10" }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: disabledLimiter,
            key: "adaptive-disabled",
            limit: 100,
            window: "1 minute",
            disableAdaptiveLearning: true
          })
        )
        const enabledClient = HttpClient.make((request) =>
          Effect.as(
            Ref.update(enabledAttempts, (n) => n + 1),
            HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: enabledLimiter,
            key: "adaptive-disabled",
            limit: 100,
            window: "1 minute"
          })
        )

        const disabled = yield* disabledClient.get("http://test/disabled").pipe(
          Effect.forkChild({ startImmediately: true })
        )
        strictEqual(yield* Ref.get(disabledAttempts), 1)

        const enabled = yield* enabledClient.get("http://test/enabled").pipe(
          Effect.forkChild({ startImmediately: true })
        )
        strictEqual(yield* Ref.get(enabledAttempts), 1)
        yield* Fiber.join(enabled)

        yield* TestClock.adjust("9 seconds")
        strictEqual(yield* Ref.get(disabledAttempts), 1)

        yield* TestClock.adjust("1 second")
        yield* Fiber.join(disabled)
        strictEqual(yield* Ref.get(disabledAttempts), 2)
      }).pipe(Effect.provide(RateLimiter.layerStoreMemory)))

    it.effect("keeps adaptive Retry-After state isolated by resolved key", () =>
      Effect.gen(function*() {
        const attemptsA = yield* Ref.make(0)
        const attemptsB = yield* Ref.make(0)
        const limiter = yield* RateLimiter.make
        const clientA = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attemptsA, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 429,
                    headers: { "retry-after": "10" }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter,
            key: "a",
            limit: 100,
            window: "1 minute"
          })
        )
        const clientB = HttpClient.make((request) =>
          Effect.as(
            Ref.update(attemptsB, (n) => n + 1),
            HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter,
            key: "b",
            limit: 100,
            window: "1 minute"
          })
        )

        const fiberA = yield* clientA.get("http://test/a").pipe(Effect.forkChild({ startImmediately: true }))
        strictEqual(yield* Ref.get(attemptsA), 1)

        const fiberB = yield* clientB.get("http://test/b").pipe(Effect.forkChild({ startImmediately: true }))
        strictEqual(yield* Ref.get(attemptsB), 1)
        yield* Fiber.join(fiberB)

        yield* TestClock.adjust("10 seconds")
        yield* Fiber.join(fiberA)
        strictEqual(yield* Ref.get(attemptsA), 2)
      }).pipe(Effect.provide(RateLimiter.layerStoreMemory)))

    it.effect("prefers explicit RateLimit reset headers over adaptive Retry-After feedback", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const limiter = yield* RateLimiter.make
        const client = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                attempt === 1
                  ? new Response(null, {
                    status: 429,
                    headers: {
                      "retry-after": "60",
                      "x-ratelimit-limit": "1",
                      "x-ratelimit-reset-after": "1"
                    }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter,
            key: "explicit",
            limit: 100,
            window: "1 minute"
          })
        )

        const retry = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust(Duration.millis(999))
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust(Duration.millis(1))
        yield* Fiber.join(retry)
        strictEqual(yield* Ref.get(attempts), 2)

        const next = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust(Duration.millis(999))
        strictEqual(yield* Ref.get(attempts), 2)

        yield* TestClock.adjust(Duration.millis(1))
        yield* Fiber.join(next)
        strictEqual(yield* Ref.get(attempts), 3)
      }).pipe(Effect.provide(RateLimiter.layerStoreMemory)))
  })
})
