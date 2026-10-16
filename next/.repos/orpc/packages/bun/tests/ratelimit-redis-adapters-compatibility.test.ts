import type { RateLimiter } from '@orpc/ratelimit'
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { RedisClient } from 'bun'
import { afterAll, describe, expect, it } from 'bun:test'
import { createClient } from 'redis'
import { BunRedisRateLimiter } from '../src'

const REDIS_URL = Bun.env.REDIS_URL

describe.concurrent('ratelimit redis adapters compatibility', async () => {
  const limiters: Array<{ name: string, limiter: RateLimiter }> = []
  const prefix = `redis-adapters:${crypto.randomUUID()}`

  if (REDIS_URL) {
    const redis = createClient({ url: REDIS_URL })

    afterAll(() => {
      redis.close()
    })

    limiters.push({
      name: 'redis',
      limiter: new RedisRateLimiter(redis, {
        window: 60_000,
        maxRequests: 3,
        prefix,
      }),
    })

    const bunRedis = new RedisClient(REDIS_URL)

    afterAll(() => {
      bunRedis.close()
    })

    limiters.push({
      name: 'bun redis',
      limiter: new BunRedisRateLimiter(bunRedis, {
        window: 60_000,
        maxRequests: 3,
        prefix,
      }),
    })
  }

  describe.skipIf(limiters.length < 2)('cross-adapter compatibility', () => {
    for (const source of limiters) {
      for (const target of limiters) {
        if (source === target) {
          continue
        }

        it(`shares rate limit state: ${source.name} → ${target.name}`, async () => {
          const key = `shared:${crypto.randomUUID()}`

          const r1 = await source.limiter.limit(key)

          expect(r1).toMatchObject({
            success: true,
            limit: 3,
            remaining: 2,
          })

          const r2 = await target.limiter.limit(key)

          expect(r2).toMatchObject({
            success: true,
            limit: 3,
            remaining: 1,
          })

          const r3 = await source.limiter.limit(key)

          expect(r3).toMatchObject({
            success: true,
            limit: 3,
            remaining: 0,
          })

          const r4 = await target.limiter.limit(key)

          expect(r4).toMatchObject({
            success: false,
            limit: 3,
            remaining: 0,
          })
        })
      }
    }
  })
})
