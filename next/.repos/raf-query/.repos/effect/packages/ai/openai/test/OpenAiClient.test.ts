import type { OpenAiSchema } from "@effect/ai-openai"
import type * as Generated from "@effect/ai-openai/Generated"
import * as Errors from "@effect/ai-openai/internal/errors"
import * as OpenAiClient from "@effect/ai-openai/OpenAiClient"
import * as OpenAiClientGenerated from "@effect/ai-openai/OpenAiClientGenerated"
import * as OpenAiConfig from "@effect/ai-openai/OpenAiConfig"
import * as OpenAiLanguageModel from "@effect/ai-openai/OpenAiLanguageModel"
import { assert, describe, it } from "@effect/vitest"
import { Config, ConfigProvider, Context, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { Chat } from "effect/ai"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Socket from "effect/socket/Socket"
import { WS } from "vitest-websocket-mock"

describe("OpenAiClient", () => {
  describe("make", () => {
    it.effect("sets Bearer token from apiKey", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        yield* client.createResponse({ model: "gpt-4o", input: "test" })

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.headers["authorization"], "Bearer sk-test-12345")
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("sk-test-12345")
      }))))

    it.effect("prepends default URL", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        yield* client.createResponse({ model: "gpt-4o", input: "test" })

        const requests = yield* MockHttpClient.requests
        assert.isTrue(requests[0]?.url.startsWith("https://api.openai.com/v1"))
      }).pipe(Effect.provide(makeTestLayer())))

    it.effect("uses custom apiUrl when provided", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        yield* client.createResponse({ model: "gpt-4o", input: "test" })

        const requests = yield* MockHttpClient.requests
        assert.isTrue(requests[0]?.url.startsWith("https://custom.api.com/v2"))
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("test-key"),
        apiUrl: "https://custom.api.com/v2"
      }))))

    it.effect("sets OpenAI-Organization header when organizationId provided", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        yield* client.createResponse({ model: "gpt-4o", input: "test" })

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.headers["openai-organization"], "org-12345")
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("test-key"),
        organizationId: Redacted.make("org-12345")
      }))))

    it.effect("sets OpenAI-Project header when projectId provided", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        yield* client.createResponse({ model: "gpt-4o", input: "test" })

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.headers["openai-project"], "proj-67890")
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("test-key"),
        projectId: Redacted.make("proj-67890")
      }))))

    it.effect("applies transformClient option", () => {
      let transformApplied = false
      return Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        yield* client.createResponse({ model: "gpt-4o", input: "test" })
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
        const client = yield* OpenAiClient.OpenAiClient
        yield* client.client.execute(HttpClientRequest.get("/responses"))

        const requests = yield* MockHttpClient.requests
        const request = requests[0]
        assert.isTrue(request?.url.startsWith("https://api.openai.com/v1"))
        assert.strictEqual(request?.headers["authorization"], "Bearer test-key")
        assert.strictEqual(request?.headers["x-client-field"], "enabled")
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("test-key"),
        transformClient: (client) =>
          client.pipe(HttpClient.mapRequest(HttpClientRequest.setHeader("x-client-field", "enabled")))
      }))))

    it.effect("applies OpenAiConfig transformClient after options transformClient", () => {
      let optionsTransformApplied = false
      let configTransformApplied = false

      return Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        yield* client.createResponse({
          model: "gpt-4o",
          input: "test"
        }).pipe(
          OpenAiConfig.withClientTransform((client) => {
            configTransformApplied = true
            return client.pipe(
              HttpClient.mapRequest(HttpClientRequest.setHeader("x-openai-transform", "config"))
            )
          })
        )

        const requests = yield* MockHttpClient.requests
        assert.isTrue(optionsTransformApplied)
        assert.isTrue(configTransformApplied)
        assert.strictEqual(requests[0]?.headers["x-openai-transform"], "config")
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("test-key"),
        transformClient: (client) => {
          optionsTransformApplied = true
          return client.pipe(
            HttpClient.mapRequest(HttpClientRequest.setHeader("x-openai-transform", "options"))
          )
        }
      })))
    })
  })

  describe("OpenAiClientGenerated", () => {
    it.effect("sets Bearer token from apiKey", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClientGenerated.OpenAiClientGenerated
        yield* client.createResponse({
          payload: { model: "gpt-4o", input: "test" }
        })

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.headers["authorization"], "Bearer sk-generated-test")
      }).pipe(Effect.provide(makeGeneratedTestLayer({
        apiKey: Redacted.make("sk-generated-test")
      }))))

    it.effect("prepends custom apiUrl", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClientGenerated.OpenAiClientGenerated
        yield* client.createResponse({
          payload: { model: "gpt-4o", input: "test" }
        })

        const requests = yield* MockHttpClient.requests
        assert.isTrue(requests[0]?.url.startsWith("https://generated.example.test/v2"))
      }).pipe(Effect.provide(makeGeneratedTestLayer({
        apiKey: Redacted.make("test-key"),
        apiUrl: "https://generated.example.test/v2"
      }))))

    it.effect("applies OpenAiConfig transformClient after options transformClient", () => {
      let optionsTransformApplied = false
      let configTransformApplied = false

      return Effect.gen(function*() {
        const client = yield* OpenAiClientGenerated.OpenAiClientGenerated
        yield* client.createResponse({
          payload: { model: "gpt-4o", input: "test" }
        }).pipe(
          OpenAiConfig.withClientTransform((client) => {
            configTransformApplied = true
            return client.pipe(
              HttpClient.mapRequest(HttpClientRequest.setHeader("x-openai-transform", "config"))
            )
          })
        )

        const requests = yield* MockHttpClient.requests
        assert.isTrue(optionsTransformApplied)
        assert.isTrue(configTransformApplied)
        assert.strictEqual(requests[0]?.headers["x-openai-transform"], "config")
      }).pipe(Effect.provide(makeGeneratedTestLayer({
        apiKey: Redacted.make("test-key"),
        transformClient: (client) => {
          optionsTransformApplied = true
          return client.pipe(
            HttpClient.mapRequest(HttpClientRequest.setHeader("x-openai-transform", "options"))
          )
        }
      })))
    })
  })

  describe("layer", () => {
    it.effect("creates working service", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        assert.isNotNull(client.client)
      }).pipe(Effect.provide(makeTestLayer())))

    it.effect("layerConfig loads from Config", () => {
      const configProvider = ConfigProvider.fromEnv({
        env: {
          MY_API_KEY: "sk-config-key",
          MY_API_URL: "https://config.api.com/v1"
        }
      })

      return Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        yield* client.createResponse({ model: "gpt-4o", input: "test" })

        const requests = yield* MockHttpClient.requests
        assert.strictEqual(requests[0]?.headers["authorization"], "Bearer sk-config-key")
        assert.isTrue(requests[0]?.url.startsWith("https://config.api.com/v1"))
      }).pipe(Effect.provide(makeConfigTestLayer(configProvider)))
    })
  })

  describe("request behavior", () => {
    it.effect("redacts OpenAI-specific headers in AI error context", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponse({
          model: "gpt-4o",
          input: "test"
        }).pipe(Effect.flip)

        assert.strictEqual(result.reason._tag, "InvalidRequestError")
        if (result.reason._tag !== "InvalidRequestError" || result.reason.http === undefined) {
          return yield* Effect.die(new Error("Expected InvalidRequestError with HTTP context"))
        }
        const headers = result.reason.http.request.headers
        assert.strictEqual(String(headers["authorization"]), "<redacted>")
        assert.strictEqual(String(headers["openai-organization"]), "<redacted>")
        assert.strictEqual(String(headers["openai-project"]), "<redacted>")
      }).pipe(Effect.provide(makeTestLayer({
        apiKey: Redacted.make("test-key"),
        organizationId: Redacted.make("org-secret"),
        projectId: Redacted.make("proj-secret")
      }, {
        _tag: "Json",
        status: 400,
        body: { error: { message: "Bad request" } }
      }))))
  })

  describe("error mapping", () => {
    it.effect("maps TransportError to NetworkError reason", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.make({
          apiKey: Redacted.make("test-key")
        })
        const result = yield* client.createResponse({ model: "gpt-4o", input: "test" }).pipe(
          Effect.flip
        )

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.module, "OpenAiClient")
        assert.strictEqual(result.method, "createResponse")
        assert.strictEqual(result.reason._tag, "NetworkError")
      }).pipe(Effect.provide(Layer.succeed(HttpClient.HttpClient, makeTransportErrorHttpClient()))))

    it.effect("maps 400 status to InvalidRequestError reason", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponse({ model: "gpt-4o", input: "test" }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.module, "OpenAiClient")
        assert.strictEqual(result.method, "createResponse")
        assert.strictEqual(result.reason._tag, "InvalidRequestError")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        status: 400,
        body: { error: { message: "Bad request" } }
      }))))

    it.effect("maps 401 status to AuthenticationError reason", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponse({ model: "gpt-4o", input: "test" }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.reason._tag, "AuthenticationError")
        if (result.reason._tag === "AuthenticationError") {
          assert.strictEqual(result.reason.kind, "InvalidKey")
          assert.strictEqual(
            result.reason.description,
            "Invalid API key (POST https://api.openai.com/v1/responses) [code: invalid_api_key] [requestId: req_openai]"
          )
          assert.include(result.reason.message, "Invalid API key")
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        status: 401,
        body: { error: { message: "Invalid API key", type: "invalid_request_error", code: "invalid_api_key" } },
        headers: { "x-request-id": "req_openai" }
      }))))

    it("preserves and truncates a fallback HTTP response", () => {
      const body = `${"a".repeat(200)}b`
      const reason = Errors.mapStatusCodeToReason({
        status: 400,
        headers: {},
        message: undefined,
        metadata: { errorCode: null, errorType: null, requestId: null },
        http: makeHttpContext("https://api.openai.com/v1/responses", body)
      })

      assert.strictEqual(reason._tag, "InvalidRequestError")
      if (reason._tag !== "InvalidRequestError") {
        throw new Error("Expected InvalidRequestError")
      }
      assert.strictEqual(
        reason.description,
        `HTTP 400 (POST https://api.openai.com/v1/responses) Response: ${"a".repeat(200)}...`
      )
    })

    it.effect("maps 403 status to AuthenticationError with InsufficientPermissions", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponse({ model: "gpt-4o", input: "test" }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.reason._tag, "AuthenticationError")
        if (result.reason._tag === "AuthenticationError") {
          assert.strictEqual(result.reason.kind, "InsufficientPermissions")
          assert.include(result.reason.description ?? "", "Access denied")
          assert.include(result.reason.message, "Access denied")
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        status: 403,
        body: { error: { message: "Access denied" } }
      }))))

    it.effect("maps 429 status to RateLimitError reason", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponse({ model: "gpt-4o", input: "test" }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.reason._tag, "RateLimitError")
        assert.isTrue(result.isRetryable)
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        status: 429,
        body: { error: { message: "Rate limit exceeded", type: "rate_limit_error", code: null } }
      }))))

    it.effect("maps 429 with insufficient_quota code to QuotaExhaustedError", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponse({ model: "gpt-4o", input: "test" }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.reason._tag, "QuotaExhaustedError")
        assert.isFalse(result.isRetryable)
      }).pipe(Effect.provide(makeTestLayer(undefined, {
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

    it.effect("maps OpenAI-compatible 402 errors to QuotaExhaustedError", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponse({ model: "grok-4", input: "test" }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.reason._tag, "QuotaExhaustedError")
        assert.isFalse(result.isRetryable)
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        status: 402,
        body: { error: "Your balance is too low", code: "billing_insufficient_balance" }
      }))))

    it.effect("maps OpenAI-compatible insufficient balance errors to QuotaExhaustedError", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponse({ model: "grok-4", input: "test" }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.reason._tag, "QuotaExhaustedError")
        assert.isFalse(result.isRetryable)
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        status: 429,
        body: { error: "Your balance is too low", code: "billing_insufficient_balance" }
      }))))

    it("mapStatusCodeToReason detects insufficient_quota as QuotaExhaustedError", () => {
      const http = {
        request: {
          method: "POST" as const,
          url: "https://api.openai.com",
          urlParams: [],
          hash: undefined,
          headers: {}
        }
      }
      const reason = Errors.mapStatusCodeToReason({
        status: 429,
        headers: {},
        message: "You exceeded your current quota",
        metadata: {
          errorCode: "insufficient_quota",
          errorType: "insufficient_quota",
          requestId: null
        },
        http
      })
      assert.strictEqual(reason._tag, "QuotaExhaustedError")
    })

    it("OpenAiErrorBody decodes error with type and code", () => {
      const json = {
        error: {
          message: "You exceeded your current quota",
          type: "insufficient_quota",
          code: "insufficient_quota"
        }
      }
      const decoded = Schema.decodeUnknownSync(Errors.OpenAiErrorBody)(json)
      assert.strictEqual(decoded.error.message, "You exceeded your current quota")
      assert.strictEqual(decoded.error.type, "insufficient_quota")
      assert.strictEqual(decoded.error.code, "insufficient_quota")
    })

    it.effect("maps 5xx status to InternalProviderError reason", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponse({ model: "gpt-4o", input: "test" }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.reason._tag, "InternalProviderError")
        assert.isTrue(result.isRetryable)
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        status: 500,
        body: { error: { message: "Internal server error" } }
      }))))

    it.effect("maps schema error to InvalidOutputError reason", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponse({ model: "gpt-4o", input: "test" }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.method, "createResponse")
        assert.strictEqual(result.reason._tag, "InvalidOutputError")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        body: { invalid: "response" } as any
      }))))
  })

  describe("createEmbedding", () => {
    it.effect("maps 400 error to AiError", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createEmbedding({
          model: "invalid-model",
          input: "test"
        }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.method, "createEmbedding")
        assert.strictEqual(result.reason._tag, "InvalidRequestError")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        status: 400,
        body: { error: { message: "Invalid model" } }
      }))))

    it.effect("maps 429 error to RateLimitError", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createEmbedding({
          model: "text-embedding-ada-002",
          input: "test"
        }).pipe(Effect.flip)

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.reason._tag, "RateLimitError")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        status: 429,
        body: { error: { message: "Rate limit exceeded" } }
      }))))
  })

  describe("createResponseStream", () => {
    it.live("terminates an SSE stream at response.failed", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const [, stream] = yield* client.createResponseStream({ model: "gpt-4o", input: "test" })
        const result = yield* Stream.runCollect(stream).pipe(Effect.timeoutOption("100 millis"))

        assert.strictEqual(result._tag, "Some")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Sse",
        events: [{
          type: "response.failed",
          sequence_number: 1,
          response: makeResponseBody({ status: "failed" })
        }],
        keepOpen: true
      }))))

    it.live("terminates a WebSocket stream at response.failed", () =>
      Effect.gen(function*() {
        const server = yield* Effect.acquireRelease(
          Effect.sync(() => new WS("wss://api.openai.com/v1/responses", { jsonProtocol: true })),
          (server) => Effect.sync(() => server.close())
        )
        const event = {
          type: "response.failed",
          sequence_number: 1,
          response: makeResponseBody({ status: "failed" })
        }
        const result = yield* OpenAiClient.withWebSocketMode(
          Effect.gen(function*() {
            const client = yield* OpenAiClient.OpenAiClient
            const [, stream] = yield* client.createResponseStream({ model: "gpt-4o", input: "test" })
            const [events] = yield* Effect.all([
              Stream.runCollect(stream),
              Effect.promise(() => server.nextMessage).pipe(
                Effect.tap(() => Effect.sync(() => server.send(event)))
              )
            ], { concurrency: "unbounded" })
            return events
          })
        ).pipe(
          Effect.provide(makeTestLayer()),
          Effect.provideService(Socket.WebSocketConstructor, (url) => new globalThis.WebSocket(url)),
          Effect.timeoutOption("1 second")
        )

        assert.strictEqual(result._tag, "Some")
      }))

    it.live("replaces the WebSocket after non-retryable error events", () =>
      Effect.gen(function*() {
        const server = yield* Effect.acquireRelease(
          Effect.sync(() => new WS("wss://socket-errors.test/v1/responses", { jsonProtocol: true })),
          (server) => Effect.sync(() => server.close())
        )
        let connections = 0

        yield* OpenAiClient.withWebSocketMode(
          Effect.gen(function*() {
            const client = yield* OpenAiClient.OpenAiClient
            const [, failedStream] = yield* client.createResponseStream({ model: "gpt-4o", input: "first" })
            yield* Effect.all([
              Stream.runDrain(failedStream).pipe(Effect.flip),
              nextWebSocketCreate(server).pipe(
                Effect.tap(() =>
                  Effect.sync(() =>
                    server.send({
                      type: "error",
                      code: "invalid_request_error",
                      message: "bad",
                      param: null
                    })
                  )
                )
              )
            ], { concurrency: "unbounded" })

            const [, secondFailedStream] = yield* client.createResponseStream({ model: "gpt-4o", input: "second" })
            yield* Effect.all([
              Stream.runDrain(secondFailedStream).pipe(Effect.flip),
              nextWebSocketCreate(server).pipe(
                Effect.tap(() =>
                  Effect.sync(() =>
                    server.send({
                      error: {
                        message: "gRPC error: permission denied",
                        type: "api_error"
                      }
                    })
                  )
                )
              )
            ], { concurrency: "unbounded" })

            const [, thirdFailedStream] = yield* client.createResponseStream({ model: "gpt-4o", input: "third" })
            const [error] = yield* Effect.all([
              Stream.runDrain(thirdFailedStream).pipe(Effect.flip),
              nextWebSocketCreate(server).pipe(
                Effect.tap(() =>
                  Effect.sync(() =>
                    server.send({
                      error: {
                        message: "bad request",
                        type: "invalid_request_error"
                      }
                    })
                  )
                )
              )
            ], { concurrency: "unbounded" })
            assert.strictEqual(error.reason._tag, "InvalidRequestError")

            const [, nextStream] = yield* client.createResponseStream({ model: "gpt-4o", input: "fourth" })
            yield* Effect.all([
              Stream.runDrain(nextStream),
              nextWebSocketCreate(server).pipe(
                Effect.tap(() => Effect.sync(() => sendWebSocketCompleted(server, "resp_4", "msg_4", "ok")))
              )
            ], { concurrency: "unbounded" })
          })
        ).pipe(
          Effect.provide(OpenAiClient.layer({
            apiKey: Redacted.make("sk-test"),
            apiUrl: "https://socket-errors.test/v1"
          })),
          Effect.provideService(Socket.WebSocketConstructor, (url) => {
            connections++
            return new globalThis.WebSocket(url)
          }),
          Effect.provideService(HttpClient.HttpClient, HttpClient.make(() => Effect.die("unexpected http"))),
          Effect.timeout("5 seconds")
        )

        assert.strictEqual(connections, 4)
      }))

    it.live("retries an untagged xAI response-not-found error with the full prompt", () =>
      Effect.gen(function*() {
        const server = yield* Effect.acquireRelease(
          Effect.sync(() => new WS("wss://previous-response.test/v1/responses", { jsonProtocol: true })),
          (server) => Effect.sync(() => server.close())
        )

        const drive = Effect.gen(function*() {
          const chat = yield* Chat.empty
          yield* chat.streamText({ prompt: "hello" }).pipe(Stream.runDrain)
          yield* chat.streamText({ prompt: "again" }).pipe(Stream.runDrain)
          yield* chat.streamText({ prompt: "later" }).pipe(Stream.runDrain)
        }).pipe(
          OpenAiClient.withWebSocketMode,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini", { store: true })),
          Effect.provide(OpenAiClient.layer({
            apiKey: Redacted.make("sk-test"),
            apiUrl: "https://previous-response.test/v1"
          })),
          Effect.provideService(Socket.WebSocketConstructor, (url) => new globalThis.WebSocket(url)),
          Effect.provideService(HttpClient.HttpClient, HttpClient.make(() => Effect.die("unexpected http")))
        )

        const respond = Effect.gen(function*() {
          const first = yield* nextWebSocketCreate(server)
          assert.isUndefined(first.previous_response_id)
          assert.deepStrictEqual(first.input, [webSocketUserInput("hello")])
          sendWebSocketCompleted(server, "resp_1", "msg_1", "ok")

          const incremental = yield* nextWebSocketCreate(server)
          assert.strictEqual(incremental.previous_response_id, "resp_1")
          assert.deepStrictEqual(incremental.input, [webSocketUserInput("again")])
          server.send({
            error: {
              message: "gRPC error: Response with id=resp_1 not found",
              type: "api_error"
            }
          })

          const retried = yield* nextWebSocketCreate(server)
          assert.isUndefined(retried.previous_response_id)
          assert.deepStrictEqual(retried.input, [
            webSocketUserInput("hello"),
            webSocketAssistantInput("msg_1", "ok"),
            webSocketUserInput("again")
          ])
          sendWebSocketCompleted(server, "resp_2", "msg_2", "retried")

          const later = yield* nextWebSocketCreate(server)
          assert.strictEqual(later.previous_response_id, "resp_2")
          assert.deepStrictEqual(later.input, [webSocketUserInput("later")])
          sendWebSocketCompleted(server, "resp_3", "msg_3", "later")
        })

        yield* Effect.all([drive, respond], { concurrency: "unbounded" }).pipe(
          Effect.timeout("5 seconds")
        )
      }))

    it.live("round-trips streamed encrypted reasoning in a full-prompt retry", () =>
      Effect.gen(function*() {
        const server = yield* Effect.acquireRelease(
          Effect.sync(() => new WS("wss://reasoning-recovery.test/v1/responses", { jsonProtocol: true })),
          (server) => Effect.sync(() => server.close())
        )
        const requests: Array<WebSocketResponseCreate> = []

        const drive = Effect.gen(function*() {
          const chat = yield* Chat.empty
          yield* chat.streamText({ prompt: "think" }).pipe(Stream.runDrain)
          yield* chat.streamText({ prompt: "continue" }).pipe(Stream.runDrain)
        }).pipe(
          OpenAiClient.withWebSocketMode,
          Effect.provide(OpenAiLanguageModel.model("o3-mini", { store: true })),
          Effect.provide(OpenAiClient.layer({
            apiKey: Redacted.make("sk-test"),
            apiUrl: "https://reasoning-recovery.test/v1"
          })),
          Effect.provideService(Socket.WebSocketConstructor, (url) => new globalThis.WebSocket(url)),
          Effect.provideService(HttpClient.HttpClient, HttpClient.make(() => Effect.die("unexpected http")))
        )

        const respond = Effect.gen(function*() {
          requests.push(yield* nextWebSocketCreate(server))
          sendWebSocketReasoningCompleted(server, "resp_1", "rs_1", "thinking", "encrypted-reasoning")

          requests.push(yield* nextWebSocketCreate(server))
          server.send({
            error: {
              message: "gRPC error: Response with id=resp_1 not found",
              type: "api_error"
            }
          })

          requests.push(yield* nextWebSocketCreate(server))
          sendWebSocketCompleted(server, "resp_2", "msg_2", "done")
        })

        yield* Effect.all([drive, respond], { concurrency: "unbounded" }).pipe(
          Effect.timeout("5 seconds")
        )

        assert.deepStrictEqual({
          include: requests[0]?.include,
          reasoning: requests[2]?.input.find((item) => item.type === "reasoning")
        }, {
          include: ["reasoning.encrypted_content"],
          reasoning: {
            type: "reasoning",
            id: "rs_1",
            summary: [{ type: "summary_text", text: "thinking" }],
            encrypted_content: "encrypted-reasoning"
          }
        })
      }))

    it.effect("accepts keepalive stream events", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const [_, stream] = yield* client.createResponseStream({
          model: "gpt-4o",
          input: "test"
        })

        const events = yield* Stream.runCollect(stream)
        const parts = globalThis.Array.from(events)

        assert.strictEqual(parts.length, 3)
        const keepAlive = parts[1]
        assert.strictEqual(keepAlive.type, "keepalive")
        if (keepAlive.type === "keepalive" && "sequence_number" in keepAlive) {
          assert.strictEqual(keepAlive.sequence_number, 2)
        }

        const completed = parts[2]
        assert.isTrue(typeof completed === "object" && completed !== null && "type" in completed)
        if (typeof completed === "object" && completed !== null && "type" in completed) {
          assert.strictEqual(completed.type, "response.completed")
          if (
            completed.type === "response.completed" &&
            "response" in completed &&
            typeof completed.response === "object" &&
            completed.response !== null &&
            "id" in completed.response
          ) {
            assert.strictEqual(completed.response.id, "resp_stream")
          }
        }
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Sse",
        events: [
          {
            type: "response.created",
            sequence_number: 1,
            response: makeResponseBody({ id: "resp_stream", status: "in_progress" })
          },
          {
            type: "keepalive",
            sequence_number: 2
          },
          {
            type: "response.completed",
            sequence_number: 3,
            response: makeResponseBody({ id: "resp_stream" })
          }
        ]
      }))))

    it.effect("accepts response stream events without sequence numbers", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const [, stream] = yield* client.createResponseStream({
          model: "gpt-4o",
          input: "test"
        })

        const events = yield* Stream.runCollect(stream)
        const decoded = globalThis.Array.from(events)

        assert.deepStrictEqual(decoded.map((event) => event.type), [
          "response.created",
          "response.output_item.added",
          "response.content_part.added",
          "response.output_text.delta",
          "response.reasoning_text.delta",
          "response.reasoning_text.done",
          "response.content_part.done",
          "response.completed"
        ])
        assert.deepStrictEqual(decoded[0], {
          type: "response.created",
          response: {
            id: "resp_test123",
            object: "response",
            model: "gpt-4o-mini",
            created_at: 1,
            output: [],
            error: null,
            incomplete_details: null
          }
        })
        assert.deepStrictEqual(decoded[3], {
          type: "response.output_text.delta",
          output_index: 0,
          item_id: "msg_123",
          content_index: 0,
          delta: "hello",
          sequence_number: 4
        })
        assert.deepStrictEqual([decoded[2], decoded[4], decoded[5], decoded[6]], [
          {
            type: "response.content_part.added",
            output_index: 0,
            item_id: "rs_tmp_123",
            content_index: 0,
            part: { type: "reasoning_text", text: "" }
          },
          {
            type: "response.reasoning_text.delta",
            output_index: 0,
            item_id: "rs_tmp_123",
            content_index: 0,
            delta: "thinking..."
          },
          {
            type: "response.reasoning_text.done",
            output_index: 0,
            item_id: "rs_tmp_123",
            content_index: 0,
            text: "thinking..."
          },
          {
            type: "response.content_part.done",
            output_index: 0,
            item_id: "rs_tmp_123",
            content_index: 0,
            part: { type: "reasoning_text", text: "thinking..." }
          }
        ])
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Sse",
        events: [
          {
            type: "response.created",
            response: makeResponseBody({ status: "in_progress" })
          },
          {
            type: "response.output_item.added",
            output_index: 0,
            item: {
              id: "msg_123",
              type: "message",
              role: "assistant",
              status: "in_progress",
              content: []
            }
          },
          {
            type: "response.content_part.added",
            output_index: 0,
            item_id: "rs_tmp_123",
            content_index: 0,
            part: { type: "reasoning_text", text: "" }
          },
          {
            type: "response.output_text.delta",
            output_index: 0,
            item_id: "msg_123",
            content_index: 0,
            delta: "hello",
            sequence_number: 4
          },
          {
            type: "response.reasoning_text.delta",
            output_index: 0,
            item_id: "rs_tmp_123",
            content_index: 0,
            delta: "thinking..."
          },
          {
            type: "response.reasoning_text.done",
            output_index: 0,
            item_id: "rs_tmp_123",
            content_index: 0,
            text: "thinking..."
          },
          {
            type: "response.content_part.done",
            output_index: 0,
            item_id: "rs_tmp_123",
            content_index: 0,
            part: { type: "reasoning_text", text: "thinking..." }
          },
          {
            type: "response.completed",
            response: makeResponseBody()
          }
        ]
      }))))

    it.effect("maps HTTP error before stream starts", () =>
      Effect.gen(function*() {
        const client = yield* OpenAiClient.OpenAiClient
        const result = yield* client.createResponseStream({
          model: "gpt-4o",
          input: "test"
        }).pipe(
          Effect.andThen(([_, stream]) => Stream.runDrain(stream)),
          Effect.flip
        )

        assert.strictEqual(result._tag, "AiError")
        assert.strictEqual(result.reason._tag, "InternalProviderError")
      }).pipe(Effect.provide(makeTestLayer(undefined, {
        _tag: "Json",
        status: 500,
        body: { error: { message: "Server error" } }
      }))))
  })
})

type WebSocketResponseCreate = {
  readonly type: "response.create"
  readonly previous_response_id?: string | undefined
  readonly include?: ReadonlyArray<string> | undefined
  readonly input: ReadonlyArray<Record<string, unknown>>
}

const nextWebSocketCreate = (server: WS) =>
  Effect.promise(() => server.nextMessage).pipe(
    Effect.map((message) => message as WebSocketResponseCreate)
  )

const webSocketUserInput = (text: string) => ({
  role: "user",
  content: [{ type: "input_text", text }]
})

const webSocketAssistantInput = (id: string, text: string) => ({
  id,
  type: "message",
  role: "assistant",
  status: "completed",
  content: [{
    type: "output_text",
    text,
    annotations: [],
    logprobs: []
  }]
})

const sendWebSocketCompleted = (server: WS, id: string, itemId: string, text: string) => {
  const response = {
    id,
    object: "response",
    model: "gpt-4o-mini",
    created_at: 1,
    output: [],
    error: null,
    incomplete_details: null
  }
  const events = [
    { type: "response.created", response },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        id: itemId,
        type: "message",
        role: "assistant",
        status: "in_progress",
        content: []
      }
    },
    {
      type: "response.output_text.delta",
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      delta: text
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: {
        id: itemId,
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }]
      }
    },
    { type: "response.completed", response }
  ]
  for (const event of events) {
    server.send(event)
  }
}

const sendWebSocketReasoningCompleted = (
  server: WS,
  id: string,
  itemId: string,
  summary: string,
  encryptedContent: string
) => {
  const response = {
    id,
    object: "response",
    model: "o3-mini",
    created_at: 1,
    output: [],
    error: null,
    incomplete_details: null
  }
  const events = [
    { type: "response.created", sequence_number: 1, response },
    {
      type: "response.output_item.added",
      sequence_number: 2,
      output_index: 0,
      item: { type: "reasoning", id: itemId, summary: [], encrypted_content: null }
    },
    {
      type: "response.reasoning_summary_part.added",
      sequence_number: 3,
      output_index: 0,
      item_id: itemId,
      summary_index: 0,
      part: { type: "summary_text", text: summary }
    },
    {
      type: "response.reasoning_summary_text.delta",
      sequence_number: 4,
      output_index: 0,
      item_id: itemId,
      summary_index: 0,
      delta: summary
    },
    {
      type: "response.reasoning_summary_part.done",
      sequence_number: 5,
      output_index: 0,
      item_id: itemId,
      summary_index: 0,
      part: { type: "summary_text", text: summary }
    },
    {
      type: "response.output_item.done",
      sequence_number: 6,
      output_index: 0,
      item: {
        type: "reasoning",
        id: itemId,
        summary: [{ type: "summary_text", text: summary }],
        encrypted_content: encryptedContent
      }
    },
    { type: "response.completed", sequence_number: 7, response }
  ]
  for (const event of events) {
    server.send(event)
  }
}

type MockResponse =
  | {
    readonly _tag: "Json"
    readonly body: typeof Generated.Response.Encoded | {
      readonly error: {
        readonly message: string
        readonly type?: string
        readonly code?: string | null
      }
    } | {
      readonly error: string
      readonly code?: string
    }
    readonly status?: number | undefined
    readonly headers?: Record<string, string> | undefined
  }
  | {
    readonly _tag: "Sse"
    readonly events: ReadonlyArray<typeof OpenAiSchema.ResponseStreamEvent.Encoded>
    readonly keepOpen?: boolean | undefined
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

const defaultResponse: MockResponse = {
  _tag: "Json",
  body: makeResponseBody()
}

const makeTestLayer = (
  options: OpenAiClient.Options = { apiKey: Redacted.make("test-key") },
  response: MockResponse = defaultResponse
) =>
  OpenAiClient.layer(options).pipe(
    Layer.provideMerge(HttpClientLayer),
    Layer.provide(Layer.succeed(MockOpenAiResponse, { response }))
  )

const makeGeneratedTestLayer = (
  options: OpenAiClientGenerated.Options,
  response: MockResponse = defaultResponse
) =>
  OpenAiClientGenerated.layer(options).pipe(
    Layer.provideMerge(HttpClientLayer),
    Layer.provide(Layer.succeed(MockOpenAiResponse, { response }))
  )

const makeConfigTestLayer = (configProvider: ConfigProvider.ConfigProvider) =>
  OpenAiClient.layerConfig({
    apiKey: Config.Redacted("MY_API_KEY"),
    apiUrl: Config.String("MY_API_URL")
  }).pipe(
    Layer.provideMerge(HttpClientLayer),
    Layer.provide(Layer.succeed(MockOpenAiResponse, { response: defaultResponse })),
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

function makeResponseBody(
  overrides: Partial<typeof Generated.Response.Encoded> = {}
): typeof Generated.Response.Encoded {
  return {
    id: "resp_test123",
    object: "response",
    created_at: 1,
    model: "gpt-4o-mini",
    status: "completed",
    output: [],
    metadata: null,
    temperature: null,
    top_p: null,
    tools: [],
    tool_choice: "auto",
    error: null,
    incomplete_details: null,
    instructions: null,
    parallel_tool_calls: false,
    ...overrides
  }
}

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

  const httpResponse = HttpClientResponse.fromWeb(
    request,
    new Response(body, {
      status: response.status ?? 200,
      headers: {
        "content-type": contentType,
        ...response.headers
      }
    })
  )
  if (response._tag !== "Sse" || response.keepOpen !== true) return httpResponse

  const stream = Stream.concat(
    Stream.succeed(new TextEncoder().encode(body)),
    Stream.never
  )
  // `fromWeb` stores the ReadableStream internally, so a proxy is needed to replace it with a non-terminating test stream.
  return new Proxy(httpResponse, {
    get(target, property) {
      if (property === "stream") return stream
      const value = Reflect.get(target, property, target)
      return typeof value === "function" ? value.bind(target) : value
    }
  })
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
