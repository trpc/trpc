import type { Locker, LockOptions } from '@orpc/experimental-lock'
import { LockTimeoutError } from '@orpc/experimental-lock'
import { promiseWithResolvers, sleep } from '@orpc/shared'
import { RedisClient } from 'bun'
import { afterAll, beforeAll, describe, expect, it, vi } from 'bun:test'
import { experimental_BunRedisLocker as BunRedisLocker } from './redis-lock'

const REDIS_URL = Bun.env.REDIS_URL

describe.skipIf(!REDIS_URL)('bun redis locker integration', async () => {
  const redis = new RedisClient(REDIS_URL)

  beforeAll(async () => {
    await redis.connect()
  })

  afterAll(async () => {
    redis.close()
  })

  function createTestingLocker(
    options: Partial<ConstructorParameters<typeof BunRedisLocker>[1]> = {},
  ) {
    const prefix = options.prefix ?? `orpc-bun-redis-locker-${crypto.randomUUID()}:`

    return {
      prefix,
      locker: new BunRedisLocker(redis, {
        ttl: 10_000,
        retryInterval: 10,
        ...options,
        prefix,
      }),
    }
  }

  /**
   * Holds the lock until `release` is called, and resolves once the callback is running.
   */
  async function hold(locker: Locker, key: string, options?: LockOptions) {
    const started = promiseWithResolvers<void>()
    const finished = promiseWithResolvers<void>()
    const done = locker.lock(key, async ({ waited }) => {
      started.resolve()
      await finished.promise
      return waited
    }, options)

    await Promise.race([started.promise, done])

    return {
      release: () => {
        finished.resolve()
        return done
      },
    }
  }

  it('runs the callback right away when the lock is free and releases it afterwards', async () => {
    const { locker } = createTestingLocker()
    const fn = vi.fn(() => 'ok')

    await expect(locker.lock('key', fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith({ waited: false })

    await expect(locker.lock('key', () => 'again', { timeout: 0 })).resolves.toBe('again')
  }, { timeout: 20_000 })

  it('makes callers wait until the holder releases, across instances', async () => {
    const key = `orpc-bun-redis-locker-${crypto.randomUUID()}`
    const locker = new BunRedisLocker(redis, { ttl: 10_000 })
    const other = new BunRedisLocker(redis, { ttl: 10_000 })
    const holder = await hold(locker, key)
    const fn = vi.fn(() => 'ok')
    const waiter = other.lock(key, fn)

    // Commands on one client run in order, so the waiter's first attempt was rejected as well
    await expect(other.lock(key, () => 'never', { timeout: 0 })).rejects.toBeInstanceOf(LockTimeoutError)

    await holder.release()
    await expect(waiter).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith({ waited: true })
  }, { timeout: 20_000 })

  it('tracks locks independently per key', async () => {
    const { locker } = createTestingLocker()
    const holder = await hold(locker, 'alice')
    const fn = vi.fn(() => 'bob')

    await expect(locker.lock('bob', fn, { timeout: 0 })).resolves.toBe('bob')
    expect(fn).toHaveBeenCalledWith({ waited: false })

    await holder.release()
  }, { timeout: 20_000 })

  it('releases the lock when the callback throws', async () => {
    const { locker } = createTestingLocker()

    await expect(locker.lock('key', () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')

    await expect(locker.lock('key', () => 'ok', { timeout: 0 })).resolves.toBe('ok')
  }, { timeout: 20_000 })

  it('rejects with LockTimeoutError when the lock is not released in time', async () => {
    const { locker } = createTestingLocker({ timeout: 200 })
    const holder = await hold(locker, 'key')
    const fn = vi.fn()
    const start = Date.now()

    await expect(locker.lock('key', fn)).rejects.toMatchObject({
      name: 'LockTimeoutError',
      key: 'key',
      message: 'Timed out waiting for the lock of key "key"',
    })
    expect(Date.now() - start).toBeGreaterThanOrEqual(200)
    expect(fn).not.toHaveBeenCalled()

    await holder.release()
  }, { timeout: 20_000 })

  it('hands the lock over when the ttl expires, and the expired holder cannot release it', async () => {
    const { locker } = createTestingLocker({ ttl: 200 })
    const expired = await hold(locker, 'key')
    const next = await hold(locker, 'key', { ttl: 10_000 })

    await expired.release()
    await expect(locker.lock('key', () => 'never', { timeout: 0 })).rejects.toBeInstanceOf(LockTimeoutError)

    await next.release()
    await expect(locker.lock('key', () => 'ok', { timeout: 0 })).resolves.toBe('ok')
  }, { timeout: 20_000 })

  it('stops waiting when the signal is aborted', async () => {
    const { locker } = createTestingLocker()
    const holder = await hold(locker, 'key')
    const controller = new AbortController()
    const fn = vi.fn()
    const waiter = locker.lock('key', fn, { signal: controller.signal })

    controller.abort(new Error('aborted'))

    await expect(waiter).rejects.toThrow('aborted')
    await expect(locker.lock('key', fn, { signal: controller.signal })).rejects.toThrow('aborted')
    expect(fn).not.toHaveBeenCalled()

    await holder.release()
  }, { timeout: 20_000 })

  it('never runs callbacks for the same key concurrently', async () => {
    const { locker } = createTestingLocker()
    let active = 0
    let maxActive = 0
    let count = 0

    await Promise.all(Array.from({ length: 5 }, () => locker.lock('key', async () => {
      active++
      maxActive = Math.max(maxActive, active)
      const current = count
      await sleep(5)
      count = current + 1
      active--
    })))

    expect(maxActive).toBe(1)
    expect(count).toBe(5)
  }, { timeout: 20_000 })
})
