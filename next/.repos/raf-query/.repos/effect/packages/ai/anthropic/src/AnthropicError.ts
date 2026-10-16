/**
 * Anthropic error metadata augmentation.
 *
 * Provides Anthropic-specific metadata fields for AI error types through module
 * augmentation, enabling typed access to Anthropic error details.
 *
 * @since 4.0.0
 */

/**
 * Anthropic-specific error metadata fields.
 *
 * **Details**
 *
 * Contains the Anthropic error type and request identifier copied from provider
 * error responses when available. Either field may be `null` when Anthropic
 * does not include it or the response cannot be decoded.
 *
 * @see {@link AnthropicRateLimitMetadata} for rate-limit responses that also include parsed Anthropic rate-limit headers
 *
 * @category models
 * @since 4.0.0
 */
export type AnthropicErrorMetadata = {
  /**
   * The Anthropic error type returned by the API.
   */
  readonly errorType: string | null
  /**
   * The unique request ID for debugging with Anthropic support.
   */
  readonly requestId: string | null
}

/**
 * Anthropic-specific rate limit metadata fields.
 *
 * **Details**
 *
 * Extends base error metadata with rate limit-specific information from Anthropic's rate limit headers.
 *
 * @category models
 * @since 4.0.0
 */
export type AnthropicRateLimitMetadata = AnthropicErrorMetadata & {
  /**
   * Number of requests allowed in the current period.
   */
  readonly requestsLimit: number | null
  /**
   * Number of requests remaining in the current period.
   */
  readonly requestsRemaining: number | null
  /**
   * Time when the request rate limit resets.
   */
  readonly requestsReset: string | null
  /**
   * Number of tokens allowed in the current period.
   */
  readonly tokensLimit: number | null
  /**
   * Number of tokens remaining in the current period.
   */
  readonly tokensRemaining: number | null
  /**
   * Time when the token rate limit resets.
   */
  readonly tokensReset: string | null
}

declare module "effect/ai/AiError" {
  /**
   * Anthropic metadata attached to `RateLimitError` values.
   *
   * **Details**
   *
   * Includes request identifiers, Anthropic error types, and parsed request or token limit headers when the provider rejects a request due to rate limits.
   *
   * @category models
   * @since 4.0.0
   */
  export interface RateLimitErrorMetadata {
    readonly anthropic?: AnthropicRateLimitMetadata | null
  }

  /**
   * Anthropic metadata attached to `QuotaExhaustedError` values.
   *
   * **Details**
   *
   * Captures the Anthropic error type and request identifier for failures where the account or workspace has exhausted its available quota.
   *
   * @category models
   * @since 4.0.0
   */
  export interface QuotaExhaustedErrorMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  /**
   * Anthropic metadata attached to `AuthenticationError` values.
   *
   * **Details**
   *
   * Preserves Anthropic error details for missing, invalid, or unauthorized API credentials while keeping the error in the shared AI error model.
   *
   * @category models
   * @since 4.0.0
   */
  export interface AuthenticationErrorMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  /**
   * Anthropic metadata attached to `ContentPolicyError` values.
   *
   * **Details**
   *
   * Records Anthropic error details returned when a request or response is rejected by Anthropic safety or content policy enforcement.
   *
   * @category models
   * @since 4.0.0
   */
  export interface ContentPolicyErrorMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  /**
   * Anthropic metadata attached to `InvalidRequestError` values.
   *
   * **Details**
   *
   * Provides the Anthropic error type and request identifier for malformed or unsupported requests rejected before model execution.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InvalidRequestErrorMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  /**
   * Anthropic metadata attached to `InternalProviderError` values.
   *
   * **Details**
   *
   * Preserves Anthropic request correlation data for provider-side failures that should be reported or investigated with Anthropic support.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InternalProviderErrorMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  /**
   * Anthropic metadata attached to `InvalidOutputError` values.
   *
   * **Details**
   *
   * Describes Anthropic-specific context for responses that could not be decoded or interpreted as valid AI output.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InvalidOutputErrorMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  /**
   * Anthropic metadata attached to `StructuredOutputError` values.
   *
   * **Details**
   *
   * Captures Anthropic error details for structured-output failures, including request correlation data useful when diagnosing schema-related responses.
   *
   * @category models
   * @since 4.0.0
   */
  export interface StructuredOutputErrorMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  /**
   * Anthropic metadata attached to `UnsupportedSchemaError` values.
   *
   * **Details**
   *
   * Provides Anthropic error details for schemas that cannot be represented by or submitted to the Anthropic API.
   *
   * @category models
   * @since 4.0.0
   */
  export interface UnsupportedSchemaErrorMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }

  /**
   * Anthropic metadata attached to `UnknownError` values.
   *
   * **Details**
   *
   * Retains the Anthropic error type and request identifier when a provider response cannot be classified as a more specific AI error.
   *
   * @category models
   * @since 4.0.0
   */
  export interface UnknownErrorMetadata {
    readonly anthropic?: AnthropicErrorMetadata | null
  }
}
