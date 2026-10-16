import type { RateLimiter, RateLimitOptions, RateLimitResult } from '@orpc/ratelimit'

export interface CloudflareRateLimiterOptions {
  /**
   * The prefix to use for cloudflare ratelimit.
   *
   * @default ''
   */
  prefix?: string
}

/**
 * Rate limiter adapter for Cloudflare's Rate Limiting binding.
 *
 * @remarks
 * **Note**: Blocking mode is not supported by this adapter.
 *
 * @see {@link https://orpc.dev/docs/helpers/ratelimit#adapters | Rate Limit Helpers - Adapters}
 */
export class CloudflareRateLimiter implements RateLimiter {
  private readonly prefix: string

  constructor(
    private readonly ratelimit: RateLimit,
    options: CloudflareRateLimiterOptions = {},
  ) {
    this.prefix = options.prefix ?? ''
  }

  async limit(key: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
    key = `${this.prefix}${key}`
    const weight = this.resolveWeight(options)

    for (let i = 0; i < weight; i++) {
      const result = await this.ratelimit.limit({ key })
      if (!result.success) {
        return { success: false }
      }
    }

    return { success: true }
  }

  private resolveWeight(options?: RateLimitOptions): number {
    const weight = options?.weight ?? 1

    if (!Number.isInteger(weight) || weight <= 0) {
      throw new TypeError('Rate limit weight must be an integer greater than 0')
    }

    return weight
  }
}
