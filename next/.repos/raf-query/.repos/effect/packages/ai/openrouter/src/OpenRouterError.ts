/**
 * OpenRouter error metadata augmentation.
 *
 * Provides OpenRouter-specific metadata fields for AI error types through
 * module augmentation, enabling typed access to OpenRouter error details.
 *
 * @since 4.0.0
 */

/**
 * OpenRouter-specific error metadata fields.
 *
 * @category models
 * @since 4.0.0
 */
export type OpenRouterErrorMetadata = {
  /**
   * The error code returned by the API.
   */
  readonly errorCode: string | number | null
  /**
   * The error type returned by the API.
   */
  readonly errorType: string | null
  /**
   * The unique request ID for debugging.
   */
  readonly requestId: string | null
}

/**
 * OpenRouter-specific rate limit metadata fields.
 *
 * @category models
 * @since 4.0.0
 */
export type OpenRouterRateLimitMetadata = OpenRouterErrorMetadata & {
  readonly limit: string | null
  readonly remaining: number | null
  readonly resetRequests: string | null
  readonly resetTokens: string | null
}

declare module "effect/ai/AiError" {
  /**
   * OpenRouter metadata attached to `RateLimitError` values.
   *
   * **Details**
   *
   * Captures OpenRouter error details together with rate limit header
   * information from responses where the provider rejected the request because
   * a limit was reached.
   *
   * @category models
   * @since 4.0.0
   */
  export interface RateLimitErrorMetadata {
    /**
     * OpenRouter-specific details for the rate limit response.
     */
    readonly openrouter?: OpenRouterRateLimitMetadata | null
  }

  /**
   * OpenRouter metadata attached to `QuotaExhaustedError` values.
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
     * OpenRouter-specific details for the quota exhaustion response.
     */
    readonly openrouter?: OpenRouterErrorMetadata | null
  }

  /**
   * OpenRouter metadata attached to `AuthenticationError` values.
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
     * OpenRouter-specific details for the authentication failure.
     */
    readonly openrouter?: OpenRouterErrorMetadata | null
  }

  /**
   * OpenRouter metadata attached to `ContentPolicyError` values.
   *
   * **Details**
   *
   * Preserves provider error details when OpenRouter rejects input or output
   * because it violates a content policy.
   *
   * @category models
   * @since 4.0.0
   */
  export interface ContentPolicyErrorMetadata {
    /**
     * OpenRouter-specific details for the content policy response.
     */
    readonly openrouter?: OpenRouterErrorMetadata | null
  }

  /**
   * OpenRouter metadata attached to `InvalidRequestError` values.
   *
   * **Details**
   *
   * Preserves provider error details for malformed requests, unsupported
   * parameters, or other request validation failures reported by OpenRouter.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InvalidRequestErrorMetadata {
    /**
     * OpenRouter-specific details for the invalid request response.
     */
    readonly openrouter?: OpenRouterErrorMetadata | null
  }

  /**
   * OpenRouter metadata attached to `InternalProviderError` values.
   *
   * **Details**
   *
   * Preserves provider error details for OpenRouter-side failures such as
   * transient server errors or overload responses.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InternalProviderErrorMetadata {
    /**
     * OpenRouter-specific details for the internal provider response.
     */
    readonly openrouter?: OpenRouterErrorMetadata | null
  }

  /**
   * OpenRouter metadata attached to `InvalidOutputError` values.
   *
   * **Details**
   *
   * Preserves provider error details when an OpenRouter response cannot be
   * parsed or validated as the expected output.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InvalidOutputErrorMetadata {
    /**
     * OpenRouter-specific details for the invalid output response.
     */
    readonly openrouter?: OpenRouterErrorMetadata | null
  }

  /**
   * OpenRouter metadata attached to `StructuredOutputError` values.
   *
   * **Details**
   *
   * Preserves provider error details when OpenRouter returns content that does
   * not satisfy the requested structured output schema.
   *
   * @category models
   * @since 4.0.0
   */
  export interface StructuredOutputErrorMetadata {
    /**
     * OpenRouter-specific details for the structured output failure.
     */
    readonly openrouter?: OpenRouterErrorMetadata | null
  }

  /**
   * OpenRouter metadata attached to `UnsupportedSchemaError` values.
   *
   * **Details**
   *
   * Preserves provider error details when an unsupported schema failure is
   * associated with an OpenRouter response.
   *
   * @category models
   * @since 4.0.0
   */
  export interface UnsupportedSchemaErrorMetadata {
    /**
     * OpenRouter-specific details for the unsupported schema failure.
     */
    readonly openrouter?: OpenRouterErrorMetadata | null
  }

  /**
   * OpenRouter metadata attached to `UnknownError` values.
   *
   * **Details**
   *
   * Preserves provider error details for OpenRouter failures that do not map
   * cleanly to a more specific AI error category.
   *
   * @category models
   * @since 4.0.0
   */
  export interface UnknownErrorMetadata {
    /**
     * OpenRouter-specific details for the unclassified provider failure.
     */
    readonly openrouter?: OpenRouterErrorMetadata | null
  }
}
