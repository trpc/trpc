import type { Locker, LockOptions } from '../types'
import { promiseWithResolvers, sleep } from '@orpc/shared'
import { Redis } from '@upstash/redis'
import { LockTimeoutError } from '../error'
import { UpstashLocker } from './upstash'

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

/**
 * These tests depend on a real Upstash redis server — make sure to set the
 * `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` envs.
 * When writing new tests, always use unique keys to avoid conflicts with other
 * test cases.
 */
describe.concurrent('upstash locker integration', {
  skip: !UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN,
  timeout: 20_000,
}, () => {
  const redis = new Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN,
  })

  function createTestingLocker(
    options: Partial<ConstructorParameters<typeof UpstashLocker>[1]> = {},
  ) {
    const prefix = options.prefix ?? `orpc-upstash-locker-${crypto.randomUUID()}:`

    return {
      prefix,
      locker: new UpstashLocker(redis, {
        ttl: 10_000,
        retryInterval: 50,
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
    const key = `orpc-upstash-locker-${crypto.randomUUID()}`
    const locker = new UpstashLocker(redis, { ttl: 10_000 })
    const other = new UpstashLocker(redis, { ttl: 10_000 })
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
})
