import type { CloudflareRateLimiterOptions } from './ratelimit'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { CloudflareRateLimiter } from './ratelimit'

describe('cloudflareRateLimiter', () => {
  const PERIOD_MS = 10_000

  function createTestingLimiter(opts: CloudflareRateLimiterOptions = {}) {
    return new CloudflareRateLimiter(env.RATELIMIT_3_10S, {
      prefix: crypto.randomUUID(),
      ...opts,
    })
  }

  async function spendWithinOneWindow(spend: (key: string) => Promise<void>): Promise<void> {
    for (let remaining = 5; ; remaining--) {
      const started = Date.now()

      try {
        await spend(`user:${crypto.randomUUID()}`)
        return
      }
      catch (error) {
        if (remaining === 1 || Math.floor(started / PERIOD_MS) === Math.floor(Date.now() / PERIOD_MS)) {
          throw error
        }
      }
    }
  }

  it('allows requests up to the limit and denies the next one', async () => {
    const limiter = createTestingLimiter()

    await spendWithinOneWindow(async (key) => {
      expect(await limiter.limit(key)).toEqual({ success: true })
      expect(await limiter.limit(key)).toEqual({ success: true })
      expect(await limiter.limit(key)).toEqual({ success: true })
      expect(await limiter.limit(key)).toEqual({ success: false })
    })
  })

  it('deducts multiple tokens when a weight is provided', async () => {
    const limiter = createTestingLimiter()

    await spendWithinOneWindow(async (key) => {
      expect(await limiter.limit(key, { weight: 2 })).toEqual({ success: true })
      expect(await limiter.limit(key, { weight: 1 })).toEqual({ success: true })
      expect(await limiter.limit(key, { weight: 1 })).toEqual({ success: false })
    })
  })

  it('throws a TypeError when weight is zero, negative, or non-integer', async () => {
    const limiter = createTestingLimiter()

    await expect(limiter.limit('user:123', { weight: 0 })).rejects.toThrow(TypeError)
    await expect(limiter.limit('user:123', { weight: -1 })).rejects.toThrow(TypeError)
    await expect(limiter.limit('user:123', { weight: 1.5 })).rejects.toThrow(
      'Rate limit weight must be an integer greater than 0',
    )
  })

  it('prepends the configured prefix to the key passed to the underlying limiter', async () => {
    const limit = vi.fn(async () => ({ success: true }))
    const limiter = new CloudflareRateLimiter({ limit }, { prefix: 'prefix:' })

    await limiter.limit('user:123')
    await limiter.limit('user:123', { weight: 2 })

    expect(limit).toHaveBeenNthCalledWith(1, { key: 'prefix:user:123' })
    expect(limit).toHaveBeenNthCalledWith(2, { key: 'prefix:user:123' })
    expect(limit).toHaveBeenNthCalledWith(3, { key: 'prefix:user:123' })
  })

  it('uses the key unmodified when no prefix is configured', async () => {
    const limit = vi.fn(async () => ({ success: true }))
    const limiter = new CloudflareRateLimiter({ limit })

    await limiter.limit('user:123')
    await limiter.limit('user:123', { weight: 2 })

    expect(limit).toHaveBeenNthCalledWith(1, { key: 'user:123' })
    expect(limit).toHaveBeenNthCalledWith(2, { key: 'user:123' })
    expect(limit).toHaveBeenNthCalledWith(3, { key: 'user:123' })
  })
})
