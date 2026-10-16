import type { RedisClientType } from 'redis'
import type { BaseRedisRateLimiterOptions } from './base-redis'
import { BaseRedisRateLimiter } from './base-redis'

export interface RedisRateLimiterOptions extends BaseRedisRateLimiterOptions {}

/**
 * Rate limiter adapter for Redis. Enforces a fixed-window limit using a
 * Redis Lua script, with optional blocking mode.
 *
 * @see {@link https://orpc.dev/docs/helpers/ratelimit#adapters | Rate Limit Helpers - Adapters}
 */
export class RedisRateLimiter extends BaseRedisRateLimiter {
  constructor(
    private readonly redis: RedisClientType<any, any, any, any, any>,
    options: RedisRateLimiterOptions,
  ) {
    super(options)
  }

  protected async evalScript(script: string, keys: string[], args: string[]): Promise<unknown> {
    if (!this.redis.isOpen) {
      await this.redis.connect()
    }

    return await this.redis.eval(script, { keys, arguments: args })
  }
}
