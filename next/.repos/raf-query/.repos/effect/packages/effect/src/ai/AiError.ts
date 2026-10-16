/**
 * Defines shared errors for AI operations.
 *
 * `AiError` records where a failure happened and stores the detailed reason in a
 * `reason` field. Those reasons cover transport problems, provider responses,
 * rate limits, authentication, content policy failures, invalid requests,
 * invalid output, unsupported schemas, tool failures, invalid user input, and
 * unknown failures. This module also includes metadata schemas, guards,
 * constructors, and helpers for converting HTTP response information into AI
 * error reasons.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import type * as HttpClientError from "../http/HttpClientError.ts"
import * as InternalRecord from "../internal/record.ts"
import * as Option from "../Option.ts"
import * as Predicate from "../Predicate.ts"
import { redact } from "../Redactable.ts"
import * as Redacted from "../Redacted.ts"
import * as Schema from "../Schema.ts"

/**
 * Schema for HTTP requests to an AI provider.
 *
 * **Example** (Describing an HTTP request)
 *
 * ```ts import.meta.vitest
 * import type { AiError } from "effect/ai"
 *
 * const requestDetails: typeof AiError.HttpRequestDetails.Type = {
 *   method: "POST",
 *   url: "https://api.openai.com/v1/responses",
 *   urlParams: [],
 *   hash: undefined,
 *   headers: { "Content-Type": "application/json" }
 * }
 * const result = [requestDetails.method, requestDetails.urlParams] // => ["POST", []]
 * ```
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const HttpRequestDetails = Schema.Struct({
  method: Schema.Literals(["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS", "TRACE", "QUERY"]),
  url: Schema.String,
  urlParams: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
  hash: Schema.optional(Schema.String),
  headers: Schema.Record(
    Schema.String,
    Schema.Union([
      Schema.String,
      Schema.Redacted(Schema.String)
    ])
  )
}).annotate({ identifier: "HttpRequestDetails" })

/**
 * Schema for HTTP responses from an AI provider.
 *
 * **Example** (Describing an HTTP response)
 *
 * ```ts import.meta.vitest
 * import type { AiError } from "effect/ai"
 *
 * const responseDetails: typeof AiError.HttpResponseDetails.Type = {
 *   status: 200,
 *   headers: {
 *     "Content-Type": "application/json",
 *     "X-Request-Id": "req_abc123"
 *   }
 * }
 * const result = [responseDetails.status, responseDetails.headers["X-Request-Id"]] // => [200, "req_abc123"]
 * ```
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const HttpResponseDetails = Schema.Struct({
  status: Schema.Int,
  headers: Schema.Record(
    Schema.String,
    Schema.Union([
      Schema.String,
      Schema.Redacted(Schema.String)
    ])
  )
}).annotate({ identifier: "HttpResponseDetails" })

const ReasonTypeId = "~effect/ai/AiError/Reason" as const

const providerMetadataWithDefaults = <Metadata extends ProviderMetadata>() =>
  (ProviderMetadata as unknown as typeof ProviderMetadata & Schema.Schema<Metadata>).pipe(
    Schema.withConstructorDefault(Effect.succeed({})),
    Schema.withDecodingDefault(Effect.succeed({}))
  )

const redactHeaders = (headers: Record<string, string>): Record<string, string> => {
  const redacted = redact(headers) as Record<string, string | Redacted.Redacted>
  const result: Record<string, string> = {}
  for (const key in redacted) {
    const value = redacted[key]
    InternalRecord.assignProperty(result, key, Redacted.isRedacted(value) ? value.toString() : value)
  }
  return result
}

// =============================================================================
// Http Request Error
// =============================================================================

/**
 * Error indicating a network-level failure before receiving a response.
 *
 * **Details**
 *
 * This error is raised when issues arise before receiving an HTTP response,
 * such as network connectivity problems, request encoding issues, or invalid
 * URLs.
 *
 * **Example** (Creating a network error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const error = new AiError.NetworkError({
 *   reason: "TransportError",
 *   request: {
 *     method: "POST",
 *     url: "https://api.openai.com/v1/completions",
 *     urlParams: [],
 *     hash: undefined,
 *     headers: { "Content-Type": "application/json" }
 *   },
 *   description: "Connection timeout after 30 seconds"
 * })
 *
 * const result = [error.reason, error.isRetryable] // => ["TransportError", true]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class NetworkError extends Schema.Error<NetworkError>(
  "effect/ai/AiError/NetworkError"
)({
  _tag: Schema.tag("NetworkError"),
  reason: Schema.Literals(["TransportError", "EncodeError", "InvalidUrlError"]),
  request: HttpRequestDetails,
  description: Schema.optional(Schema.String)
}) {
  /**
   * Marks `NetworkError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Transport errors are retryable; encoding and URL errors are not.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return this.reason === "TransportError"
  }

  /**
   * Creates a NetworkError from a platform HttpClientError.RequestError.
   *
   * **Example** (Creating a network error from a request error)
   *
   * ```ts import.meta.vitest
   * import { AiError } from "effect/ai"
   * import { HttpClientError, HttpClientRequest } from "effect/http"
   *
   * const platformError = new HttpClientError.TransportError({
   *   request: HttpClientRequest.get("https://example.com/models"),
   *   description: "Connection refused"
   * })
   *
   * const aiError = AiError.NetworkError.fromRequestError(platformError)
   * aiError.reason // => "TransportError"
   * ```
   *
   * @stability unstable
   * @since 4.0.0
   */
  static fromRequestError(error: HttpClientError.RequestError): NetworkError {
    return new NetworkError({
      description: error.description,
      reason: error._tag,
      request: {
        hash: Option.getOrUndefined(error.request.hash),
        headers: redactHeaders(error.request.headers),
        method: error.request.method,
        url: error.request.url,
        urlParams: Array.from(error.request.urlParams)
      }
    })
  }

  override get message(): string {
    const methodAndUrl = `${this.request.method} ${this.request.url}`

    let baseMessage = this.description
      ? `${this.reason}: ${this.description}`
      : `${this.reason}: A network error occurred.`

    baseMessage += ` (${methodAndUrl})`

    let suggestion = ""
    switch (this.reason) {
      case "EncodeError": {
        suggestion += "Check that the request body data is properly formatted and matches the expected content type."
        break
      }

      case "InvalidUrlError": {
        suggestion += "Verify that the URL format is correct and that all required parameters have been provided."
        suggestion += " Check for any special characters that may need encoding."
        break
      }

      case "TransportError": {
        suggestion += "Check your network connection and verify that the requested URL is accessible."
        break
      }
    }

    baseMessage += `\n\n${suggestion}`

    return baseMessage
  }
}

// =============================================================================
// Http Response Error
// =============================================================================

// =============================================================================
// Supporting Schemas
// =============================================================================

/**
 * Schema for provider-specific metadata which can be attached to error reasons.
 *
 * **Details**
 *
 * Provider-specific metadata is namespaced by provider name. Each provider
 * value can contain arbitrary mutable JSON metadata or `null`.
 *
 * **Example** (Inspecting metadata shape)
 *
 * ```ts import.meta.vitest
 * const metadata = {
 *   openai: {
 *     errorCode: "rate_limit_exceeded",
 *     requestId: "req_123"
 *   },
 *   anthropic: null
 * }
 *
 * Array.of(metadata.openai.errorCode, metadata.anthropic) // => ["rate_limit_exceeded", null]
 * ```
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ProviderMetadata: Schema.$Record<
  Schema.String,
  Schema.NullOr<Schema.Codec<Schema.MutableJson>>
> = Schema.Record(Schema.String, Schema.NullOr(Schema.MutableJson))

/**
 * Type of provider-specific metadata attached to AI error reasons.
 *
 * **Details**
 *
 * Metadata is keyed by provider name, and each provider value is either mutable
 * JSON metadata or `null`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ProviderMetadata = typeof ProviderMetadata.Type

/**
 * Provider-specific metadata attached to `RateLimitError`.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface RateLimitErrorMetadata extends ProviderMetadata {}

/**
 * Provider-specific metadata attached to `QuotaExhaustedError`.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface QuotaExhaustedErrorMetadata extends ProviderMetadata {}

/**
 * Provider-specific metadata attached to `AuthenticationError`.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface AuthenticationErrorMetadata extends ProviderMetadata {}

/**
 * Provider-specific metadata attached to `ContentPolicyError`.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ContentPolicyErrorMetadata extends ProviderMetadata {}

/**
 * Provider-specific metadata attached to `InvalidRequestError`.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface InvalidRequestErrorMetadata extends ProviderMetadata {}

/**
 * Provider-specific metadata attached to `InternalProviderError`.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface InternalProviderErrorMetadata extends ProviderMetadata {}

/**
 * Provider-specific metadata attached to `InvalidOutputError`.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface InvalidOutputErrorMetadata extends ProviderMetadata {}

/**
 * Provider-specific metadata attached to `StructuredOutputError`.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface StructuredOutputErrorMetadata extends ProviderMetadata {}

/**
 * Provider-specific metadata attached to `UnsupportedSchemaError`.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface UnsupportedSchemaErrorMetadata extends ProviderMetadata {}

/**
 * Provider-specific metadata attached to `UnknownError`.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface UnknownErrorMetadata extends ProviderMetadata {}

/**
 * Schema for token usage information from AI operations.
 *
 * **Details**
 *
 * Schema for optional provider-reported token counts for prompt tokens,
 * completion tokens, and total tokens.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const UsageInfo = Schema.Struct({
  promptTokens: Schema.optional(Schema.Int),
  completionTokens: Schema.optional(Schema.Int),
  totalTokens: Schema.optional(Schema.Int)
}).annotate({ identifier: "UsageInfo" })

/**
 * Schema for the combined HTTP context used in error reporting.
 *
 * **When to use**
 *
 * Use to attach request details, optional response details, and optional body
 * text to AI provider errors.
 *
 * **Details**
 *
 * Includes the required request details plus optional response details and raw
 * response body.
 *
 * @see {@link HttpRequestDetails} for captured request details
 * @see {@link HttpResponseDetails} for captured response details
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const HttpContext = Schema.Struct({
  request: HttpRequestDetails,
  response: Schema.optional(HttpResponseDetails),
  body: Schema.optional(Schema.String)
}).annotate({ identifier: "HttpContext" })

/**
 * Builds a description for an HTTP error returned by an AI provider.
 *
 * @stability unstable
 * @category utilities
 * @since 4.0.0
 */
export const buildErrorDescription = (params: {
  readonly status: number
  readonly message: string | undefined
  readonly method: string
  readonly url: string
  readonly errorCode?: string | number | null | undefined
  readonly errorType?: string | null | undefined
  readonly requestId?: string | null | undefined
  readonly body: string | undefined
}): string => {
  const parts: Array<string> = []

  if (params.message) {
    parts.push(params.message)
  } else {
    parts.push(`HTTP ${params.status}`)
  }

  parts.push(`(${params.method} ${params.url})`)

  if (params.errorCode) {
    parts.push(`[code: ${params.errorCode}]`)
  } else if (params.errorType) {
    parts.push(`[type: ${params.errorType}]`)
  }

  if (params.requestId) {
    parts.push(`[requestId: ${params.requestId}]`)
  }

  if (!params.message && params.body) {
    const truncated = params.body.length > 200
      ? params.body.slice(0, 200) + "..."
      : params.body
    parts.push(`Response: ${truncated}`)
  }

  return parts.join(" ")
}

// =============================================================================
// Reason Classes
// =============================================================================

/**
 * Error indicating the request was rate limited.
 *
 * **Details**
 *
 * Rate limit errors are always retryable. When `retryAfter` is provided,
 * callers should wait that duration before retrying.
 *
 * **Example** (Creating a rate limit error)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 * import { AiError } from "effect/ai"
 *
 * const rateLimitError = new AiError.RateLimitError({
 *   retryAfter: Duration.seconds(60)
 * })
 *
 * const result = [rateLimitError._tag, rateLimitError.isRetryable] // => ["RateLimitError", true]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class RateLimitError extends Schema.Error<RateLimitError>(
  "effect/ai/AiError/RateLimitError"
)({
  _tag: Schema.tag("RateLimitError"),
  retryAfter: Schema.optional(Schema.Duration),
  metadata: providerMetadataWithDefaults<RateLimitErrorMetadata>(),
  http: Schema.optional(HttpContext)
}) {
  /**
   * Marks `RateLimitError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Rate limit errors are always retryable.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return true
  }

  override get message(): string {
    let msg = "Rate limit exceeded"
    if (this.retryAfter) msg += `. Retry after ${Duration.format(this.retryAfter)}`
    return msg
  }
}

/**
 * Error indicating account or billing limits have been reached.
 *
 * **Details**
 *
 * Quota exhausted errors are not retryable without user action.
 *
 * **Example** (Creating a quota exhausted error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const quotaError = new AiError.QuotaExhaustedError({})
 *
 * const result = [quotaError._tag, quotaError.isRetryable] // => ["QuotaExhaustedError", false]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class QuotaExhaustedError extends Schema.Error<QuotaExhaustedError>(
  "effect/ai/AiError/QuotaExhaustedError"
)({
  _tag: Schema.tag("QuotaExhaustedError"),
  resetAt: Schema.optional(Schema.DateTimeUtc),
  metadata: providerMetadataWithDefaults<QuotaExhaustedErrorMetadata>(),
  http: Schema.optional(HttpContext)
}) {
  /**
   * Marks `QuotaExhaustedError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Quota exhausted errors require user action and are not retryable.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    let msg = "Quota exhausted"
    if (this.resetAt) msg += `. Resets at ${this.resetAt}`
    return `${msg}. Check your account billing and usage limits.`
  }
}

/**
 * Error indicating authentication or authorization failure.
 *
 * **Details**
 *
 * Authentication errors are never retryable without credential changes.
 *
 * **Example** (Creating an authentication error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const authError = new AiError.AuthenticationError({
 *   kind: "InvalidKey"
 * })
 *
 * const result = [authError.kind, authError.isRetryable] // => ["InvalidKey", false]
 *
 * const detailed = new AiError.AuthenticationError({
 *   kind: "InsufficientPermissions",
 *   description: "Token expired"
 * })
 *
 * detailed.message // => "InsufficientPermissions: Your API key lacks required permissions. Token expired"
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class AuthenticationError extends Schema.Error<AuthenticationError>(
  "effect/ai/AiError/AuthenticationError"
)({
  _tag: Schema.tag("AuthenticationError"),
  kind: Schema.Literals(["InvalidKey", "ExpiredKey", "MissingKey", "InsufficientPermissions", "Unknown"]),
  description: Schema.optional(Schema.String),
  metadata: providerMetadataWithDefaults<AuthenticationErrorMetadata>(),
  http: Schema.optional(HttpContext)
}) {
  /**
   * Marks `AuthenticationError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Authentication errors require credential changes and are not retryable.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    const suggestions: Record<string, string> = {
      InvalidKey: "Verify your API key is correct",
      ExpiredKey: "Your API key has expired. Generate a new one",
      MissingKey: "No API key provided. Set the appropriate environment variable",
      InsufficientPermissions: "Your API key lacks required permissions",
      Unknown: "Authentication failed. Check your credentials"
    }
    let msg = `${this.kind}: ${suggestions[this.kind]}`
    if (this.description) msg += `. ${this.description}`
    return msg
  }
}

/**
 * Error indicating content policy violation.
 *
 * **Details**
 *
 * Content policy errors are never retryable without content changes.
 *
 * **Example** (Creating a content policy error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const policyError = new AiError.ContentPolicyError({
 *   description: "Input contains prohibited content"
 * })
 *
 * const result = [policyError.description, policyError.isRetryable] // => ["Input contains prohibited content", false]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ContentPolicyError extends Schema.Error<ContentPolicyError>(
  "effect/ai/AiError/ContentPolicyError"
)({
  _tag: Schema.tag("ContentPolicyError"),
  description: Schema.String,
  metadata: providerMetadataWithDefaults<ContentPolicyErrorMetadata>(),
  http: Schema.optional(HttpContext)
}) {
  /**
   * Marks `ContentPolicyError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Content policy errors require content changes and are not retryable.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    return `Content policy violation: ${this.description}`
  }
}

/**
 * Error indicating the request had invalid or malformed parameters.
 *
 * **Details**
 *
 * Invalid request errors require fixing the request and are not retryable.
 *
 * **Example** (Creating an invalid request error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const invalidRequestError = new AiError.InvalidRequestError({
 *   parameter: "temperature",
 *   constraint: "must be between 0 and 2",
 *   description: "Temperature value 5 is out of range"
 * })
 *
 * const result = [invalidRequestError.parameter, invalidRequestError.isRetryable] // => ["temperature", false]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InvalidRequestError extends Schema.Error<InvalidRequestError>(
  "effect/ai/AiError/InvalidRequestError"
)({
  _tag: Schema.tag("InvalidRequestError"),
  parameter: Schema.optional(Schema.String),
  constraint: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  metadata: providerMetadataWithDefaults<InvalidRequestErrorMetadata>(),
  http: Schema.optional(HttpContext)
}) {
  /**
   * Marks `InvalidRequestError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Invalid request errors require fixing the request and are not retryable.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    let msg = "Invalid request"
    if (this.parameter) msg += `: parameter '${this.parameter}'`
    if (this.constraint) msg += ` ${this.constraint}`
    if (this.description) msg += `. ${this.description}`
    return msg
  }
}

/**
 * Error indicating the AI provider experienced an internal error.
 *
 * **Details**
 *
 * Internal provider errors are typically transient and are retryable.
 *
 * **Example** (Creating an internal provider error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const providerError = new AiError.InternalProviderError({
 *   description: "Server encountered an unexpected error"
 * })
 *
 * const result = [providerError.description, providerError.isRetryable] // => ["Server encountered an unexpected error", true]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InternalProviderError extends Schema.Error<InternalProviderError>(
  "effect/ai/AiError/InternalProviderError"
)({
  _tag: Schema.tag("InternalProviderError"),
  description: Schema.String,
  metadata: providerMetadataWithDefaults<InternalProviderErrorMetadata>(),
  http: Schema.optional(HttpContext)
}) {
  /**
   * Marks `InternalProviderError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Internal provider errors are typically transient and are retryable.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return true
  }

  override get message(): string {
    return `Internal provider error: ${this.description}`
  }
}

/**
 * Error indicating failure to parse or validate LLM output.
 *
 * **Details**
 *
 * Invalid output errors are retryable since LLM outputs are non-deterministic.
 *
 * **Example** (Creating an invalid output error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const parseError = new AiError.InvalidOutputError({
 *   description: "Expected a string but received a number"
 * })
 *
 * const result = [parseError.description, parseError.isRetryable] // => ["Expected a string but received a number", true]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InvalidOutputError extends Schema.Error<InvalidOutputError>(
  "effect/ai/AiError/InvalidOutputError"
)({
  _tag: Schema.tag("InvalidOutputError"),
  description: Schema.String,
  metadata: providerMetadataWithDefaults<InvalidOutputErrorMetadata>(),
  usage: Schema.optional(UsageInfo)
}) {
  /**
   * Marks `InvalidOutputError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Invalid output errors are retryable since LLM outputs are non-deterministic.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return true
  }

  /**
   * Creates an InvalidOutputError from a Schema error.
   *
   * **Example** (Creating an invalid output error from a schema error)
   *
   * ```ts import.meta.vitest
   * import { Effect, Schema } from "effect"
   * import { AiError } from "effect/ai"
   *
   * const schemaError = await Effect.runPromise(
   *   Schema.decodeUnknownEffect(Schema.Number)("not a number").pipe(Effect.flip)
   * )
   * const parseError = AiError.InvalidOutputError.fromSchemaError(schemaError)
   * parseError.description // => "Expected number"
   * ```
   *
   * @stability unstable
   * @since 4.0.0
   */
  static fromSchemaError(error: Schema.SchemaError): InvalidOutputError {
    return new InvalidOutputError({
      description: error.message
    })
  }

  override get message(): string {
    return `Invalid output: ${this.description}`
  }
}

/**
 * Error indicating the LLM generated text that does not conform to the
 * requested structured output schema.
 *
 * **Details**
 *
 * Structured output errors are retryable since LLM outputs are non-deterministic.
 *
 * **Example** (Creating a structured output error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const error = new AiError.StructuredOutputError({
 *   description: "Expected a valid JSON object",
 *   responseText: "{\"foo\":}"
 * })
 *
 * const result = [error.description, error.responseText, error.isRetryable] // => ["Expected a valid JSON object", '{"foo":}', true]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class StructuredOutputError extends Schema.Error<StructuredOutputError>(
  "effect/ai/AiError/StructuredOutputError"
)({
  _tag: Schema.tag("StructuredOutputError"),
  description: Schema.String,
  responseText: Schema.String,
  metadata: providerMetadataWithDefaults<StructuredOutputErrorMetadata>(),
  usage: Schema.optional(UsageInfo)
}) {
  /**
   * Marks `StructuredOutputError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Structured output errors are retryable since LLM outputs are non-deterministic.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return true
  }

  /**
   * Creates a StructuredOutputError from a Schema error.
   *
   * **Example** (Creating a structured output error from a schema error)
   *
   * ```ts import.meta.vitest
   * import { Effect, Schema } from "effect"
   * import { AiError } from "effect/ai"
   *
   * const schemaError = await Effect.runPromise(
   *   Schema.decodeUnknownEffect(Schema.Struct({ name: Schema.String }))({}).pipe(Effect.flip)
   * )
   * const parseError = AiError.StructuredOutputError.fromSchemaError(schemaError, "{}")
   * parseError.responseText // => "{}"
   * ```
   *
   * @stability unstable
   * @since 4.0.0
   */
  static fromSchemaError(error: Schema.SchemaError, responseText: string): StructuredOutputError {
    return new StructuredOutputError({
      description: error.message,
      responseText
    })
  }

  override get message(): string {
    return `Structured output validation failed: ${this.description}`
  }
}

/**
 * Error indicating a codec transformer rejected a schema because it contains
 * unsupported constructs.
 *
 * **Details**
 *
 * Unsupported schema errors are not retryable because they indicate a
 * programmer error where the schema is incompatible with the provider.
 *
 * **Example** (Creating an unsupported schema error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const error = new AiError.UnsupportedSchemaError({
 *   description: "Unions are not supported in Anthropic structured output"
 * })
 *
 * const result = [error.description, error.isRetryable] // => ["Unions are not supported in Anthropic structured output", false]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class UnsupportedSchemaError extends Schema.Error<UnsupportedSchemaError>(
  "effect/ai/AiError/UnsupportedSchemaError"
)({
  _tag: Schema.tag("UnsupportedSchemaError"),
  description: Schema.String,
  metadata: providerMetadataWithDefaults<UnsupportedSchemaErrorMetadata>()
}) {
  /**
   * Marks `UnsupportedSchemaError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Unsupported schema errors are not retryable because they indicate a programmer error.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    return `Unsupported schema: ${this.description}`
  }
}

/**
 * Error data for unknown or unexpected AI failures.
 *
 * **Details**
 *
 * Unknown errors are not retryable by default since the cause is unknown.
 *
 * **Example** (Creating an unknown error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const unknownError = new AiError.UnknownError({
 *   description: "An unexpected error occurred"
 * })
 *
 * const result = [unknownError.description, unknownError.isRetryable] // => ["An unexpected error occurred", false]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class UnknownError extends Schema.Error<UnknownError>(
  "effect/ai/AiError/UnknownError"
)({
  _tag: Schema.tag("UnknownError"),
  description: Schema.optional(Schema.String),
  metadata: providerMetadataWithDefaults<UnknownErrorMetadata>(),
  http: Schema.optional(HttpContext)
}) {
  /**
   * Marks `UnknownError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Unknown errors are not retryable by default.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    return this.description ?? "Unknown error"
  }
}

// =============================================================================
// Tool Call Error Types
// =============================================================================

/**
 * Error indicating the model requested a tool that doesn't exist in the toolkit.
 *
 * **Details**
 *
 * This error is retryable because the model may self-correct when provided
 * with the list of available tools.
 *
 * **Example** (Creating a tool not found error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const error = new AiError.ToolNotFoundError({
 *   toolName: "unknownTool",
 *   availableTools: ["GetWeather", "GetTime"]
 * })
 *
 * const result = [error.toolName, error.availableTools, error.isRetryable] // => ["unknownTool", ["GetWeather", "GetTime"], true]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ToolNotFoundError extends Schema.Error<ToolNotFoundError>(
  "effect/ai/AiError/ToolNotFoundError"
)({
  _tag: Schema.tag("ToolNotFoundError"),
  toolName: Schema.String,
  availableTools: Schema.Array(Schema.String)
}) {
  /**
   * Marks `ToolNotFoundError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Tool not found errors are retryable because the model may self-correct.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return true
  }

  override get message(): string {
    const availableTools = this.availableTools.length > 0 ? this.availableTools.join(", ") : "none"
    return `Tool '${this.toolName}' not found. Available tools: ${availableTools}`
  }
}

/**
 * Error indicating the model's tool call parameters failed schema validation.
 *
 * **Details**
 *
 * This error is retryable because the model may correct its parameters
 * on subsequent attempts.
 *
 * **Example** (Creating a tool parameter validation error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const error = new AiError.ToolParameterValidationError({
 *   toolName: "GetWeather",
 *   description: "Expected string, got number"
 * })
 *
 * const result = [error.toolName, error.description, error.isRetryable] // => ["GetWeather", "Expected string, got number", true]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ToolParameterValidationError extends Schema.Error<ToolParameterValidationError>(
  "effect/ai/AiError/ToolParameterValidationError"
)({
  _tag: Schema.tag("ToolParameterValidationError"),
  toolName: Schema.String,
  description: Schema.String
}) {
  /**
   * Marks `ToolParameterValidationError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Parameter validation errors are retryable because the model may correct parameters.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return true
  }

  override get message(): string {
    return `Invalid parameters for tool '${this.toolName}': ${this.description}`
  }
}

/**
 * Error indicating the tool handler returned an invalid result that does not
 * match the tool's schema.
 *
 * **Details**
 *
 * This error is not retryable because invalid results indicate a bug in the
 * tool handler implementation.
 *
 * **Example** (Creating an invalid tool result error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const error = new AiError.InvalidToolResultError({
 *   toolName: "GetWeather",
 *   description: "Tool handler returned invalid result: missing 'temperature' field"
 * })
 *
 * const result = [error.toolName, error.isRetryable] // => ["GetWeather", false]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InvalidToolResultError extends Schema.Error<InvalidToolResultError>(
  "effect/ai/AiError/InvalidToolResultError"
)({
  _tag: Schema.tag("InvalidToolResultError"),
  toolName: Schema.String,
  description: Schema.String
}) {
  /**
   * Marks `InvalidToolResultError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Invalid tool result errors are not retryable because they indicate a bug in the handler.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    return `Tool '${this.toolName}' returned invalid result: ${this.description}`
  }
}

/**
 * Error indicating the tool result cannot be encoded for sending back to the model.
 *
 * **Details**
 *
 * This error is not retryable because encoding failures indicate a bug in the
 * tool schema definitions.
 *
 * **Example** (Creating a tool result encoding error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const error = new AiError.ToolResultEncodingError({
 *   toolName: "GetWeather",
 *   toolResult: { temperature: 72n },
 *   description: "Cannot encode bigint values as JSON"
 * })
 *
 * const result = [error.toolName, error.description, error.isRetryable] // => ["GetWeather", "Cannot encode bigint values as JSON", false]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ToolResultEncodingError extends Schema.Error<ToolResultEncodingError>(
  "effect/ai/AiError/ToolResultEncodingError"
)({
  _tag: Schema.tag("ToolResultEncodingError"),
  toolName: Schema.String,
  toolResult: Schema.Unknown,
  description: Schema.String
}) {
  /**
   * Marks `ToolResultEncodingError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Encoding errors are not retryable because they indicate a code bug.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    return `Failed to encode result for tool '${this.toolName}': ${this.description}`
  }
}

/**
 * Error indicating a provider-defined tool was configured with invalid arguments.
 *
 * **Details**
 *
 * This error is not retryable because it indicates a programming error in the
 * tool configuration that must be fixed in code.
 *
 * **Example** (Creating a tool configuration error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const error = new AiError.ToolConfigurationError({
 *   toolName: "OpenAiCodeInterpreter",
 *   description: "Invalid container ID format"
 * })
 *
 * const result = [error.toolName, error.description, error.isRetryable] // => ["OpenAiCodeInterpreter", "Invalid container ID format", false]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ToolConfigurationError extends Schema.Error<ToolConfigurationError>(
  "effect/ai/AiError/ToolConfigurationError"
)({
  _tag: Schema.tag("ToolConfigurationError"),
  toolName: Schema.String,
  description: Schema.String
}) {
  /**
   * Marks `ToolConfigurationError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Configuration errors are not retryable because they indicate a code bug.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    return `Invalid configuration for tool '${this.toolName}': ${this.description}`
  }
}

/**
 * Error indicating an operation requires a toolkit but none was provided.
 *
 * **Details**
 *
 * This error occurs when tool approval responses are present in the prompt
 * but no toolkit was provided to resolve them.
 *
 * **Example** (Creating a toolkit required error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const error = new AiError.ToolkitRequiredError({
 *   pendingApprovals: ["GetWeather", "SendEmail"]
 * })
 *
 * const result = [error.pendingApprovals, error.isRetryable] // => [["GetWeather", "SendEmail"], false]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ToolkitRequiredError extends Schema.Error<ToolkitRequiredError>(
  "effect/ai/AiError/ToolkitRequiredError"
)({
  _tag: Schema.tag("ToolkitRequiredError"),
  pendingApprovals: Schema.Array(Schema.String),
  description: Schema.optional(Schema.String)
}) {
  /**
   * Marks `ToolkitRequiredError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Toolkit required errors are not retryable without providing a toolkit.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    const tools = this.pendingApprovals.join(", ")
    return `Toolkit required to resolve pending tool approvals: ${tools}`
  }
}

/**
 * Error indicating the user provided invalid input in their prompt.
 *
 * **Details**
 *
 * This error is raised when the prompt contains content that is structurally
 * valid but not supported by the provider (e.g., unsupported media types,
 * unsupported file formats, etc.).
 *
 * **Example** (Creating an invalid user input error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const error = new AiError.InvalidUserInputError({
 *   description: "Unsupported media type 'video/mp4'. Supported types include images, application/pdf, text/plain"
 * })
 *
 * const result = [error._tag, error.isRetryable] // => ["InvalidUserInputError", false]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InvalidUserInputError extends Schema.Error<InvalidUserInputError>(
  "effect/ai/AiError/InvalidUserInputError"
)({
  _tag: Schema.tag("InvalidUserInputError"),
  description: Schema.String
}) {
  /**
   * Marks `InvalidUserInputError` as a semantic AI error reason for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  /**
   * Invalid user input errors require fixing the input and are not retryable.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    return `Invalid user input: ${this.description}`
  }
}

// =============================================================================
// AiErrorReason Union
// =============================================================================

/**
 * Union type of all semantic error reasons that can occur during AI operations.
 *
 * **Details**
 *
 * Every reason carries a semantic `_tag`, a human-readable message, and an
 * `isRetryable` getter. Provider-facing reasons may also include retry timing,
 * provider metadata, usage information, or HTTP context.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type AiErrorReason =
  | RateLimitError
  | QuotaExhaustedError
  | AuthenticationError
  | ContentPolicyError
  | InvalidRequestError
  | InternalProviderError
  | NetworkError
  | InvalidOutputError
  | StructuredOutputError
  | UnsupportedSchemaError
  | UnknownError
  | ToolNotFoundError
  | ToolParameterValidationError
  | InvalidToolResultError
  | ToolResultEncodingError
  | ToolConfigurationError
  | ToolkitRequiredError
  | InvalidUserInputError

/**
 * Schema for validating and parsing AI error reasons.
 *
 * **When to use**
 *
 * Use when decoding or validating unknown AI error reason values with Schema.
 *
 * **Details**
 *
 * This runtime schema is the union of the concrete AI error reason classes.
 *
 * @see {@link isAiErrorReason} for checking an existing value without Schema decoding
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const AiErrorReason: Schema.Union<[
  typeof RateLimitError,
  typeof QuotaExhaustedError,
  typeof AuthenticationError,
  typeof ContentPolicyError,
  typeof InvalidRequestError,
  typeof InternalProviderError,
  typeof NetworkError,
  typeof InvalidOutputError,
  typeof StructuredOutputError,
  typeof UnsupportedSchemaError,
  typeof UnknownError,
  typeof ToolNotFoundError,
  typeof ToolParameterValidationError,
  typeof InvalidToolResultError,
  typeof ToolResultEncodingError,
  typeof ToolConfigurationError,
  typeof ToolkitRequiredError,
  typeof InvalidUserInputError
]> = Schema.Union([
  RateLimitError,
  QuotaExhaustedError,
  AuthenticationError,
  ContentPolicyError,
  InvalidRequestError,
  InternalProviderError,
  NetworkError,
  InvalidOutputError,
  StructuredOutputError,
  UnsupportedSchemaError,
  UnknownError,
  ToolNotFoundError,
  ToolParameterValidationError,
  InvalidToolResultError,
  ToolResultEncodingError,
  ToolConfigurationError,
  ToolkitRequiredError,
  InvalidUserInputError
])

// =============================================================================
// Top-Level AiError
// =============================================================================

const TypeId = "~effect/ai/AiError" as const

/**
 * Schema for the top-level AI error wrapper using the `reason` pattern.
 *
 * **When to use**
 *
 * Use when you need AI errors that can be handled by semantic reason with
 * `Effect.catchReason`.
 *
 * **Details**
 *
 * This error stores `module` and `method` context, the semantic `reason`, and
 * delegates `isRetryable` and `retryAfter` to the underlying reason.
 *
 * **Example** (Handling an AI error by tag)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect } from "effect"
 * import { AiError } from "effect/ai"
 *
 * const aiOperation = Effect.fail(new AiError.AiError({
 *   module: "OpenAI",
 *   method: "generateText",
 *   reason: new AiError.RateLimitError({ retryAfter: Duration.seconds(30) })
 * }))
 *
 * // Handle specific reason types
 * const handled = aiOperation.pipe(
 *   Effect.catchTag("AiError", (error) => {
 *     if (error.reason._tag === "RateLimitError") {
 *       return Effect.succeed(`Retry after ${error.retryAfter}`)
 *     }
 *     return Effect.fail(error)
 *   })
 * )
 *
 * await Effect.runPromise(handled) // => "Retry after 30000 millis"
 * ```
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class AiError extends Schema.Error<AiError>(
  "effect/ai/AiError/AiError"
)({
  _tag: Schema.tag("AiError"),
  module: Schema.String,
  method: Schema.String,
  reason: AiErrorReason
}) {
  readonly [TypeId] = TypeId
  override readonly cause = this.reason

  /**
   * Delegates to the underlying reason's `isRetryable` getter.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return this.reason.isRetryable
  }

  /**
   * Delegates to the underlying reason's `retryAfter` if present.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get retryAfter(): Duration.Duration | undefined {
    return "retryAfter" in this.reason ? this.reason.retryAfter : undefined
  }

  override get message(): string {
    return `${this.module}.${this.method}: ${this.reason.message}`
  }
}

/**
 * The encoded (serialized) form of an `AiError`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type AiErrorEncoded = typeof AiError["Encoded"]

/**
 * Type guard to check if a value is an `AiError`.
 *
 * **Example** (Checking for an AI error)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const someError = new Error("generic error")
 * const aiError = AiError.make({
 *   module: "Test",
 *   method: "example",
 *   reason: new AiError.RateLimitError({})
 * })
 *
 * const result = [AiError.isAiError(someError), AiError.isAiError(aiError)] // => [false, true]
 * ```
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isAiError = (u: unknown): u is AiError => Predicate.hasProperty(u, TypeId)

/**
 * Type guard to check if a value is an `AiErrorReason`.
 *
 * **Example** (Checking for an AI error reason)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const rateLimitError = new AiError.RateLimitError({})
 * const genericError = new Error("generic error")
 *
 * const result = [AiError.isAiErrorReason(rateLimitError), AiError.isAiErrorReason(genericError)] // => [true, false]
 * ```
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isAiErrorReason = (u: unknown): u is AiErrorReason => Predicate.hasProperty(u, ReasonTypeId)

/**
 * Creates an `AiError` with the given reason.
 *
 * **Example** (Creating an AI error)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 * import { AiError } from "effect/ai"
 *
 * const error = AiError.make({
 *   module: "OpenAI",
 *   method: "completion",
 *   reason: new AiError.RateLimitError({
 *     retryAfter: Duration.seconds(60)
 *   })
 * })
 *
 * const result = [error.module, error.method, error.reason._tag] // => ["OpenAI", "completion", "RateLimitError"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (params: {
  readonly module: string
  readonly method: string
  readonly reason: AiErrorReason
}): AiError => new AiError(params)

/**
 * Maps HTTP status codes to semantic error reasons.
 *
 * **When to use**
 *
 * Use as the base mapping when provider packages translate HTTP status codes into
 * provider-specific error reasons.
 *
 * **Example** (Mapping an HTTP status to a reason)
 *
 * ```ts import.meta.vitest
 * import { AiError } from "effect/ai"
 *
 * const reason = AiError.reasonFromHttpStatus({
 *   status: 429,
 *   body: { error: "Rate limit exceeded" }
 * })
 *
 * reason._tag // => "RateLimitError"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const reasonFromHttpStatus = (params: {
  readonly status: number
  readonly body?: unknown
  readonly http?: typeof HttpContext.Type
  readonly metadata?: ProviderMetadata
  readonly description?: string | undefined
}): AiErrorReason => {
  const { status, http, metadata, description } = params
  const common = {
    http,
    ...(metadata ? { metadata } : undefined),
    ...(description ? { description } : undefined)
  }
  switch (status) {
    case 400:
      return new InvalidRequestError(common)
    case 401:
      return new AuthenticationError({ kind: "InvalidKey", ...common })
    case 403:
      return new AuthenticationError({ kind: "InsufficientPermissions", ...common })
    case 429:
      return new RateLimitError(common)
    default:
      if (status >= 500) {
        return new InternalProviderError({ description: "Server error", ...common })
      }
      return new UnknownError(common)
  }
}
