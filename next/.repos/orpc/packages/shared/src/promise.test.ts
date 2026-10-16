import { AsyncLocalStorage } from 'node:async_hooks'
import { captureAsyncContext, promiseWithResolvers } from './promise'

describe('promiseWithResolvers', () => {
  it('resolves the promise', async () => {
    const { promise, resolve } = promiseWithResolvers<number>()

    resolve(123)

    await expect(promise).resolves.toBe(123)
  })

  it('rejects the promise', async () => {
    const { promise, reject } = promiseWithResolvers<number>()

    reject(new Error('test'))

    await expect(promise).rejects.toThrow('test')
  })

  it('returns promise, resolve, and reject', () => {
    const result = promiseWithResolvers<number>()

    expect(result.promise).toBeInstanceOf(Promise)
    expect(result.resolve).toBeTypeOf('function')
    expect(result.reject).toBeTypeOf('function')
  })

  it('can resolve with undefined', async () => {
    const { promise, resolve } = promiseWithResolvers<void>()

    resolve(undefined)

    await expect(promise).resolves.toBeUndefined()
  })

  it('uses the first settlement when resolved then rejected', async () => {
    const { promise, resolve, reject } = promiseWithResolvers<number>()

    resolve(123)
    reject(new Error('ignored'))

    await expect(promise).resolves.toBe(123)
  })

  it('uses the first settlement when rejected then resolved', async () => {
    const { promise, resolve, reject } = promiseWithResolvers<number>()

    reject(new Error('test'))
    resolve(123)

    await expect(promise).rejects.toThrow('test')
  })
})

describe('captureAsyncContext', () => {
  const storage = new AsyncLocalStorage<string>()

  it('runs the callback in the captured async context', async () => {
    const run = storage.run('captured', () => captureAsyncContext())

    await storage.run('current', async () => {
      await expect(run(async () => storage.getStore())).resolves.toBe('captured')
    })
  })

  it('rejects when called more than once', async () => {
    const run = captureAsyncContext()
    const second = vi.fn(async () => 2)

    await expect(run(async () => 1)).resolves.toBe(1)
    await expect(run(second)).rejects.toThrow('A captured async context can be run only once.')
    expect(second).not.toHaveBeenCalled()
  })

  it('rejects when the callback rejects', async () => {
    const run = captureAsyncContext()

    await expect(run(async () => {
      throw new Error('test')
    })).rejects.toThrow('test')
  })
})
