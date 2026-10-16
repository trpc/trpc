import type { RateLimiter, RateLimitOptions, RateLimitResult } from '../types'
import { sleep } from '@orpc/shared'

export interface MemoryRateLimiterOptions {
  /**
   * Maximum number of requests allowed within the window.
   */
  maxRequests: number

  /**
   * The duration of the fixed window in milliseconds.
   */
  window: number

  /**
   * Block until the request may pass or timeout is reached.
   *
   * @default { enabled: false }
   */
  blockingUntilReady?: {
    /**
     * Block until the request may pass or timeout is reached.
     *
     * @default false
     */
    enabled: boolean

    /**
     * milliseconds
     */
    timeout: number
  }
}

/**
 * Rate limiter adapter backed by in-memory storage. Enforces a fixed-window
 * limit, with optional blocking mode.
 *
 * @see {@link https://orpc.dev/docs/helpers/ratelimit#adapters | Rate Limit Helpers - Adapters}
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly maxRequests: number
  private readonly window: number
  private readonly blockingUntilReady: MemoryRateLimiterOptions['blockingUntilReady']

  private current: Map<string, { used: number }> = new Map()
  private currentEpochStart: number = Date.now()

  constructor(options: MemoryRateLimiterOptions) {
    this.maxRequests = options.maxRequests
    this.window = options.window
    this.blockingUntilReady = options.blockingUntilReady
  }

  async limit(key: string, options?: RateLimitOptions): Promise<Required<RateLimitResult>> {
    const weight = this.resolveWeight(options)

    return this.blockingUntilReady?.enabled
      ? this.blockUntilReady(key, this.blockingUntilReady.timeout, weight)
      : this.checkLimit(key, weight)
  }

  private rotateIfNeeded(now: number): void {
    if (now < this.currentEpochStart + this.window) {
      return
    }

    this.current = new Map()
    this.currentEpochStart = now
  }

  private checkLimit(key: string, weight: number): Required<RateLimitResult> {
    const now = Date.now()
    this.rotateIfNeeded(now)

    let entry = this.current.get(key)

    if (!entry) {
      entry = { used: 0 }
      this.current.set(key, entry)
    }

    const reset = this.currentEpochStart + this.window
    const success = entry.used + weight <= this.maxRequests

    if (success) {
      entry.used += weight
    }

    return {
      success,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - entry.used),
      reset,
    }
  }

  private async blockUntilReady(key: string, timeoutMs: number, weight: number): Promise<Required<RateLimitResult>> {
    const deadlineAtMs = Date.now() + timeoutMs

    while (true) {
      const result = this.checkLimit(key, weight)

      if (result.success || result.reset > deadlineAtMs) {
        return result
      }

      await sleep(result.reset - Date.now())
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
