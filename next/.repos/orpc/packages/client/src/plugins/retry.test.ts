import type { StandardLazyResponse, StandardRequest } from '@standard-server/core'
import type { StandardLinkCodec, StandardLinkTransport } from '../adapters/standard'
import type { RetryLinkPluginContext } from './retry'
import { promiseWithResolvers } from '@orpc/shared'
import { withEventMeta } from '@standard-server/core'
import { StandardLink } from '../adapters/standard'
import { RetryLinkPlugin } from './retry'

interface TestContext extends RetryLinkPluginContext {
  tag?: string
}

function makeCodec(): StandardLinkCodec<TestContext> {
  return {
    encodeInput: vi.fn(async () => ({
      method: 'POST',
      url: '/test',
      headers: {},
      body: undefined,
    } satisfies StandardRequest)),
    decodeResponse: vi.fn(),
  }
}

function makeTransport(): StandardLinkTransport<TestContext> {
  return {
    send: vi.fn(async () => ({
      status: 200,
      headers: {},
      resolveBody: async () => undefined,
    } satisfies StandardLazyResponse)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('retryLinkPlugin', () => {
  it('does not retry by default', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    vi.mocked(codec.decodeResponse).mockRejectedValue(new Error('FAIL'))

    const link = new StandardLink(codec, transport, {
      plugins: [new RetryLinkPlugin()],
    })

    await expect(link.call(['planet', 'create'], { name: 'Earth' }, { context: {} })).rejects.toThrow('FAIL')

    expect(codec.decodeResponse).toHaveBeenCalledTimes(1)
  })

  it('retries until max attempts and then throws', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    vi.mocked(codec.decodeResponse).mockRejectedValue(new Error('FAIL'))

    const link = new StandardLink(codec, transport, {
      plugins: [new RetryLinkPlugin()],
    })

    await expect(link.call(['planet', 'create'], { name: 'Earth' }, { context: { retry: 1, retryDelay: 0 } })).rejects.toThrow('FAIL')

    expect(codec.decodeResponse).toHaveBeenCalledTimes(2)
  })

  it('respects shouldRetry=false', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    vi.mocked(codec.decodeResponse).mockRejectedValue(new Error('FAIL'))

    const shouldRetry = vi.fn(async () => false)

    const link = new StandardLink(codec, transport, {
      plugins: [new RetryLinkPlugin()],
    })

    await expect(link.call(['planet', 'create'], { name: 'Earth' }, { context: { retry: 5, retryDelay: 0, shouldRetry } })).rejects.toThrow('FAIL')

    expect(shouldRetry).toHaveBeenCalledTimes(1)
    expect(codec.decodeResponse).toHaveBeenCalledTimes(1)
  })

  it('calls onRetry cleanup with success/failure state', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    let count = 0
    vi.mocked(codec.decodeResponse).mockImplementation(async () => {
      count++

      if (count < 3) {
        throw new Error(`FAIL_${count}`)
      }

      return { kind: 'output', output: 'OK' }
    })

    const clean = vi.fn()
    const onRetry = vi.fn(() => clean)

    const link = new StandardLink(codec, transport, {
      plugins: [new RetryLinkPlugin()],
    })

    await expect(link.call(['planet', 'create'], { name: 'Earth' }, { context: { retry: 3, retryDelay: 0, onRetry } })).resolves.toBe('OK')

    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(clean).toHaveBeenCalledTimes(2)
    expect(clean).toHaveBeenNthCalledWith(1, false)
    expect(clean).toHaveBeenNthCalledWith(2, true)
  })

  it('does not retry when signal is aborted', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    const controller = new AbortController()
    controller.abort()

    vi.mocked(transport.send).mockRejectedValue(new Error('AbortError'))

    const link = new StandardLink(codec, transport, {
      plugins: [new RetryLinkPlugin()],
    })

    await expect(link.call(['planet', 'create'], { name: 'Earth' }, { context: { retry: 3, retryDelay: 0 }, signal: controller.signal })).rejects.toThrow('AbortError')

    expect(transport.send).toHaveBeenCalledTimes(1)
  })

  it('uses constructor defaults', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    vi.mocked(codec.decodeResponse)
      .mockRejectedValueOnce(new Error('FAIL_1'))
      .mockResolvedValueOnce({ kind: 'output', output: 'OK' })

    const link = new StandardLink(codec, transport, {
      plugins: [new RetryLinkPlugin({ default: { retry: 1, retryDelay: 0 } })],
    })

    await expect(link.call(['planet', 'create'], { name: 'Earth' }, { context: {} })).resolves.toBe('OK')

    expect(codec.decodeResponse).toHaveBeenCalledTimes(2)
  })

  it('uses default retryDelay fallback when lastEventRetry is undefined', async () => {
    vi.useFakeTimers()

    const codec = makeCodec()
    const transport = makeTransport()

    vi.mocked(codec.decodeResponse)
      .mockRejectedValueOnce(new Error('FAIL_1'))
      .mockResolvedValueOnce({ kind: 'output', output: 'OK' })

    const link = new StandardLink(codec, transport, {
      plugins: [new RetryLinkPlugin({ default: { retry: 1 } })],
    })

    const callPromise = link.call(['planet', 'create'], { name: 'Earth' }, { context: {} })

    await vi.advanceTimersByTimeAsync(1999)
    await Promise.resolve()
    expect(codec.decodeResponse).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await expect(callPromise).resolves.toBe('OK')
    expect(codec.decodeResponse).toHaveBeenCalledTimes(2)
  })

  it('does not wait full retry delay when signal is aborted mid-delay', async () => {
    vi.useFakeTimers()

    const codec = makeCodec()
    const transport = makeTransport()

    vi.mocked(codec.decodeResponse).mockRejectedValue(new Error('FAIL'))

    const controller = new AbortController()

    const link = new StandardLink(codec, transport, {
      plugins: [new RetryLinkPlugin()],
    })

    const clean = vi.fn()
    const onRetry = vi.fn(() => clean)

    const callPromise = link.call(
      ['planet', 'create'],
      { name: 'Earth' },
      { context: { retry: 3, retryDelay: 5000, onRetry }, signal: controller.signal },
    )

    await vi.advanceTimersByTimeAsync(1)
    controller.abort()

    await expect(callPromise).rejects.toThrow()

    expect(codec.decodeResponse).toHaveBeenCalledTimes(1)

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(clean).toHaveBeenCalledTimes(1)
    expect(clean).toHaveBeenCalledWith(false)
  })

  it('throws the retryDelay error without retrying it', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    vi.mocked(codec.decodeResponse).mockRejectedValue(new Error('FAIL'))

    const retryDelay = vi.fn(() => 0).mockRejectedValueOnce(new Error('DELAY_FAIL'))
    const onRetry = vi.fn()

    const link = new StandardLink(codec, transport, {
      plugins: [new RetryLinkPlugin()],
    })

    await expect(link.call(['planet', 'create'], { name: 'Earth' }, { context: { retry: 1, retryDelay, onRetry } })).rejects.toThrow('DELAY_FAIL')

    expect(retryDelay).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
    expect(codec.decodeResponse).toHaveBeenCalledTimes(1)
  })

  describe('asyncIteratorObject', () => {
    it('retries AsyncIteratorObject and forwards lastEventId from metadata', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      let callCount = 0
      vi.mocked(codec.decodeResponse).mockImplementation(async () => {
        callCount++

        if (callCount === 1) {
          return {
            kind: 'output',
            output: (async function* () {
              yield withEventMeta({ phase: 'first' }, { id: 'evt-1', retry: 0 })
              throw withEventMeta(new Error('ITER_FAIL'), { id: 'evt-2', retry: 0 })
            })(),
          }
        }

        return {
          kind: 'output',
          output: (async function* () {
            yield { phase: 'second' }
          })(),
        }
      })

      const shouldRetry = vi.fn(() => true)

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryLinkPlugin()],
      })

      const iterator = await link.call(['planet', 'create'], { name: 'Earth' }, { context: { retry: 1, shouldRetry }, lastEventId: 'init-id' }) as AsyncIterator<any>

      await expect(iterator.next()).resolves.toEqual({ done: false, value: { phase: 'first' } })
      await expect(iterator.next()).resolves.toEqual({ done: false, value: { phase: 'second' } })

      expect(vi.mocked(codec.encodeInput).mock.calls[0]?.[2]).toMatchObject({ lastEventId: 'init-id' })
      expect(vi.mocked(codec.encodeInput).mock.calls[1]?.[2]).toMatchObject({ lastEventId: 'evt-2' })

      expect(shouldRetry).toHaveBeenCalledTimes(1)
      expect(shouldRetry).toHaveBeenCalledWith(expect.objectContaining({ lastEventRetry: 0 }))
    })

    it('throws when retry response is not an AsyncIteratorObject', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      let callCount = 0
      vi.mocked(codec.decodeResponse).mockImplementation(async () => {
        callCount++

        if (callCount === 1) {
          return {
            kind: 'output',
            output: (async function* () {
              throw new Error('ITER_FAIL')
            })(),
          }
        }

        return { kind: 'output', output: 'NOT_ITERATOR' }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryLinkPlugin()],
      })

      const iterator = await link.call(['planet', 'create'], { name: 'Earth' }, { context: { retry: 1, retryDelay: 0 } }) as AsyncIterator<any>

      await expect(iterator.next()).rejects.toBeInstanceOf(TypeError)
    })

    it('support manually cleanup', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      const cleanup = vi.fn()

      vi.mocked(codec.decodeResponse).mockResolvedValue({
        kind: 'output',
        output: (async function* () {
          try {
            yield 1
            yield 2
          }
          finally {
            cleanup()
          }
        })(),
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryLinkPlugin()],
      })

      const iterator = await link.call(['planet', 'create'], { name: 'Earth' }, { context: { retry: 1, retryDelay: 0 } }) as AsyncIterator<any>

      await iterator.next()
      await iterator.return?.()

      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('automatically cleanup retried iterator when cleanup during retry', async () => {
      vi.useFakeTimers()

      const codec = makeCodec()
      const transport = makeTransport()

      const cleanup = vi.fn()

      const retriedReturn = vi.fn(async () => ({ done: true as const, value: undefined }))

      const reconnect = promiseWithResolvers<void>()

      let callCount = 0
      vi.mocked(codec.decodeResponse).mockImplementation(async () => {
        callCount++

        if (callCount === 1) {
          return {
            kind: 'output',
            output: (async function* () {
              try {
                throw new Error('ITER_FAIL')
              }
              finally {
                cleanup()
              }
            })(),
          }
        }

        await reconnect.promise

        return {
          kind: 'output',
          output: {
            async next() {
              return { done: false as const, value: 'RETRIED' }
            },
            return: retriedReturn,
            [Symbol.asyncIterator]() {
              return this
            },
          },
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryLinkPlugin()],
      })

      const iterator = await link.call(['planet', 'create'], { name: 'Earth' }, { context: { retry: 1, retryDelay: 50 } }) as AsyncIterator<any>

      const nextPromise = iterator.next()
      const nextExpectation = expect(nextPromise).resolves.toEqual({ done: true, value: undefined })

      await vi.advanceTimersByTimeAsync(60)
      expect(codec.decodeResponse).toHaveBeenCalledTimes(2) // reconnect request is in flight

      await iterator.return?.()
      reconnect.resolve()

      await nextExpectation

      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(retriedReturn).toHaveBeenCalledTimes(1)
    })

    it('stops reconnecting once the iterator is closed', async () => {
      vi.useFakeTimers()

      const codec = makeCodec()
      const transport = makeTransport()

      const onRetry = vi.fn()

      vi.mocked(codec.decodeResponse)
        .mockResolvedValueOnce({
          kind: 'output',
          output: (async function* () {
            throw new Error('DISCONNECTED')
          })(),
        })
        .mockRejectedValue(new Error('SERVER_DOWN'))

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryLinkPlugin()],
      })

      const iterator = await link.call(['stream'], undefined, { context: { retry: Number.POSITIVE_INFINITY, retryDelay: 10, onRetry } }) as AsyncIterator<any>

      const nextPromise = iterator.next()

      await vi.advanceTimersByTimeAsync(35)
      expect(vi.mocked(codec.decodeResponse).mock.calls.length).toBeGreaterThan(1)

      await iterator.return?.()

      const callsAtReturn = vi.mocked(codec.decodeResponse).mock.calls.length
      const onRetryCallsAtReturn = onRetry.mock.calls.length

      await vi.advanceTimersByTimeAsync(1000)

      expect(codec.decodeResponse).toHaveBeenCalledTimes(callsAtReturn)
      expect(onRetry).toHaveBeenCalledTimes(onRetryCallsAtReturn)
      await expect(nextPromise).resolves.toEqual({ done: true, value: undefined })
    })

    it('does not send further requests when closed during the retry delay', async () => {
      vi.useFakeTimers()

      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(codec.decodeResponse).mockResolvedValue({
        kind: 'output',
        output: (async function* () {
          throw new Error('DISCONNECTED')
        })(),
      })

      const clean = vi.fn()
      const onRetry = vi.fn(() => clean)

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryLinkPlugin()],
      })

      const iterator = await link.call(['stream'], undefined, { context: { retry: 3, retryDelay: 1000, onRetry } }) as AsyncIterator<any>

      const nextPromise = iterator.next()

      await vi.advanceTimersByTimeAsync(10)
      expect(onRetry).toHaveBeenCalledTimes(1)

      await iterator.return?.()
      await vi.advanceTimersByTimeAsync(5000)

      await expect(nextPromise).resolves.toEqual({ done: true, value: undefined })

      expect(transport.send).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(clean).toHaveBeenCalledTimes(1)
      expect(clean).toHaveBeenCalledWith(false)
    })

    it('reset special AsyncIteratorObject properties after retry', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      let callCount = 0
      vi.mocked(codec.decodeResponse).mockImplementation(async () => {
        callCount++

        const gen = (async function* () {
          throw new Error('ITER_FAIL')
        })()

        Object.defineProperty(gen, 'specialProperty', {
          value: `specialValue:${callCount}`,
          configurable: true,
        })

        return {
          kind: 'output',
          output: gen,
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryLinkPlugin()],
      })

      const iterator = await link.call(['planet', 'create'], { name: 'Earth' }, { context: { retry: 1, retryDelay: 0 } }) as AsyncIterator<any>

      expect((iterator as any).specialProperty).toEqual('specialValue:1')
      await expect(iterator.next()).rejects.toThrow('ITER_FAIL')
      expect((iterator as any).specialProperty).toEqual('specialValue:2')
    })
  })
})
