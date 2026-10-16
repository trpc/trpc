import { sleep } from '@orpc/shared'
import { RedisClient } from 'bun'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { BunRedisRateLimiter } from './redis-ratelimit'

const REDIS_URL = Bun.env.REDIS_URL

describe.skipIf(!REDIS_URL)('bun redis rate limiter integration', async () => {
  const redis = new RedisClient(REDIS_URL)

  beforeAll(async () => {
    await redis.connect()
  })

  afterAll(async () => {
    redis.close()
  })

  async function createTestingRateLimiter(
    options: ConstructorParameters<typeof BunRedisRateLimiter>[1] = {
      maxRequests: 3,
      window: 10_000,
    },
  ) {
    return new BunRedisRateLimiter(redis, {
      prefix: `orpc-redis-rate-limiter-${crypto.randomUUID()}:`,
      ...options,
    })
  }

  it('accepts weighted requests', async () => {
    const limiter = await createTestingRateLimiter()
    const key = 'weighted'

    await expect(
      limiter.limit(key, { weight: 2 }),
    ).resolves.toMatchObject({
      success: true,
      limit: 3,
      remaining: 1,
    })
  }, { timeout: 20_000 })

  it('tracks counters independently for each key', async () => {
    const limiter = await createTestingRateLimiter()

    const aliceKey = 'alice'
    const bobKey = 'bob'

    await expect(
      limiter.limit(aliceKey),
    ).resolves.toMatchObject({
      success: true,
      limit: 3,
      remaining: 2,
    })

    await expect(
      limiter.limit(bobKey),
    ).resolves.toMatchObject({
      success: true,
      limit: 3,
      remaining: 2,
    })
  }, { timeout: 20_000 })

  it('returns a stable reset timestamp within the same window', async () => {
    const window = 2000
    const limiter = await createTestingRateLimiter({
      maxRequests: 2,
      window,
    })
    const key = 'reset'
    const tolerance = 500

    const firstStartedAt = Date.now()
    const first = await limiter.limit(key)
    const firstCompletedAt = Date.now()

    expect(first).toMatchObject({
      success: true,
      limit: 2,
      remaining: 1,
    })
    expect(first.reset).toBeGreaterThanOrEqual(firstStartedAt + window - tolerance)
    expect(first.reset).toBeLessThanOrEqual(firstCompletedAt + window)

    await sleep(100)

    const second = await limiter.limit(key)

    expect(second).toMatchObject({
      success: true,
      limit: 2,
      remaining: 0,
    })
    expect(Math.abs(second.reset - first.reset)).toBeLessThanOrEqual(tolerance)

    const denied = await limiter.limit(key)

    expect(denied).toMatchObject({
      success: false,
      limit: 2,
      remaining: 0,
    })
    expect(Math.abs(denied.reset - first.reset)).toBeLessThanOrEqual(tolerance)
  }, { timeout: 20_000 })

  it('uses an empty prefix when none is provided', async () => {
    const limiter = await createTestingRateLimiter({
      prefix: undefined,
      maxRequests: 3,
      window: 10_000,
    })

    await expect(
      limiter.limit(`no-prefix-${crypto.randomUUID()}`),
    ).resolves.toMatchObject({
      success: true,
      limit: 3,
      remaining: 2,
    })
  }, { timeout: 20_000 })

  it('rejects invalid weights', async () => {
    const limiter = await createTestingRateLimiter()
    const key = 'invalid-weight'

    await expect(
      limiter.limit(key, { weight: 0 }),
    ).rejects.toThrow(TypeError)

    await expect(
      limiter.limit(key, { weight: -1 }),
    ).rejects.toThrow(TypeError)

    await expect(
      limiter.limit(key, { weight: 1.5 }),
    ).rejects.toThrow(
      'Rate limit weight must be an integer greater than 0',
    )
  }, { timeout: 20_000 })

  it('consumes quota across multiple requests', async () => {
    const limiter = await createTestingRateLimiter()
    const key = 'quota'

    await expect(limiter.limit(key))
      .resolves
      .toMatchObject({
        success: true,
        remaining: 2,
      })

    await expect(limiter.limit(key))
      .resolves
      .toMatchObject({
        success: true,
        remaining: 1,
      })

    await expect(limiter.limit(key))
      .resolves
      .toMatchObject({
        success: true,
        remaining: 0,
      })
  }, { timeout: 20_000 })

  it('rejects requests that exceed the limit', async () => {
    const limiter = await createTestingRateLimiter()
    const key = 'exceeded'

    await limiter.limit(key)
    await limiter.limit(key)
    await limiter.limit(key)

    await expect(
      limiter.limit(key),
    ).resolves.toMatchObject({
      success: false,
      limit: 3,
      remaining: 0,
    })
  }, { timeout: 20_000 })

  describe('blockingUntilReady', () => {
    it('waits until the next window when capacity is unavailable', async () => {
      const limiter = await createTestingRateLimiter({
        maxRequests: 2,
        window: 1000,
        blockingUntilReady: {
          enabled: true,
          timeout: 4000,
        },
      })

      const key = 'blocking'

      await limiter.limit(key)
      await limiter.limit(key)

      const start = Date.now()

      const result = await limiter.limit(key)

      expect(result).toMatchObject({
        success: true,
        limit: 2,
      })

      expect(Date.now() - start).toBeGreaterThanOrEqual(900)
      expect(result.reset - Date.now()).toBeGreaterThanOrEqual(700)
    }, { timeout: 20_000 })

    it('waits until enough quota is available for weighted requests', async () => {
      const limiter = await createTestingRateLimiter({
        maxRequests: 2,
        window: 1000,
        blockingUntilReady: {
          enabled: true,
          timeout: 4000,
        },
      })

      const key = 'blocking-weighted'

      await expect(
        limiter.limit(key),
      ).resolves.toMatchObject({
        success: true,
        remaining: 1,
      })

      await sleep(100)

      await expect(
        limiter.limit(key, { weight: 2 }),
      ).resolves.toMatchObject({
        success: true,
        limit: 2,
        remaining: 0,
      })
    }, { timeout: 20_000 })

    it('returns denial when reset exceeds timeout', async () => {
      const limiter = await createTestingRateLimiter({
        maxRequests: 2,
        window: 10_000,
        blockingUntilReady: {
          enabled: true,
          timeout: 100,
        },
      })

      const key = 'blocking-timeout'

      await limiter.limit(key)

      await sleep(100)

      await expect(
        limiter.limit(key, { weight: 2 }),
      ).resolves.toMatchObject({
        success: false,
        limit: 2,
        remaining: 0,
      })
    }, { timeout: 20_000 })
  })
})
