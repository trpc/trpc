import type { Locker, LockOptions } from '../types'
import { promiseWithResolvers, sleep } from '@orpc/shared'
import { createClient } from 'redis'
import { LockTimeoutError } from '../error'
import { RedisLocker } from './redis'

const REDIS_URL = process.env.REDIS_URL

describe.concurrent('redis locker integration', {
  skip: !REDIS_URL,
  timeout: 20_000,
}, () => {
  const redis = createClient({
    url: REDIS_URL,
  })

  beforeAll(async () => {
    await redis.connect()
  })

  function createTestingLocker(
    { useRedis = redis, ...options }: Partial<ConstructorParameters<typeof RedisLocker>[1]> & { useRedis?: typeof redis } = {},
  ) {
    const prefix = options.prefix ?? `orpc-redis-locker-${crypto.randomUUID()}:`

    return {
      prefix,
      locker: new RedisLocker(useRedis, {
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
    expect(fn).toHaveBeenCalledExactlyOnceWith({ waited: false })

    await expect(locker.lock('key', () => 'again', { timeout: 0 })).resolves.toBe('again')
  })

  it('makes callers wait until the holder releases, across instances', async () => {
    const key = `orpc-redis-locker-${crypto.randomUUID()}`
    const locker = new RedisLocker(redis, { ttl: 10_000 })
    const other = new RedisLocker(redis, { ttl: 10_000 })
    const holder = await hold(locker, key)
    const fn = vi.fn(() => 'ok')
    const waiter = other.lock(key, fn)

    // Commands on one client run in order, so the waiter's first attempt was rejected as well
    await expect(other.lock(key, () => 'never', { timeout: 0 })).rejects.toBeInstanceOf(LockTimeoutError)

    await holder.release()
    await expect(waiter).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledExactlyOnceWith({ waited: true })
  })

  it('tracks locks independently per key', async () => {
    const { locker } = createTestingLocker()
    const holder = await hold(locker, 'alice')
    const fn = vi.fn(() => 'bob')

    await expect(locker.lock('bob', fn, { timeout: 0 })).resolves.toBe('bob')
    expect(fn).toHaveBeenCalledWith({ waited: false })

    await holder.release()
  })

  it('releases the lock when the callback throws', async () => {
    const { locker } = createTestingLocker()

    await expect(locker.lock('key', () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')

    await expect(locker.lock('key', () => 'ok', { timeout: 0 })).resolves.toBe('ok')
  })

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
  })

  it('hands the lock over when the ttl expires, and the expired holder cannot release it', async () => {
    const { locker } = createTestingLocker({ ttl: 200 })
    const expired = await hold(locker, 'key')
    const next = await hold(locker, 'key', { ttl: 10_000 })

    await expired.release()
    await expect(locker.lock('key', () => 'never', { timeout: 0 })).rejects.toBeInstanceOf(LockTimeoutError)

    await next.release()
    await expect(locker.lock('key', () => 'ok', { timeout: 0 })).resolves.toBe('ok')
  })

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
  })

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
  })

  it('connects lazily and only once under concurrent lock calls', async () => {
    const redis = createClient({
      url: REDIS_URL,
    })
    const { locker } = createTestingLocker({ useRedis: redis })

    expect(redis.isOpen).toBe(false)

    await expect(Promise.all([
      locker.lock('a', () => 'a'),
      locker.lock('b', () => 'b'),
      locker.lock('c', () => 'c'),
    ])).resolves.toEqual(['a', 'b', 'c'])

    expect(redis.isOpen).toBe(true)
  })
})
