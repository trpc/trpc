import type { Redis } from '@upstash/redis'
import type { BaseRedisLockerOptions } from './base-redis'
import { BaseRedisLocker } from './base-redis'

/**
 * Locker adapter for Upstash Redis. Acquires locks with `SET NX PX` and releases
 * them atomically with a Lua script, so it shares locks with `RedisLocker`.
 * A good fit for serverless and edge runtimes.
 *
 * @see {@link https://orpc.dev/docs/helpers/lock#adapters | Lock Helpers - Adapters}
 */
export class UpstashLocker extends BaseRedisLocker {
  constructor(
    private readonly redis: Redis,
    options: BaseRedisLockerOptions,
  ) {
    super(options)
  }

  protected async acquire(key: string, token: string, ttl: number): Promise<boolean> {
    const result = await this.redis.set(key, token, { nx: true, px: ttl })

    return result === 'OK'
  }

  protected async evalScript(script: string, keys: string[], args: string[]): Promise<unknown> {
    return await this.redis.eval(script, keys, args)
  }
}
