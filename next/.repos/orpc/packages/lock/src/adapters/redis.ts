import type { RedisClientType } from 'redis'
import type { BaseRedisLockerOptions } from './base-redis'
import { BaseRedisLocker } from './base-redis'

/**
 * Locker adapter for Redis. Acquires locks with `SET NX PX` and releases them
 * atomically with a Lua script, so every instance using the same server shares
 * the same locks.
 *
 * @see {@link https://orpc.dev/docs/helpers/lock#adapters | Lock Helpers - Adapters}
 */
export class RedisLocker extends BaseRedisLocker {
  constructor(
    private readonly redis: RedisClientType<any, any, any, any, any>,
    options: BaseRedisLockerOptions,
  ) {
    super(options)
  }

  protected async acquire(key: string, token: string, ttl: number): Promise<boolean> {
    await this.connectIfNeeded()

    const result = await this.redis.set(key, token, {
      condition: 'NX',
      expiration: { type: 'PX', value: ttl },
    })

    return result === 'OK'
  }

  protected async evalScript(script: string, keys: string[], args: string[]): Promise<unknown> {
    await this.connectIfNeeded()

    return await this.redis.eval(script, { keys, arguments: args })
  }

  private async connectIfNeeded(): Promise<void> {
    if (!this.redis.isOpen) {
      await this.redis.connect()
    }
  }
}
