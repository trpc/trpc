import { AnthropicClient } from "@effect/ai-anthropic"
import * as Errors from "@effect/ai-anthropic/internal/errors"
import { assert, describe, it } from "@effect/vitest"
import { Context, Duration, Effect, Layer, Redacted, type Schema } from "effect"
import { Headers, HttpClient, type HttpClientError, type HttpClientRequest, HttpClientResponse } from "effect/http"

describe("AnthropicClient", () => {
  it.effect("maps a gateway 400 without an Anthropic error envelope", () =>
    Effect.gen(function*() {
      const client = yield* AnthropicClient.AnthropicClient
      const error = yield* client.createMessage({
        payload: {
          model: "claude-sonnet-4-20250514",
          max_tokens: 1,
          messages: [{ role: "user", content: "hello" }]
        }
      }).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, "InvalidRequestError")
      if (error.reason._tag !== "InvalidRequestError") return
      assert.include(error.reason.description ?? "", "HTTP 400")
      assert.include(error.reason.description ?? "", "gateway rejected request")
      assert.strictEqual(error.reason.http?.response?.status, 400)
    }).pipe(Effect.provide(makeTestLayer({
      _tag: "Json",
      status: 400,
      body: { error: { message: "gateway rejected request" } }
    }))))

  it.effect("maps a gateway 429 without an Anthropic error envelope and preserves retry-after", () =>
    Effect.gen(function*() {
      const client = yield* AnthropicClient.AnthropicClient
      const error = yield* client.createMessage({
        payload: {
          model: "claude-sonnet-4-20250514",
          max_tokens: 1,
          messages: [{ role: "user", content: "hello" }]
        }
      }).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, "RateLimitError")
      if (error.reason._tag !== "RateLimitError") return
      assert.strictEqual(Duration.toMillis(error.reason.retryAfter!), 3000)
      assert.strictEqual(error.reason.http?.response?.status, 429)
    }).pipe(Effect.provide(makeTestLayer({
      _tag: "Json",
      status: 429,
      headers: { "retry-after": "3" },
      body: { error: { message: "gateway rate limit" } }
    }))))

  it.effect("redacts the API key in AI error context", () =>
    Effect.gen(function*() {
      const client = yield* AnthropicClient.AnthropicClient

      const result = yield* client.createMessage({
        payload: {
          model: "claude-sonnet-4-20250514",
          max_tokens: 1,
          messages: [{ role: "user", content: "hello" }]
        }
      }).pipe(
        Effect.flip,
        Effect.updateService(Headers.CurrentRedactedNames, () => [])
      )

      assert.strictEqual(result.reason._tag, "InvalidRequestError")
      if (result.reason._tag !== "InvalidRequestError" || result.reason.http === undefined) {
        return yield* Effect.die(new Error("Expected InvalidRequestError with HTTP context"))
      }
      const requests = yield* MockHttpClient.requests
      assert.include(requests[0]?.url, "/v1/messages")
      assert.strictEqual(String(result.reason.http.request.headers["x-api-key"]), "<redacted>")
    }).pipe(Effect.provide(makeTestLayer({
      _tag: "Json",
      status: 400,
      body: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Bad request"
        },
        request_id: null
      }
    }))))

  it.effect("surfaces the provider message on 401 AuthenticationError", () =>
    Effect.gen(function*() {
      const client = yield* AnthropicClient.AnthropicClient

      const result = yield* client.createMessage({
        payload: {
          model: "claude-sonnet-4-20250514",
          max_tokens: 1,
          messages: [{ role: "user", content: "hello" }]
        }
      }).pipe(Effect.flip)

      assert.strictEqual(result.reason._tag, "AuthenticationError")
      if (result.reason._tag !== "AuthenticationError") {
        return yield* Effect.die(new Error("Expected AuthenticationError"))
      }
      assert.strictEqual(result.reason.kind, "InvalidKey")
      assert.deepStrictEqual(result.reason.metadata?.anthropic, {
        errorType: "authentication_error",
        requestId: "req_anthropic"
      })
      assert.strictEqual(
        result.reason.description,
        "invalid x-api-key (POST https://api.anthropic.com/v1/messages?beta=true) [type: authentication_error] [requestId: req_anthropic]"
      )
      assert.include(result.reason.message, "invalid x-api-key")
      assert.strictEqual(
        result.reason.message,
        "InvalidKey: Verify your API key is correct. invalid x-api-key (POST https://api.anthropic.com/v1/messages?beta=true) [type: authentication_error] [requestId: req_anthropic]"
      )
    }).pipe(Effect.provide(makeTestLayer({
      _tag: "Json",
      status: 401,
      body: {
        type: "error",
        error: { type: "authentication_error", message: "invalid x-api-key" },
        request_id: "req_anthropic"
      }
    }))))

  it("preserves and truncates a fallback HTTP response", () => {
    const body = `${"a".repeat(200)}b`
    const reason = Errors.mapStatusCodeToReason({
      status: 400,
      headers: {},
      message: undefined,
      metadata: { errorType: null, requestId: null },
      http: makeHttpContext("https://api.anthropic.com/v1/messages?beta=true", body)
    })

    assert.strictEqual(reason._tag, "InvalidRequestError")
    if (reason._tag !== "InvalidRequestError") {
      throw new Error("Expected InvalidRequestError")
    }
    assert.strictEqual(
      reason.description,
      `HTTP 400 (POST https://api.anthropic.com/v1/messages?beta=true) Response: ${"a".repeat(200)}...`
    )
  })

  it.effect("surfaces the provider message on 403 AuthenticationError", () =>
    Effect.gen(function*() {
      const client = yield* AnthropicClient.AnthropicClient

      const result = yield* client.createMessage({
        payload: {
          model: "claude-sonnet-4-20250514",
          max_tokens: 1,
          messages: [{ role: "user", content: "hello" }]
        }
      }).pipe(Effect.flip)

      assert.strictEqual(result.reason._tag, "AuthenticationError")
      if (result.reason._tag !== "AuthenticationError") {
        return yield* Effect.die(new Error("Expected AuthenticationError"))
      }
      assert.strictEqual(result.reason.kind, "InsufficientPermissions")
      assert.include(result.reason.description ?? "", "not available for this account")
      assert.include(result.reason.message, "not available for this account")
    }).pipe(Effect.provide(makeTestLayer({
      _tag: "Json",
      status: 403,
      body: {
        type: "error",
        error: {
          type: "permission_error",
          message: "claude-sonnet-4-20250514 is not available for this account"
        },
        request_id: null
      }
    }))))
})

type MockResponse =
  | {
    readonly _tag: "Json"
    readonly body: Schema.Json
    readonly status?: number | undefined
    readonly headers?: Record<string, string> | undefined
  }
  | {
    readonly _tag: "Sse"
    readonly events: ReadonlyArray<Schema.Json>
    readonly status?: number | undefined
    readonly headers?: Record<string, string> | undefined
  }

class MockAnthropicResponse extends Context.Service<MockAnthropicResponse, {
  readonly response: MockResponse
}>()("MockAnthropicResponse") {}

class MockHttpClient extends Context.Service<MockHttpClient, {
  readonly requests: Effect.Effect<ReadonlyArray<HttpClientRequest.HttpClientRequest>>
}>()("MockHttpClient") {
  static requests = MockHttpClient.use((client) => client.requests)
}

const makeHttpClientContext = Effect.gen(function*() {
  const capturedRequests: Array<HttpClientRequest.HttpClientRequest> = []
  const mock = yield* MockAnthropicResponse

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

const makeTestLayer = (
  response: MockResponse,
  options: AnthropicClient.Options = { apiKey: Redacted.make("sk-test-key") }
) =>
  AnthropicClient.layer(options).pipe(
    Layer.provideMerge(HttpClientLayer),
    Layer.provide(Layer.succeed(MockAnthropicResponse, { response }))
  )

const makeResponse = (
  request: HttpClientRequest.HttpClientRequest,
  response: MockResponse
): HttpClientResponse.HttpClientResponse => {
  const contentType = response._tag === "Json"
    ? "application/json"
    : "text/event-stream"
  const body = response._tag === "Json"
    ? JSON.stringify(response.body)
    : response.events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")

  return HttpClientResponse.fromWeb(
    request,
    new Response(body, {
      status: response.status ?? 200,
      headers: {
        "content-type": contentType,
        ...response.headers
      }
    })
  )
}

const makeHttpContext = (url: string, body: string) => ({
  request: {
    method: "POST" as const,
    url,
    urlParams: [],
    hash: undefined,
    headers: {}
  },
  body
})
