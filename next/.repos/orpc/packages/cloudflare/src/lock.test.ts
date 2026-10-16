import type { LockOptions } from '@orpc/experimental-lock'
import { LockTimeoutError } from '@orpc/experimental-lock'
import { promiseWithResolvers, sleep } from '@orpc/shared'
import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { experimental_DurableLocker as DurableLocker } from './lock'

describe('durableLocker', () => {
  function createTestingLocker(
    options: Partial<ConstructorParameters<typeof DurableLocker>[1]> = {},
  ) {
    const prefix = options.prefix ?? `orpc-durable-locker-${crypto.randomUUID()}:`

    return {
      prefix,
      locker: new DurableLocker(env.LOCK_DON, {
        ttl: 10_000,
        ...options,
        prefix,
      }),
    }
  }

  /**
   * Holds the lock until `release` is called, and resolves once the callback is running.
   * `release` resolves with whether the lock was acquired only after waiting.
   */
  async function hold(locker: DurableLocker, key = 'key', options?: LockOptions) {
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

  async function waitForSockets(prefix: string, count: number) {
    await vi.waitFor(async () => {
      const open = await runInDurableObject(
        env.LOCK_DON.getByName(`${prefix}key`),
        (_, ctx) => ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN).length,
      )

      expect(open).toBe(count)
    }, { interval: 10 })
  }

  it('runs the callback immediately when the lock is free and releases afterwards', async () => {
    const { locker } = createTestingLocker()
    const fn = vi.fn(async () => {
      await expect(locker.lock('key', () => 'never', { timeout: 0 })).rejects.toBeInstanceOf(LockTimeoutError)
      return 'ok'
    })

    await expect(locker.lock('key', fn)).resolves.toBe('ok')

    expect(fn).toHaveBeenCalledExactlyOnceWith({ waited: false })
    await vi.waitFor(() => expect(locker.lock('key', () => 'again', { timeout: 0 })).resolves.toBe('again'))
  })

  it('waits for the holder to release', async () => {
    const { prefix, locker } = createTestingLocker()
    const holder = await hold(locker)
    const fn = vi.fn(({ waited }) => waited)
    const waiter = locker.lock('key', fn)

    await waitForSockets(prefix, 2)
    expect(fn).not.toHaveBeenCalled()

    await expect(holder.release()).resolves.toBe(false)
    await expect(waiter).resolves.toBe(true)
  })

  it('shares locks across instances using the same prefix', async () => {
    const { prefix, locker } = createTestingLocker()
    const { locker: other } = createTestingLocker({ prefix })
    const holder = await hold(locker)

    await expect(other.lock('key', () => 'never', { timeout: 0 })).rejects.toBeInstanceOf(LockTimeoutError)

    await holder.release()
    await expect(other.lock('key', () => 'ok')).resolves.toBe('ok')
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

    await vi.waitFor(() => expect(locker.lock('key', () => 'ok', { timeout: 0 })).resolves.toBe('ok'))
  })

  it.each([
    {
      case: 'gives up immediately',
      attempt: (locker: DurableLocker, fn: () => unknown) => locker.lock('key', fn, { timeout: 0 }),
      rejection: { name: 'LockTimeoutError', key: 'key', message: 'Timed out waiting for the lock of key "key"' },
      minWait: 0,
    },
    {
      case: 'times out while waiting',
      attempt: (locker: DurableLocker, fn: () => unknown) => locker.lock('key', fn, { timeout: 200 }),
      rejection: { name: 'LockTimeoutError', key: 'key' },
      minWait: 150,
    },
    {
      case: 'is aborted while waiting',
      attempt: (locker: DurableLocker, fn: () => unknown) => {
        const controller = new AbortController()
        setTimeout(() => controller.abort(new Error('aborted')), 50)

        return locker.lock('key', fn, { signal: controller.signal })
      },
      rejection: { message: 'aborted' },
      minWait: 50,
    },
  ])('releases the socket of a waiter that $case, so the next waiter still gets the lock', async ({ attempt, rejection, minWait }) => {
    const { prefix, locker } = createTestingLocker()
    const holder = await hold(locker)
    const fn = vi.fn()
    const start = Date.now()

    await expect(attempt(locker, fn)).rejects.toMatchObject(rejection)
    expect(Date.now() - start).toBeGreaterThanOrEqual(minWait)
    expect(fn).not.toHaveBeenCalled()
    await waitForSockets(prefix, 1)

    const waiter = locker.lock('key', ({ waited }) => waited, { timeout: 1000 })

    await waitForSockets(prefix, 2)
    await holder.release()
    await expect(waiter).resolves.toBe(true)
  })

  it('hands the lock over when the ttl expires, and the expired holder cannot release it', async () => {
    const { locker } = createTestingLocker({ ttl: 200 })
    const expired = await hold(locker)
    const next = await hold(locker, 'key', { ttl: 10_000 })

    await expect(expired.release()).resolves.toBe(false)
    await expect(locker.lock('key', () => 'never', { timeout: 0 })).rejects.toBeInstanceOf(LockTimeoutError)

    await expect(next.release()).resolves.toBe(true)
    await vi.waitFor(() => expect(locker.lock('key', () => 'again', { timeout: 0 })).resolves.toBe('again'))
  })

  it('releases the lock when the ttl expires while the callback is still running', async () => {
    const { locker } = createTestingLocker({ ttl: 100 })

    await expect(locker.lock('key', async () => {
      await sleep(300)
      return 'ok'
    })).resolves.toBe('ok')

    await vi.waitFor(() => expect(locker.lock('key', () => 'again', { timeout: 0 })).resolves.toBe('again'))
  })

  it('makes one request per lock and never polls', async () => {
    const fetch = vi.fn()
    const getStubByName = vi.fn((namespace, key) => {
      const stub = namespace.getByName(key)

      return {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          fetch()
          return stub.fetch(input, init)
        },
      } as unknown as DurableObjectStub
    })
    const { prefix, locker } = createTestingLocker({ getStubByName })
    const holder = await hold(locker)
    const waiter = locker.lock('key', ({ waited }) => waited)

    await waitForSockets(prefix, 2)
    await sleep(300)
    expect(fetch).toHaveBeenCalledTimes(2)

    await holder.release()
    await expect(waiter).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws when the object does not return a socket', async () => {
    const getStubByName = vi.fn(() => ({
      fetch: async () => new Response(null, { status: 500, statusText: 'Internal Server Error' }),
    }) as unknown as DurableObjectStub)
    const { locker } = createTestingLocker({ getStubByName })
    const fn = vi.fn()

    await expect(locker.lock('key', fn)).rejects.toThrow('Failed to acquire the lock: 500 Internal Server Error')
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects a waiter whose socket the object closes before handing the lock over', async () => {
    const { prefix, locker } = createTestingLocker()
    const holder = await hold(locker)
    const fn = vi.fn()
    // Assert before closing the socket, so the rejection never sits unobserved
    const rejected = expect(locker.lock('key', fn)).rejects.toThrow('The lock durable object closed the socket before handing the lock over')

    await waitForSockets(prefix, 2)
    await runInDurableObject(env.LOCK_DON.getByName(`${prefix}key`), (_, ctx) => {
      ctx.getWebSockets()[0]!.close() // newest first, so the parked waiter
    })

    await rejected
    expect(fn).not.toHaveBeenCalled()

    await holder.release()
  })

  it('uses no prefix when none is provided', async () => {
    const locker = new DurableLocker(env.LOCK_DON, { ttl: 10_000 })
    const key = `no-prefix-${crypto.randomUUID()}`

    await expect(locker.lock(key, ({ waited }) => waited)).resolves.toBe(false)
  })
  it('names the Durable Object after the prefixed key', async () => {
    const getStubByName = vi.fn((namespace, key) => namespace.getByName(key))
    const { prefix, locker } = createTestingLocker({ getStubByName })

    await expect(locker.lock('key', () => 'ok')).resolves.toBe('ok')

    expect(getStubByName).toHaveBeenCalledWith(env.LOCK_DON, `${prefix}key`)
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
