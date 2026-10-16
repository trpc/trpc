/**
 * The `OpenAiError` module defines OpenAI-specific metadata that can be
 * attached to the shared `AiError` error types used by the AI packages. It is
 * primarily used by OpenAI-compatible clients to preserve provider details
 * such as error codes, error types, request IDs, and rate limit headers while
 * still exposing errors through the provider-neutral Effect AI error model.
 *
 * Use this module when mapping OpenAI API failures into `AiError` values and
 * when consumers need enough structured metadata to debug failed requests,
 * inspect quota or rate limit responses, or correlate an error with OpenAI
 * support. The exported types are metadata shapes only; the module augmentation
 * makes those shapes available on the corresponding shared AI error metadata
 * interfaces without defining new runtime error classes.
 *
 * @since 4.0.0
 */

/**
 * OpenAI-specific error metadata fields.
 *
 * @category models
 * @since 4.0.0
 */
export type OpenAiErrorMetadata = {
  /**
   * The OpenAI error code returned by the API.
   */
  readonly errorCode: string | null
  /**
   * The OpenAI error type returned by the API.
   */
  readonly errorType: string | null
  /**
   * The unique request ID for debugging with OpenAI support.
   */
  readonly requestId: string | null
}

/**
 * OpenAI-specific rate limit metadata fields.
 *
 * **Details**
 *
 * Extends base error metadata with rate limit specific information from
 * OpenAI's rate limit headers.
 *
 * @category models
 * @since 4.0.0
 */
export type OpenAiRateLimitMetadata = OpenAiErrorMetadata & {
  /**
   * The rate limit type (e.g. "requests", "tokens").
   */
  readonly limit: string | null
  /**
   * Number of remaining requests in the current window.
   */
  readonly remaining: number | null
  /**
   * Time until the request rate limit resets.
   */
  readonly resetRequests: string | null
  /**
   * Time until the token rate limit resets.
   */
  readonly resetTokens: string | null
}

declare module "effect/ai/AiError" {
  /**
   * Metadata attached to rate limit errors returned by OpenAI-compatible APIs.
   *
   * @category models
   * @since 4.0.0
   */
  export interface RateLimitErrorMetadata {
    readonly openai?: OpenAiRateLimitMetadata | null
  }

  /**
   * Metadata attached when an OpenAI-compatible provider reports that quota or
   * billing limits have been exhausted.
   *
   * @category models
   * @since 4.0.0
   */
  export interface QuotaExhaustedErrorMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * Metadata attached to authentication failures from OpenAI-compatible APIs,
   * such as invalid, missing, or unauthorized API credentials.
   *
   * @category models
   * @since 4.0.0
   */
  export interface AuthenticationErrorMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * Metadata attached when an OpenAI-compatible provider rejects content because
   * it violates a safety or usage policy.
   *
   * @category models
   * @since 4.0.0
   */
  export interface ContentPolicyErrorMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * Metadata attached to malformed or unsupported requests rejected by an
   * OpenAI-compatible API before model execution.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InvalidRequestErrorMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * Metadata attached to unexpected server-side failures reported by an
   * OpenAI-compatible provider.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InternalProviderErrorMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * Metadata attached when an OpenAI-compatible response cannot be converted
   * into the expected AI package output shape.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InvalidOutputErrorMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * Metadata attached when an OpenAI-compatible structured output response does
   * not satisfy the requested schema or parsing constraints.
   *
   * @category models
   * @since 4.0.0
   */
  export interface StructuredOutputErrorMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * Metadata attached when an OpenAI-compatible provider cannot support the
   * schema supplied for structured output or tool definitions.
   *
   * @category models
   * @since 4.0.0
   */
  export interface UnsupportedSchemaErrorMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * Metadata attached when an OpenAI-compatible error response cannot be mapped
   * to a more specific shared AI error category.
   *
   * @category models
   * @since 4.0.0
   */
  export interface UnknownErrorMetadata {
    readonly openai?: OpenAiErrorMetadata | null
  }
}
