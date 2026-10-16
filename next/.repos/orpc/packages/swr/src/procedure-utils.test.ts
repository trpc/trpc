import type { OperationKey } from './key'
import { promiseWithResolvers } from '@orpc/shared'
import { ProcedureUtils } from './procedure-utils'
import { OPERATION_CONTEXT_SYMBOL } from './types'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('procedureUtils', () => {
  const client = vi.fn()
  const utils = new ProcedureUtils(['ping'], client, {})

  const key: OperationKey<unknown> = [['ping'], { input: { search: '__search__' } }]

  it('.call', () => {
    expect(utils.call).toBe(client)
  })

  it('.key', () => {
    expect(utils.key()).toEqual([['ping'], {}])
    expect(utils.key({ input: { search: '__search__' } })).toEqual([['ping'], { input: { search: '__search__' } }])
  })

  it('.key with prefix', () => {
    const prefixedUtils = new ProcedureUtils(['ping'], client, { prefix: '__prefix__' })

    expect(prefixedUtils.key()).toEqual(['__prefix__', ['ping'], {}])
    expect(prefixedUtils.key({ input: { search: '__search__' } })).toEqual(['__prefix__', ['ping'], { input: { search: '__search__' } }])
  })

  it('.fetcher', async () => {
    client.mockResolvedValueOnce('__output__')
    const fetcher = utils.fetcher({ context: { batch: true } })

    await expect(fetcher(key)).resolves.toEqual('__output__')
    expect(client).toHaveBeenCalledTimes(1)
    expect(client).toHaveBeenCalledWith({ search: '__search__' }, { context: { batch: true, [OPERATION_CONTEXT_SYMBOL]: { key, type: 'fetcher' } } })
  })

  it('.fetcher with prefixed key', async () => {
    client.mockResolvedValueOnce('__output__')
    const fetcher = utils.fetcher({ context: { batch: true } })

    const prefixedKey: OperationKey<unknown> = ['__prefix__', ['ping'], { input: { search: '__search__' } }]

    await expect(fetcher(prefixedKey)).resolves.toEqual('__output__')
    expect(client).toHaveBeenCalledTimes(1)
    expect(client).toHaveBeenCalledWith({ search: '__search__' }, { context: { batch: true, [OPERATION_CONTEXT_SYMBOL]: { key: prefixedKey, type: 'fetcher' } } })
  })

  describe('.subscriber', async () => {
    it('on success', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        yield '__event__1'
        yield '__event__2'
        yield '__event__3'
      })
      const subscriber = utils.subscriber({ context: { batch: true }, maxChunks: 2 })

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })

      expect(unsubscribe).toBeInstanceOf(Function)

      await new Promise(resolve => setTimeout(resolve, 20))

      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith({ search: '__search__' }, { context: { batch: true, [OPERATION_CONTEXT_SYMBOL]: { key, type: 'subscriber' } }, signal: expect.any(AbortSignal) })

      expect(next).toHaveBeenCalledTimes(4)
      expect(next).toHaveBeenCalledWith(undefined, expect.any(Function))

      expect(next).toHaveBeenNthCalledWith(1, undefined, undefined) // reset mode
      expect(next.mock.calls[1]![1](undefined)).toEqual(['__event__1'])
      expect(next.mock.calls[2]![1](['1'])).toEqual(['1', '__event__2'])
      // exceeds maxChunks, so it should only return the last 2 events
      expect(next.mock.calls[3]![1](['1', '2'])).toEqual(['2', '__event__3'])
    })

    it('on success refetchMode=append', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        yield '__event__1'
        yield '__event__2'
        yield '__event__3'
      })
      const subscriber = utils.subscriber({ context: { batch: true }, maxChunks: 2, refetchMode: 'append' })

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })

      expect(unsubscribe).toBeInstanceOf(Function)

      await new Promise(resolve => setTimeout(resolve, 20))

      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith({ search: '__search__' }, { context: { batch: true, [OPERATION_CONTEXT_SYMBOL]: { key, type: 'subscriber' } }, signal: expect.any(AbortSignal) })

      expect(next).toHaveBeenCalledTimes(3)
      expect(next).toHaveBeenCalledWith(undefined, expect.any(Function))

      expect(next.mock.calls[0]![1](undefined)).toEqual(['__event__1'])
      expect(next.mock.calls[1]![1](['1'])).toEqual(['1', '__event__2'])
      // exceeds maxChunks, so it should only return the last 2 events
      expect(next.mock.calls[2]![1](['1', '2'])).toEqual(['2', '__event__3'])
    })

    it('on success refetchMode=replace with previous data', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        yield '__event__1'
        yield '__event__2'
        yield '__event__3'
      })
      const subscriber = utils.subscriber({ context: { batch: true }, maxChunks: 2, refetchMode: 'replace' })

      // simulate SWR: updaters are invoked synchronously with the current data
      let data: unknown = ['__previous__']
      const next = vi.fn((error, update?) => {
        if (error === undefined) {
          data = typeof update === 'function' ? update(data) : update
        }
      })

      subscriber(key, { next })

      await new Promise(resolve => setTimeout(resolve, 20))

      // one probe call + one final replace call, no updates during the stream
      expect(next).toHaveBeenCalledTimes(2)
      expect(next).toHaveBeenNthCalledWith(1, undefined, expect.any(Function))
      // exceeds maxChunks, so it should only keep the last 2 events
      expect(next).toHaveBeenNthCalledWith(2, undefined, ['__event__2', '__event__3'])
      expect(data).toEqual(['__event__2', '__event__3'])
    })

    it('on success refetchMode=replace without previous data', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        yield '__event__1'
        yield '__event__2'
        yield '__event__3'
      })
      const subscriber = utils.subscriber({ context: { batch: true }, refetchMode: 'replace' })

      // simulate SWR: updaters are invoked synchronously with the current data
      let data: unknown
      const next = vi.fn((error, update?) => {
        if (error === undefined) {
          data = typeof update === 'function' ? update(data) : update
        }
      })

      subscriber(key, { next })

      await new Promise(resolve => setTimeout(resolve, 20))

      // one probe call + one update per event, streamed live like append mode
      expect(next).toHaveBeenCalledTimes(4)
      expect(data).toEqual(['__event__1', '__event__2', '__event__3'])
    })

    it('on unsubscribe', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 100))
        yield '__event__1'
        yield '__event__2'
        yield '__event__3'
      })
      const subscriber = utils.subscriber({ context: { batch: true }, maxChunks: 2 })

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })
      await new Promise(resolve => setTimeout(resolve, 10))
      unsubscribe()

      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith({ search: '__search__' }, { context: { batch: true, [OPERATION_CONTEXT_SYMBOL]: { key, type: 'subscriber' } }, signal: expect.any(AbortSignal) })
      expect(client.mock.calls[0]![1].signal.aborted).toBe(true)
    })

    it('does not duplicate chunks on a StrictMode double mount when the iterator ignores the signal', async () => {
      const generator = async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        yield '__event__1'
        yield '__event__2'
      }
      client.mockImplementationOnce(generator).mockImplementationOnce(generator)
      const subscriber = utils.subscriber()

      // simulate SWR: updaters are invoked synchronously with the current data
      let data: unknown
      const next = vi.fn((error, update?) => {
        if (error === undefined) {
          data = typeof update === 'function' ? update(data) : update
        }
      })

      // StrictMode subscribes, unsubscribes, then subscribes again
      subscriber(key, { next })()
      subscriber(key, { next })

      await new Promise(resolve => setTimeout(resolve, 20))

      expect(client).toHaveBeenCalledTimes(2)
      expect(data).toEqual(['__event__1', '__event__2'])
    })

    it('stops writing and returns the iterator when unsubscribed mid-stream', async () => {
      const cleanup = vi.fn()
      const paused = promiseWithResolvers<void>()
      client.mockImplementationOnce(async function* () {
        try {
          yield '__event__1'
          await paused.promise
          yield '__event__2'
          yield '__event__3'
        }
        finally {
          cleanup()
        }
      })
      const subscriber = utils.subscriber()

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })

      await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(2)) // reset + first event
      unsubscribe()
      paused.resolve()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(next).toHaveBeenCalledTimes(2)
      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('does not replace data after unsubscribe in refetchMode=replace', async () => {
      const paused = promiseWithResolvers<void>()
      client.mockImplementationOnce(async function* () {
        yield '__event__1'
        await paused.promise
        yield '__event__2'
      })
      const subscriber = utils.subscriber({ refetchMode: 'replace' })

      // simulate SWR: updaters are invoked synchronously with the current data
      let data: unknown = ['__previous__']
      const next = vi.fn((error, update?) => {
        if (error === undefined) {
          data = typeof update === 'function' ? update(data) : update
        }
      })

      const unsubscribe = subscriber(key, { next })
      await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1)) // the probe
      await new Promise(resolve => setTimeout(resolve, 10)) // the first event is buffered
      unsubscribe()
      paused.resolve()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(next).toHaveBeenCalledTimes(1)
      expect(data).toEqual(['__previous__'])
    })

    it('on error while yielding', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        throw new Error('__error__')
      })
      const subscriber = utils.subscriber({ context: { batch: true }, maxChunks: 2 })

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })

      expect(unsubscribe).toBeInstanceOf(Function)

      await new Promise(resolve => setTimeout(resolve, 20))

      expect(next).toHaveBeenCalledTimes(2)
      expect(next).toHaveBeenCalledWith(new Error('__error__'))
    })

    it('on error after unsubscribe', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        throw new Error('__error__')
      })
      const subscriber = utils.subscriber({ context: { batch: true }, maxChunks: 2 })

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })
      unsubscribe()
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(next).toHaveBeenCalledTimes(0)
    })

    it('on non-AsyncIteratorObject output', async () => {
      client.mockResolvedValueOnce('__output__')
      const subscriber = utils.subscriber({ context: { batch: true } })

      const next = vi.fn()
      subscriber(key, { next })

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith(new TypeError('.subscriber requires an AsyncIteratorObject output'))
    })
  })

  describe('.liveSubscriber', async () => {
    it('on success', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        yield '__event__1'
        yield '__event__2'
        yield '__event__3'
      })
      const subscriber = utils.liveSubscriber({ context: { batch: true } })

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })

      expect(unsubscribe).toBeInstanceOf(Function)

      await new Promise(resolve => setTimeout(resolve, 20))

      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith({ search: '__search__' }, { context: { batch: true, [OPERATION_CONTEXT_SYMBOL]: { key, type: 'liveSubscriber' } }, signal: expect.any(AbortSignal) })

      expect(next).toHaveBeenCalledTimes(3)
      expect(next).toHaveBeenNthCalledWith(1, undefined, '__event__1')
      expect(next).toHaveBeenNthCalledWith(2, undefined, '__event__2')
      expect(next).toHaveBeenNthCalledWith(3, undefined, '__event__3')
    })

    it('on unsubscribe', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        yield '__event__1'
        yield '__event__2'
        yield '__event__3'
      })
      const subscriber = utils.liveSubscriber({ context: { batch: true } })

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })
      await new Promise(resolve => setTimeout(resolve, 20))
      unsubscribe()

      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith({ search: '__search__' }, { context: { batch: true, [OPERATION_CONTEXT_SYMBOL]: { key, type: 'liveSubscriber' } }, signal: expect.any(AbortSignal) })
      expect(client.mock.calls[0]![1].signal.aborted).toBe(true)
    })

    it('stops writing after unsubscribe when the iterator ignores the signal', async () => {
      const paused = promiseWithResolvers<void>()
      client.mockImplementationOnce(async function* () {
        yield '__event__1'
        await paused.promise
        yield '__event__2'
      })
      const subscriber = utils.liveSubscriber()

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })

      await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1))
      unsubscribe()
      paused.resolve()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith(undefined, '__event__1')
    })

    it('on error while yielding', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        throw new Error('__error__')
      })
      const subscriber = utils.liveSubscriber({ context: { batch: true } })

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })

      expect(unsubscribe).toBeInstanceOf(Function)

      await new Promise(resolve => setTimeout(resolve, 20))

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith(new Error('__error__'))
    })

    it('on error after unsubscribe', async () => {
      client.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10))
        throw new Error('__error__')
      })
      const subscriber = utils.liveSubscriber({ context: { batch: true } })

      const next = vi.fn()
      const unsubscribe = subscriber(key, { next })
      unsubscribe()
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(next).toHaveBeenCalledTimes(0)
    })

    it('on non-AsyncIteratorObject output', async () => {
      client.mockResolvedValueOnce('__output__')
      const subscriber = utils.liveSubscriber({ context: { batch: true } })

      const next = vi.fn()
      subscriber(key, { next })
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith(new TypeError('.liveSubscriber requires an AsyncIteratorObject output'))
    })
  })

  it('.mutator', async () => {
    client.mockResolvedValueOnce('__output__')
    const mutator = utils.mutator({ context: { batch: true } })

    await expect(mutator('key', { arg: { search: '__search__' } })).resolves.toEqual('__output__')
    expect(client).toHaveBeenCalledTimes(1)
    expect(client).toHaveBeenCalledWith({ search: '__search__' }, { context: { batch: true, [OPERATION_CONTEXT_SYMBOL]: { key: 'key', type: 'mutator' } } })
  })
})
