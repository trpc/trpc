import type { Ratelimit } from '@upstash/ratelimit'
import type { RateLimiter, RateLimitOptions, RateLimitResult } from '../types'
import { sleep } from '@orpc/shared'

export interface UpstashRateLimiterOptions {
  /**
   * Block until the request may pass or timeout is reached.
   */
  blockingUntilReady?: {
    enabled: boolean

    /**
     * milliseconds
     */
    timeout: number
  }

  /**
   * For the MultiRegion setup we do some synchronizing in the background, after returning the current limit.
   * Or when analytics is enabled, we send the analytics asynchronously after returning the limit.
   * In most case you can simply ignore this.
   *
   * On Vercel Edge or Cloudflare workers, you might need `.bind` before assign:
   * ```ts
   * const ratelimiter = new UpstashRateLimiter(ratelimit, {
   *   waitUntil: ctx.waitUntil.bind(ctx),
   * })
   * ```
   */
  waitUntil?: (promise: Promise<any>) => any
}

/**
 * Rate limiter adapter for Upstash Rate Limit. Delegates limit checks to a
 * configured `Ratelimit` instance, with optional blocking mode.
 *
 * @see {@link https://orpc.dev/docs/helpers/ratelimit#adapters | Rate Limit Helpers - Adapters}
 */
export class UpstashRateLimiter implements RateLimiter {
  private blockingUntilReady: UpstashRateLimiterOptions['blockingUntilReady']
  private waitUntil: UpstashRateLimiterOptions['waitUntil']

  constructor(
    private readonly ratelimit: Ratelimit,
    options: UpstashRateLimiterOptions = {},
  ) {
    this.blockingUntilReady = options.blockingUntilReady
    this.waitUntil = options.waitUntil
  }

  async limit(key: string, options: RateLimitOptions = {}): Promise<Required<RateLimitResult>> {
    const weight = this.resolveWeight(options)

    if (this.blockingUntilReady?.enabled) {
      return await this.blockUntilReady(key, weight, this.blockingUntilReady.timeout)
    }

    return await this.checkLimit(key, weight)
  }

  private async checkLimit(key: string, weight: number): Promise<Required<RateLimitResult>> {
    const result = await this.ratelimit.limit(key, { rate: weight })
    this.waitUntil?.(result.pending)
    return result
  }

  private async blockUntilReady(key: string, weight: number, timeoutMs: number): Promise<Required<RateLimitResult>> {
    if (weight === 1) {
      const result = await this.ratelimit.blockUntilReady(key, timeoutMs)
      this.waitUntil?.(result.pending)
      return result
    }

    const deadlineAtMs = Date.now() + timeoutMs

    while (true) {
      const result = await this.checkLimit(key, weight)

      if (result.success || result.reset > deadlineAtMs) {
        return result
      }

      await sleep(Math.max(0, result.reset - Date.now()))
    }
  }

  private resolveWeight(options?: RateLimitOptions): number {
    const weight = options?.weight ?? 1

    if (!Number.isInteger(weight) || weight <= 0) {
      throw new TypeError('Rate limit weight must be an integer greater than 0')
    }

    return weight
  }
}
