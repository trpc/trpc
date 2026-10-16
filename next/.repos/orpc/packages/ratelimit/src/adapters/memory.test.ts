import { MemoryRateLimiter } from './memory'

describe('memoryRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests up to the limit, then starts denying', async () => {
    const limiter = new MemoryRateLimiter({ maxRequests: 3, window: 1000 })

    expect(await limiter.limit('key')).toEqual({ success: true, limit: 3, remaining: 2, reset: 1000 })
    expect(await limiter.limit('key')).toEqual({ success: true, limit: 3, remaining: 1, reset: 1000 })
    expect(await limiter.limit('key')).toEqual({ success: true, limit: 3, remaining: 0, reset: 1000 })
    expect(await limiter.limit('key')).toEqual({ success: false, limit: 3, remaining: 0, reset: 1000 })
  })

  it('consumes weight and denies when accumulated weight exceeds the limit', async () => {
    const limiter = new MemoryRateLimiter({ maxRequests: 5, window: 1000 })

    expect(await limiter.limit('key', { weight: 3 })).toEqual({ success: true, limit: 5, remaining: 2, reset: 1000 })
    expect(await limiter.limit('key', { weight: 3 })).toEqual({ success: false, limit: 5, remaining: 2, reset: 1000 })
    expect(await limiter.limit('key', { weight: 2 })).toEqual({ success: true, limit: 5, remaining: 0, reset: 1000 })
    expect(await limiter.limit('key', { weight: 1 })).toEqual({ success: false, limit: 5, remaining: 0, reset: 1000 })
  })

  it('tracks limits independently per key', async () => {
    const limiter = new MemoryRateLimiter({ maxRequests: 1, window: 1000 })

    expect(await limiter.limit('alice')).toEqual({ success: true, limit: 1, remaining: 0, reset: 1000 })
    expect(await limiter.limit('alice')).toEqual({ success: false, limit: 1, remaining: 0, reset: 1000 })
    expect(await limiter.limit('bob')).toEqual ({ success: true, limit: 1, remaining: 0, reset: 1000 })
  })

  it('denies within window and resets counter on new epoch', async () => {
    const limiter = new MemoryRateLimiter({ maxRequests: 2, window: 1000 })

    expect(await limiter.limit('key')).toEqual({ success: true, limit: 2, remaining: 1, reset: 1000 })
    expect(await limiter.limit('key')).toEqual({ success: true, limit: 2, remaining: 0, reset: 1000 })

    await vi.advanceTimersByTimeAsync(999) // still inside window
    expect(await limiter.limit('key')).toEqual({ success: false, limit: 2, remaining: 0, reset: 1000 })

    await vi.advanceTimersByTimeAsync(1) // t=1000 — new epoch
    expect(await limiter.limit('key', { weight: 2 })).toEqual({ success: true, limit: 2, remaining: 0, reset: 2000 })
    expect(await limiter.limit('key')).toEqual ({ success: false, limit: 2, remaining: 0, reset: 2000 })
  })

  it('reset is pegged to epoch start and does not shift mid-window', async () => {
    vi.setSystemTime(200)
    const limiter = new MemoryRateLimiter({ maxRequests: 3, window: 1000 })

    expect(await limiter.limit('key', { weight: 2 })).toEqual({ success: true, limit: 3, remaining: 1, reset: 1200 })
    vi.setSystemTime(500)
    expect(await limiter.limit('key', { weight: 1 })).toEqual({ success: true, limit: 3, remaining: 0, reset: 1200 })
    vi.setSystemTime(600)
    expect(await limiter.limit('key', { weight: 2 })).toEqual({ success: false, limit: 3, remaining: 0, reset: 1200 })
  })

  it('throws for invalid weights', async () => {
    const limiter = new MemoryRateLimiter({ maxRequests: 5, window: 1000 })

    await expect(limiter.limit('key', { weight: 0 })).rejects.toThrow(TypeError)
    await expect(limiter.limit('key', { weight: -1 })).rejects.toThrow(TypeError)
    await expect(limiter.limit('key', { weight: 1.5 })).rejects.toThrow(
      'Rate limit weight must be an integer greater than 0',
    )
  })

  it('should not allow more than maxRequests under concurrent requests', async () => {
    const limiter = new MemoryRateLimiter({
      maxRequests: 10,
      window: 1000,
    })

    const results = await Promise.all(
      Array.from({ length: 100 }, () => limiter.limit('user')),
    )

    const successCount = results.filter(r => r.success).length

    expect(successCount).toBe(10)
    expect(results.length - successCount).toBe(90)
  })

  describe('blockingUntilReady', () => {
    it('blocks and retries until a slot opens up', async () => {
      const limiter = new MemoryRateLimiter({
        maxRequests: 1,
        window: 500,
        blockingUntilReady: { enabled: true, timeout: 1000 },
      })

      expect(await limiter.limit('key')).toEqual({ success: true, limit: 1, remaining: 0, reset: 500 })

      const pending = limiter.limit('key')
      await vi.advanceTimersByTimeAsync(500) // new epoch at t=500

      expect(await pending).toEqual({ success: true, limit: 1, remaining: 0, reset: 1000 })
    })

    it('blocks and retries with weight until a slot opens up', async () => {
      const limiter = new MemoryRateLimiter({
        maxRequests: 3,
        window: 500,
        blockingUntilReady: { enabled: true, timeout: 1000 },
      })

      expect(await limiter.limit('key', { weight: 3 })).toEqual({ success: true, limit: 3, remaining: 0, reset: 500 })

      const pending = limiter.limit('key', { weight: 2 })
      await vi.advanceTimersByTimeAsync(500) // new epoch at t=500

      expect(await pending).toEqual({ success: true, limit: 3, remaining: 1, reset: 1000 })
    })

    it('gives up immediately when the wait would exceed the timeout', async () => {
      const limiter = new MemoryRateLimiter({
        maxRequests: 1,
        window: 2000,
        blockingUntilReady: { enabled: true, timeout: 100 },
      })

      expect(await limiter.limit('key')).toEqual({ success: true, limit: 1, remaining: 0, reset: 2000 })

      const pending = limiter.limit('key')
      await vi.advanceTimersByTimeAsync(200)

      expect(await pending).toEqual({ success: false, limit: 1, remaining: 0, reset: 2000 })
    })

    it('ignores the blocking option when disabled', async () => {
      const limiter = new MemoryRateLimiter({
        maxRequests: 1,
        window: 1000,
        blockingUntilReady: { enabled: false, timeout: 5000 },
      })

      expect(await limiter.limit('key')).toEqual({ success: true, limit: 1, remaining: 0, reset: 1000 })
      expect(await limiter.limit('key')).toEqual({ success: false, limit: 1, remaining: 0, reset: 1000 })
    })
  })

  describe('epoch rotation', () => {
    it('drops stale keys from memory when the epoch rotates', async () => {
      const limiter = new MemoryRateLimiter({ maxRequests: 5, window: 1000 })

      await limiter.limit('key1')
      await limiter.limit('key2')
      expect((limiter as any).current.size).toBe(2)

      await vi.advanceTimersByTimeAsync(1000)
      await limiter.limit('other') // triggers rotation
      expect((limiter as any).current.size).toBe(1) // only 'other' is in current
    })
  })
})
