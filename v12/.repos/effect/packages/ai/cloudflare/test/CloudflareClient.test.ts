import * as CloudflareClient from "@effect/ai-cloudflare/CloudflareClient"
import { assert, describe, it } from "@effect/vitest"
import { Config, ConfigProvider, Duration, Effect, Layer, Redacted } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"

const payload = {
  model: "clef-flash",
  state: "Checkout is down",
  questions: { urgent: { type: "noul", instructions: "Does this need immediate attention?" } }
} as const

const result = {
  model: "clef-flash",
  answers: { urgent: { type: "noul", noul: 0.99 } },
  usage: { input_tokens: 120, output_tokens: 0 }
} as const

const httpLayer = (
  handler: (
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.makeWith(
      Effect.flatMap(handler),
      Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
    )
  )

const clientLayer = (
  response: (request: HttpClientRequest.HttpClientRequest) => Response,
  options?: Partial<CloudflareClient.Options>
) =>
  CloudflareClient.layer({ accountId: "test-account", apiKey: Redacted.make("test-token"), ...options }).pipe(
    Layer.provide(httpLayer((request) => Effect.succeed(HttpClientResponse.fromWeb(request, response(request)))))
  )

const createDecisions = Effect.gen(function*() {
  const client = yield* CloudflareClient.CloudflareClient
  return yield* client.createDecisions(payload)
})

describe("CloudflareClient", () => {
  it.effect("posts decisions to the account model endpoint and unwraps the result envelope", () =>
    Effect.gen(function*() {
      const response = yield* createDecisions
      assert.deepStrictEqual(response, result)
    }).pipe(Effect.provide(clientLayer((request) => {
      assert.strictEqual(request.method, "POST")
      assert.strictEqual(
        request.url,
        "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/cloudflare/clef-flash"
      )
      assert.strictEqual(request.headers.authorization, "Bearer test-token")
      assert.strictEqual(request.headers["cf-aig-gateway-id"], undefined)
      assert.strictEqual(request.body._tag, "Uint8Array")
      if (request.body._tag === "Uint8Array") {
        assert.deepStrictEqual(JSON.parse(new TextDecoder().decode(request.body.body)), payload)
      }
      return Response.json({ success: true, result, errors: [], messages: [] })
    }))))

  it.effect("routes requests through the configured AI Gateway", () =>
    createDecisions.pipe(
      Effect.provide(clientLayer((request) => {
        assert.strictEqual(request.headers["cf-aig-gateway-id"], "test-gateway")
        return Response.json({ success: true, result })
      }, { gatewayId: "test-gateway" }))
    ))

  it.effect("layerConfig reads Cloudflare credentials and AI Gateway configuration from the environment", () =>
    createDecisions.pipe(
      Effect.provide(CloudflareClient.layerConfig({
        apiUrl: Config.String("TEST_API_URL"),
        transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader("x-test", "configured"))
      })),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({
        env: {
          CLOUDFLARE_ACCOUNT_ID: "configured-account",
          CLOUDFLARE_API_TOKEN: "configured-token",
          CLOUDFLARE_AI_GATEWAY_ID: "configured-gateway",
          TEST_API_URL: "https://example.com/api"
        }
      }))),
      Effect.provide(httpLayer((request) => {
        assert.strictEqual(
          request.url,
          "https://example.com/api/accounts/configured-account/ai/run/@cf/cloudflare/clef-flash"
        )
        assert.strictEqual(request.headers.authorization, "Bearer configured-token")
        assert.strictEqual(request.headers["cf-aig-gateway-id"], "configured-gateway")
        assert.strictEqual(request.headers["x-test"], "configured")
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ success: true, result })))
      }))
    ))

  describe("error mapping", () => {
    for (
      const [status, tag] of [
        [401, "AuthenticationError"],
        [404, "InvalidRequestError"],
        [422, "InvalidRequestError"],
        [200, "InternalProviderError"]
      ] as const
    ) {
      it.effect(`maps a failure envelope with HTTP ${status} to ${tag}`, () =>
        Effect.gen(function*() {
          const error = yield* Effect.flip(createDecisions)
          assert.strictEqual(error.module, "CloudflareClient")
          assert.strictEqual(error.method, "createDecisions")
          assert.strictEqual(error.reason._tag, tag)
          if ("http" in error.reason) {
            assert.strictEqual(error.reason.http?.response?.status, status)
            assert.notInclude(JSON.stringify(error.reason), "test-token")
          }
          if ("description" in error.reason) {
            assert.include(error.reason.description, "Request failed")
            assert.include(error.reason.description, "3040")
            assert.include(error.reason.description, "test-ray")
          }
        }).pipe(Effect.provide(clientLayer(() =>
          Response.json(
            { success: false, result: null, errors: [{ code: 3040, message: "Request failed" }] },
            { status, headers: { "cf-ray": "test-ray" } }
          )
        ))))
    }

    it.effect("maps a failure envelope without errors with HTTP 200 to InternalProviderError", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(createDecisions)
        assert.strictEqual(error.reason._tag, "InternalProviderError")
      }).pipe(Effect.provide(clientLayer(() => Response.json({ success: false, result: null })))))

    it.effect("maps 429 to RateLimitError with Retry-After and Cloudflare metadata", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(createDecisions)
        assert.strictEqual(error.reason._tag, "RateLimitError")
        if (error.reason._tag === "RateLimitError") {
          assert.strictEqual(Duration.toMillis(error.reason.retryAfter!), 2000)
          assert.deepStrictEqual(error.reason.metadata, {
            cloudflare: { rayId: "test-ray", errors: [{ code: 3040, message: "Request failed" }] }
          })
        }
      }).pipe(Effect.provide(clientLayer(() =>
        Response.json(
          { success: false, result: null, errors: [{ code: 3040, message: "Request failed" }] },
          { status: 429, headers: { "cf-ray": "test-ray", "retry-after": "2" } }
        )
      ))))

    it.effect("maps a non-JSON failure body by HTTP status", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(createDecisions)
        assert.strictEqual(error.reason._tag, "InternalProviderError")
        if (error.reason._tag === "InternalProviderError") {
          assert.include(error.reason.description, "Bad gateway")
        }
      }).pipe(Effect.provide(clientLayer(() => new Response("Bad gateway", { status: 502 })))))

    it.effect("maps a success body without a result envelope to a non-retryable InvalidResponseError", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(createDecisions)
        assert.strictEqual(error.reason._tag, "InvalidResponseError")
      }).pipe(Effect.provide(clientLayer(() => Response.json(result)))))

    it.effect("maps TransportError to NetworkError", () => {
      const failures: Array<HttpClientError.HttpClientError> = []
      return Effect.gen(function*() {
        const error = yield* Effect.flip(createDecisions)
        assert.strictEqual(error.reason._tag, "NetworkError")
        assert.strictEqual(error.reason._tag === "NetworkError" && error.reason.cause, failures[0])
      }).pipe(
        Effect.provide(CloudflareClient.layer({ accountId: "test-account", apiKey: Redacted.make("test-token") })),
        Effect.provide(httpLayer((request) => {
          const error = new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({ request, cause: new Error("Connection refused") })
          })
          failures.push(error)
          return Effect.fail(error)
        }))
      )
    })
  })
})
