import type { Locker } from '@orpc/experimental-lock'
import { RedisLocker } from '@orpc/experimental-lock/redis'
import { promiseWithResolvers } from '@orpc/shared'
import { RedisClient } from 'bun'
import { afterAll, describe, expect, it } from 'bun:test'
import { createClient } from 'redis'
import { experimental_BunRedisLocker as BunRedisLocker } from '../src'

const REDIS_URL = Bun.env.REDIS_URL

describe.concurrent('lock redis adapters compatibility', async () => {
  const lockers: Array<{ name: string, locker: Locker }> = []
  const prefix = `redis-adapters:${crypto.randomUUID()}`

  if (REDIS_URL) {
    const redis = createClient({ url: REDIS_URL })

    afterAll(() => {
      redis.close()
    })

    lockers.push({
      name: 'redis',
      locker: new RedisLocker(redis, {
        prefix,
        ttl: 10_000,
        retryInterval: 10,
      }),
    })

    const bunRedis = new RedisClient(REDIS_URL)

    afterAll(() => {
      bunRedis.close()
    })

    lockers.push({
      name: 'bun redis',
      locker: new BunRedisLocker(bunRedis, {
        prefix,
        ttl: 10_000,
        retryInterval: 10,
      }),
    })
  }

  /**
   * Holds the lock until `release` is called, and resolves once the callback is running.
   */
  async function hold(locker: Locker, key: string) {
    const started = promiseWithResolvers<void>()
    const finished = promiseWithResolvers<void>()
    const done = locker.lock(key, async ({ waited }) => {
      started.resolve()
      await finished.promise
      return waited
    })

    await Promise.race([started.promise, done])

    return {
      release: () => {
        finished.resolve()
        return done
      },
    }
  }

  describe.skipIf(lockers.length < 2)('cross-adapter compatibility', () => {
    for (const source of lockers) {
      for (const target of lockers) {
        if (source === target) {
          continue
        }

        it(`shares lock state: ${source.name} → ${target.name}`, async () => {
          const key = `shared:${crypto.randomUUID()}`
          const holder = await hold(source.locker, key)
          const waiter = target.locker.lock(key, ({ waited }) => waited)

          // Commands on one client run in order, so the waiter's first attempt was rejected as well
          await expect(
            target.locker.lock(key, () => 'never', { timeout: 0 }),
          ).rejects.toMatchObject({ name: 'LockTimeoutError', key })

          await holder.release()
          await expect(waiter).resolves.toBe(true)
        }, { timeout: 20_000 })
      }
    }
  })
})
