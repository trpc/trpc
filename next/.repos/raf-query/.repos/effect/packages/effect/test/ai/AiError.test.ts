import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Schema } from "effect"
import { AiError } from "effect/ai"

describe("AiError", () => {
  describe("reason types", () => {
    describe("RateLimitError", () => {
      it("should be retryable", () => {
        const error = new AiError.RateLimitError({})
        assert.isTrue(error.isRetryable)
      })

      it("should format message with retryAfter", () => {
        const error = new AiError.RateLimitError({
          retryAfter: Duration.seconds(60)
        })
        assert.match(error.message, /Retry after/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.RateLimitError({})
        assert.strictEqual(error._tag, "RateLimitError")
      })
    })

    describe("QuotaExhaustedError", () => {
      it("should not be retryable", () => {
        const error = new AiError.QuotaExhaustedError({})
        assert.isFalse(error.isRetryable)
      })

      it("should format message correctly", () => {
        const error = new AiError.QuotaExhaustedError({})
        assert.match(error.message, /Quota exhausted/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.QuotaExhaustedError({})
        assert.strictEqual(error._tag, "QuotaExhaustedError")
      })
    })

    describe("AuthenticationError", () => {
      it("should not be retryable", () => {
        const error = new AiError.AuthenticationError({ kind: "InvalidKey" })
        assert.isFalse(error.isRetryable)
      })

      it("should format message based on kind", () => {
        const invalidKey = new AiError.AuthenticationError({ kind: "InvalidKey" })
        assert.match(invalidKey.message, /InvalidKey/)

        const expiredKey = new AiError.AuthenticationError({ kind: "ExpiredKey" })
        assert.match(expiredKey.message, /ExpiredKey/)

        const missingKey = new AiError.AuthenticationError({ kind: "MissingKey" })
        assert.match(missingKey.message, /MissingKey/)

        const insufficientPermissions = new AiError.AuthenticationError({ kind: "InsufficientPermissions" })
        assert.match(insufficientPermissions.message, /InsufficientPermissions/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.AuthenticationError({ kind: "Unknown" })
        assert.strictEqual(error._tag, "AuthenticationError")
      })

      it("should render the description after the kind suggestion when present", () => {
        const error = new AiError.AuthenticationError({
          kind: "InsufficientPermissions",
          description: "anthropic.claude-sonnet-5 is not available for this account"
        })
        assert.strictEqual(
          error.message,
          "InsufficientPermissions: Your API key lacks required permissions. anthropic.claude-sonnet-5 is not available for this account"
        )
      })

      it("should render the message unchanged when description is absent", () => {
        const error = new AiError.AuthenticationError({ kind: "InsufficientPermissions" })
        assert.strictEqual(
          error.message,
          "InsufficientPermissions: Your API key lacks required permissions"
        )
        assert.isUndefined(error.description)
      })

      it("should round-trip the description through the schema", () => {
        const error = new AiError.AuthenticationError({
          kind: "ExpiredKey",
          description: "The security token included in the request is expired"
        })
        const encoded = Schema.encodeUnknownSync(AiError.AuthenticationError)(error)
        const decoded = Schema.decodeUnknownSync(AiError.AuthenticationError)(encoded)
        assert.strictEqual(decoded.description, "The security token included in the request is expired")
      })
    })

    describe("ContentPolicyError", () => {
      it("should not be retryable", () => {
        const error = new AiError.ContentPolicyError({ description: "hate speech detected" })
        assert.isFalse(error.isRetryable)
      })

      it("should format message with description", () => {
        const error = new AiError.ContentPolicyError({
          description: "Input contains prohibited content"
        })
        assert.match(error.message, /Content policy violation/)
        assert.match(error.message, /Input contains prohibited content/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.ContentPolicyError({ description: "violation" })
        assert.strictEqual(error._tag, "ContentPolicyError")
      })
    })

    describe("InvalidRequestError", () => {
      it("should not be retryable", () => {
        const error = new AiError.InvalidRequestError({
          parameter: "temperature",
          constraint: "must be between 0 and 2"
        })
        assert.isFalse(error.isRetryable)
      })

      it("should format message with parameter details", () => {
        const error = new AiError.InvalidRequestError({
          parameter: "temperature",
          constraint: "must be between 0 and 2",
          description: "Value 5 is invalid"
        })
        assert.match(error.message, /parameter 'temperature'/)
        assert.match(error.message, /must be between 0 and 2/)
        assert.match(error.message, /Value 5 is invalid/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.InvalidRequestError({})
        assert.strictEqual(error._tag, "InvalidRequestError")
      })
    })

    describe("InternalProviderError", () => {
      it("should be retryable", () => {
        const error = new AiError.InternalProviderError({
          description: "Server error"
        })
        assert.isTrue(error.isRetryable)
      })

      it("should format message with description", () => {
        const error = new AiError.InternalProviderError({
          description: "Unexpected server failure"
        })
        assert.match(error.message, /Internal provider error/)
        assert.match(error.message, /Unexpected server failure/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.InternalProviderError({
          description: "Server error"
        })
        assert.strictEqual(error._tag, "InternalProviderError")
      })
    })

    describe("InvalidOutputError", () => {
      it("should be retryable", () => {
        const error = new AiError.InvalidOutputError({
          description: "Invalid JSON structure"
        })
        assert.isTrue(error.isRetryable)
      })

      it("should format message with description", () => {
        const error = new AiError.InvalidOutputError({
          description: "Expected string but got number"
        })
        assert.match(error.message, /Invalid output/)
        assert.match(error.message, /Expected string but got number/)
      })

      it.effect("should create from SchemaError", () =>
        Effect.gen(function*() {
          const TestSchema = Schema.Struct({ name: Schema.String })
          const result = yield* Effect.exit(
            Schema.decodeUnknownEffect(TestSchema)({ name: 123 })
          )

          if (result._tag === "Failure") {
            const cause = result.cause
            if ("error" in cause && Schema.isSchemaError(cause.error)) {
              const parseError = AiError.InvalidOutputError.fromSchemaError(cause.error)
              assert.strictEqual(parseError._tag, "InvalidOutputError")
              assert.isString(parseError.description)
            }
          }
        }))

      it("should have _tag set correctly", () => {
        const error = new AiError.InvalidOutputError({
          description: "Test error"
        })
        assert.strictEqual(error._tag, "InvalidOutputError")
      })
    })

    describe("UnknownError", () => {
      it("should not be retryable", () => {
        const error = new AiError.UnknownError({})
        assert.isFalse(error.isRetryable)
      })

      it("should format message with description", () => {
        const error = new AiError.UnknownError({
          description: "Something unexpected happened"
        })
        assert.strictEqual(error.message, "Something unexpected happened")
      })

      it("should use default message without description", () => {
        const error = new AiError.UnknownError({})
        assert.strictEqual(error.message, "Unknown error")
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.UnknownError({})
        assert.strictEqual(error._tag, "UnknownError")
      })
    })

    describe("ToolNotFoundError", () => {
      it("should be retryable", () => {
        const error = new AiError.ToolNotFoundError({
          toolName: "UnknownTool",
          availableTools: ["GetWeather", "GetTime"]
        })
        assert.isTrue(error.isRetryable)
      })

      it("should format message with available tools", () => {
        const error = new AiError.ToolNotFoundError({
          toolName: "UnknownTool",
          availableTools: ["GetWeather", "GetTime"]
        })
        assert.match(error.message, /Tool 'UnknownTool' not found/)
        assert.match(error.message, /Available tools: GetWeather, GetTime/)
      })

      it("should format message with no available tools", () => {
        const error = new AiError.ToolNotFoundError({
          toolName: "UnknownTool",
          availableTools: []
        })
        assert.match(error.message, /Available tools: none/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.ToolNotFoundError({
          toolName: "Test",
          availableTools: []
        })
        assert.strictEqual(error._tag, "ToolNotFoundError")
      })
    })

    describe("ToolParameterValidationError", () => {
      it("should be retryable", () => {
        const error = new AiError.ToolParameterValidationError({
          toolName: "GetWeather",
          description: "Expected string"
        })
        assert.isTrue(error.isRetryable)
      })

      it("should format message with tool name", () => {
        const error = new AiError.ToolParameterValidationError({
          toolName: "GetWeather",
          description: "Expected string"
        })
        assert.match(error.message, /Invalid parameters for tool 'GetWeather'/)
      })

      it("should format message with validation message", () => {
        const error = new AiError.ToolParameterValidationError({
          toolName: "GetWeather",
          description: "Expected string, got number"
        })
        assert.match(error.message, /Expected string, got number/)
      })

      it("should construct when validated params contain non-JSON values", () => {
        const error = new AiError.ToolParameterValidationError({
          toolName: "GetWeather",
          description: `Expected finite number, got NaN at ["city"]`
        })
        assert.strictEqual(error._tag, "ToolParameterValidationError")
        assert.match(error.message, /NaN/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.ToolParameterValidationError({
          toolName: "Test",
          description: "Error"
        })
        assert.strictEqual(error._tag, "ToolParameterValidationError")
      })
    })

    describe("InvalidToolResultError", () => {
      it("should not be retryable", () => {
        const error = new AiError.InvalidToolResultError({
          toolName: "GetWeather",
          description: "missing required field"
        })
        assert.isFalse(error.isRetryable)
      })

      it("should format message with tool name", () => {
        const error = new AiError.InvalidToolResultError({
          toolName: "GetWeather",
          description: "missing required field"
        })
        assert.match(error.message, /Tool 'GetWeather' returned invalid result/)
      })

      it("should format message with description", () => {
        const error = new AiError.InvalidToolResultError({
          toolName: "GetWeather",
          description: "missing 'temperature' field"
        })
        assert.match(error.message, /missing 'temperature' field/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.InvalidToolResultError({
          toolName: "Test",
          description: "invalid result"
        })
        assert.strictEqual(error._tag, "InvalidToolResultError")
      })
    })

    describe("ToolResultEncodingError", () => {
      it("should not be retryable", () => {
        const error = new AiError.ToolResultEncodingError({
          toolName: "GetWeather",
          toolResult: { temp: 72 },
          description: "Cannot encode"
        })
        assert.isFalse(error.isRetryable)
      })

      it("should format message with tool name", () => {
        const error = new AiError.ToolResultEncodingError({
          toolName: "GetWeather",
          toolResult: { temp: 72 },
          description: "Cannot encode"
        })
        assert.match(error.message, /Failed to encode result for tool 'GetWeather'/)
      })

      it("should format message with validation message", () => {
        const error = new AiError.ToolResultEncodingError({
          toolName: "GetWeather",
          toolResult: { circular: "ref" },
          description: "Cannot encode circular reference"
        })
        assert.match(error.message, /Cannot encode circular reference/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.ToolResultEncodingError({
          toolName: "Test",
          toolResult: {},
          description: "Error"
        })
        assert.strictEqual(error._tag, "ToolResultEncodingError")
      })
    })

    describe("ToolConfigurationError", () => {
      it("should not be retryable", () => {
        const error = new AiError.ToolConfigurationError({
          toolName: "OpenAiCodeInterpreter",
          description: "Invalid container ID format"
        })
        assert.isFalse(error.isRetryable)
      })

      it("should format message with tool name", () => {
        const error = new AiError.ToolConfigurationError({
          toolName: "OpenAiCodeInterpreter",
          description: "Invalid container ID format"
        })
        assert.match(error.message, /Invalid configuration for tool 'OpenAiCodeInterpreter'/)
      })

      it("should format message with description", () => {
        const error = new AiError.ToolConfigurationError({
          toolName: "OpenAiWebSearch",
          description: "search_context_size must be between 1 and 10"
        })
        assert.match(error.message, /search_context_size must be between 1 and 10/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.ToolConfigurationError({
          toolName: "Test",
          description: "Error"
        })
        assert.strictEqual(error._tag, "ToolConfigurationError")
      })
    })

    describe("StructuredOutputError", () => {
      it("should be retryable", () => {
        const error = new AiError.StructuredOutputError({
          description: "Invalid JSON structure",
          responseText: "{\"invalid\":}"
        })
        assert.isTrue(error.isRetryable)
      })

      it("should format message with description", () => {
        const error = new AiError.StructuredOutputError({
          description: "Expected a valid JSON object",
          responseText: "{\"test\":true}"
        })
        assert.match(error.message, /Structured output validation failed/)
        assert.match(error.message, /Expected a valid JSON object/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.StructuredOutputError({
          description: "Test error",
          responseText: "{\"foo\":\"bar\"}"
        })
        assert.strictEqual(error._tag, "StructuredOutputError")
      })

      it.effect("should create from SchemaError", () =>
        Effect.gen(function*() {
          const TestSchema = Schema.Struct({ name: Schema.String })
          const result = yield* Effect.exit(
            Schema.decodeUnknownEffect(TestSchema)({ name: 123 })
          )

          if (result._tag === "Failure") {
            const cause = result.cause
            if ("error" in cause && Schema.isSchemaError(cause.error)) {
              const parseError = AiError.StructuredOutputError.fromSchemaError(cause.error, "{\"name\":123}")
              assert.strictEqual(parseError._tag, "StructuredOutputError")
              assert.isString(parseError.description)
              assert.strictEqual(parseError.responseText, "{\"name\":123}")
            }
          }
        }))
    })

    describe("UnsupportedSchemaError", () => {
      it("should not be retryable", () => {
        const error = new AiError.UnsupportedSchemaError({
          description: "Unions are not supported"
        })
        assert.isFalse(error.isRetryable)
      })

      it("should format message with description", () => {
        const error = new AiError.UnsupportedSchemaError({
          description: "Unions are not supported in Anthropic structured output"
        })
        assert.match(error.message, /Unsupported schema/)
        assert.match(error.message, /Unions are not supported in Anthropic structured output/)
      })

      it("should have _tag set correctly", () => {
        const error = new AiError.UnsupportedSchemaError({
          description: "Test error"
        })
        assert.strictEqual(error._tag, "UnsupportedSchemaError")
      })
    })
  })

  describe("delegation", () => {
    it("should delegate isRetryable to reason", () => {
      const retryableError = new AiError.AiError({
        module: "OpenAI",
        method: "completion",
        reason: new AiError.RateLimitError({})
      })
      assert.isTrue(retryableError.isRetryable)

      const nonRetryableError = new AiError.AiError({
        module: "OpenAI",
        method: "completion",
        reason: new AiError.AuthenticationError({ kind: "InvalidKey" })
      })
      assert.isFalse(nonRetryableError.isRetryable)
    })

    it("should delegate retryAfter to reason", () => {
      const errorWithRetryAfter = new AiError.AiError({
        module: "OpenAI",
        method: "completion",
        reason: new AiError.RateLimitError({
          retryAfter: Duration.seconds(60)
        })
      })
      assert.isDefined(errorWithRetryAfter.retryAfter)

      const errorWithoutRetryAfter = new AiError.AiError({
        module: "OpenAI",
        method: "completion",
        reason: new AiError.AuthenticationError({ kind: "InvalidKey" })
      })
      assert.isUndefined(errorWithoutRetryAfter.retryAfter)
    })

    it("should format message with module, method, and reason", () => {
      const error = new AiError.AiError({
        module: "OpenAI",
        method: "completion",
        reason: new AiError.RateLimitError({})
      })
      assert.match(error.message, /OpenAI\.completion:/)
      assert.match(error.message, /Rate limit exceeded/)
    })

    it("should have _tag set correctly", () => {
      const error = new AiError.AiError({
        module: "Test",
        method: "test",
        reason: new AiError.UnknownError({})
      })
      assert.strictEqual(error._tag, "AiError")
    })
  })

  describe("constructors", () => {
    describe("make", () => {
      it("should create AiError", () => {
        const error = AiError.make({
          module: "OpenAI",
          method: "completion",
          reason: new AiError.RateLimitError({})
        })
        assert.strictEqual(error._tag, "AiError")
        assert.strictEqual(error.module, "OpenAI")
        assert.strictEqual(error.method, "completion")
        assert.strictEqual(error.reason._tag, "RateLimitError")
      })
    })

    describe("reasonFromHttpStatus", () => {
      it("should map 400 to InvalidRequestError", () => {
        const reason = AiError.reasonFromHttpStatus({ status: 400 })
        assert.strictEqual(reason._tag, "InvalidRequestError")
      })

      it("should map 401 to AuthenticationError with InvalidKey", () => {
        const reason = AiError.reasonFromHttpStatus({ status: 401 })
        assert.strictEqual(reason._tag, "AuthenticationError")
        if (reason._tag === "AuthenticationError") {
          assert.strictEqual(reason.kind, "InvalidKey")
        }
      })

      it("should map 403 to AuthenticationError with InsufficientPermissions", () => {
        const reason = AiError.reasonFromHttpStatus({ status: 403 })
        assert.strictEqual(reason._tag, "AuthenticationError")
        if (reason._tag === "AuthenticationError") {
          assert.strictEqual(reason.kind, "InsufficientPermissions")
        }
      })

      it("should thread the description into 401/403 AuthenticationError", () => {
        const reason = AiError.reasonFromHttpStatus({
          status: 403,
          description: "User is not authorized to perform: bedrock:InvokeModel"
        })
        assert.strictEqual(reason._tag, "AuthenticationError")
        if (reason._tag === "AuthenticationError") {
          assert.strictEqual(reason.description, "User is not authorized to perform: bedrock:InvokeModel")
          assert.include(reason.message, "User is not authorized to perform: bedrock:InvokeModel")
        }
      })

      it("should map 429 to RateLimitError", () => {
        const reason = AiError.reasonFromHttpStatus({ status: 429 })
        assert.strictEqual(reason._tag, "RateLimitError")
      })

      it("should map 5xx to InternalProviderError", () => {
        assert.strictEqual(
          AiError.reasonFromHttpStatus({ status: 500 })._tag,
          "InternalProviderError"
        )
        assert.strictEqual(
          AiError.reasonFromHttpStatus({ status: 502 })._tag,
          "InternalProviderError"
        )
        assert.strictEqual(
          AiError.reasonFromHttpStatus({ status: 503 })._tag,
          "InternalProviderError"
        )
      })

      it("should map unknown status to UnknownError", () => {
        const reason = AiError.reasonFromHttpStatus({ status: 418 })
        assert.strictEqual(reason._tag, "UnknownError")
      })
    })
  })

  describe("type guards", () => {
    describe("isAiError", () => {
      it("should return true for AiError", () => {
        const error = new AiError.AiError({
          module: "Test",
          method: "test",
          reason: new AiError.UnknownError({})
        })
        assert.isTrue(AiError.isAiError(error))
      })

      it("should return false for non-AiError values", () => {
        assert.isFalse(AiError.isAiError(new Error("regular error")))
        assert.isFalse(AiError.isAiError(null))
        assert.isFalse(AiError.isAiError(undefined))
        assert.isFalse(AiError.isAiError({ _tag: "FakeError" }))
      })

      it("should return false for reason types", () => {
        const networkError = new AiError.NetworkError({
          reason: "TransportError",
          request: {
            method: "GET",
            url: "https://example.com",
            urlParams: [],
            hash: undefined,
            headers: {}
          }
        })
        assert.isFalse(AiError.isAiError(networkError))
      })
    })
  })

  describe("supporting schemas", () => {
    describe("ProviderMetadata", () => {
      it.effect("should encode and decode roundtrip", () =>
        Effect.gen(function*() {
          const metadata = {
            name: "OpenAI",
            errorCode: "rate_limit_exceeded",
            errorType: "rate_limit",
            requestId: "req_123abc"
          }
          const encoded = yield* Schema.encodeEffect(AiError.ProviderMetadata)(metadata)
          const decoded = yield* Schema.decodeEffect(AiError.ProviderMetadata)(encoded)
          assert.deepStrictEqual(decoded, metadata)
        }))
    })

    describe("UsageInfo", () => {
      it.effect("should encode and decode roundtrip", () =>
        Effect.gen(function*() {
          const usage = {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150
          }
          const encoded = yield* Schema.encodeEffect(AiError.UsageInfo)(usage)
          const decoded = yield* Schema.decodeEffect(AiError.UsageInfo)(encoded)
          assert.deepStrictEqual(decoded, usage)
        }))
    })

    describe("HttpContext", () => {
      it.effect("should encode and decode roundtrip", () =>
        Effect.gen(function*() {
          const context = {
            request: {
              method: "POST" as const,
              url: "https://api.example.com/v1/chat",
              urlParams: [["model", "gpt-4"]] as Array<[string, string]>,
              hash: undefined,
              headers: { "Content-Type": "application/json" }
            },
            response: {
              status: 200,
              headers: { "Content-Type": "application/json" }
            },
            body: "{\"result\": \"success\"}"
          }
          const encoded = yield* Schema.encodeEffect(AiError.HttpContext)(context)
          const decoded = yield* Schema.decodeEffect(AiError.HttpContext)(encoded)
          assert.deepStrictEqual(decoded, context)
        }))
    })
  })

  describe("schema roundtrip", () => {
    it.effect("RateLimitError roundtrip", () =>
      Effect.gen(function*() {
        const error = new AiError.RateLimitError({
          retryAfter: Duration.seconds(60)
        })
        const encoded = yield* Schema.encodeEffect(AiError.RateLimitError)(error)
        const decoded = yield* Schema.decodeEffect(AiError.RateLimitError)(encoded)
        assert.strictEqual(decoded._tag, "RateLimitError")
        assert.isDefined(decoded.retryAfter)
      }))

    it.effect("AiErrorReason union roundtrip", () =>
      Effect.gen(function*() {
        const rateLimitError: AiError.AiErrorReason = new AiError.RateLimitError({})
        const encoded = yield* Schema.encodeEffect(AiError.AiErrorReason)(rateLimitError)
        const decoded = yield* Schema.decodeEffect(AiError.AiErrorReason)(encoded)
        assert.strictEqual(decoded._tag, "RateLimitError")

        const authError: AiError.AiErrorReason = new AiError.AuthenticationError({
          kind: "ExpiredKey"
        })
        const authEncoded = yield* Schema.encodeEffect(AiError.AiErrorReason)(authError)
        const authDecoded = yield* Schema.decodeEffect(AiError.AiErrorReason)(authEncoded)
        assert.strictEqual(authDecoded._tag, "AuthenticationError")
      }))

    it.effect("AiError roundtrip", () =>
      Effect.gen(function*() {
        const error = new AiError.AiError({
          module: "OpenAI",
          method: "completion",
          reason: new AiError.RateLimitError({})
        })
        const encoded = yield* Schema.encodeEffect(AiError.AiError)(error)
        const decoded = yield* Schema.decodeEffect(AiError.AiError)(encoded)
        assert.strictEqual(decoded._tag, "AiError")
        assert.strictEqual(decoded.module, "OpenAI")
        assert.strictEqual(decoded.method, "completion")
        assert.strictEqual(decoded.reason._tag, "RateLimitError")
      }))

    it.effect("ToolNotFoundError roundtrip", () =>
      Effect.gen(function*() {
        const error = new AiError.ToolNotFoundError({
          toolName: "UnknownTool",
          availableTools: ["GetWeather", "GetTime"]
        })
        const encoded = yield* Schema.encodeEffect(AiError.ToolNotFoundError)(error)
        const decoded = yield* Schema.decodeEffect(AiError.ToolNotFoundError)(encoded)
        assert.strictEqual(decoded._tag, "ToolNotFoundError")
        assert.strictEqual(decoded.toolName, "UnknownTool")
        assert.deepStrictEqual(decoded.availableTools, ["GetWeather", "GetTime"])
      }))

    it.effect("ToolParameterValidationError roundtrip", () =>
      Effect.gen(function*() {
        const error = new AiError.ToolParameterValidationError({
          toolName: "GetWeather",
          description: "Expected string"
        })
        const encoded = yield* Schema.encodeEffect(AiError.ToolParameterValidationError)(error)
        const decoded = yield* Schema.decodeEffect(AiError.ToolParameterValidationError)(encoded)
        assert.strictEqual(decoded._tag, "ToolParameterValidationError")
        assert.strictEqual(decoded.toolName, "GetWeather")
        assert.strictEqual(decoded.description, "Expected string")
      }))

    it.effect("InvalidToolResultError roundtrip", () =>
      Effect.gen(function*() {
        const error = new AiError.InvalidToolResultError({
          toolName: "GetWeather",
          description: "missing required field"
        })
        const encoded = yield* Schema.encodeEffect(AiError.InvalidToolResultError)(error)
        const decoded = yield* Schema.decodeEffect(AiError.InvalidToolResultError)(encoded)
        assert.strictEqual(decoded._tag, "InvalidToolResultError")
        assert.strictEqual(decoded.toolName, "GetWeather")
        assert.strictEqual(decoded.description, "missing required field")
      }))

    it.effect("ToolResultEncodingError roundtrip", () =>
      Effect.gen(function*() {
        const error = new AiError.ToolResultEncodingError({
          toolName: "GetWeather",
          toolResult: { temp: 72 },
          description: "Circular reference"
        })
        const encoded = yield* Schema.encodeEffect(AiError.ToolResultEncodingError)(error)
        const decoded = yield* Schema.decodeEffect(AiError.ToolResultEncodingError)(encoded)
        assert.strictEqual(decoded._tag, "ToolResultEncodingError")
        assert.strictEqual(decoded.toolName, "GetWeather")
        assert.strictEqual(decoded.description, "Circular reference")
      }))

    it.effect("ToolConfigurationError roundtrip", () =>
      Effect.gen(function*() {
        const error = new AiError.ToolConfigurationError({
          toolName: "OpenAiCodeInterpreter",
          description: "Invalid container ID format"
        })
        const encoded = yield* Schema.encodeEffect(AiError.ToolConfigurationError)(error)
        const decoded = yield* Schema.decodeEffect(AiError.ToolConfigurationError)(encoded)
        assert.strictEqual(decoded._tag, "ToolConfigurationError")
        assert.strictEqual(decoded.toolName, "OpenAiCodeInterpreter")
        assert.strictEqual(decoded.description, "Invalid container ID format")
      }))

    it.effect("StructuredOutputError roundtrip", () =>
      Effect.gen(function*() {
        const error = new AiError.StructuredOutputError({
          description: "Invalid JSON structure",
          responseText: "{\"invalid\":}"
        })
        const encoded = yield* Schema.encodeEffect(AiError.StructuredOutputError)(error)
        const decoded = yield* Schema.decodeEffect(AiError.StructuredOutputError)(encoded)
        assert.strictEqual(decoded._tag, "StructuredOutputError")
        assert.strictEqual(decoded.description, "Invalid JSON structure")
        assert.strictEqual(decoded.responseText, "{\"invalid\":}")
      }))

    it.effect("UnsupportedSchemaError roundtrip", () =>
      Effect.gen(function*() {
        const error = new AiError.UnsupportedSchemaError({
          description: "Unions are not supported"
        })
        const encoded = yield* Schema.encodeEffect(AiError.UnsupportedSchemaError)(error)
        const decoded = yield* Schema.decodeEffect(AiError.UnsupportedSchemaError)(encoded)
        assert.strictEqual(decoded._tag, "UnsupportedSchemaError")
        assert.strictEqual(decoded.description, "Unions are not supported")
      }))

    it.effect("AiErrorReason union with tool errors roundtrip", () =>
      Effect.gen(function*() {
        const toolNotFound: AiError.AiErrorReason = new AiError.ToolNotFoundError({
          toolName: "Unknown",
          availableTools: ["A", "B"]
        })
        const encoded = yield* Schema.encodeEffect(AiError.AiErrorReason)(toolNotFound)
        const decoded = yield* Schema.decodeEffect(AiError.AiErrorReason)(encoded)
        assert.strictEqual(decoded._tag, "ToolNotFoundError")

        const paramError: AiError.AiErrorReason = new AiError.ToolParameterValidationError({
          toolName: "Test",
          description: "Error"
        })
        const paramEncoded = yield* Schema.encodeEffect(AiError.AiErrorReason)(paramError)
        const paramDecoded = yield* Schema.decodeEffect(AiError.AiErrorReason)(paramEncoded)
        assert.strictEqual(paramDecoded._tag, "ToolParameterValidationError")
      }))
  })
})
