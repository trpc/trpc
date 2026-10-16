/**
 * OpenAI error metadata augmentation.
 *
 * Provides OpenAI-specific metadata fields for AI error types through module
 * augmentation, enabling typed access to OpenAI error details.
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
   * OpenAI metadata attached to `RateLimitError` values.
   *
   * **Details**
   *
   * Captures OpenAI error details together with rate limit header information
   * from responses where the provider rejected the request because a limit was
   * reached.
   *
   * @category models
   * @since 4.0.0
   */
  export interface RateLimitErrorMetadata {
    /**
     * OpenAI-specific details for the rate limit response.
     */
    readonly openai?: OpenAiRateLimitMetadata | null
  }

  /**
   * OpenAI metadata attached to `QuotaExhaustedError` values.
   *
   * **Details**
   *
   * Preserves provider error details for failures caused by exhausted account,
   * billing, or usage quota.
   *
   * @category models
   * @since 4.0.0
   */
  export interface QuotaExhaustedErrorMetadata {
    /**
     * OpenAI-specific details for the quota exhaustion response.
     */
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * OpenAI metadata attached to `AuthenticationError` values.
   *
   * **Details**
   *
   * Preserves provider error details for failed API key, authorization, or
   * permission checks.
   *
   * @category models
   * @since 4.0.0
   */
  export interface AuthenticationErrorMetadata {
    /**
     * OpenAI-specific details for the authentication failure.
     */
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * OpenAI metadata attached to `ContentPolicyError` values.
   *
   * **Details**
   *
   * Preserves provider error details when OpenAI rejects input or output because
   * it violates a content policy.
   *
   * @category models
   * @since 4.0.0
   */
  export interface ContentPolicyErrorMetadata {
    /**
     * OpenAI-specific details for the content policy response.
     */
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * OpenAI metadata attached to `InvalidRequestError` values.
   *
   * **Details**
   *
   * Preserves provider error details for malformed requests, unsupported
   * parameters, or other request validation failures reported by OpenAI.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InvalidRequestErrorMetadata {
    /**
     * OpenAI-specific details for the invalid request response.
     */
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * OpenAI metadata attached to `InternalProviderError` values.
   *
   * **Details**
   *
   * Preserves provider error details for OpenAI-side failures such as transient
   * server errors.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InternalProviderErrorMetadata {
    /**
     * OpenAI-specific details for the internal provider response.
     */
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * OpenAI metadata attached to `InvalidOutputError` values.
   *
   * **Details**
   *
   * Preserves provider error details when an OpenAI response cannot be parsed or
   * validated as the expected output.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InvalidOutputErrorMetadata {
    /**
     * OpenAI-specific details for the invalid output response.
     */
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * OpenAI metadata attached to `StructuredOutputError` values.
   *
   * **Details**
   *
   * Preserves provider error details when OpenAI returns content that does not
   * satisfy the requested structured output schema.
   *
   * @category models
   * @since 4.0.0
   */
  export interface StructuredOutputErrorMetadata {
    /**
     * OpenAI-specific details for the structured output failure.
     */
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * OpenAI metadata attached to `UnsupportedSchemaError` values.
   *
   * **Details**
   *
   * Preserves provider error details when an unsupported schema failure is
   * associated with an OpenAI response.
   *
   * @category models
   * @since 4.0.0
   */
  export interface UnsupportedSchemaErrorMetadata {
    /**
     * OpenAI-specific details for the unsupported schema failure.
     */
    readonly openai?: OpenAiErrorMetadata | null
  }

  /**
   * OpenAI metadata attached to `UnknownError` values.
   *
   * **Details**
   *
   * Preserves provider error details for OpenAI failures that do not map cleanly
   * to a more specific AI error category.
   *
   * @category models
   * @since 4.0.0
   */
  export interface UnknownErrorMetadata {
    /**
     * OpenAI-specific details for the unclassified provider failure.
     */
    readonly openai?: OpenAiErrorMetadata | null
  }
}
