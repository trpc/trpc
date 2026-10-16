import { promiseWithResolvers, sleep } from '@orpc/shared'
import { LockTimeoutError } from '../error'
import { MemoryLocker } from './memory'

describe('memoryLocker', () => {
  it('runs the callback right away when the lock is free and releases it afterwards', async () => {
    const locker = new MemoryLocker()
    const fn = vi.fn(() => 'ok')

    await expect(locker.lock('key', fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledExactlyOnceWith({ waited: false })

    await expect(locker.lock('key', () => 'again', { timeout: 0 })).resolves.toBe('again')
  })

  it('serves waiters in order once the holder releases', async () => {
    const locker = new MemoryLocker()
    const { promise: release, resolve } = promiseWithResolvers<void>()
    const order: string[] = []

    const first = locker.lock('key', async ({ waited }) => {
      order.push(`first:${waited}`)
      await release
      order.push('first:done')
      return 1
    })
    const second = locker.lock('key', ({ waited }) => {
      order.push(`second:${waited}`)
      return 2
    })
    const third = locker.lock('key', ({ waited }) => {
      order.push(`third:${waited}`)
      return 3
    })

    await sleep(10)
    expect(order).toEqual(['first:false'])

    resolve()

    await expect(Promise.all([first, second, third])).resolves.toEqual([1, 2, 3])
    expect(order).toEqual(['first:false', 'first:done', 'second:true', 'third:true'])
  })

  it('tracks locks independently per key', async () => {
    const locker = new MemoryLocker()
    const { promise: release, resolve } = promiseWithResolvers<void>()
    const holder = locker.lock('alice', () => release)
    const fn = vi.fn(() => 'bob')

    await expect(locker.lock('bob', fn, { timeout: 0 })).resolves.toBe('bob')
    expect(fn).toHaveBeenCalledWith({ waited: false })

    resolve()
    await holder
  })

  it('releases the lock when the callback throws', async () => {
    const locker = new MemoryLocker()

    await expect(locker.lock('key', () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')

    await expect(locker.lock('key', () => 'ok', { timeout: 0 })).resolves.toBe('ok')
  })

  it('never runs callbacks for the same key concurrently', async () => {
    const locker = new MemoryLocker()
    let active = 0
    let maxActive = 0
    let count = 0

    await Promise.all(Array.from({ length: 50 }, () => locker.lock('key', async () => {
      active++
      maxActive = Math.max(maxActive, active)
      const current = count
      await sleep(1)
      count = current + 1
      active--
    })))

    expect(maxActive).toBe(1)
    expect(count).toBe(50)
  })

  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('rejects with LockTimeoutError when the lock is not released in time', async () => {
      const locker = new MemoryLocker({ timeout: 1000 })
      const { promise: release, resolve } = promiseWithResolvers<void>()
      const holder = locker.lock('key', () => release)
      const fn = vi.fn()
      const waiter = locker.lock('key', fn)
      const settled = vi.fn()
      waiter.then(settled, settled)

      await vi.advanceTimersByTimeAsync(999)
      expect(settled).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      await expect(waiter).rejects.toBeInstanceOf(LockTimeoutError)
      await expect(waiter).rejects.toMatchObject({
        name: 'LockTimeoutError',
        key: 'key',
        message: 'Timed out waiting for the lock of key "key"',
      })
      expect(fn).not.toHaveBeenCalled()

      resolve()
      await holder
    })

    it('gives up immediately when timeout is 0', async () => {
      const locker = new MemoryLocker()
      const { promise: release, resolve } = promiseWithResolvers<void>()
      const holder = locker.lock('key', () => release)
      const fn = vi.fn()

      await expect(locker.lock('key', fn, { timeout: 0 })).rejects.toBeInstanceOf(LockTimeoutError)
      expect(fn).not.toHaveBeenCalled()

      resolve()
      await holder
    })

    it('per-call timeout overrides the default', async () => {
      const locker = new MemoryLocker({ timeout: 10_000 })
      const { promise: release, resolve } = promiseWithResolvers<void>()
      const holder = locker.lock('key', () => release)
      const waiter = locker.lock('key', vi.fn(), { timeout: 100 })
      waiter.catch(() => {})

      await vi.advanceTimersByTimeAsync(100)
      await expect(waiter).rejects.toBeInstanceOf(LockTimeoutError)

      resolve()
      await holder
    })

    it('still hands the lock over to later waiters after an earlier waiter timed out', async () => {
      const locker = new MemoryLocker({ timeout: 1000 })
      const { promise: release, resolve } = promiseWithResolvers<void>()
      const holder = locker.lock('key', () => release)
      const timedOut = locker.lock('key', vi.fn())
      timedOut.catch(() => {})

      await vi.advanceTimersByTimeAsync(1000)
      await expect(timedOut).rejects.toBeInstanceOf(LockTimeoutError)

      const fn = vi.fn(() => 'ok')
      const waiter = locker.lock('key', fn)

      resolve()
      await holder

      await expect(waiter).resolves.toBe('ok')
      expect(fn).toHaveBeenCalledWith({ waited: true })
    })
  })

  describe('ttl', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('does not expire locks by default', async () => {
      const locker = new MemoryLocker()
      const { promise: release, resolve } = promiseWithResolvers<void>()
      const holder = locker.lock('key', () => release)
      const fn = vi.fn(() => 'ok')
      const waiter = locker.lock('key', fn, { timeout: 100_000 })

      await vi.advanceTimersByTimeAsync(60_000)
      expect(fn).not.toHaveBeenCalled()

      resolve()
      await holder
      await expect(waiter).resolves.toBe('ok')
      expect(fn).toHaveBeenCalledWith({ waited: true })
    })

    it('hands the lock over when the ttl expires', async () => {
      const locker = new MemoryLocker({ ttl: 1000 })
      const { promise: release, resolve } = promiseWithResolvers<void>()
      const holder = locker.lock('key', () => release)
      const fn = vi.fn(() => 'ok')
      const waiter = locker.lock('key', fn)

      await vi.advanceTimersByTimeAsync(999)
      expect(fn).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      await expect(waiter).resolves.toBe('ok')
      expect(fn).toHaveBeenCalledWith({ waited: true })

      resolve()
      await holder
    })

    it('expired holder cannot release the lock of the new holder', async () => {
      const locker = new MemoryLocker({ ttl: 1000 })
      const { promise: release1, resolve: resolve1 } = promiseWithResolvers<void>()
      const { promise: release2, resolve: resolve2 } = promiseWithResolvers<void>()
      const holder1 = locker.lock('key', () => release1)
      const holder2 = locker.lock('key', () => release2)

      await vi.advanceTimersByTimeAsync(1000) // holder1 expires, holder2 acquires

      resolve1()
      await holder1

      const fn = vi.fn(() => 'ok')
      const third = locker.lock('key', fn)

      await vi.advanceTimersByTimeAsync(0)
      expect(fn).not.toHaveBeenCalled()

      resolve2()
      await holder2
      await expect(third).resolves.toBe('ok')
      expect(fn).toHaveBeenCalledWith({ waited: true })
    })

    it('per-call ttl overrides the default', async () => {
      const locker = new MemoryLocker({ ttl: 10_000 })
      const { promise: release, resolve } = promiseWithResolvers<void>()
      const holder = locker.lock('key', () => release, { ttl: 100 })
      const fn = vi.fn(() => 'ok')
      const waiter = locker.lock('key', fn)

      await vi.advanceTimersByTimeAsync(100)
      await expect(waiter).resolves.toBe('ok')
      expect(fn).toHaveBeenCalledWith({ waited: true })

      resolve()
      await holder
    })
  })

  describe('signal', () => {
    it('stops waiting when the signal is aborted', async () => {
      const locker = new MemoryLocker()
      const { promise: release, resolve } = promiseWithResolvers<void>()
      const holder = locker.lock('key', () => release)
      const controller = new AbortController()
      const fn = vi.fn()
      const waiter = locker.lock('key', fn, { signal: controller.signal })

      controller.abort(new Error('aborted'))

      await expect(waiter).rejects.toThrow('aborted')
      expect(fn).not.toHaveBeenCalled()

      resolve()
      await holder
    })

    it('rejects immediately when the signal is already aborted', async () => {
      const locker = new MemoryLocker()
      const controller = new AbortController()
      controller.abort(new Error('aborted'))
      const fn = vi.fn()

      await expect(locker.lock('key', fn, { signal: controller.signal })).rejects.toThrow('aborted')
      expect(fn).not.toHaveBeenCalled()

      await expect(locker.lock('key', () => 'ok', { timeout: 0 })).resolves.toBe('ok')
    })

    it('ignores the signal once the lock is acquired', async () => {
      const locker = new MemoryLocker()
      const controller = new AbortController()

      await expect(locker.lock('key', async () => {
        controller.abort()
        await sleep(1)
        return 'ok'
      }, { signal: controller.signal })).resolves.toBe('ok')
    })
  })
})
