import { sleep } from '@orpc/shared'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { UpstashRateLimiter } from './upstash'

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

/**
 * These tests depend on a real Upstash redis server — make sure to set the
 * `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` envs.
 * When writing new tests, always use unique keys to avoid conflicts with other
 * test cases.
 */
describe.concurrent(
  'upstash rate limiter integration',
  { skip: !UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN, timeout: 20_000 },
  () => {
    function createTestingRatelimit(
      config: { limit: number, window: Parameters<typeof Ratelimit.slidingWindow>[1] } = { limit: 3, window: '10 s' },
    ) {
      const redis = new Redis({
        url: UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
      })

      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(config.limit, config.window),
        prefix: `orpc-upstash-rate-limiter-${crypto.randomUUID()}`,
      })

      return ratelimit
    }

    function createTestingRateLimiter(
      options: ConstructorParameters<typeof UpstashRateLimiter>[1] = {},
      config: { limit: number, window: Parameters<typeof Ratelimit.slidingWindow>[1] } = { limit: 3, window: '10 s' },
    ) {
      return new UpstashRateLimiter(createTestingRatelimit(config), options)
    }

    function createTestKey(name: string) {
      return `${name}-${crypto.randomUUID()}`
    }

    it('accepts weighted requests and forwards pending work to waitUntil', async () => {
      const waitUntil = vi.fn()
      const limiter = createTestingRateLimiter({ waitUntil })
      const key = createTestKey('weighted')

      await expect(limiter.limit(key, { weight: 2 })).resolves.toMatchObject({
        success: true,
        limit: 3,
        remaining: 1,
      })

      expect(waitUntil).toHaveBeenCalledTimes(1)
    })

    it('tracks rate-limit counters independently for each key', async () => {
      const waitUntil = vi.fn()
      const limiter = createTestingRateLimiter({ waitUntil })
      const aliceKey = createTestKey('alice')
      const bobKey = createTestKey('bob')

      expect((await limiter.limit(aliceKey))).toMatchObject({
        success: true,
        limit: 3,
        remaining: 2,
      })
      expect((await limiter.limit(bobKey))).toMatchObject({
        success: true,
        limit: 3,
        remaining: 2,
      })

      expect(waitUntil).toHaveBeenCalledTimes(2)
    })

    it('rejects invalid weights before making a real Upstash call', async () => {
      const limiter = createTestingRateLimiter()
      const key = createTestKey('invalid-weight')

      await expect(limiter.limit(key, { weight: 0 })).rejects.toThrow(TypeError)
      await expect(limiter.limit(key, { weight: -1 })).rejects.toThrow(TypeError)
      await expect(limiter.limit(key, { weight: 1.5 })).rejects.toThrow(
        'Rate limit weight must be an integer greater than 0',
      )
    })

    describe('blockingUntilReady', () => {
      it('delegates weight-1 requests to Upstash blockUntilReady', async () => {
        const waitUntil = vi.fn()
        const timeoutMs = 2000
        const limiter = createTestingRateLimiter(
          {
            waitUntil,
            blockingUntilReady: {
              enabled: true,
              timeout: timeoutMs,
            },
          },
          { limit: 3, window: '10 s' },
        )
        const key = createTestKey('blocking-native')

        let times = 0

        while (true) {
          const result = await limiter.limit(key)
          times += 1
          if (!result.success) {
            break
          }
        }

        expect(waitUntil).toHaveBeenCalledTimes(times)
      })

      it('retries weighted requests until enough capacity frees before the timeout', { retry: 5 }, async () => {
        const waitUntil = vi.fn()
        const timeoutMs = 4000
        const ratelimit = createTestingRatelimit({ limit: 2, window: '1 s' })
        const seedingLimiter = new UpstashRateLimiter(ratelimit)
        const limiter = new UpstashRateLimiter(ratelimit, {
          waitUntil,
          blockingUntilReady: {
            enabled: true,
            timeout: timeoutMs,
          },
        })
        const key = createTestKey('blocking-weighted')

        await expect(seedingLimiter.limit(key)).resolves.toMatchObject({ success: true, limit: 2, remaining: 1 })
        await sleep(100)

        await expect(limiter.limit(key, { weight: 2 })).resolves.toMatchObject({
          success: true,
          limit: 2,
          remaining: 0,
        })

        // second limit can most more than 1 limit due weight is 2
        expect(waitUntil.mock.calls.length).toBeGreaterThanOrEqual(2)
      })

      it('returns the weighted denial when the next reset exceeds the timeout', { retry: 5 }, async () => {
        const waitUntil = vi.fn()
        const timeoutMs = 100
        const ratelimit = createTestingRatelimit({ limit: 2, window: '10 s' })
        const seedingLimiter = new UpstashRateLimiter(ratelimit)
        const limiter = new UpstashRateLimiter(ratelimit, {
          waitUntil,
          blockingUntilReady: {
            enabled: true,
            timeout: timeoutMs,
          },
        })
        const key = createTestKey('blocking-weighted-timeout')

        await expect(seedingLimiter.limit(key)).resolves.toMatchObject({ success: true, remaining: 1 })
        await sleep(100)
        await expect(limiter.limit(key, { weight: 2 })).resolves.toMatchObject({
          success: false,
          limit: 2,
          remaining: 0,
        })

        expect(waitUntil).toHaveBeenCalledTimes(1)
      })
    })
  },
)
