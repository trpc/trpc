export interface RateLimitResult {
  /**
   * Whether the request may pass(true) or exceeded the limit(false)
   */
  success: boolean
  /**
   * Maximum number of requests allowed within a window.
   */
  limit?: number
  /**
   * How many requests the user has left within the current window.
   */
  remaining?: number
  /**
   * Unix timestamp in milliseconds when the limits are reset.
   */
  reset?: number
}

export interface RateLimitOptions {
  /**
   * The weight of the request. Determines how many tokens or quota
   * units are consumed by this request. Must be an integer greater than 0.
   *
   * @default 1
   */
  weight?: number
}

/**
 * Standard interface for checking and enforcing rate limits.
 * Implement it for custom strategies, or use one of the provided adapters.
 *
 * @see {@link https://orpc.dev/docs/helpers/ratelimit | Rate Limit Helpers}
 */
export interface RateLimiter {
  limit(key: string, options?: RateLimitOptions): Promise<RateLimitResult>
}
