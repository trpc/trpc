import { OpenRouterClient } from "@effect/ai-openrouter"
import * as Errors from "@effect/ai-openrouter/internal/errors"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Context, Effect, Exit, Layer, Option, Redacted, type Schema } from "effect"
import { HttpClient, type HttpClientError, type HttpClientRequest, HttpClientResponse } from "effect/http"

describe("OpenRouterClient", () => {
  it.effect("rejects unserializable bigint decision state with a typed error before making an HTTP call", () =>
    Effect.gen(function*() {
      const client = yield* OpenRouterClient.OpenRouterClient
      const exit = yield* client.createDecisions({
        model: "test-model",
        state: { n: 1n },
        questions: {
          urgent: {
            type: "noul",
            instructions: "Is this urgent?",
            criteria: { false: "Not urgent", true: "Urgent" }
          }
        }
      }).pipe(Effect.exit)

      assert.deepStrictEqual(yield* MockHttpClient.requests, [])
      assert.isTrue(Exit.isFailure(exit))
      if (!Exit.isFailure(exit)) {
        return yield* Effect.die(new Error("Expected serialization to fail"))
      }
      assert.isFalse(Cause.hasDies(exit.cause))
      const error = Option.getOrThrow(Cause.findErrorOption(exit.cause))
      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.module, "OpenRouterClient")
      assert.strictEqual(error.method, "createDecisions")
      assert.strictEqual(error.reason._tag, "InvalidRequestError")
    }).pipe(Effect.provide(makeTestLayer({
      _tag: "Json",
      body: {}
    }))))

  it.effect("redacts the API key in AI error context", () =>
    Effect.gen(function*() {
      const client = yield* OpenRouterClient.OpenRouterClient

      const result = yield* client.createChatCompletion({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }]
      }).pipe(Effect.flip)

      assert.strictEqual(result.reason._tag, "InvalidRequestError")
      if (result.reason._tag !== "InvalidRequestError" || result.reason.http === undefined) {
        return yield* Effect.die(new Error("Expected InvalidRequestError with HTTP context"))
      }
      const requests = yield* MockHttpClient.requests
      assert.include(requests[0]?.url, "/chat/completions")
      assert.strictEqual(String(result.reason.http.request.headers["authorization"]), "<redacted>")
    }).pipe(Effect.provide(makeTestLayer({
      _tag: "Json",
      status: 400,
      body: {
        error: {
          code: 400,
          message: "Bad request"
        }
      }
    }))))

  it.effect("surfaces the provider message on 401 AuthenticationError", () =>
    Effect.gen(function*() {
      const client = yield* OpenRouterClient.OpenRouterClient

      const result = yield* client.createChatCompletion({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }]
      }).pipe(Effect.flip)

      assert.strictEqual(result.reason._tag, "AuthenticationError")
      if (result.reason._tag !== "AuthenticationError") {
        return yield* Effect.die(new Error("Expected AuthenticationError"))
      }
      assert.strictEqual(result.reason.kind, "InvalidKey")
      assert.strictEqual(
        result.reason.description,
        "No auth credentials found (POST https://openrouter.ai/api/v1/chat/completions) [code: 401] [requestId: req_openrouter]"
      )
      assert.include(result.reason.message, "No auth credentials found")
    }).pipe(Effect.provide(makeTestLayer({
      _tag: "Json",
      status: 401,
      body: {
        error: {
          code: 401,
          message: "No auth credentials found"
        }
      },
      headers: { "x-request-id": "req_openrouter" }
    }))))

  it("preserves and truncates a fallback HTTP response", () => {
    const body = `${"a".repeat(200)}b`
    const reason = Errors.mapStatusCodeToReason({
      status: 400,
      headers: {},
      message: undefined,
      metadata: { errorCode: null, errorType: null, requestId: null },
      http: makeHttpContext("https://openrouter.ai/api/v1/chat/completions", body)
    })

    assert.strictEqual(reason._tag, "InvalidRequestError")
    if (reason._tag !== "InvalidRequestError") {
      throw new Error("Expected InvalidRequestError")
    }
    assert.strictEqual(
      reason.description,
      `HTTP 400 (POST https://openrouter.ai/api/v1/chat/completions) Response: ${"a".repeat(200)}...`
    )
  })

  it.effect("surfaces the provider message on 403 AuthenticationError", () =>
    Effect.gen(function*() {
      const client = yield* OpenRouterClient.OpenRouterClient

      const result = yield* client.createChatCompletion({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }]
      }).pipe(Effect.flip)

      assert.strictEqual(result.reason._tag, "AuthenticationError")
      if (result.reason._tag !== "AuthenticationError") {
        return yield* Effect.die(new Error("Expected AuthenticationError"))
      }
      assert.strictEqual(result.reason.kind, "InsufficientPermissions")
      assert.include(result.reason.description ?? "", "Key does not have permission")
      assert.include(result.reason.message, "Key does not have permission")
    }).pipe(Effect.provide(makeTestLayer({
      _tag: "Json",
      status: 403,
      body: {
        error: {
          code: 403,
          message: "Key does not have permission"
        }
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

class MockOpenRouterResponse extends Context.Service<MockOpenRouterResponse, {
  readonly response: MockResponse
}>()("MockOpenRouterResponse") {}

class MockHttpClient extends Context.Service<MockHttpClient, {
  readonly requests: Effect.Effect<ReadonlyArray<HttpClientRequest.HttpClientRequest>>
}>()("MockHttpClient") {
  static requests = MockHttpClient.use((client) => client.requests)
}

const makeHttpClientContext = Effect.gen(function*() {
  const capturedRequests: Array<HttpClientRequest.HttpClientRequest> = []
  const mock = yield* MockOpenRouterResponse

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
  options: OpenRouterClient.Options = { apiKey: Redacted.make("sk-test-key") }
) =>
  OpenRouterClient.layer(options).pipe(
    Layer.provideMerge(HttpClientLayer),
    Layer.provide(Layer.succeed(MockOpenRouterResponse, { response }))
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
