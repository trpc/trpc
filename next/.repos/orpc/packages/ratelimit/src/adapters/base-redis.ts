import type { RateLimiter, RateLimitOptions, RateLimitResult } from '../types'
import { sleep } from '@orpc/shared'

/**
 * Consumes `ARGV[1]` points from the counter at `KEYS[1]`, starts a window of
 * `ARGV[2]` milliseconds when the counter is new, and replies with `[used, ttl]`.
 * Kept on one line because `EVAL` sends it with every call.
 */
const FIXED_WINDOW_SCRIPT = `local c=redis.call('INCRBY',KEYS[1],ARGV[1]) if c==tonumber(ARGV[1]) then redis.call('PEXPIRE',KEYS[1],ARGV[2]) end return {c,redis.call('PTTL',KEYS[1])}`

/**
 * Options shared by every Redis-backed rate limiter adapter.
 *
 * @see {@link https://orpc.dev/docs/helpers/ratelimit#adapters | Rate Limit Helpers - Adapters}
 */
export interface BaseRedisRateLimiterOptions {
  /**
   * The prefix to use for Redis keys.
   *
   * @default ''
   */
  prefix?: string

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
 * Base class for Redis-backed rate limiter adapters. It owns the key naming,
 * the fixed-window script, and the blocking logic, so every adapter built on
 * it shares counters with the others regardless of the Redis client in use.
 *
 * Extend it and implement `evalScript` to support another Redis client.
 *
 * @see {@link https://orpc.dev/docs/helpers/ratelimit#adapters | Rate Limit Helpers - Adapters}
 */
export abstract class BaseRedisRateLimiter implements RateLimiter {
  protected readonly prefix: string
  protected readonly maxRequests: number
  protected readonly window: number
  protected readonly blockingUntilReady: BaseRedisRateLimiterOptions['blockingUntilReady']

  constructor(options: BaseRedisRateLimiterOptions) {
    this.prefix = options.prefix ?? ''
    this.maxRequests = options.maxRequests
    this.window = options.window
    this.blockingUntilReady = options.blockingUntilReady
  }

  /**
   * Runs a Lua script (`EVAL script numkeys key [key ...] arg [arg ...]`) and resolves with its reply.
   */
  protected abstract evalScript(script: string, keys: string[], args: string[]): Promise<unknown>

  async limit(key: string, options?: RateLimitOptions): Promise<Required<RateLimitResult>> {
    key = `${this.prefix}${key}`
    const weight = this.resolveWeight(options)

    return this.blockingUntilReady?.enabled
      ? this.blockUntilReady(key, this.blockingUntilReady.timeout, weight)
      : this.checkLimit(key, weight)
  }

  private async checkLimit(key: string, weight: number): Promise<Required<RateLimitResult>> {
    const [used, ttl] = await this.evalScript(
      FIXED_WINDOW_SCRIPT,
      [key],
      [String(weight), String(this.window)],
    ) as [used: number, ttl: number]

    return {
      success: used <= this.maxRequests,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - used),
      reset: Date.now() + ttl,
    }
  }

  private async blockUntilReady(key: string, timeoutMs: number, weight: number): Promise<Required<RateLimitResult>> {
    const deadlineAtMs = Date.now() + timeoutMs

    while (true) {
      const result = await this.checkLimit(key, weight)

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
