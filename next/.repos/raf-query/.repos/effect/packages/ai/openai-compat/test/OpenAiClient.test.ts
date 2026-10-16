import { OpenAiClient } from "@effect/ai-openai-compat"
import * as Errors from "@effect/ai-openai-compat/internal/errors"
import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Layer, Redacted, type Schema, Stream } from "effect"
import { Headers, HttpClient, type HttpClientError, type HttpClientRequest, HttpClientResponse } from "effect/http"

describe("OpenAiClient", () => {
  describe("request behavior", () => {
    it.effect("sets auth and OpenAI headers on /chat/completions requests", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        yield* client.createResponse({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }]
        })

        const requests = yield* MockHttpClient.requests
        const request = requests[0]
        const body = yield* getRequestBody(request)

        assert.isTrue(request.url.endsWith("/chat/completions"))
        assert.isTrue(request.url.startsWith("https://compat.example.test/v1"))
        assert.strictEqual(request.headers["authorization"], "Bearer sk-test-key")
        assert.strictEqual(request.headers["openai-organization"], "org_123")
        assert.strictEqual(request.headers["openai-project"], "proj_456")

        assert.strictEqual(body.messages[0]?.role, "user")
        assert.strictEqual(body.messages[0]?.content, "hello")
      }).pipe(Effect.provide(makeTestLayer())))

    it.effect("passes custom chat-completions request properties through", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        yield* client.createResponse({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }],
          provider_feature: {
            enabled: true
          }
        })

        const requests = yield* MockHttpClient.requests
        const request = requests[0]
        const body = yield* getRequestBody(request)
        assert.deepStrictEqual(body.provider_feature, {
          enabled: true
        })
      }).pipe(Effect.provide(makeTestLayer())))

    it.effect("uses /embeddings path and decodes permissive embedding payloads", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        const embedding = yield* client.createEmbedding({
          model: "my-custom-embedding-model",
          input: "embed this"
        })

        const requests = yield* MockHttpClient.requests
        const request = requests[0]

        assert.isTrue(request.url.endsWith("/embeddings"))
        assert.strictEqual(embedding.model, "my-custom-embedding-model")
        assert.strictEqual(embedding.data[0]?.index, 0)
        assert.strictEqual(typeof embedding.data[0]?.embedding, "string")
      }).pipe(Effect.provide(makeTestLayer({
        _tag: "Json",
        body: {
          data: [{
            embedding: "YmFzZTY0LWRhdGE=",
            index: 0,
            object: "embedding",
            vendor_payload: { future_field: true }
          }],
          model: "my-custom-embedding-model",
          object: "list",
          usage: {
            prompt_tokens: 5,
            total_tokens: 5
          },
          unknown_top_level: true
        }
      }))))

    it.effect("sets stream=true for createResponseStream and returns chat chunks", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        const events = yield* client.createResponseStream({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }]
        }).pipe(
          Effect.flatMap(([_, stream]) => Stream.runCollect(stream))
        )

        const requests = yield* MockHttpClient.requests
        const request = requests[0]
        const body = yield* getRequestBody(request)
        assert.strictEqual(body.stream, true)
        assert.strictEqual(body.stream_options.include_usage, true)
        assert.isTrue(request.url.endsWith("/chat/completions"))

        assert.propertyVal(events[0], "id", "chatcmpl_test_1")
        assert.propertyVal(events[1], "id", "chatcmpl_test_1")
        assert.strictEqual(events[2], "[DONE]")
      }).pipe(Effect.provide(makeTestLayer({
        _tag: "Sse",
        events: [
          {
            id: "chatcmpl_test_1",
            object: "chat.completion.chunk",
            model: "gpt-4o-mini",
            created: 1,
            future_provider_field: { accepted: true },
            choices: [{
              index: 0,
              delta: { content: "Hello" },
              finish_reason: null
            }]
          },
          {
            id: "chatcmpl_test_1",
            object: "chat.completion.chunk",
            model: "gpt-4o-mini",
            created: 1,
            usage: {
              prompt_tokens: 4,
              completion_tokens: 2,
              total_tokens: 6,
              prompt_tokens_details: { cached_tokens: 1 },
              completion_tokens_details: { reasoning_tokens: 1 }
            },
            choices: [{
              index: 0,
              delta: {},
              finish_reason: "stop"
            }]
          },
          "[DONE]"
        ]
      }))))

    it.effect("surfaces schema-mismatched chat chunks and continues streaming", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        const events = yield* client.createResponseStream({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }]
        }).pipe(
          Effect.flatMap(([_, stream]) => Stream.runCollect(stream))
        )

        assert.deepStrictEqual(events[0], {
          _tag: "UnknownChatCompletionEvent",
          data: {
            type: "provider.chat.completion.delta",
            provider_payload: { content: "provider-specific" }
          }
        })
        assert.propertyVal(events[1], "id", "chatcmpl_test_2")
        assert.strictEqual(events[2], "[DONE]")
      }).pipe(Effect.provide(makeTestLayer({
        _tag: "Sse",
        events: [
          {
            type: "provider.chat.completion.delta",
            provider_payload: { content: "provider-specific" }
          },
          {
            id: "chatcmpl_test_2",
            object: "chat.completion.chunk",
            model: "gpt-4o-mini",
            created: 1,
            choices: [{
              index: 0,
              delta: { content: "Hello" },
              finish_reason: null
            }]
          },
          "[DONE]"
        ]
      }))))

    it.effect("drops invalid JSON and continues streaming", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        const events = yield* client.createResponseStream({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }]
        }).pipe(
          Effect.flatMap(([_, stream]) => Stream.runCollect(stream))
        )

        assert.strictEqual(events.length, 2)
        assert.propertyVal(events[0], "id", "chatcmpl_test_3")
        assert.strictEqual(events[1], "[DONE]")
      }).pipe(Effect.provide(makeTestLayer({
        _tag: "RawSse",
        body: [
          "data: {invalid-json\n\n",
          `data: ${
            JSON.stringify({
              id: "chatcmpl_test_3",
              object: "chat.completion.chunk",
              model: "gpt-4o-mini",
              created: 1,
              choices: [{
                index: 0,
                delta: { content: "Hello" },
                finish_reason: null
              }]
            })
          }\n\n`,
          "data: [DONE]\n\n"
        ].join("")
      }))))

    it.effect("passes chat-completions tool_choice payload through unchanged", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        yield* client.createResponse({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }],
          tool_choice: {
            type: "function",
            function: {
              name: "TestTool"
            }
          },
          tools: [{
            type: "function",
            function: {
              name: "TestTool",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  input: { type: "string" }
                },
                required: ["input"]
              }
            }
          }]
        })

        const requests = yield* MockHttpClient.requests
        const request = requests[0]
        const body = yield* getRequestBody(request)

        assert.deepStrictEqual(body.tool_choice, {
          type: "function",
          function: { name: "TestTool" }
        })
      }).pipe(Effect.provide(makeTestLayer())))

    it.effect("accepts assistant tool-call and tool result chat history", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        yield* client.createResponse({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "assistant",
              content: null,
              tool_calls: [{
                id: "patch_call_1",
                type: "function",
                function: {
                  name: "apply_patch",
                  arguments: JSON.stringify({
                    call_id: "patch_call_1",
                    operation: {
                      type: "delete_file",
                      path: "src/obsolete.ts"
                    }
                  })
                }
              }]
            },
            {
              role: "tool",
              tool_call_id: "patch_call_1",
              content: "deleted"
            }
          ]
        })

        const requests = yield* MockHttpClient.requests
        const request = requests[0]
        const body = yield* getRequestBody(request)

        const assistantMessages = body.messages.filter((message: any) => message.role === "assistant")
        const patchMessage = assistantMessages.find((message: any) =>
          message.tool_calls?.[0]?.function?.name === "apply_patch"
        )

        assert.isDefined(patchMessage)

        assert.strictEqual(patchMessage.tool_calls[0].id, "patch_call_1")
        assert.deepStrictEqual(JSON.parse(patchMessage.tool_calls[0].function.arguments), {
          call_id: "patch_call_1",
          operation: {
            type: "delete_file",
            path: "src/obsolete.ts"
          }
        })

        const toolMessages = body.messages.filter((message: any) => message.role === "tool")
        const patchOutput = toolMessages.find((message: any) => message.tool_call_id === "patch_call_1")
        assert.isDefined(patchOutput)
        assert.strictEqual(patchOutput.content, "deleted")
      }).pipe(Effect.provide(makeTestLayer())))

    it.effect("redacts OpenAI-specific headers in AI error context", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        const result = yield* client.createResponse({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }]
        }).pipe(Effect.flip)

        const headers = result.reason._tag === "InvalidRequestError"
          ? result.reason.http?.request.headers ?? Headers.empty
          : Headers.empty

        assert.strictEqual(String(headers["authorization"]), "<redacted>")
        assert.strictEqual(String(headers["openai-organization"]), "<redacted>")
        assert.strictEqual(String(headers["openai-project"]), "<redacted>")
      }).pipe(Effect.provide(makeTestLayer({
        _tag: "Json",
        status: 400,
        body: {
          error: {
            message: "Bad request",
            type: "invalid_request_error",
            code: null
          }
        }
      }))))
  })

  describe("error mapping", () => {
    it.effect("maps 400 responses to InvalidRequestError", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        const error = yield* client.createResponse({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }]
        }).pipe(Effect.flip)

        assert.strictEqual(error._tag, "AiError")
        assert.strictEqual(error.method, "createResponse")
        assert.strictEqual(error.reason._tag, "InvalidRequestError")
      }).pipe(Effect.provide(makeTestLayer({
        _tag: "Json",
        status: 400,
        body: {
          error: {
            message: "Bad request",
            type: "invalid_request_error",
            code: null
          }
        }
      }))))

    it.effect("surfaces the provider message on 401 AuthenticationError", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        const error = yield* client.createResponse({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }]
        }).pipe(Effect.flip)

        assert.strictEqual(error.reason._tag, "AuthenticationError")
        if (error.reason._tag !== "AuthenticationError") {
          return yield* Effect.die(new Error("Expected AuthenticationError"))
        }
        assert.strictEqual(error.reason.kind, "InvalidKey")
        assert.strictEqual(
          error.reason.description,
          "Incorrect API key provided (POST https://compat.example.test/v1/chat/completions) [code: invalid_api_key] [requestId: req_openai_compat]"
        )
        assert.include(error.reason.message, "Incorrect API key provided")
      }).pipe(Effect.provide(makeTestLayer({
        _tag: "Json",
        status: 401,
        body: {
          error: {
            message: "Incorrect API key provided",
            type: "invalid_request_error",
            code: "invalid_api_key"
          }
        },
        headers: { "x-request-id": "req_openai_compat" }
      }))))

    it("preserves and truncates a fallback HTTP response", () => {
      const body = `${"a".repeat(200)}b`
      const reason = Errors.mapStatusCodeToReason({
        status: 400,
        headers: {},
        message: undefined,
        metadata: { errorCode: null, errorType: null, requestId: null },
        http: makeHttpContext("https://compat.example.test/v1/chat/completions", body)
      })

      assert.strictEqual(reason._tag, "InvalidRequestError")
      if (reason._tag !== "InvalidRequestError") {
        throw new Error("Expected InvalidRequestError")
      }
      assert.strictEqual(
        reason.description,
        `HTTP 400 (POST https://compat.example.test/v1/chat/completions) Response: ${"a".repeat(200)}...`
      )
    })

    it.effect("surfaces the provider message on 403 AuthenticationError", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        const error = yield* client.createResponse({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }]
        }).pipe(Effect.flip)

        assert.strictEqual(error.reason._tag, "AuthenticationError")
        if (error.reason._tag !== "AuthenticationError") {
          return yield* Effect.die(new Error("Expected AuthenticationError"))
        }
        assert.strictEqual(error.reason.kind, "InsufficientPermissions")
        assert.include(error.reason.description ?? "", "Country, region, or territory not supported")
        assert.include(error.reason.message, "Country, region, or territory not supported")
      }).pipe(Effect.provide(makeTestLayer({
        _tag: "Json",
        status: 403,
        body: {
          error: {
            message: "Country, region, or territory not supported",
            type: "permission_error",
            code: null
          }
        }
      }))))

    it.effect("maps insufficient quota errors to QuotaExhaustedError", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient

        const error = yield* client.createResponse({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }]
        }).pipe(Effect.flip)

        assert.strictEqual(error._tag, "AiError")
        assert.strictEqual(error.method, "createResponse")
        assert.strictEqual(error.reason._tag, "QuotaExhaustedError")
      }).pipe(Effect.provide(makeTestLayer({
        _tag: "Json",
        status: 429,
        body: {
          error: {
            message: "You exceeded your current quota",
            type: "insufficient_quota",
            code: "insufficient_quota"
          }
        }
      }))))
  })
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
  | {
    readonly _tag: "RawSse"
    readonly body: string
    readonly status?: number | undefined
    readonly headers?: Record<string, string> | undefined
  }

class MockOpenAiResponse extends Context.Service<MockOpenAiResponse, {
  readonly response: MockResponse
}>()("MockOpenAiResponse") {}

class MockHttpClient extends Context.Service<MockHttpClient, {
  readonly requests: Effect.Effect<ReadonlyArray<HttpClientRequest.HttpClientRequest>>
}>()("MockHttpClient") {
  static requests = MockHttpClient.use((client) => client.requests)
}

const makeHttpClientContext = Effect.gen(function*() {
  const capturedRequests: Array<HttpClientRequest.HttpClientRequest> = []
  const mock = yield* MockOpenAiResponse

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

const makeTestLayer = (response: MockResponse = {
  _tag: "Json",
  body: makeCreateResponse()
}) =>
  OpenAiClient.layer({
    apiKey: Redacted.make("sk-test-key"),
    apiUrl: "https://compat.example.test/v1",
    organizationId: Redacted.make("org_123"),
    projectId: Redacted.make("proj_456")
  }).pipe(
    Layer.provideMerge(HttpClientLayer),
    Layer.provide(Layer.succeed(MockOpenAiResponse, {
      response
    }))
  )

const makeCreateResponse = (
  overrides: Partial<OpenAiClient.CreateResponse200> = {}
) => ({
  id: "chatcmpl_test_1",
  object: "chat.completion",
  model: "gpt-4o-mini",
  created: 1,
  choices: [{
    index: 0,
    finish_reason: "stop",
    message: {
      role: "assistant",
      content: "Hello"
    }
  }],
  usage: {
    prompt_tokens: 1,
    completion_tokens: 1,
    total_tokens: 2
  },
  ...overrides
})

const makeResponse = (
  request: HttpClientRequest.HttpClientRequest,
  response: MockResponse
): HttpClientResponse.HttpClientResponse => {
  const contentType = response._tag === "Json"
    ? "application/json"
    : "text/event-stream"
  const body = response._tag === "Json"
    ? JSON.stringify(response.body)
    : response._tag === "Sse"
    ? toSseBody(response.events)
    : response.body

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

const getRequestBody = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function*() {
    const body = request.body
    if (body._tag === "Uint8Array") {
      const text = new TextDecoder().decode(body.body)
      return JSON.parse(text)
    }
    return yield* Effect.die(new Error("Expected Uint8Array body"))
  })

const toSseBody = (events: ReadonlyArray<Schema.Json>): string =>
  events.map((event) => {
    const data = event === "[DONE]" ? event : JSON.stringify(event)
    return `data: ${data}\n\n`
  }).join("")

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
