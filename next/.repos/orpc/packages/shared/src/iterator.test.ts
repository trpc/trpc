import { AsyncLocalStorage } from 'node:async_hooks'
import { AsyncIteratorClass, sleep } from '@standard-server/shared'
import { consumeAsyncIterator, replicateAsyncIterator, traceAsyncIterator, wrapAsyncIterator } from './iterator'
import { promiseWithResolvers } from './promise'
import * as Tracing from './tracing'

const runInSpanContextSpy = vi.spyOn(Tracing, 'runInSpanContext')
const startSpanSpy = vi.spyOn(Tracing, 'startSpan')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('wrapAsyncIterator', () => {
  it('runs next calls inside runWith, maps results, and finishes once after completion', async () => {
    const calls: string[] = []
    const stores: string[] = []
    const storage = new AsyncLocalStorage<string>()
    let step = 0
    let finishCount = 0
    let returnCount = 0

    const iterator: AsyncIterator<number, number> = {
      async next() {
        calls.push(`next:${step}`)
        stores.push(storage.getStore() ?? 'missing')

        if (step === 0) {
          step += 1
          return { done: false as const, value: 1 }
        }

        step += 1
        return { done: true as const, value: 2 }
      },
      async return() {
        returnCount += 1
        calls.push('return')
        return { done: true as const, value: 99 }
      },
    }

    const wrapped = wrapAsyncIterator(iterator, {
      runWith: run => storage.run('iterator-context', run),
      mapResult: (result) => {
        calls.push(`map:${result.done ? 'done' : 'yield'}`)
        return { done: result.done, value: `mapped:${result.value}` }
      },
      onFinish: () => {
        finishCount += 1
        calls.push('finish')
      },
    })

    expect(await wrapped.next()).toEqual({ done: false, value: 'mapped:1' })
    expect(await wrapped.next()).toEqual({ done: true, value: 'mapped:2' })
    expect(await wrapped.next()).toEqual({ done: true, value: undefined })

    expect(calls).toEqual([
      'next:0',
      'map:yield',
      'next:1',
      'map:done',
      'finish',
    ])
    expect(stores).toEqual(['iterator-context', 'iterator-context'])
    expect(returnCount).toBe(0)
    expect(finishCount).toBe(1)
  })

  it('maps next errors and finishes without cancelling a failed iterator', async () => {
    let returnCount = 0
    let finishCount = 0
    const seen: string[] = []

    const iterator: AsyncIterator<number, void> = {
      async next() {
        throw new Error('next failed')
      },
      async return() {
        returnCount += 1
        return { done: true as const, value: undefined }
      },
    }

    const wrapped = wrapAsyncIterator(iterator, {
      onError: (error) => {
        seen.push((error as Error).message)
      },
      mapError: error => new TypeError(`mapped:${(error as Error).message}`),
      onFinish: () => {
        finishCount += 1
      },
    })

    await expect(wrapped.next()).rejects.toThrow('mapped:next failed')
    expect(seen).toEqual(['next failed'])
    expect(returnCount).toBe(0)
    expect(finishCount).toBe(1)
  })

  it('cancels unfinished iterators when returned early', async () => {
    const calls: string[] = []

    const iterator: AsyncIterator<number, string> = {
      async next() {
        calls.push('next')
        return { done: false as const, value: 1 }
      },
      async return() {
        calls.push('return')
        return { done: true as const, value: 'inner' }
      },
    }

    const wrapped = wrapAsyncIterator(iterator, {})

    expect(await wrapped.next()).toEqual({ done: false, value: 1 })
    expect(await wrapped.return('outer')).toEqual({ done: true, value: 'outer' })
    expect(calls).toEqual(['next', 'return'])
  })

  it('propagates cleanup errors after reporting them and still finishes', async () => {
    const calls: string[] = []
    const storage = new AsyncLocalStorage<string>()
    let finishCount = 0
    let cleanupStore: string | undefined

    const iterator: AsyncIterator<number, void> = {
      async next() {
        calls.push('next')
        return { done: false as const, value: 1 }
      },
      async return() {
        cleanupStore = storage.getStore()
        calls.push('return')
        throw new Error('cleanup failed')
      },
    }

    const wrapped = wrapAsyncIterator(iterator, {
      runWith: run => storage.run('cleanup-context', run),
      onError: (error) => {
        calls.push(`error:${(error as Error).message}`)
      },
      onFinish: () => {
        finishCount += 1
        calls.push('finish')
      },
    })

    expect(await wrapped.next()).toEqual({ done: false, value: 1 })
    await expect(wrapped.return()).rejects.toThrow('cleanup failed')

    expect(calls).toEqual([
      'next',
      'return',
      'error:cleanup failed',
      'finish',
    ])
    expect(cleanupStore).toBe('cleanup-context')
    expect(finishCount).toBe(1)
  })

  it('rethrows mapping errors and closes the source iterator when mapping fails', async () => {
    const calls: string[] = []
    let finishCount = 0

    const iterator: AsyncIterator<number, void> = {
      async next() {
        calls.push('next')
        return { done: false as const, value: 1 }
      },
      async return() {
        calls.push('return')
        return { done: true as const, value: undefined }
      },
    }

    const wrapped = wrapAsyncIterator(iterator, {
      mapResult: () => {
        calls.push('map')
        throw new Error('map failed')
      },
      onFinish: () => {
        finishCount += 1
        calls.push('finish')
      },
    })

    await expect(wrapped.next()).rejects.toThrow('map failed')
    expect(calls).toEqual(['next', 'map', 'return', 'finish'])
    expect(finishCount).toBe(1)
  })
})

describe('traceAsyncIterator', () => {
  it('when success', async () => {
    const iterator = (async function* () {
      yield 1
      yield 2
    }())

    const withSpan = traceAsyncIterator('name', iterator)

    expect(await withSpan.next()).toEqual({ done: false, value: 1 })
    expect(await withSpan.next()).toEqual({ done: false, value: 2 })
    expect(await withSpan.next()).toEqual({ done: true, value: undefined })

    expect(startSpanSpy).toHaveBeenCalledTimes(1)
    expect(startSpanSpy).toHaveBeenCalledWith('name')

    expect(runInSpanContextSpy).toHaveBeenCalledTimes(3)
  })

  it('when cancelled', async () => {
    let cleanup = false

    const iterator = (async function* () {
      try {
        yield 1
        yield 2
      }
      finally {
        cleanup = true
      }
    }())

    const withSpan = traceAsyncIterator({ name: 'name' }, iterator)

    expect(await withSpan.next()).toEqual({ done: false, value: 1 })
    expect(await withSpan.return()).toEqual({ done: true, value: undefined })
    expect(cleanup).toBe(true)
    expect(runInSpanContextSpy).toHaveBeenCalledTimes(2)
  })

  it('when error while yielding', async () => {
    const iterator = (async function* () {
      throw new Error('Forced error')
    }())

    const withSpan = traceAsyncIterator({ name: 'name' }, iterator)

    await expect(withSpan.next()).rejects.toThrow('Forced error')
    expect(runInSpanContextSpy).toHaveBeenCalledTimes(1)
  })

  it('on error while cleanup', async () => {
    const iterator = (async function* () {
      try {
        yield 1
      }
      finally {
        // eslint-disable-next-line no-unsafe-finally
        throw new Error('Forced error')
      }
    }())

    const withSpan = traceAsyncIterator({ name: 'name' }, iterator)

    await expect(withSpan.next()).resolves.toEqual({ done: false, value: 1 })
    await expect(withSpan.return()).rejects.toThrow('Forced error')
    expect(runInSpanContextSpy).toHaveBeenCalledTimes(2)
  })

  it('can be cancelled while an iteration is pending', async () => {
    const cleanup = vi.fn()
    const pull = promiseWithResolvers<void>()
    const iterator = new AsyncIteratorClass(
      async () => {
        await pull.promise
        return { done: true, value: 'done' }
      },
      cleanup,
    )

    const withSpan = traceAsyncIterator({ name: 'name' }, iterator)

    const nextPromise = withSpan.next()
    await sleep(10)
    await withSpan.return() // would hang if it waited for the pending pull

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith({ kind: 'cancelled' })

    pull.resolve()
    await expect(nextPromise).resolves.toEqual({ done: true, value: undefined })
  })
})

describe('replicateAsyncIterator', async () => {
  it('on success', async () => {
    const gen = async function* () {
      yield 1
      await new Promise(resolve => setTimeout(resolve, 10))
      yield 2
      yield 3
      return 4
    }

    const iterators = replicateAsyncIterator(gen(), 3)

    expect(iterators.length).toBe(3)

    await Promise.all([
      expect(iterators[0]!.next()).resolves.toEqual({ done: false, value: 1 }),
      expect(iterators[1]!.next()).resolves.toEqual({ done: false, value: 1 }),
    ])

    expect(await iterators[0]!.next()).toEqual({ done: false, value: 2 })
    expect(await iterators[1]!.next()).toEqual({ done: false, value: 2 })

    expect(await iterators[0]!.next()).toEqual({ done: false, value: 3 })
    expect(await iterators[1]!.next()).toEqual({ done: false, value: 3 })
    expect(await iterators[2]!.next()).toEqual({ done: false, value: 1 })

    expect(await iterators[0]!.next()).toEqual({ done: true, value: 4 })
    expect(await iterators[1]!.next()).toEqual({ done: true, value: 4 })
    expect(await iterators[2]!.next()).toEqual({ done: false, value: 2 })

    expect(await iterators[0]!.next()).toEqual({ done: true, value: undefined })
    expect(await iterators[1]!.next()).toEqual({ done: true, value: undefined })
    expect(await iterators[2]!.next()).toEqual({ done: false, value: 3 })

    expect(await iterators[0]!.next()).toEqual({ done: true, value: undefined })
    expect(await iterators[1]!.next()).toEqual({ done: true, value: undefined })
    expect(await iterators[2]!.next()).toEqual({ done: true, value: 4 })

    expect(await iterators[0]!.next()).toEqual({ done: true, value: undefined })
    expect(await iterators[1]!.next()).toEqual({ done: true, value: undefined })
    expect(await iterators[2]!.next()).toEqual({ done: true, value: undefined })
  })

  it('on error', { repeats: 10 }, async () => {
    const error = new Error('Something went wrong')

    const gen = async function* () {
      yield 1
      await new Promise(resolve => setTimeout(resolve, 10))
      throw error
    }

    const iterators = replicateAsyncIterator(gen(), 3)

    expect(iterators.length).toBe(3)

    expect(await iterators[0]!.next()).toEqual({ done: false, value: 1 })
    expect(await iterators[1]!.next()).toEqual({ done: false, value: 1 })

    await Promise.all([
      expect(iterators[0]!.next()).rejects.toThrow(error),
      expect(iterators[1]!.next()).rejects.toThrow(error),
    ])

    expect(await iterators[0]!.next()).toEqual({ done: true, value: undefined })
    expect(await iterators[1]!.next()).toEqual({ done: true, value: undefined })
    expect(await iterators[2]!.next()).toEqual({ done: false, value: 1 })

    expect(await iterators[0]!.next()).toEqual({ done: true, value: undefined })
    expect(await iterators[1]!.next()).toEqual({ done: true, value: undefined })
    await expect(iterators[2]!.next()).rejects.toThrow(error)
  })

  it('on manual close', async () => {
    let cleanup = false

    const gen = async function* () {
      try {
        yield 1
        await new Promise(resolve => setTimeout(resolve, 10))
        yield 2
        await new Promise(resolve => setTimeout(resolve, 10))
        yield 3
        await new Promise(resolve => setTimeout(resolve, Number.MIN_SAFE_INTEGER))
        return 4
      }
      finally {
        cleanup = true
      }
    }

    const iterators = replicateAsyncIterator(gen(), 3)

    expect(iterators.length).toBe(3)
    expect(await iterators[0]!.next()).toEqual({ done: false, value: 1 })

    expect(await iterators[0]!.return()).toEqual({ done: true, value: undefined })
    expect(cleanup).toBe(false)

    expect(await iterators[0]!.next()).toEqual({ done: true, value: undefined })
    expect(await iterators[1]!.next()).toEqual({ done: false, value: 1 })

    expect(await iterators[1]!.return()).toEqual({ done: true, value: undefined })
    expect(cleanup).toBe(false)
    expect(await iterators[2]!.return()).toEqual({ done: true, value: undefined })
    expect(cleanup).toBe(true)
  })
})

describe('consumeAsyncIterator', () => {
  it('on success', async () => {
    const iterator = (async function* () {
      yield 1
      yield 2
      return 3
    }())

    const onEvent = vi.fn()
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const onFinish = vi.fn()

    void consumeAsyncIterator(iterator, {
      onEvent,
      onError,
      onSuccess,
      onFinish,
    })

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledTimes(2)
      expect(onEvent).toHaveBeenNthCalledWith(1, 1)
      expect(onEvent).toHaveBeenNthCalledWith(2, 2)

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSuccess).toHaveBeenNthCalledWith(1, 3)
      expect(onFinish).toHaveBeenCalledTimes(1)
      expect(onFinish).toHaveBeenNthCalledWith(1, [null, 3, true])

      expect(onError).toHaveBeenCalledTimes(0)
    })
  })

  it('on error', async () => {
    const error = new Error('TEST')
    const iterator = (async function* () {
      yield 1
      yield 2
      throw error
    }())

    const onEvent = vi.fn()
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const onFinish = vi.fn()

    void consumeAsyncIterator(iterator, {
      onEvent,
      onError,
      onSuccess,
      onFinish,
    })

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledTimes(2)
      expect(onEvent).toHaveBeenNthCalledWith(1, 1)
      expect(onEvent).toHaveBeenNthCalledWith(2, 2)

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenNthCalledWith(1, error)

      expect(onFinish).toHaveBeenCalledTimes(1)
      expect(onFinish).toHaveBeenNthCalledWith(1, [error, undefined, false])

      expect(onSuccess).toHaveBeenCalledTimes(0)
    })
  })

  it('closes the iterator when onEvent throws', async () => {
    const error = new Error('TEST')
    let cleanup = false
    const iterator = (async function* () {
      try {
        yield 1
        yield 2
        return 3
      }
      finally {
        cleanup = true
      }
    }())

    const onEvent = vi.fn(() => {
      throw error
    })
    const onError = vi.fn()
    const onSuccess = vi.fn()
    let cleanupBeforeFinish: boolean | undefined
    const onFinish = vi.fn(() => {
      cleanupBeforeFinish = cleanup
    })

    void consumeAsyncIterator(iterator, {
      onEvent,
      onError,
      onSuccess,
      onFinish,
    })

    await vi.waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1)
    })

    expect(cleanupBeforeFinish).toBe(true)
    expect(onFinish).toHaveBeenNthCalledWith(1, [error, undefined, false])

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenNthCalledWith(1, 1)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenNthCalledWith(1, error)

    expect(onSuccess).toHaveBeenCalledTimes(0)
  })

  it('reports the return error when closing the iterator fails', async () => {
    const returnError = new Error('RETURN')
    const iterator: AsyncIterator<number> = {
      next: async () => ({ done: false, value: 1 }),
      return: vi.fn(async () => {
        throw returnError
      }),
    }

    const onError = vi.fn()
    const onFinish = vi.fn()

    void consumeAsyncIterator(iterator, {
      onEvent: () => {
        throw new Error('TEST')
      },
      onError,
      onFinish,
    })

    await vi.waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1)
    })

    expect(iterator.return).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenNthCalledWith(1, returnError)
    expect(onFinish).toHaveBeenNthCalledWith(1, [returnError, undefined, false])
  })

  it('unsubscribe', async () => {
    let cleanup = false
    const iterator = (async function* () {
      try {
        await new Promise(resolve => setTimeout(resolve, 10))
        yield 1
        yield 2
        return 3
      }
      finally {
        cleanup = true
      }
    }())

    const onEvent = vi.fn()
    const onSuccess = vi.fn()
    const onFinish = vi.fn()
    const onError = vi.fn()

    const unsubscribe = consumeAsyncIterator(iterator, {
      onEvent,
      onError,
      onSuccess,
      onFinish,
    })

    await new Promise(resolve => setTimeout(resolve, 1))
    await unsubscribe()
    expect(cleanup).toBe(true)
    // side-effect of async generator - waiting for .next resolve before .return effect
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenNthCalledWith(1, 1)

    expect(onError).toHaveBeenCalledTimes(0)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onFinish).toHaveBeenCalledTimes(1)
    // undefined can be passed on success because iterator can be canceled
    expect(onSuccess).toHaveBeenNthCalledWith(1, undefined)
    expect(onFinish).toHaveBeenNthCalledWith(1, [null, undefined, true])
  })

  it('error on unsubscribe', async () => {
    const error = new Error('TEST')
    let cleanup = false
    const iterator = (async function* () {
      try {
        await new Promise(resolve => setTimeout(resolve, 10))
        yield 1
        yield 2
        return 3
      }
      finally {
        cleanup = true
        // eslint-disable-next-line no-unsafe-finally
        throw error
      }
    }())

    const onEvent = vi.fn()
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const onFinish = vi.fn()

    const unsubscribe = consumeAsyncIterator(iterator, {
      onEvent,
      onError,
      onSuccess,
      onFinish,
    })

    await new Promise(resolve => setTimeout(resolve, 1))
    await expect(unsubscribe()).rejects.toThrow(error)
    expect(cleanup).toBe(true)
    // side-effect of async generator - waiting for .next resolve before .return effect
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenNthCalledWith(1, 1)

    expect(onError).toHaveBeenCalledTimes(0)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onFinish).toHaveBeenCalledTimes(1)
    // undefined can be passed on success because iterator can be canceled
    expect(onSuccess).toHaveBeenNthCalledWith(1, undefined)
    expect(onFinish).toHaveBeenNthCalledWith(1, [null, undefined, true])
  })

  it('on iterator promise rejection', async () => {
    const error = new Error('TEST')
    const iterator = Promise.reject(error)

    const onEvent = vi.fn()
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const onFinish = vi.fn()

    void consumeAsyncIterator(iterator, {
      onEvent,
      onError,
      onSuccess,
      onFinish,
    })

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledTimes(0)

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenNthCalledWith(1, error)

      expect(onFinish).toHaveBeenCalledTimes(1)
      expect(onFinish).toHaveBeenNthCalledWith(1, [error, undefined, false])

      expect(onSuccess).toHaveBeenCalledTimes(0)
    })
  })
})
