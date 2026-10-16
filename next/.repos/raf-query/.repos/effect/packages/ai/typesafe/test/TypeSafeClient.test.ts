import * as TypeSafeClient from "@effect/ai-typesafe/TypeSafeClient"
import * as TypeSafeConfig from "@effect/ai-typesafe/TypeSafeConfig"
import { assert, describe, it } from "@effect/vitest"
import { Config, ConfigProvider, Context, Duration, Effect, Layer, Redacted } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { vi } from "vitest"
const systemOneRequest = {
  state: "My card was charged twice.",
  model: "jev-latest",
  questions: {
    urgent: {
      type: "noul",
      instructions: "The message conveys urgency",
      criteria: { false: "No time pressure", true: "Needs action now" }
    }
  }
} as const

const systemOneBody = {
  model: "jev-latest",
  answers: {
    urgent: { type: "noul", noul: 0.99 }
  },
  usage: { input_tokens: 360, output_tokens: 39 }
}

describe("TypeSafeClient", () => {
  describe("make", () => {
    it.effect("sets Bearer token from apiKey", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        yield* client.systemOne(systemOneRequest)

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.headers["authorization"], "Bearer ts-test-12345")
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("ts-test-12345")
      }))))

    it.effect("posts systemone requests to the default URL as JSON", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const response = yield* client.systemOne(systemOneRequest)

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.method, "POST")
        assert.strictEqual(requests[0]?.url, "https://api.typesafe.ai/v1/systemone")
        assert.strictEqual(requests[0]?.headers["content-type"], "application/json")
        assert.deepStrictEqual(yield* getRequestBody(requests[0]), systemOneRequest)
        assert.strictEqual(response.model, "jev-latest")
        assert.deepStrictEqual(response.usage, { input_tokens: 360, output_tokens: 39 })
      }).pipe(Effect.provide(makeTestLayer())))

    it.effect("uses custom apiUrl when provided", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        yield* client.systemOne(systemOneRequest)

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.url, "https://custom.api.com/v2/systemone")
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("test-key"),
        apiUrl: "https://custom.api.com/v2"
      }))))

    it.effect("lists models from the models endpoint", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const response = yield* client.listModels()

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.method, "GET")
        assert.strictEqual(requests[0]?.url, "https://api.typesafe.ai/v1/models")
        assert.deepStrictEqual(response.models, [
          { name: "jev-1.13.0", description: "Jev 1.13", release_date: "2026-08-01" }
        ])
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 200,
        body: {
          models: [{ name: "jev-1.13.0", description: "Jev 1.13", release_date: "2026-08-01" }]
        }
      }))))

    it.effect("applies transformClient option", () => {
      let transformApplied = false
      return Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        yield* client.systemOne(systemOneRequest)
        assert.isTrue(transformApplied)
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("test-key"),
        transformClient: (client) => {
          transformApplied = true
          return client
        }
      })))
    })

    it.effect("exposes transformed HttpClient via client field", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        yield* client.client.execute(HttpClientRequest.get("/models"))

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.url, "https://api.typesafe.ai/v1/models")
        assert.strictEqual(requests[0]?.headers["authorization"], "Bearer test-key")
        assert.strictEqual(requests[0]?.headers["x-client-field"], "enabled")
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("test-key"),
        transformClient: (client) =>
          client.pipe(HttpClient.mapRequest(HttpClientRequest.setHeader("x-client-field", "enabled")))
      }))))

    it.effect("applies TypeSafeConfig transformClient after options transformClient", () => {
      let optionsTransformApplied = false
      let configTransformApplied = false

      return Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        yield* client.systemOne(systemOneRequest).pipe(
          TypeSafeConfig.withClientTransform((client) => {
            configTransformApplied = true
            return client.pipe(
              HttpClient.mapRequest(HttpClientRequest.setHeader("x-typesafe-transform", "config"))
            )
          })
        )

        const requests = yield* MockHttpClient.requests
        assert.isTrue(optionsTransformApplied)
        assert.isTrue(configTransformApplied)
        assert.strictEqual(requests[0]?.headers["x-typesafe-transform"], "config")
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("test-key"),
        transformClient: (client) => {
          optionsTransformApplied = true
          return client.pipe(
            HttpClient.mapRequest(HttpClientRequest.setHeader("x-typesafe-transform", "options"))
          )
        }
      })))
    })
  })

  describe("layer", () => {
    it.effect("creates working service", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        assert.isNotNull(client.client)
      }).pipe(Effect.provide(makeTestLayer())))

    it.effect("layerConfig loads from Config", () => {
      const configProvider = ConfigProvider.fromEnv({
        env: {
          MY_API_KEY: "ts-config-key",
          MY_API_URL: "https://config.api.com/v1"
        }
      })

      return Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        yield* client.systemOne(systemOneRequest)

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.headers["authorization"], "Bearer ts-config-key")
        assert.strictEqual(requests[0]?.url, "https://config.api.com/v1/systemone")
      }).pipe(Effect.provide(makeConfigTestLayer(configProvider)))
    })

    it.effect("layerConfig defaults to TYPESAFE_API_KEY", () => {
      const configProvider = ConfigProvider.fromEnv({
        env: {
          TYPESAFE_API_KEY: "ts-env-key"
        }
      })

      return Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        yield* client.systemOne(systemOneRequest)

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.headers["authorization"], "Bearer ts-env-key")
        assert.strictEqual(requests[0]?.url, "https://api.typesafe.ai/v1/systemone")
      }).pipe(Effect.provide(
        TypeSafeClient.layerConfig().pipe(
          Layer.provideMerge(HttpClientLayer),
          Layer.provide(Layer.succeed(MockTypeSafeResponse, { response: defaultResponse })),
          Layer.provide(ConfigProvider.layer(configProvider))
        )
      ))
    })
  })

  describe("request behavior", () => {
    it.effect("redacts the authorization header in AI error context", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "InvalidRequestError")
        if (result.reason._tag !== "InvalidRequestError" || result.reason.http === undefined) {
          return yield* Effect.die(new Error("Expected InvalidRequestError with HTTP context"))
        }
        assert.strictEqual(String(result.reason.http.request.headers["authorization"]), "<redacted>")
        assert.strictEqual(result.reason.http.response?.status, 422)
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("secret-key")
      }, {
        status: 422,
        body: { message: "questions must not be empty" }
      }))))
  })

  describe("error mapping", () => {
    it.effect("maps undocumented 409 status to the generic UnknownError fallback", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "UnknownError")
        if (result.reason._tag === "UnknownError") {
          assert.strictEqual(result.reason.http?.response?.status, 409)
          assert.include(result.reason.description ?? "", "Conflict")
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 409,
        body: { message: "Conflict" }
      }))))

    it.effect("retains 429 diagnostics in provider metadata", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "RateLimitError")
        if (result.reason._tag === "RateLimitError") {
          assert.deepStrictEqual(result.reason.metadata.typesafe, {
            requestId: "req_typesafe_429",
            errorCode: "rate_limit_exceeded",
            errorType: "requests"
          })
          assert.strictEqual(result.reason.http?.response?.status, 429)
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 429,
        body: { message: "Slow down", code: "rate_limit_exceeded", type: "requests" },
        headers: { "x-typesafe-request-id": "req_typesafe_429" }
      }))))

    describe("HTTP-date Retry-After", { concurrent: false }, () => {
      for (
        const { date, expected, name } of [
          { name: "future", date: "Fri, 18 Sep 2026 12:00:30 GMT", expected: 30000 },
          { name: "past", date: "Fri, 18 Sep 2026 11:59:30 GMT", expected: 0 }
        ]
      ) {
        it.effect("honors a " + name + " HTTP-date Retry-After", () =>
          Effect.gen(function*() {
            const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-18T12:00:00Z"))
            try {
              const client = yield* TypeSafeClient.TypeSafeClient
              const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

              assert.strictEqual(result.reason._tag, "RateLimitError")
              if (result.reason._tag === "RateLimitError") {
                assert.isDefined(result.reason.retryAfter)
                assert.strictEqual(Duration.toMillis(result.reason.retryAfter!), expected)
              }
            } finally {
              now.mockRestore()
            }
          }).pipe(Effect.provide(makeTestLayer(undefined, {
            status: 429,
            body: { message: "Rate limit exceeded" },
            headers: { "retry-after": date }
          }))))
      }
    })

    it.effect("maps TransportError to NetworkError reason", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.make({
          apiKey: Redacted.make("test-key")
        })
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.module, "TypeSafeClient")
        assert.strictEqual(result.method, "systemOne")
        assert.strictEqual(result.reason._tag, "NetworkError")
      }).pipe(Effect.provide(Layer.succeed(HttpClient.HttpClient, makeTransportErrorHttpClient()))))

    it.effect("maps 400 status to InvalidRequestError reason", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.module, "TypeSafeClient")
        assert.strictEqual(result.method, "systemOne")
        assert.strictEqual(result.reason._tag, "InvalidRequestError")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 400,
        body: { message: "Bad request" }
      }))))

    it.effect("maps 401 status to AuthenticationError reason", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.reason._tag, "AuthenticationError")
        if (result.reason._tag === "AuthenticationError") {
          assert.strictEqual(result.reason.kind, "InvalidKey")
          assert.include(result.reason.description ?? "", "Invalid API key")
          assert.include(result.reason.description ?? "", "req_typesafe")
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 401,
        body: { message: "Invalid API key" },
        headers: { "x-typesafe-request-id": "req_typesafe" }
      }))))

    it.effect("maps 403 status to AuthenticationError with InsufficientPermissions", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "AuthenticationError")
        if (result.reason._tag === "AuthenticationError") {
          assert.strictEqual(result.reason.kind, "InsufficientPermissions")
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 403,
        body: { message: "Access denied" }
      }))))

    it.effect("maps 404 status to InvalidRequestError reason", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "InvalidRequestError")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 404,
        body: { message: "Not found" }
      }))))

    it.effect("maps 422 status to InvalidRequestError reason with the message", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "InvalidRequestError")
        if (result.reason._tag === "InvalidRequestError") {
          assert.include(result.reason.description, "criteria must contain at least two levels")
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 422,
        body: { message: "criteria must contain at least two levels" }
      }))))

    it.effect("maps 429 status to RateLimitError honoring Retry-After seconds", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "RateLimitError")
        if (result.reason._tag === "RateLimitError") {
          assert.isDefined(result.reason.retryAfter)
          assert.strictEqual(Duration.toMillis(result.reason.retryAfter!), 2000)
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 429,
        body: { message: "Rate limit exceeded" },
        headers: { "retry-after": "2" }
      }))))

    it.effect("maps 429 status to RateLimitError honoring retry-after-ms", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "RateLimitError")
        if (result.reason._tag === "RateLimitError") {
          assert.isDefined(result.reason.retryAfter)
          assert.strictEqual(Duration.toMillis(result.reason.retryAfter!), 1500)
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 429,
        body: { message: "Rate limit exceeded" },
        headers: { "retry-after-ms": "1500" }
      }))))

    it.effect("maps 429 status without retry headers to RateLimitError without retryAfter", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "RateLimitError")
        if (result.reason._tag === "RateLimitError") {
          assert.isUndefined(result.reason.retryAfter)
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 429,
        body: { message: "Rate limit exceeded" }
      }))))

    it.effect("maps 529 status to InternalProviderError reason", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "InternalProviderError")
        if (result.reason._tag === "InternalProviderError") {
          assert.strictEqual(result.reason.http?.response?.status, 529)
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 529,
        body: { message: "Overloaded" }
      }))))

    it.effect("maps 500 status to InternalProviderError reason", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "InternalProviderError")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 500,
        body: { message: "Internal error" }
      }))))

    it.effect("maps a malformed success body to InvalidOutputError reason", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.systemOne(systemOneRequest).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.method, "systemOne")
        assert.strictEqual(result.reason._tag, "InvalidOutputError")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 200,
        body: { model: "jev-latest", answers: { urgent: { type: "noul" } } }
      }))))

    it.effect("maps listModels failures with the listModels method", () =>
      Effect.gen(function*() {
        const client = yield* TypeSafeClient.TypeSafeClient
        const result = yield* client.listModels().pipe(Effect.flip)

        assert.strictEqual(result.module, "TypeSafeClient")
        assert.strictEqual(result.method, "listModels")
        assert.strictEqual(result.reason._tag, "AuthenticationError")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        status: 401,
        body: { message: "Invalid API key" }
      }))))
  })
})

interface MockResponse {
  readonly status?: number
  readonly body: unknown
  readonly headers?: Record<string, string>
}

class MockTypeSafeResponse extends Context.Service<MockTypeSafeResponse, {
  readonly response: MockResponse
}>()("MockTypeSafeResponse") {}

class MockHttpClient extends Context.Service<MockHttpClient, {
  readonly requests: Effect.Effect<ReadonlyArray<HttpClientRequest.HttpClientRequest>>
}>()("MockHttpClient") {
  static requests = MockHttpClient.use((client) => client.requests)
}

const makeHttpClientContext = Effect.gen(function*() {
  const capturedRequests: Array<HttpClientRequest.HttpClientRequest> = []
  const mock = yield* MockTypeSafeResponse

  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      capturedRequests.push(request)
      return makeResponse(request, mock.response)
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )

  const mockHttpClient: MockHttpClient["Service"] = {
    requests: Effect.sync(() => capturedRequests)
  }

  return Context.make(HttpClient.HttpClient, httpClient).pipe(
    Context.add(MockHttpClient, mockHttpClient)
  )
})

const HttpClientLayer = Layer.effectContext(makeHttpClientContext)

const defaultResponse: MockResponse = {
  status: 200,
  body: systemOneBody
}

const makeTestLayer = (
  options: TypeSafeClient.Options = { apiKey: Redacted.make("test-key") },
  response: MockResponse = defaultResponse
) =>
  TypeSafeClient.layer(options).pipe(
    Layer.provideMerge(HttpClientLayer),
    Layer.provide(Layer.succeed(MockTypeSafeResponse, { response }))
  )

const makeConfigTestLayer = (configProvider: ConfigProvider.ConfigProvider) =>
  TypeSafeClient.layerConfig({
    apiKey: Config.Redacted("MY_API_KEY"),
    apiUrl: Config.String("MY_API_URL")
  }).pipe(
    Layer.provideMerge(HttpClientLayer),
    Layer.provide(Layer.succeed(MockTypeSafeResponse, { response: defaultResponse })),
    Layer.provide(ConfigProvider.layer(configProvider))
  )

const makeTransportErrorHttpClient = (): HttpClient.HttpClient =>
  HttpClient.makeWith<HttpClientError.HttpClientError, never, HttpClientError.HttpClientError, never>(
    (requestEffect) =>
      Effect.flatMap(requestEffect, (request) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              request,
              cause: new Error("Connection refused")
            })
          })
        )),
    Effect.succeed
  )

const makeResponse = (
  request: HttpClientRequest.HttpClientRequest,
  response: MockResponse
): HttpClientResponse.HttpClientResponse =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...response.headers
      }
    })
  )

const getRequestBody = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function*() {
    const body = request.body
    if (body._tag === "Uint8Array") {
      const text = new TextDecoder().decode(body.body)
      return JSON.parse(text)
    }
    return yield* Effect.die(new Error("Expected Uint8Array body"))
  })
