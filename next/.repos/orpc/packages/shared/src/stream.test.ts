import { AsyncLocalStorage } from 'node:async_hooks'
import { AsyncIteratorClass, sleep } from '@standard-server/shared'
import { promiseWithResolvers } from './promise'
import { asyncIteratorToStream, asyncIteratorToUnproxiedDataStream, replicateReadableStream, streamToAsyncIteratorObject, traceReadableStream, wrapReadableStream } from './stream'
import * as Tracing from './tracing'

const runInSpanContextSpy = vi.spyOn(Tracing, 'runInSpanContext')
const startSpanSpy = vi.spyOn(Tracing, 'startSpan')
const recordSpanErrorSpy = vi.spyOn(Tracing, 'recordSpanError')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('replicateReadableStream', () => {
  it('replicates all chunks to every branch', async () => {
    const stream = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1)
        controller.enqueue(2)
        controller.enqueue(3)
        controller.close()
      },
    })

    const replicated = replicateReadableStream(stream, 3)

    expect(replicated).toHaveLength(3)

    await expect(readAll(replicated[0]!)).resolves.toEqual([1, 2, 3])
    await expect(readAll(replicated[1]!)).resolves.toEqual([1, 2, 3])
    await expect(readAll(replicated[2]!)).resolves.toEqual([1, 2, 3])
  })

  it('returns an empty array when count is zero', () => {
    const stream = new ReadableStream<number>()

    expect(replicateReadableStream(stream, 0)).toEqual([])
  })

  it('cancels the source once all branches are cancelled', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<number>({
      pull(controller) {
        controller.enqueue(1)
      },
      cancel,
    })

    const replicated = replicateReadableStream(stream, 2)
    const firstReader = replicated[0]!.getReader()
    const secondReader = replicated[1]!.getReader()
    const firstCancelResolved = vi.fn()

    const firstCancel = firstReader.cancel('first')
    void firstCancel.then(firstCancelResolved)

    await Promise.resolve()
    expect(firstCancelResolved).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()

    const secondCancel = secondReader.cancel('second')

    await expect(Promise.all([firstCancel, secondCancel])).resolves.toEqual([undefined, undefined])
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})

describe('traceReadableStream', () => {
  it('traces reads until completion', async () => {
    const span = createSpan()
    startSpanSpy.mockReturnValue(span)

    const stream = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1)
        controller.enqueue(2)
        controller.close()
      },
    })

    await expect(readAll(traceReadableStream('name', stream))).resolves.toEqual([1, 2])

    expect(startSpanSpy).toHaveBeenCalledTimes(1)
    expect(startSpanSpy).toHaveBeenCalledWith('name')
    expect(runInSpanContextSpy).toHaveBeenCalledTimes(3)
    expect(recordSpanErrorSpy).not.toHaveBeenCalled()
    expect(span.addEvent).toHaveBeenNthCalledWith(1, 'enqueued')
    expect(span.addEvent).toHaveBeenNthCalledWith(2, 'enqueued')
    expect(span.addEvent).toHaveBeenNthCalledWith(3, 'closed')
    expect(span.end).toHaveBeenCalledTimes(1)
  })

  it('traces cancellation', async () => {
    const span = createSpan()
    startSpanSpy.mockReturnValue(span)
    const cancel = vi.fn()

    const stream = new ReadableStream<number>({
      pull(controller) {
        controller.enqueue(1)
      },
      cancel,
    })

    const reader = traceReadableStream({ name: 'name' }, stream).getReader()

    await expect(reader.read()).resolves.toEqual({ done: false, value: 1 })
    await expect(reader.cancel('stop')).resolves.toBeUndefined()

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith('stop')
    expect(runInSpanContextSpy).toHaveBeenCalledTimes(3)
    expect(recordSpanErrorSpy).not.toHaveBeenCalled()
    expect(span.end).toHaveBeenCalledTimes(1)
  })

  it('records read errors', async () => {
    const span = createSpan()
    startSpanSpy.mockReturnValue(span)
    const error = new Error('read failure')

    const stream = new ReadableStream<number>({
      pull() {
        throw error
      },
    })

    const reader = traceReadableStream({ name: 'name' }, stream).getReader()

    await expect(reader.read()).rejects.toBe(error)

    expect(runInSpanContextSpy).toHaveBeenCalledTimes(1)
    expect(recordSpanErrorSpy).toHaveBeenCalledTimes(1)
    expect(recordSpanErrorSpy).toHaveBeenCalledWith(span, error)
    expect(span.end).toHaveBeenCalledTimes(1)
  })

  it('records cancellation errors', async () => {
    const span = createSpan()
    startSpanSpy.mockReturnValue(span)
    const error = new Error('cancel failure')

    const stream = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1)
      },
      cancel() {
        throw error
      },
    })

    const reader = traceReadableStream({ name: 'name' }, stream).getReader()

    await expect(reader.read()).resolves.toEqual({ done: false, value: 1 })
    await expect(reader.cancel('stop')).rejects.toBe(error)

    expect(runInSpanContextSpy).toHaveBeenCalledTimes(3)
    expect(recordSpanErrorSpy).toHaveBeenCalledTimes(1)
    expect(recordSpanErrorSpy).toHaveBeenCalledWith(span, error)
    expect(span.end).toHaveBeenCalledTimes(1)
  })
})

describe('wrapReadableStream', () => {
  it('reads values without mapping', async () => {
    const stream = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1)
        controller.close()
      },
    })

    await expect(readAll(wrapReadableStream(stream, {}))).resolves.toEqual([1])
  })

  it('runs reads inside runWith, maps results, skips cancellation after completion, and finishes once', async () => {
    const storage = new AsyncLocalStorage<string>()
    const stores: string[] = []
    const mapped: Array<string | 'done'> = []
    let step = 0
    let cancelCount = 0
    let finishCount = 0
    let startFinish: (() => void) | undefined
    let resolveFinish: (() => void) | undefined

    const finishStarted = new Promise<void>((resolve) => {
      startFinish = resolve
    })

    const finishCompleted = new Promise<void>((resolve) => {
      resolveFinish = resolve
    })

    const stream = {
      getReader() {
        return {
          async read() {
            stores.push(storage.getStore() ?? 'missing')

            if (step === 0) {
              step += 1
              return { done: false as const, value: 1 }
            }

            return { done: true as const, value: undefined }
          },
          async cancel() {
            cancelCount += 1
          },
          releaseLock() {
          },
        }
      },
    } as ReadableStream<number>

    const reader = wrapReadableStream(stream, {
      runWith: run => storage.run('read-context', run),
      mapResult: (result) => {
        mapped.push(result.done ? 'done' : `map:${result.value}`)

        if (result.done) {
          return result
        }

        return { done: false, value: `mapped:${result.value}` } as any
      },
      onFinish: async () => {
        finishCount += 1
        startFinish?.()
        await finishCompleted
      },
    }).getReader()

    await expect(reader.read()).resolves.toEqual({ done: false, value: 'mapped:1' })
    expect(storage.getStore()).toBeUndefined()

    const donePromise = reader.read()
    await finishStarted

    await expect(reader.cancel('stop')).resolves.toBeUndefined()
    resolveFinish?.()

    await expect(donePromise).resolves.toEqual({ done: true, value: undefined })
    expect(storage.getStore()).toBeUndefined()

    expect(stores).toEqual(['read-context', 'read-context'])
    expect(mapped).toEqual(['map:1', 'done'])
    expect(cancelCount).toBe(0)
    expect(finishCount).toBe(1)
  })

  it('maps pull errors after reporting them and still finishes once', async () => {
    const error = new Error('pull failure')
    const mappedError = new TypeError('mapped pull failure')
    let finishCount = 0
    const onError = vi.fn()
    const stream = new ReadableStream<number>({
      pull() {
        throw error
      },
    })

    const reader = wrapReadableStream(stream, {
      onError,
      mapError: received => new TypeError(`mapped ${(received as Error).message}`),
      onFinish: () => {
        finishCount += 1
      },
    }).getReader()

    await expect(reader.read()).rejects.toEqual(mappedError)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(error)
    expect(finishCount).toBe(1)
  })

  it('runs cancellation inside runWith and finishes once', async () => {
    const storage = new AsyncLocalStorage<string>()
    let cancelReason: unknown
    let cancelStore: string | undefined
    let finishCount = 0

    const stream = new ReadableStream<number>({
      cancel(reason) {
        cancelReason = reason
        cancelStore = storage.getStore()
      },
    })

    const reader = wrapReadableStream(stream, {
      runWith: run => storage.run('cancel-context', run),
      onFinish: () => {
        finishCount += 1
      },
    }).getReader()

    await expect(reader.cancel('stop')).resolves.toBeUndefined()

    expect(cancelReason).toBe('stop')
    expect(cancelStore).toBe('cancel-context')
    expect(finishCount).toBe(1)
  })
})

async function readAll<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader()
  const values: T[] = []

  try {
    while (true) {
      const result = await reader.read()

      if (result.done) {
        return values
      }

      values.push(result.value)
    }
  }
  finally {
    reader.releaseLock()
  }
}

function createSpan() {
  return {
    addEvent: vi.fn(),
    end: vi.fn(),
    recordException: vi.fn(),
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
  } as any
}

describe('streamToAsyncIteratorObject', () => {
  it('should convert a ReadableStream to AsyncIteratorClass', async () => {
    const values = [1, 2, 3, 4, 5]
    const stream = new ReadableStream<number>({
      start(controller) {
        values.forEach(value => controller.enqueue(value))
        controller.close()
      },
    })

    const iterator = streamToAsyncIteratorObject(stream)
    expect(iterator).toBeInstanceOf(AsyncIteratorClass)

    const results: number[] = []
    for await (const value of iterator) {
      results.push(value)
    }

    expect(results).toEqual(values)
  })

  it('should handle empty stream', async () => {
    const stream = new ReadableStream<number>({
      start(controller) {
        controller.close()
      },
    })

    const iterator = streamToAsyncIteratorObject(stream)
    const results: number[] = []

    for await (const value of iterator) {
      results.push(value)
    }

    expect(results).toEqual([])
  })

  it('should handle stream errors', async () => {
    const error = new Error('Stream error')
    const stream = new ReadableStream<number>({
      start(controller) {
        controller.error(error)
      },
    })

    const iterator = streamToAsyncIteratorObject(stream)

    try {
      for await (const value of iterator) {
        // Should not reach here
      }
      expect.fail('Should have thrown an error')
    }
    catch (err) {
      expect(err).toBe(error)
    }
  })

  it('should properly cleanup when iterator is returned early', async () => {
    let cleanupCalled = false
    const stream = new ReadableStream<number>({
      start(controller) {
        for (let i = 1; i <= 10; i++) {
          controller.enqueue(i)
        }
        controller.close()
      },
      cancel() {
        cleanupCalled = true
      },
    })

    const iterator = streamToAsyncIteratorObject(stream)

    await iterator.next()
    await iterator.return()

    expect(cleanupCalled).toBe(true)
  })

  describe('with signal', () => {
    it('should abort if signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()
      const cancel = vi.fn()

      const stream = new ReadableStream<number>({
        start(c) {
          c.enqueue(1)
          c.enqueue(2)
          c.close()
        },
        cancel,
      })

      const iterator = streamToAsyncIteratorObject(stream, { signal: controller.signal })

      await expect(iterator.next()).rejects.toBe(controller.signal.reason)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(controller.signal.reason)
    })

    it('should abort mid-stream and cancel reader', async () => {
      const controller = new AbortController()
      const cancel = vi.fn()

      const stream = new ReadableStream<number>({
        start(c) {
          c.enqueue(1)
          c.enqueue(2)
          c.enqueue(3)
          c.close()
        },
        cancel,
      })

      const iterator = streamToAsyncIteratorObject(stream, { signal: controller.signal })

      await iterator.next()
      controller.abort()
      await expect(iterator.next()).rejects.toBe(controller.signal.reason)

      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(controller.signal.reason)
    })

    it('should abort during slow stream', async () => {
      const controller = new AbortController()
      const cancel = vi.fn()
      const { promise, resolve } = promiseWithResolvers<void>()

      const stream = new ReadableStream<number>({
        async pull(c) {
          await promise
          c.enqueue(1)
        },
        cancel,
      })

      const iterator = streamToAsyncIteratorObject(stream, { signal: controller.signal })

      const nextPromise = iterator.next()
      await sleep(0)
      controller.abort()
      await expect(nextPromise).rejects.toBe(controller.signal.reason)
      resolve()

      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(controller.signal.reason)
    })

    it('should complete normally if not aborted', async () => {
      const controller = new AbortController()
      const values = [1, 2, 3]
      const cancel = vi.fn()

      const stream = new ReadableStream<number>({
        start(c) {
          values.forEach(v => c.enqueue(v))
          c.close()
        },
        cancel,
      })

      const iterator = streamToAsyncIteratorObject(stream, { signal: controller.signal })
      const results: number[] = []

      for await (const value of iterator) {
        results.push(value)
      }

      expect(results).toEqual(values)
      expect(cancel).toHaveResolvedTimes(0)
    })
  })
})

describe('asyncIteratorToStream', () => {
  it('should convert an AsyncIterator to ReadableStream', async () => {
    async function* generator() {
      yield 1
      yield 2
      yield 3
    }

    const asyncIterator = generator()
    const stream = asyncIteratorToStream(asyncIterator)

    expect(stream).toBeInstanceOf(ReadableStream)

    const reader = stream.getReader()
    const results: number[] = []

    let result = await reader.read()
    while (!result.done) {
      results.push(result.value)
      result = await reader.read()
    }

    expect(results).toEqual([1, 2, 3])
  })

  it('should handle empty AsyncIteratorObject', async () => {
    async function* emptyGenerator() {
      // Empty generator
    }

    const asyncIterator = emptyGenerator()
    const stream = asyncIteratorToStream(asyncIterator)

    const reader = stream.getReader()
    const result = await reader.read()

    expect(result.done).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it('should handle AsyncIteratorObject errors', async () => {
    const error = new Error('Iterator error')
    async function* errorGenerator() {
      yield 1
      throw error
    }

    const asyncIterator = errorGenerator()
    const stream = asyncIteratorToStream(asyncIterator)

    const reader = stream.getReader()

    // First read should succeed
    const firstResult = await reader.read()
    expect(firstResult.done).toBe(false)
    expect(firstResult.value).toBe(1)

    // Second read should throw the error
    await expect(reader.read()).rejects.toThrow(error)
  })

  it('should call iterator.return when stream is cancelled', async () => {
    let cleanupCalled = false

    const stream = asyncIteratorToStream(async function* () {
      try {
        yield 1
        yield 2
        await new Promise(resolve => setTimeout(resolve, 100)) // Simulate async operation
      }
      finally {
        cleanupCalled = true
      }
    }())

    const reader = stream.getReader()
    await reader.read()
    await reader.cancel()

    expect(cleanupCalled).toBe(true)
  })
})

it('streamToAsyncIteratorClass + asyncIteratorToStream', async () => {
  const stream = new ReadableStream<number>({
    start(controller) {
      controller.enqueue(1)
      controller.enqueue(2)
      controller.enqueue(3)
      controller.close()
    },
  })

  const iterator = streamToAsyncIteratorObject(stream)
  const newStream = asyncIteratorToStream(iterator)
  const newIterator = streamToAsyncIteratorObject(newStream)

  const results: number[] = []
  for await (const value of newIterator) {
    results.push(value)
  }

  expect(results).toEqual([1, 2, 3])
})

describe('asyncIteratorToUnproxiedDataStream', () => {
  const PROXY_SYMBOL = Symbol('proxy')

  function proxy(value: object) {
    return new Proxy(value, {
      get(target, prop) {
        if (prop === PROXY_SYMBOL) {
          return true
        }

        return Reflect.get(target, prop)
      },
    })
  }

  function isProxied(value: any) {
    return Boolean(typeof value === 'object' && value && value[PROXY_SYMBOL])
  }

  it('should convert an AsyncIterator to ReadableStream and unproxied data', async () => {
    const date = new Date()
    const set = new Set([date])

    async function* generator() {
      yield 1
      yield proxy({ order: 2 })
      yield { order: 3 }
      yield [4]
      yield proxy([5])
      yield date // support native Date
      yield set // support native Set
    }

    const asyncIterator = generator()
    const stream = asyncIteratorToUnproxiedDataStream(asyncIterator)

    expect(stream).toBeInstanceOf(ReadableStream)

    const reader = stream.getReader()
    const results: any[] = []

    let result = await reader.read()
    while (!result.done) {
      results.push(result.value)
      result = await reader.read()
    }

    expect(results).toEqual([
      1,
      { order: 2 },
      { order: 3 },
      [4],
      [5],
      date,
      set,
    ])

    expect(results.some(isProxied)).toBe(false)
  })

  it('should handle empty AsyncIteratorObject', async () => {
    async function* emptyGenerator() {
      // Empty generator
    }

    const asyncIterator = emptyGenerator()
    const stream = asyncIteratorToUnproxiedDataStream(asyncIterator)

    const reader = stream.getReader()
    const result = await reader.read()

    expect(result.done).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it('should handle AsyncIteratorObject errors', async () => {
    const error = new Error('Iterator error')
    async function* errorGenerator() {
      yield 1
      throw error
    }

    const asyncIterator = errorGenerator()
    const stream = asyncIteratorToUnproxiedDataStream(asyncIterator)

    const reader = stream.getReader()

    // First read should succeed
    const firstResult = await reader.read()
    expect(firstResult.done).toBe(false)
    expect(firstResult.value).toBe(1)

    // Second read should throw the error
    await expect(reader.read()).rejects.toThrow(error)
  })

  it('should call iterator.return when stream is cancelled', async () => {
    let cleanupCalled = false

    const stream = asyncIteratorToUnproxiedDataStream(async function* () {
      try {
        yield 1
        yield 2
        await new Promise(resolve => setTimeout(resolve, 100)) // Simulate async operation
      }
      finally {
        cleanupCalled = true
      }
    }())

    const reader = stream.getReader()
    await reader.read()
    await reader.cancel()

    expect(cleanupCalled).toBe(true)
  })
})
