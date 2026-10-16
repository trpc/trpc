import type { BaseRedisRateLimiterOptions } from '@orpc/ratelimit/base-redis'
import type { RedisClient } from 'bun'
import { BaseRedisRateLimiter } from '@orpc/ratelimit/base-redis'

export interface BunRedisRateLimiterOptions extends BaseRedisRateLimiterOptions {}

/**
 * Rate limiter adapter for Bun's built-in Redis client. Enforces a fixed-window
 * limit using a Redis Lua script, with optional blocking mode.
 *
 * @see {@link https://orpc.dev/docs/helpers/ratelimit#adapters | Rate Limit Helpers - Adapters}
 */
export class BunRedisRateLimiter extends BaseRedisRateLimiter {
  constructor(
    private readonly redis: RedisClient,
    options: BunRedisRateLimiterOptions,
  ) {
    super(options)
  }

  protected async evalScript(script: string, keys: string[], args: string[]): Promise<unknown> {
    return await this.redis.send('EVAL', [script, String(keys.length), ...keys, ...args])
  }
}
