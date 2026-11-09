import { assert, describe, it, vi } from "@effect/vitest"
import { strictEqual } from "@effect/vitest/utils"
import {
  Cause,
  Clock,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Redacted,
  Ref,
  Schedule,
  Schema,
  Stream
} from "effect"
import { Cookies, HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse, UrlParams } from "effect/http"
import { CircuitBreaker, RateLimiter } from "effect/persistence"
import { TestClock } from "effect/testing"
import * as Tracer from "effect/Tracer"
import { inspect } from "node:util"
import { collectGarbage } from "../utils/gc.ts"

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

const makeSequenceClient = Effect.fnUntraced(function*(
  responses: ReadonlyArray<{ readonly status: number; readonly headers?: Record<string, string> }>
) {
  const attempts = yield* Ref.make(0)
  const client = HttpClient.make((request) =>
    Effect.map(
      Ref.getAndUpdate(attempts, (n) => n + 1),
      (n) => HttpClientResponse.fromWeb(request, new Response(null, responses[Math.min(n, responses.length - 1)]))
    )
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

const classifiedRequest = HttpClientRequest.get("http://test/")
const classifiedResponse = (status: number, headers: Record<string, string> = {}) =>
  HttpClientResponse.fromWeb(classifiedRequest, new Response(null, { status, headers }))
const statusCodeError = (status: number, headers?: Record<string, string>) =>
  new HttpClientError.HttpClientError({
    reason: new HttpClientError.StatusCodeError({
      request: classifiedRequest,
      response: classifiedResponse(status, headers)
    })
  })
const transportError = new HttpClientError.HttpClientError({
  reason: new HttpClientError.TransportError({ request: classifiedRequest })
})
const encodeError = new HttpClientError.HttpClientError({
  reason: new HttpClientError.EncodeError({ request: classifiedRequest })
})
const failures = (...errors: ReadonlyArray<unknown>) =>
  Exit.failCause(Cause.fromReasons(errors.map((error) => Cause.makeFailReason(error))))

const circuitOpenKey = (error: unknown) =>
  error instanceof CircuitBreaker.CircuitBreakerError && error.reason._tag === "CircuitOpen"
    ? error.reason.key
    : undefined

const classifierCases: ReadonlyArray<{
  readonly name: string
  readonly exit: (nowMillis: number) => Exit.Exit<HttpClientResponse.HttpClientResponse, unknown>
  readonly outcome: CircuitBreaker.Outcome["_tag"]
  readonly retryAfterMillis?: number
}> = [
  {
    name: "a returned 503 with Retry-After seconds",
    exit: () => Exit.succeed(classifiedResponse(503, { "retry-after": "5" })),
    outcome: "Failure",
    retryAfterMillis: 5_000
  },
  {
    name: "a wrapped 503 with a Retry-After HTTP date",
    exit: (nowMillis) => Exit.fail(statusCodeError(503, { "retry-after": new Date(nowMillis + 30_000).toUTCString() })),
    outcome: "Failure",
    retryAfterMillis: 30_000
  },
  { name: "a TransportError", exit: () => Exit.fail(transportError), outcome: "Failure" },
  { name: "a TimeoutError", exit: () => Exit.fail(new Cause.TimeoutError()), outcome: "Failure" },
  { name: "a wrapped 404", exit: () => Exit.fail(statusCodeError(404)), outcome: "Success" },
  {
    name: "a returned 429",
    exit: () => Exit.succeed(classifiedResponse(429, { "retry-after": "5" })),
    outcome: "Ignored"
  },
  { name: "an EncodeError", exit: () => Exit.fail(encodeError), outcome: "Ignored" },
  { name: "a defect", exit: () => Exit.die(new Error("caller bug")), outcome: "Ignored" },
  {
    name: "an unknown typed error",
    exit: () =>
      Exit.fail(
        new RateLimiter.RateLimiterError({
          reason: new RateLimiter.RateLimitStoreError({ message: "store unavailable" })
        })
      ),
    outcome: "Ignored"
  },
  {
    name: "a success beside an ignored error",
    exit: () => failures(encodeError, statusCodeError(404)),
    outcome: "Success"
  },
  {
    name: "failures beside a success and an ignored error",
    exit: () =>
      failures(
        statusCodeError(404),
        statusCodeError(503, { "retry-after": "5" }),
        statusCodeError(429, { "retry-after": "60" }),
        statusCodeError(502, { "retry-after": "10" })
      ),
    outcome: "Failure",
    retryAfterMillis: 10_000
  }
]

describe("HttpClient", () => {
  it.effect("preserves the response stream after JSON serialization", () =>
    Effect.gen(function*() {
      const response = HttpClientResponse.fromWeb(
        HttpClientRequest.get("https://example.com"),
        new Response("data: hello\n\n", { headers: { "content-type": "text/event-stream" } })
      )

      JSON.stringify(response)

      const bytes = yield* Stream.runFold(response.stream, () =>
        Array<number>(), (bytes, chunk) =>
        bytes.concat(Array.from(chunk)))
      assert.deepStrictEqual(bytes, Array.from(new TextEncoder().encode("data: hello\n\n")))
    }))

  it.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "does not retain unread responses without FinalizationRegistry",
    async () => {
      vi.stubGlobal("FinalizationRegistry", undefined)
      try {
        // The response registry is selected when HttpClient is imported.
        vi.resetModules()
        const { Effect } = await import("effect")
        const { HttpClient, HttpClientResponse } = await import("effect/http")
        let reference: WeakRef<HttpClientResponse.HttpClientResponse> | undefined
        const client = HttpClient.make((request) =>
          Effect.sync(() => {
            const response = HttpClientResponse.fromWeb(request, new Response("unread"))
            reference = new WeakRef(response)
            return response
          })
        )

        await Effect.runPromise(Effect.asVoid(client.get("https://example.test/")))
        await Effect.runPromise(collectGarbage)

        assert.isDefined(reference)
        assert.isUndefined(reference!.deref())
      } finally {
        vi.unstubAllGlobals()
        vi.resetModules()
      }
    }
  )

  it("does not throw when unread response cleanup runs outside a Cloudflare request", async () => {
    const cleanups: Array<() => void> = []
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" })
    vi.stubGlobal(
      "FinalizationRegistry",
      class<T> {
        constructor(readonly cleanup: (value: T) => void) {}
        register(_target: object, value: T) {
          cleanups.push(() => this.cleanup(value))
        }
        unregister(_token: object) {
          return true
        }
      }
    )
    let abort: ReturnType<typeof vi.spyOn> | undefined
    try {
      // Select the runtime registry on import, then drive GC cleanup deterministically.
      vi.resetModules()
      const { Effect } = await import("effect")
      const { FetchHttpClient, HttpClient } = await import("effect/http")
      const status = await Effect.runPromise(
        HttpClient.get("https://example.test/").pipe(
          Effect.map((response) => response.status),
          Effect.provide(FetchHttpClient.layer),
          Effect.provideService(
            FetchHttpClient.Fetch,
            Object.assign(async () => new Response("unread"), { preconnect: () => {} })
          )
        )
      )
      assert.strictEqual(status, 200)

      // workerd disallows aborting request I/O from a finalizer outside its request.
      abort = vi.spyOn(AbortController.prototype, "abort").mockImplementation(() => {
        throw new Error("Disallowed operation called within global scope")
      })
      assert.doesNotThrow(() => {
        for (const cleanup of cleanups) cleanup()
      })
    } finally {
      abort?.mockRestore()
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })

  // Stubbing globals and resetting modules would race with the concurrent tests.
  describe("toWeb", { concurrent: false }, () => {
    it("keeps unread response cleanup when toWeb finds no Web response", async () => {
      const cleanups = new Map<object, () => void>()
      vi.stubGlobal(
        "FinalizationRegistry",
        class<T> {
          constructor(readonly cleanup: (value: T) => void) {}
          register(_target: object, value: T, token: object) {
            cleanups.set(token, () => this.cleanup(value))
          }
          unregister(token: object) {
            return cleanups.delete(token)
          }
        }
      )
      try {
        // Select the runtime registry on import, then drive GC cleanup deterministically.
        vi.resetModules()
        const { Effect, Option } = await import("effect")
        const { HttpClient, HttpClientResponse, HttpServerResponse } = await import("effect/http")
        let signal: AbortSignal | undefined
        const client = HttpClient.make((request, _url, requestSignal) =>
          Effect.sync(() => {
            signal = requestSignal
            return HttpServerResponse.toClientResponse(HttpServerResponse.text("unread"), { request })
          })
        )
        const response = await Effect.runPromise(client.get("https://example.test/"))

        assert.isTrue(Option.isNone(HttpClientResponse.toWeb(response)))
        for (const cleanup of cleanups.values()) cleanup()
        assert.isTrue(signal!.aborted)
      } finally {
        vi.unstubAllGlobals()
        vi.resetModules()
      }
    })
  })

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
    it.effect("omits request and response headers by default", () =>
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
        assert.strictEqual(clientSpan.attributes.get("http.request.header.x-request-default"), undefined)
        assert.strictEqual(clientSpan.attributes.get("http.response.header.x-response-default"), undefined)
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

    it.effect("redacts sensitive query params in url attributes", () =>
      Effect.gen(function*() {
        let clientSpan: Tracer.NativeSpan | undefined
        let sentUrl: string | undefined
        const tracer = Tracer.make({
          span(options) {
            clientSpan = new Tracer.NativeSpan(options)
            return clientSpan
          }
        })
        const client = HttpClient.make((request, url) => {
          sentUrl = url.toString()
          return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null)))
        })

        yield* client.get("http://test/path?Signature=sig-secret&page=1", {
          urlParams: { "X-Goog-Signature": "goog-secret" }
        }).pipe(Effect.provideService(Tracer.Tracer, tracer))

        assert(clientSpan !== undefined)
        assert.strictEqual(
          clientSpan.attributes.get("url.full"),
          "http://test/path?Signature=REDACTED&page=1&X-Goog-Signature=REDACTED"
        )
        assert.strictEqual(
          clientSpan.attributes.get("url.query"),
          "Signature=REDACTED&page=1&X-Goog-Signature=REDACTED"
        )
        assert.strictEqual(sentUrl, "http://test/path?Signature=sig-secret&page=1&X-Goog-Signature=goog-secret")
      }))

    it.effect("redacts userinfo in url.full", () =>
      Effect.gen(function*() {
        let clientSpan: Tracer.NativeSpan | undefined
        const tracer = Tracer.make({
          span(options) {
            clientSpan = new Tracer.NativeSpan(options)
            return clientSpan
          }
        })
        const client = HttpClient.make((request) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null)))
        )

        yield* client.get("http://user:password@test/path").pipe(Effect.provideService(Tracer.Tracer, tracer))

        assert(clientSpan !== undefined)
        assert.strictEqual(clientSpan.attributes.get("url.full"), "http://REDACTED:REDACTED@test/path")
      }))

    it.effect("redacts Redacted query params in url attributes", () =>
      Effect.gen(function*() {
        let clientSpan: Tracer.NativeSpan | undefined
        let sentUrl: string | undefined
        const tracer = Tracer.make({
          span(options) {
            clientSpan = new Tracer.NativeSpan(options)
            return clientSpan
          }
        })
        const client = HttpClient.make((request, url) => {
          sentUrl = url.toString()
          return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null)))
        })

        yield* HttpClientRequest.get("http://test/path?page=1#frag").pipe(
          HttpClientRequest.appendUrlParam("remote", Redacted.make("param-secret")),
          HttpClientRequest.appendUrlParam("\uD800", Redacted.make("surrogate-secret")),
          HttpClientRequest.appendUrlParam("q", "visible"),
          client.execute,
          Effect.provideService(Tracer.Tracer, tracer)
        )

        assert(clientSpan !== undefined)
        assert.strictEqual(
          clientSpan.attributes.get("url.full"),
          "http://test/path?page=1&remote=REDACTED&%EF%BF%BD=REDACTED&q=visible#frag"
        )
        assert.strictEqual(
          clientSpan.attributes.get("url.query"),
          "page=1&remote=REDACTED&%EF%BF%BD=REDACTED&q=visible"
        )
        assert.strictEqual(
          sentUrl,
          "http://test/path?page=1&remote=param-secret&%EF%BF%BD=surrogate-secret&q=visible#frag"
        )
      }))

    const makeCapturingClient = () => {
      let sent: HttpClientRequest.HttpClientRequest | undefined
      const client = HttpClient.make((request) => {
        sent = request
        return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null)))
      })
      return { client, sent: () => sent }
    }

    it.effect("sends trace headers by default", () =>
      Effect.gen(function*() {
        const { client, sent } = makeCapturingClient()

        yield* client.get("http://test/")

        const request = sent()
        assert(request !== undefined)
        assert.strictEqual(typeof request.headers.b3, "string")
        assert.strictEqual(typeof request.headers.traceparent, "string")
      }))

    it.effect("omits trace headers when propagation is disabled and keeps the client span", () =>
      Effect.gen(function*() {
        const { client, sent } = makeCapturingClient()
        let clientSpan: Tracer.NativeSpan | undefined
        const tracer = Tracer.make({
          span(options) {
            clientSpan = new Tracer.NativeSpan(options)
            return clientSpan
          }
        })

        yield* client.get("http://test/").pipe(
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.provideService(Tracer.Tracer, tracer)
        )

        const request = sent()
        assert(request !== undefined)
        assert.isUndefined(request.headers.b3)
        assert.isUndefined(request.headers.traceparent)
        assert(clientSpan !== undefined)
      }))
  })

  describe("HttpClientError", () => {
    it.effect("does not expose Redacted query params", () =>
      Effect.gen(function*() {
        const client = HttpClient.make((request) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 500 })))
        ).pipe(HttpClient.filterStatusOk)

        const error = yield* client.get("http://test/path", {
          urlParams: { remote: Redacted.make("param-secret"), q: "visible" }
        }).pipe(Effect.flip)

        for (const output of [JSON.stringify(error), String(error), inspect(error, { depth: 10 })]) {
          assert.notInclude(output, "param-secret")
        }
        assert.include(JSON.stringify(error), "http://test/path")
      }))

    it.effect("does not expose request headers, query params or body in toJSON", () =>
      Effect.gen(function*() {
        const client = HttpClient.make((request) =>
          Effect.fail(new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request }) }))
        )
        const request = HttpClientRequest.post("http://test/join").pipe(
          HttpClientRequest.setHeader("x-token", "header-secret"),
          HttpClientRequest.setUrlParam("token", "query-secret"),
          HttpClientRequest.bodyJsonUnsafe({ JoinToken: "body-secret" })
        )

        const error = yield* client.execute(request).pipe(Effect.flip)

        const json = JSON.stringify(error.toJSON())
        for (const secret of ["header-secret", "query-secret", "body-secret"]) {
          assert.notInclude(json, secret)
        }
        strictEqual(error.message, "Transport error (POST http://test/join)")
      }))

    it.effect("redacts query params in messages using the current redacted names", () =>
      Effect.gen(function*() {
        const request = HttpClientRequest.get("http://test/path?token=token-secret&sig=sig-visible")
        const error = new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request })
        })

        strictEqual(error.message, "Transport error (GET http://test/path?token=REDACTED&sig=sig-visible)")
      }).pipe(Effect.provideService(UrlParams.CurrentRedactedNames, ["token"])))
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

    it.effect("follows the location without re-encoding its query", () =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeRedirectClient(
          302,
          "https://origin.test/dest?q=caf%E9&sig=a%20b&flag#new"
        )
        yield* client.get("https://origin.test/start", { urlParams: { old: "1" }, hash: "old" })

        const redirected = (yield* Ref.get(requests))[1]
        assert.strictEqual(redirected.url, "https://origin.test/dest?q=caf%E9&sig=a%20b&flag")
        assert.strictEqual(UrlParams.toString(redirected.urlParams), "")
        assert.deepStrictEqual(redirected.hash, Option.some("new"))
      }))

    it.effect("returns the redirect response when the location is invalid", () =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeRedirectClient(302, "http://exa mple.com/")
        const response = yield* client.get("https://origin.test/start")

        assert.strictEqual(response.status, 302)
        assert.strictEqual(response.headers.location, "http://exa mple.com/")
        assert.strictEqual((yield* Ref.get(requests)).length, 1)
      }))

    it.effect("switches 303 requests to GET and drops the body", () =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeRedirectClient(303, "/destination")
        yield* HttpClientRequest.post("https://origin.test/start").pipe(
          HttpClientRequest.bodyText("payload"),
          HttpClientRequest.setHeaders({
            "content-encoding": "identity",
            "content-language": "en",
            "content-location": "/original"
          }),
          client.execute
        )

        const redirected = (yield* Ref.get(requests))[1]
        assert.strictEqual(redirected.method, "GET")
        assert.strictEqual(redirected.body._tag, "Empty")
        assert.isUndefined(redirected.headers["content-type"])
        assert.isUndefined(redirected.headers["content-length"])
        assert.isUndefined(redirected.headers["content-encoding"])
        assert.isUndefined(redirected.headers["content-language"])
        assert.isUndefined(redirected.headers["content-location"])
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

  it("classifies transient responses and errors", () => {
    const request = HttpClientRequest.get("http://test/")
    const responses = [200, 404, 408, 429, 500, 501, 502, 503, 504].map((status) =>
      HttpClientResponse.fromWeb(request, new Response(null, { status }))
    )
    const statusErrors = responses.map((response) =>
      new HttpClientError.HttpClientError({ reason: new HttpClientError.StatusCodeError({ request, response }) })
    )
    const expected = [false, false, true, true, true, false, true, true, true]
    assert.deepStrictEqual(responses.map(HttpClient.isTransientResponse), expected)
    assert.deepStrictEqual(statusErrors.map(HttpClient.isTransientError), expected)
    assert.deepStrictEqual(
      [
        new Cause.TimeoutError(),
        new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request }) }),
        new HttpClientError.HttpClientError({ reason: new HttpClientError.EncodeError({ request }) }),
        new Error("boom")
      ].map(HttpClient.isTransientError),
      [true, true, false, false]
    )
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

    it.effect.each([
      { name: "seconds", header: "1", status: 503, delay: 1_000 },
      { name: "a five-minute Retry-After", header: "300", status: 429, delay: 300_000 },
      { name: "HTTP date on an errors-only retry", header: "date", status: 429, delay: 30_000 },
      { name: "a longer schedule", header: "5", status: 503, delay: 60_000, scheduled: true },
      { name: "no header", status: 503, delay: 0 },
      // invalid values are ignored rather than parsed as dates or fractions
      { name: "a negative Retry-After", header: "-5", status: 503, delay: 0 },
      { name: "a fractional Retry-After", header: "1.5", status: 503, delay: 0 }
    ])(
      "honors the retry delay for $name",
      ({ delay, header, scheduled, status }) =>
        Effect.gen(function*() {
          const retryAfter = header === "date"
            ? new Date((yield* Clock.currentTimeMillis) + 30_000).toUTCString()
            : header
          const { attempts, client } = yield* makeSequenceClient([
            { status, headers: retryAfter === undefined ? {} : { "retry-after": retryAfter } },
            { status: 200 }
          ])
          const retryClient = (header === "date" ? HttpClient.filterStatusOk(client) : client).pipe(
            HttpClient.retryTransient({
              retryOn: header === "date" ? "errors-only" : "errors-and-responses",
              times: 1,
              ...(scheduled ? { schedule: Schedule.spaced("1 minute") } : {})
            })
          )
          const fiber = yield* retryClient.get("http://test/").pipe(
            Effect.forkChild({ startImmediately: true })
          )

          if (delay > 0) {
            yield* TestClock.adjust(Duration.millis(delay - 1))
            strictEqual(yield* Ref.get(attempts), 1)
            yield* TestClock.adjust("1 millis")
          }
          strictEqual((yield* Fiber.join(fiber)).status, 200)
        })
    )
  })

  describe("timeout", () => {
    it.effect("fails with a TransportError and aborts the request", () =>
      Effect.gen(function*() {
        let signal: AbortSignal | undefined
        const client = HttpClient.make((_request, _url, requestSignal) => {
          signal = requestSignal
          return Effect.never
        }).pipe(HttpClient.timeout("5 seconds"))

        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust("5 seconds")
        const exit = yield* Fiber.await(fiber)

        assert.isTrue(Exit.isFailure(exit))
        const error = Cause.squash((exit as Exit.Failure<unknown, unknown>).cause)
        assert.instanceOf(error, HttpClientError.HttpClientError)
        strictEqual(error.reason._tag, "TransportError")
        strictEqual(error.request.url, "http://test/")
        assert.isTrue(Cause.isTimeoutError(error.cause))
        assert.include(error.message, "timed out")
        assert.isTrue(signal!.aborted)
      }))

    it.effect("gives each retryTransient attempt a fresh budget", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const client = HttpClient.make((request) =>
          Effect.flatMap(Ref.getAndUpdate(attempts, (n) => n + 1), (n) =>
            n === 0
              ? Effect.never
              : Effect.as(Effect.sleep("900 millis"), HttpClientResponse.fromWeb(request, new Response(null))))
        ).pipe(HttpClient.timeout("1 second"), HttpClient.retryTransient({ times: 1 }))

        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust("1 second")
        strictEqual(yield* Ref.get(attempts), 2)
        yield* TestClock.adjust("900 millis")
        strictEqual((yield* Fiber.join(fiber)).status, 200)
      }))

    it.effect("bounds the whole retry loop when applied after retryTransient", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const client = HttpClient.make((request) =>
          Effect.flatMap(Ref.getAndUpdate(attempts, (n) => n + 1), (n) =>
            n === 0
              ? Effect.andThen(
                Effect.sleep("600 millis"),
                Effect.fail(
                  new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request }) })
                )
              )
              : Effect.as(Effect.sleep("900 millis"), HttpClientResponse.fromWeb(request, new Response(null))))
        ).pipe(HttpClient.retryTransient({ times: 1 }), HttpClient.timeout("1 second"))

        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        yield* TestClock.adjust("1 second")
        const exit = fiber.pollUnsafe()

        strictEqual(yield* Ref.get(attempts), 2)
        assert.isTrue(exit !== undefined && Exit.isFailure(exit))
        const error = Cause.squash((exit as Exit.Failure<unknown, unknown>).cause)
        assert.instanceOf(error, HttpClientError.HttpClientError)
        assert.isTrue(Cause.isTimeoutError(error.cause))
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

        yield* TestClock.adjust("59 seconds")
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("1 second")
        yield* Fiber.join(fiber)
        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("tracks remaining headers when the limit header is also present", () =>
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
                      "ratelimit-limit": "800",
                      "ratelimit-remaining": "1",
                      "ratelimit-reset-after": "60"
                    }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "reported-remaining",
            limit: 800,
            window: "1 minute"
          })
        )

        yield* client.get("http://test/")
        yield* client.get("http://test/")
        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))

        yield* TestClock.adjust("59 seconds")
        strictEqual(yield* Ref.get(attempts), 2)

        yield* TestClock.adjust("1 second")
        yield* Fiber.join(fiber)
        strictEqual(yield* Ref.get(attempts), 3)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("retries a 429 at the reported reset when remaining is exhausted", () =>
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
                    headers: {
                      "ratelimit-limit": "800",
                      "ratelimit-remaining": "0",
                      "ratelimit-reset-after": "60"
                    }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "reported-429",
            limit: 800,
            window: "1 minute",
            times: 1,
            disableAdaptiveLearning: true
          })
        )

        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))

        yield* TestClock.adjust("59 seconds")
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("1 second")
        const response = yield* Fiber.join(fiber)
        strictEqual(response.status, 200)
        strictEqual(yield* Ref.get(attempts), 2)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("ignores stale remaining headers from out-of-order responses", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const releaseFirst = yield* Deferred.make<void>()
        const client = HttpClient.make((request) =>
          Effect.flatMap(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) => {
              const response = (headers: Record<string, string> = {}) =>
                HttpClientResponse.fromWeb(request, new Response(null, { status: 200, headers }))
              if (attempt === 1) {
                return Effect.as(
                  Deferred.await(releaseFirst),
                  response({ "ratelimit-remaining": "5", "ratelimit-reset-after": "60" })
                )
              }
              return Effect.succeed(
                attempt === 2
                  ? response({ "ratelimit-remaining": "0", "ratelimit-reset-after": "60" })
                  : response()
              )
            }
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "stale-remaining",
            limit: 800,
            window: "1 minute"
          })
        )

        const first = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        yield* client.get("http://test/")
        yield* Deferred.succeed(releaseFirst, undefined)
        yield* Fiber.join(first)

        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))

        yield* TestClock.adjust("59 seconds")
        strictEqual(yield* Ref.get(attempts), 2)

        yield* TestClock.adjust("1 second")
        yield* Fiber.join(fiber)
        strictEqual(yield* Ref.get(attempts), 3)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("counts requests sent after the reporting request against its remaining", () =>
      Effect.gen(function*() {
        const attempts = yield* Ref.make(0)
        const releaseFirst = yield* Deferred.make<void>()
        const client = HttpClient.make((request) =>
          Effect.flatMap(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              attempt === 1
                ? Effect.as(
                  Deferred.await(releaseFirst),
                  HttpClientResponse.fromWeb(
                    request,
                    new Response(null, {
                      status: 200,
                      headers: { "ratelimit-remaining": "1", "ratelimit-reset-after": "60" }
                    })
                  )
                )
                : Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })))
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "in-flight-remaining",
            limit: 800,
            window: "1 minute"
          })
        )

        const first = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        yield* client.get("http://test/")
        yield* Deferred.succeed(releaseFirst, undefined)
        yield* Fiber.join(first)

        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))

        yield* TestClock.adjust("59 seconds")
        strictEqual(yield* Ref.get(attempts), 2)

        yield* TestClock.adjust("1 second")
        yield* Fiber.join(fiber)
        strictEqual(yield* Ref.get(attempts), 3)
      }).pipe(Effect.provide(RateLimiterTestLayer)))

    it.effect("paces requests started while remaining is exhausted with the limiter after reset", () =>
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
                      "ratelimit-limit": "2",
                      "ratelimit-remaining": "0",
                      "ratelimit-reset-after": "60"
                    }
                  })
                  : new Response(null, { status: 200 })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "exhausted-pacing",
            limit: 2,
            window: "1 minute",
            disableAdaptiveLearning: true
          })
        )

        yield* client.get("http://test/")
        const fibers = yield* Effect.forEach(
          [1, 2, 3],
          () => client.get("http://test/").pipe(Effect.forkChild({ startImmediately: true }))
        )

        yield* TestClock.adjust("60 seconds")
        strictEqual(yield* Ref.get(attempts), 3)

        yield* TestClock.adjust("60 seconds")
        yield* Fiber.joinAll(fibers)
        strictEqual(yield* Ref.get(attempts), 4)
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

        yield* TestClock.adjust("1 minute")
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

    it.effect("waits until a Retry-After HTTP date", () =>
      Effect.gen(function*() {
        const retryAt = new Date((yield* Clock.currentTimeMillis) + 30_000).toUTCString()
        const attempts = yield* Ref.make(0)
        const client = HttpClient.make((request) =>
          Effect.map(
            Ref.updateAndGet(attempts, (n) => n + 1),
            (attempt) =>
              HttpClientResponse.fromWeb(
                request,
                new Response(null, {
                  status: attempt === 1 ? 429 : 200,
                  headers: { "retry-after": retryAt }
                })
              )
          )
        ).pipe(
          HttpClient.withRateLimiter({
            limiter: yield* RateLimiter.RateLimiter,
            key: "http-date-retry-after",
            limit: 100,
            window: "1 minute",
            times: 1,
            disableAdaptiveLearning: true
          })
        )

        const fiber = yield* client.get("http://test/").pipe(Effect.forkChild)

        yield* TestClock.adjust("29 seconds")
        strictEqual(yield* Ref.get(attempts), 1)

        yield* TestClock.adjust("1 second")
        const response = yield* Fiber.join(fiber)

        strictEqual(response.status, 200)
        strictEqual(yield* Ref.get(attempts), 2)
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

  describe("withCircuitBreaker", () => {
    it.effect.each(classifierCases)(
      "circuitBreakerClassifier classifies $name as $outcome",
      ({ exit, outcome, retryAfterMillis }) =>
        Effect.gen(function*() {
          const classified = yield* HttpClient.circuitBreakerClassifier(exit(yield* Clock.currentTimeMillis))
          assert.deepStrictEqual(
            {
              _tag: classified._tag,
              retryAfterMillis: classified._tag === "Failure" && classified.retryAfter !== undefined
                ? Duration.toMillis(classified.retryAfter)
                : undefined
            },
            { _tag: outcome, retryAfterMillis }
          )
        })
    )

    it.effect("retryTransient never retries a CircuitBreakerError", () =>
      Effect.gen(function*() {
        const reasons = [
          new CircuitBreaker.CircuitOpen({ key: "test", retryAfter: Duration.zero }),
          new CircuitBreaker.CircuitHalfOpen({ key: "test" }),
          new CircuitBreaker.CircuitBreakerStoreError({ message: "store unavailable", cause: transportError })
        ]
        for (const reason of reasons) {
          const attempts = yield* Ref.make(0)
          const client = HttpClient.make(() => Effect.die("unreachable")).pipe(
            HttpClient.transform(() =>
              Ref.update(attempts, (n) => n + 1).pipe(
                Effect.andThen(Effect.fail(new CircuitBreaker.CircuitBreakerError({ reason })))
              )
            ),
            HttpClient.retryTransient({ times: 2 })
          )
          const error = yield* Effect.flip(client.get("http://test/"))
          strictEqual(error._tag, "CircuitBreakerError")
          strictEqual(yield* Ref.get(attempts), 1)
        }
      }))

    it.effect("keys circuits by request origin by default", () =>
      Effect.gen(function*() {
        const hosts = yield* Ref.make<Array<string>>([])
        const client = HttpClient.make((request, url) =>
          Effect.as(
            Ref.update(hosts, (hosts) => [...hosts, url.host]),
            HttpClientResponse.fromWeb(
              request,
              new Response(null, { status: url.hostname === "down.test" ? 503 : 200 })
            )
          )
        ).pipe(
          HttpClient.withCircuitBreaker({
            breaker: yield* CircuitBreaker.make({
              tripPolicy: CircuitBreaker.consecutive(1),
              openDuration: "1 minute"
            })
          })
        )

        strictEqual((yield* client.get("http://down.test:8080/a")).status, 503)
        const error = yield* Effect.flip(client.get("http://down.test:8080/b?q=1"))
        strictEqual(circuitOpenKey(error), "http://down.test:8080")
        strictEqual((yield* client.get("http://up.test/")).status, 200)
        assert.deepStrictEqual(yield* Ref.get(hosts), ["down.test:8080", "up.test"])
      }).pipe(Effect.provide(CircuitBreaker.layerStoreMemory())))
  })

  it.effect("sends stored response cookies only to the matching host", () =>
    Effect.gen(function*() {
      const jar = yield* Ref.make<ReadonlyArray<Cookies.Cookie>>([])
      const seen: Array<string | undefined> = []
      const client = HttpClient.withCookiesRef(
        HttpClient.make((request) => {
          seen.push(request.headers.cookie)
          const host = new URL(request.url).hostname
          const setCookie = host === "api.example.com"
            ? "session=secret"
            : "session=attacker"
          return Effect.succeed(HttpClientResponse.fromWeb(
            request,
            new Response(null, { status: 200, headers: { "set-cookie": setCookie } })
          ))
        }),
        jar
      )

      yield* client.get("https://api.example.com/account")
      yield* client.get("https://evil.example/hook")
      yield* client.get("https://api.example.com/account")
      yield* client.get("https://evil.example/hook")

      assert.deepStrictEqual(seen, [undefined, undefined, "session=secret", "session=attacker"])
    }))

  it.effect("stores cookies using the final response host and default path", () =>
    Effect.gen(function*() {
      const jar = yield* Ref.make<ReadonlyArray<Cookies.Cookie>>([])
      const client = HttpClient.withCookiesRef(
        HttpClient.make((request) => {
          const source = new Response(null, { headers: { "set-cookie": "session=final" } })
          Object.defineProperty(source, "url", { value: "https://login.example.com/auth/callback" })
          return Effect.succeed(HttpClientResponse.fromWeb(request, source))
        }),
        jar
      )

      yield* client.get("https://api.example.com/start")

      const stored = yield* Ref.get(jar)
      const now = yield* Clock.currentTimeMillis
      assert.strictEqual(
        Cookies.toRequestCookieHeader(stored, "https://login.example.com/auth/next", now),
        "session=final"
      )
      assert.strictEqual(Cookies.toRequestCookieHeader(stored, "https://api.example.com/start", now), undefined)
      assert.strictEqual(Cookies.toRequestCookieHeader(stored, "https://login.example.com/other", now), undefined)
    }))

  it("reads cookies when Headers has no getSetCookie", () => {
    // React Native's Headers implementation does not provide getSetCookie.
    const source = new Response(null, { headers: { "content-type": "text/plain" } })
    Object.defineProperty(source.headers, "getSetCookie", { value: undefined })
    const response = HttpClientResponse.fromWeb(HttpClientRequest.get("http://localhost"), source)
    assert.isTrue(Cookies.isEmpty(response.cookies))
  })
})
