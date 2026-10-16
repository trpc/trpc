import { InfiniteQueryObserver, QueryClient, QueryObserver, skipToken } from '@tanstack/query-core'
import * as KeyModule from './key'
import * as LiveQuery from './live-query'
import { isProcedureUtilsOptions, mergeProcedureUtilsOptions, ProcedureUtils } from './procedure-utils'
import * as streamQueryModule from './stream-query'
import { OPERATION_CONTEXT_SYMBOL } from './types'

const streamedQuerySpy = vi.spyOn(streamQueryModule, 'serializableStreamedQuery')

const liveQuerySpy = vi.spyOn(LiveQuery, 'liveQuery')

const generateOperationKeySpy = vi.spyOn(KeyModule, 'generateOperationKey')

const queryClient = new QueryClient()

beforeEach(() => {
  queryClient.clear()
  vi.clearAllMocks()
})

describe('procedureUtils', () => {
  const signal = new AbortController().signal
  const client = vi.fn()
  const utils = new ProcedureUtils(['ping'], client)

  it('.call', () => {
    expect(utils.call).toBe(client)
  })

  it('.queryKey', () => {
    expect(utils.queryKey({ input: { search: '__search__' } })).toBe(generateOperationKeySpy.mock.results[0]!.value)
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
    expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'query', input: { search: '__search__' } })

    expect(utils.queryKey({ queryKey: ['1'] })).toEqual(['1'])
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
  })

  describe('with prefix', () => {
    const prefixedUtils = new ProcedureUtils(['ping'], client, { prefix: '__prefix__' })

    it('includes prefix in generated keys', () => {
      prefixedUtils.queryKey({ input: 1 } as any)
      expect(generateOperationKeySpy).toHaveBeenNthCalledWith(1, ['ping'], { prefix: '__prefix__', type: 'query', input: 1 })

      prefixedUtils.streamedKey({ input: 1, queryFnOptions: { maxChunks: 1 } } as any)
      expect(generateOperationKeySpy).toHaveBeenNthCalledWith(2, ['ping'], { prefix: '__prefix__', type: 'streamed', input: 1, fnOptions: { maxChunks: 1 } })

      prefixedUtils.liveKey({ input: 1 } as any)
      expect(generateOperationKeySpy).toHaveBeenNthCalledWith(3, ['ping'], { prefix: '__prefix__', type: 'live', input: 1 })

      prefixedUtils.infiniteKey({ input: (cursor: number) => ({ cursor }), initialPageParam: 0 } as any)
      expect(generateOperationKeySpy).toHaveBeenNthCalledWith(4, ['ping'], { prefix: '__prefix__', type: 'infinite', input: { cursor: 0 } })

      prefixedUtils.mutationKey()
      expect(generateOperationKeySpy).toHaveBeenNthCalledWith(5, ['ping'], { prefix: '__prefix__', type: 'mutation' })
    })
  })

  describe('.queryOptions', () => {
    it('without skipToken', async () => {
      const options = utils.queryOptions({ input: { search: '__search__' }, context: { batch: '__batch__' } })

      expect((options as any).enabled).toBeUndefined()

      expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'query', input: { search: '__search__' } })
      expect(options.queryKey).toBe(generateOperationKeySpy.mock.results[0]!.value)

      client.mockResolvedValueOnce('__output__')
      await expect(options.queryFn!({ signal } as any)).resolves.toEqual('__output__')
      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith({ search: '__search__' }, { signal, context: {
        batch: '__batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.queryKey,
          type: 'query',
        },
      } })
    })

    it('with skipToken', () => {
      const options = utils.queryOptions({ input: skipToken, context: { batch: '__batch__' } })

      expect((options as any).enabled).toBe(false)

      expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'query', input: skipToken })
      expect(options.queryKey).toBe(generateOperationKeySpy.mock.results[0]!.value)

      expect(() => options.queryFn!({ signal } as any)).toThrow('queryFn should not be called when skipToken used for skipping')
      expect(client).toHaveBeenCalledTimes(0)
    })

    it('uses custom queryFn instead of client', async () => {
      const queryFn = vi.fn().mockResolvedValue('__custom_output__')
      const fnContext = { signal } as any
      const options = utils.queryOptions({
        input: { search: '__search__' },
        context: { batch: '__batch__' },
        queryFn,
      })

      await expect(options.queryFn!(fnContext)).resolves.toBe('__custom_output__')
      expect(queryFn).toHaveBeenCalledTimes(1)
      expect(queryFn).toHaveBeenCalledWith(fnContext)
      expect(client).toHaveBeenCalledTimes(0)
    })
  })

  it('.streamedKey', () => {
    expect(utils.streamedKey({ input: { search: '__search__' } })).toBe(generateOperationKeySpy.mock.results[0]!.value)
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
    expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'streamed', input: { search: '__search__' } })

    expect(utils.streamedKey({ queryKey: ['1'] })).toEqual(['1'])
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
  })

  describe('.streamedOptions', () => {
    it('without skipToken', async () => {
      const options = utils.streamedOptions({
        input: { search: '__search__' },
        context: { batch: '__batch__' },
        queryFnOptions: {
          refetchMode: 'replace',
        },
      })

      expect('enabled' in options).toBe(false)
      expect((options as any).enabled).toBeUndefined()

      expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], {
        type: 'streamed',
        input: { search: '__search__' },
        fnOptions: {
          refetchMode: 'replace',
        },
      })
      expect(options.queryKey).toBe(generateOperationKeySpy.mock.results[0]!.value)

      client.mockImplementationOnce(async function* (input) {
        yield '__1__'
        yield '__2__'
        return '__3__'
      })
      await expect(options.queryFn!({ signal, client: queryClient, queryKey: options.queryKey } as any)).resolves.toEqual(['__1__', '__2__'])
      expect(streamedQuerySpy).toHaveBeenCalledTimes(1)
      expect(streamedQuerySpy).toHaveBeenCalledWith(expect.any(Function), {
        refetchMode: 'replace',
      })
      expect(queryClient.getQueryData(options.queryKey)).toEqual(['__1__', '__2__'])

      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith({ search: '__search__' }, {
        signal,
        context: {
          batch: '__batch__',
          [OPERATION_CONTEXT_SYMBOL]: {
            key: options.queryKey,
            type: 'streamed',
          },
        },
      })
    })

    it('with skipToken', () => {
      const options = utils.streamedOptions({ input: skipToken, context: { batch: '__batch__' } })

      expect((options as any).enabled).toBe(false)

      expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'streamed', input: skipToken })
      expect(options.queryKey).toBe(generateOperationKeySpy.mock.results[0]!.value)

      expect(() => options.queryFn!({ signal, client: queryClient } as any)).toThrow('queryFn should not be called when skipToken used for skipping')
      expect(client).toHaveBeenCalledTimes(0)
    })

    it('with unsupported output', async () => {
      const options = utils.streamedOptions({ input: { search: '__search__' }, context: { batch: '__batch__' } })

      client.mockResolvedValueOnce('INVALID')
      await expect(options.queryFn!({ signal, client: queryClient } as any)).rejects.toThrow('streamedQuery requires an AsyncIteratorObject output')
      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith({ search: '__search__' }, { signal, context: {
        batch: '__batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.queryKey,
          type: 'streamed',
        },
      } })
    })

    it('uses custom queryFn instead of client', async () => {
      const queryFn = vi.fn().mockResolvedValue(['__custom_output__'])
      const fnContext = { signal, client: queryClient, queryKey: ['__custom__'] } as any
      const options = utils.streamedOptions({
        input: { search: '__search__' },
        context: { batch: '__batch__' },
        queryFn,
      })

      await expect(options.queryFn!(fnContext)).resolves.toEqual(['__custom_output__'])
      expect(queryFn).toHaveBeenCalledTimes(1)
      expect(queryFn).toHaveBeenCalledWith(fnContext)
      expect(streamedQuerySpy).toHaveBeenCalledTimes(0)
      expect(client).toHaveBeenCalledTimes(0)
    })
  })

  it('.liveKey', () => {
    expect(utils.liveKey({ input: { search: '__search__' } })).toBe(generateOperationKeySpy.mock.results[0]!.value)
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
    expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'live', input: { search: '__search__' } })

    expect(utils.liveKey({ queryKey: ['1'] })).toEqual(['1'])
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
  })

  describe('.liveOptions', () => {
    it('without skipToken', async () => {
      const options = utils.liveOptions({
        input: { search: '__search__' },
        context: { batch: '__batch__' },
      })

      expect('enabled' in options).toBe(false)
      expect((options as any).enabled).toBeUndefined()

      expect(options.queryKey).toBe(generateOperationKeySpy.mock.results[0]!.value)
      expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], {
        type: 'live',
        input: { search: '__search__' },
      })

      client.mockImplementationOnce(async function* (input) {
        yield '__1__'
        yield '__2__'
        return '__3__'
      })
      await expect(options.queryFn!({ signal, client: queryClient, queryKey: options.queryKey } as any)).resolves.toEqual('__2__')
      expect(liveQuerySpy).toHaveBeenCalledTimes(1)
      expect(liveQuerySpy).toHaveBeenCalledWith(expect.any(Function))
      expect(queryClient.getQueryData(options.queryKey)).toEqual('__2__')

      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith({ search: '__search__' }, {
        signal,
        context: {
          batch: '__batch__',
          [OPERATION_CONTEXT_SYMBOL]: {
            key: options.queryKey,
            type: 'live',
          },
        },
      })
    })

    it('with skipToken', () => {
      const options = utils.liveOptions({ input: skipToken, context: { batch: '__batch__' } })

      expect((options as any).enabled).toBe(false)

      expect(options.queryKey).toBe(generateOperationKeySpy.mock.results[0]!.value)
      expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'live', input: skipToken })

      expect(() => options.queryFn!({ signal, client: queryClient } as any)).toThrow('queryFn should not be called when skipToken used for skipping')
      expect(client).toHaveBeenCalledTimes(0)
    })

    it('with unsupported output', async () => {
      const options = utils.liveOptions({ input: { search: '__search__' }, context: { batch: '__batch__' } })

      client.mockResolvedValueOnce('INVALID')
      await expect(options.queryFn!({ signal, client: queryClient } as any)).rejects.toThrow('liveQuery requires an AsyncIteratorObject output')
      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith({ search: '__search__' }, {
        signal,
        context: {
          batch: '__batch__',
          [OPERATION_CONTEXT_SYMBOL]: {
            key: options.queryKey,
            type: 'live',
          },
        },
      })
    })

    it('uses custom queryFn instead of client', async () => {
      const queryFn = vi.fn().mockResolvedValue('__custom_output__')
      const fnContext = { signal, client: queryClient, queryKey: ['__custom__'] } as any
      const options = utils.liveOptions({
        input: { search: '__search__' },
        context: { batch: '__batch__' },
        queryFn,
      })

      await expect(options.queryFn!(fnContext)).resolves.toBe('__custom_output__')
      expect(queryFn).toHaveBeenCalledTimes(1)
      expect(queryFn).toHaveBeenCalledWith(fnContext)
      expect(liveQuerySpy).toHaveBeenCalledTimes(0)
      expect(client).toHaveBeenCalledTimes(0)
    })
  })

  it('.infiniteKey', () => {
    expect(utils.infiniteKey({ input: pageParam => ({ search: '__search__', pageParam }), initialPageParam: '__initialPageParam__' })).toBe(generateOperationKeySpy.mock.results[0]!.value)
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
    expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'infinite', input: { search: '__search__', pageParam: '__initialPageParam__' } })

    expect(utils.infiniteKey({ input: () => ({}), initialPageParam: 0, queryKey: ['1'] })).toEqual(['1'])
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
  })

  describe('.infiniteOptions', () => {
    it('without skipToken', async () => {
      const getNextPageParam = vi.fn()

      const options = utils.infiniteOptions({
        input: pageParam => ({ search: '__search__', pageParam }),
        context: { batch: '__batch__' },
        getNextPageParam,
        initialPageParam: '__initialPageParam__',
      })

      expect('enabled' in options).toBe(false)
      expect((options as any).enabled).toBeUndefined()

      expect(options.queryKey).toBe(generateOperationKeySpy.mock.results[0]!.value)
      expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'infinite', input: { search: '__search__', pageParam: '__initialPageParam__' } })

      expect(options.initialPageParam).toEqual('__initialPageParam__')
      expect(options.getNextPageParam).toBe(getNextPageParam)

      client.mockResolvedValueOnce('__output__')
      await expect(options.queryFn!({ signal, pageParam: '__pageParam__' } as any)).resolves.toEqual('__output__')
      expect(client).toHaveBeenCalledTimes(1)
      expect(client).toHaveBeenCalledWith(
        { search: '__search__', pageParam: '__pageParam__' },
        {
          signal,
          context: {
            batch: '__batch__',
            [OPERATION_CONTEXT_SYMBOL]: {
              key: options.queryKey,
              type: 'infinite',
            },
          },
        },
      )
    })

    it('with skipToken', () => {
      const getNextPageParam = vi.fn()

      const options = utils.infiniteOptions({
        input: skipToken,
        context: { batch: '__batch__' },
        getNextPageParam,
        initialPageParam: '__initialPageParam__',
      })

      expect((options as any).enabled).toBe(false)

      expect(options.queryKey).toBe(generateOperationKeySpy.mock.results[0]!.value)
      expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'infinite', input: skipToken })

      expect(options.initialPageParam).toEqual('__initialPageParam__')
      expect(options.getNextPageParam).toBe(getNextPageParam)

      expect(() => options.queryFn!({ signal, pageParam: '__pageParam__' } as any)).toThrow('queryFn should not be called when skipToken used for skipping')
      expect(client).toHaveBeenCalledTimes(0)
    })

    it('uses custom queryFn instead of client', async () => {
      const queryFn = vi.fn().mockResolvedValue('__custom_output__')
      const fnContext = { signal, pageParam: '__pageParam__' } as any
      const options = utils.infiniteOptions({
        input: pageParam => ({ search: '__search__', pageParam }),
        context: { batch: '__batch__' },
        getNextPageParam: vi.fn(),
        initialPageParam: '__initialPageParam__',
        queryFn,
      })

      await expect(options.queryFn!(fnContext)).resolves.toBe('__custom_output__')
      expect(queryFn).toHaveBeenCalledTimes(1)
      expect(queryFn).toHaveBeenCalledWith(fnContext)
      expect(client).toHaveBeenCalledTimes(0)
    })
  })

  it('.mutationKey', () => {
    expect(utils.mutationKey()).toBe(generateOperationKeySpy.mock.results[0]!.value)
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
    expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'mutation' })

    expect(utils.mutationKey({ mutationKey: ['1'] })).toEqual(['1'])
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
  })

  it('.mutationOptions', async () => {
    const options = utils.mutationOptions({
      context: { batch: '__batch__' },
    })

    expect(options.mutationKey).toBe(generateOperationKeySpy.mock.results[0]!.value)
    expect(generateOperationKeySpy).toHaveBeenCalledTimes(1)
    expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'mutation' })

    client.mockResolvedValueOnce('__output__')
    await expect(options.mutationFn!('__input__', {} as any)).resolves.toEqual('__output__')
    expect(client).toHaveBeenCalledTimes(1)
    expect(client).toHaveBeenCalledWith('__input__', { context: {
      batch: '__batch__',
      [OPERATION_CONTEXT_SYMBOL]: {
        key: options.mutationKey,
        type: 'mutation',
      },
    } })
  })

  it('.mutationOptions uses custom mutationFn instead of client', async () => {
    const mutationFn = vi.fn().mockResolvedValue('__custom_output__')
    const fnContext = { meta: '__meta__' } as any
    const options = utils.mutationOptions({
      context: { batch: '__batch__' },
      mutationFn,
    })

    await expect(options.mutationFn!('__input__', fnContext)).resolves.toBe('__custom_output__')
    expect(mutationFn).toHaveBeenCalledTimes(1)
    expect(mutationFn).toHaveBeenCalledWith('__input__', fnContext)
    expect(client).toHaveBeenCalledTimes(0)
  })
})

describe('skipToken queries do not share a query with unskipped ones', () => {
  const client = vi.fn(async () => '__output__')
  const utils = new ProcedureUtils<Record<never, never>, { search?: string } | undefined, string, Error>(['planet', 'list'], client)

  it('.queryOptions', async () => {
    const unskipped = new QueryObserver(queryClient, utils.queryOptions())
    onTestFinished(unskipped.subscribe(() => {}))
    await vi.waitFor(() => expect(unskipped.getCurrentResult().status).toBe('success'))

    const skipped = new QueryObserver(queryClient, utils.queryOptions({ input: skipToken }))
    onTestFinished(skipped.subscribe(() => {}))

    expect(queryClient.getQueryCache().getAll()).toHaveLength(2)

    await queryClient.invalidateQueries({ queryKey: utils.key() })

    expect(unskipped.getCurrentResult().status).toBe('success')
    expect(skipped.getCurrentResult().status).toBe('pending')
    expect(client).toHaveBeenCalledTimes(2)
  })

  it('.infiniteOptions', async () => {
    const unskipped = new InfiniteQueryObserver(queryClient, utils.infiniteOptions({
      input: () => undefined,
      initialPageParam: 0,
      getNextPageParam: () => undefined,
    }))
    onTestFinished(unskipped.subscribe(() => {}))
    await vi.waitFor(() => expect(unskipped.getCurrentResult().status).toBe('success'))

    const skipped = new InfiniteQueryObserver(queryClient, utils.infiniteOptions({
      input: skipToken,
      initialPageParam: 0,
      getNextPageParam: () => undefined,
    }))
    onTestFinished(skipped.subscribe(() => {}))

    expect(queryClient.getQueryCache().getAll()).toHaveLength(2)

    await queryClient.invalidateQueries({ queryKey: utils.key() })

    expect(unskipped.getCurrentResult().status).toBe('success')
    expect(skipped.getCurrentResult().status).toBe('pending')
    expect(client).toHaveBeenCalledTimes(2)
  })
})

describe('createProcedureUtils with options', () => {
  const client = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('.queryKey', () => {
    it('applies defaults when no options provided', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        queryKey: { input: { defaultInput: true } },
      })

      utils.queryKey()

      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'query', input: { defaultInput: true } })
    })

    it('user options override defaults', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        queryKey: { input: { defaultInput: true } },
      })

      utils.queryKey({ input: { userInput: true } })

      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'query', input: { userInput: true } })
    })

    it('custom queryKey overrides default', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        queryKey: { queryKey: ['default-key'] },
      })

      expect(utils.queryKey()).toEqual(['default-key'])
      expect(utils.queryKey({ queryKey: ['user-key'] })).toEqual(['user-key'])
    })

    it('applies a modifier function', () => {
      const queryKey = vi.fn(() => ({ queryKey: ['function-query-key'] }))
      const utils = new ProcedureUtils(['ping'], client, {
        queryKey,
      })

      expect(utils.queryKey({ input: 'per-call' })).toEqual(['function-query-key'])
      expect(queryKey).toHaveBeenCalledWith({ input: 'per-call' })
    })
  })

  describe('.queryOptions', () => {
    it('applies defaults when no options provided', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        queryOptions: { input: { defaultInput: true }, staleTime: 1000 },
      })

      const options = utils.queryOptions() as any

      expect(options.staleTime).toBe(1000)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'query', input: { defaultInput: true } })
    })

    it('user options override defaults', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        queryOptions: { input: { defaultInput: true }, staleTime: 1000 },
      })

      const options = utils.queryOptions({ input: { userInput: true }, staleTime: 2000 }) as any

      expect(options.staleTime).toBe(2000)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'query', input: { userInput: true } })
    })

    it('applies a modifier function', () => {
      const queryOptions = vi.fn(() => ({ input: { defaultInput: true }, staleTime: 1000 }))
      const utils = new ProcedureUtils(['ping'], client, {
        queryOptions,
      })

      const options = utils.queryOptions({ input: 'per-call' as any }) as any

      expect(options.staleTime).toBe(1000)
      expect(queryOptions).toHaveBeenCalledWith({ input: 'per-call' })
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'query', input: { defaultInput: true } })
    })

    it('can use queryKey options to configure the query key', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        queryKey: { queryKey: ['__TEST__'] },
      })

      expect(utils.queryOptions().queryKey).toEqual(['__TEST__'])
    })
  })

  describe('.streamedKey', () => {
    it('applies defaults when no options provided', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        streamedKey: { input: { defaultInput: true } },
      })

      utils.streamedKey()

      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'streamed', input: { defaultInput: true } })
    })

    it('user options override defaults', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        streamedKey: { input: { defaultInput: true } },
      })

      utils.streamedKey({ input: { userInput: true } })

      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'streamed', input: { userInput: true } })
    })

    it('applies a modifier function', () => {
      const streamedKey = vi.fn(() => ({ queryKey: ['function-streamed-key'] }))
      const utils = new ProcedureUtils(['ping'], client, {
        streamedKey,
      })

      expect(utils.streamedKey({ input: 'per-call' })).toEqual(['function-streamed-key'])
      expect(streamedKey).toHaveBeenCalledWith({ input: 'per-call' })
    })
  })

  describe('.streamedOptions', () => {
    it('applies defaults when no options provided', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        streamedOptions: { input: { defaultInput: true }, staleTime: 1000 },
      })

      const options = utils.streamedOptions() as any

      expect(options.staleTime).toBe(1000)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'streamed', input: { defaultInput: true } })
    })

    it('user options override defaults', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        streamedOptions: { input: { defaultInput: true }, staleTime: 1000 },
      })

      const options = utils.streamedOptions({ input: { userInput: true }, staleTime: 2000 }) as any

      expect(options.staleTime).toBe(2000)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'streamed', input: { userInput: true } })
    })

    it('applies a modifier function', () => {
      const streamedOptions = vi.fn(() => ({ input: { defaultInput: true }, staleTime: 1000 }))
      const utils = new ProcedureUtils(['ping'], client, {
        streamedOptions,
      })

      const options = utils.streamedOptions({ input: 'per-call' as any }) as any

      expect(options.staleTime).toBe(1000)
      expect(streamedOptions).toHaveBeenCalledWith({ input: 'per-call' })
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'streamed', input: { defaultInput: true } })
    })

    it('can use streamedKey options to configure the query key', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        streamedKey: { queryKey: ['__TEST__'] },
      })

      expect(utils.streamedOptions().queryKey).toEqual(['__TEST__'])
    })
  })

  describe('.liveKey', () => {
    it('applies defaults when no options provided', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        liveKey: { input: { defaultInput: true } },
      })

      utils.liveKey()

      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'live', input: { defaultInput: true } })
    })

    it('user options override defaults', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        liveKey: { input: { defaultInput: true } },
      })

      utils.liveKey({ input: { userInput: true } })

      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'live', input: { userInput: true } })
    })

    it('applies a modifier function', () => {
      const liveKey = vi.fn(() => ({ queryKey: ['function-live-key'] }))
      const utils = new ProcedureUtils(['ping'], client, {
        liveKey,
      })

      expect(utils.liveKey({ input: 'per-call' })).toEqual(['function-live-key'])
      expect(liveKey).toHaveBeenCalledWith({ input: 'per-call' })
    })
  })

  describe('.liveOptions', () => {
    it('applies defaults when no options provided', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        liveOptions: { input: { defaultInput: true }, staleTime: 1000 },
      })

      const options = utils.liveOptions() as any

      expect(options.staleTime).toBe(1000)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'live', input: { defaultInput: true } })
    })

    it('user options override defaults', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        liveOptions: { input: { defaultInput: true }, staleTime: 1000 },
      })

      const options = utils.liveOptions({ input: { userInput: true }, staleTime: 2000 }) as any

      expect(options.staleTime).toBe(2000)
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'live', input: { userInput: true } })
    })

    it('applies a modifier function', () => {
      const liveOptions = vi.fn(() => ({ input: { defaultInput: true }, staleTime: 1000 }))
      const utils = new ProcedureUtils(['ping'], client, {
        liveOptions,
      })

      const options = utils.liveOptions({ input: 'per-call' as any }) as any

      expect(options.staleTime).toBe(1000)
      expect(liveOptions).toHaveBeenCalledWith({ input: 'per-call' })
      expect(generateOperationKeySpy).toHaveBeenCalledWith(['ping'], { type: 'live', input: { defaultInput: true } })
    })

    it('can use liveKey options to configure the query key', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        liveKey: { queryKey: ['__TEST__'] },
      })

      expect(utils.liveOptions().queryKey).toEqual(['__TEST__'])
    })
  })

  describe('.infiniteKey', () => {
    it('applies defaults when options provided', () => {
      const defaultInput = vi.fn().mockReturnValue({ defaultInput: true })
      const utils = new ProcedureUtils(['ping'], client, {
        infiniteKey: { input: defaultInput, initialPageParam: 0 },
      })

      utils.infiniteKey({ input: () => ({}), initialPageParam: 1 })

      expect(defaultInput).not.toHaveBeenCalled()
    })

    it('custom queryKey in defaults is used', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        infiniteKey: { queryKey: ['default-infinite-key'] },
      })

      expect(utils.infiniteKey({ input: () => ({}), initialPageParam: 0 })).toEqual(['default-infinite-key'])
    })

    it('applies an modifier function', () => {
      const infiniteKey = vi.fn((options: any) => ({ ...options, queryKey: ['function-infinite-key'] }))
      const utils = new ProcedureUtils(['ping'], client, {
        infiniteKey,
      })

      expect(utils.infiniteKey({ input: () => ({}), initialPageParam: 0 })).toEqual(['function-infinite-key'])
      expect(infiniteKey).toHaveBeenCalledWith({ input: expect.any(Function), initialPageParam: 0 })
    })
  })

  describe('.infiniteOptions', () => {
    it('applies defaults', () => {
      const getNextPageParam = vi.fn()
      const utils = new ProcedureUtils(['ping'], client, {
        infiniteOptions: { staleTime: 1000 },
      })

      const options = utils.infiniteOptions({
        input: () => ({}),
        getNextPageParam,
        initialPageParam: 0,
      }) as any

      expect(options.staleTime).toBe(1000)
    })

    it('user options override defaults', () => {
      const getNextPageParam = vi.fn()
      const utils = new ProcedureUtils(['ping'], client, {
        infiniteOptions: { staleTime: 1000 },
      })

      const options = utils.infiniteOptions({
        input: () => ({}),
        getNextPageParam,
        initialPageParam: 0,
        staleTime: 2000,
      }) as any

      expect(options.staleTime).toBe(2000)
    })

    it('applies an modifier function', () => {
      const infiniteOptions = vi.fn((options: any) => ({ ...options, staleTime: 1000 }))
      const utils = new ProcedureUtils(['ping'], client, {
        infiniteOptions,
      })

      const options = utils.infiniteOptions({
        input: () => ({}),
        getNextPageParam: vi.fn(),
        initialPageParam: 0,
      }) as any

      expect(options.staleTime).toBe(1000)
      expect(infiniteOptions).toHaveBeenCalledWith({
        input: expect.any(Function),
        getNextPageParam: expect.any(Function),
        initialPageParam: 0,
      })
    })

    it('can use infiniteKey options to configure the query key', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        infiniteKey: { queryKey: ['__TEST__'] },
      })

      expect(
        utils.infiniteOptions({
          input: () => ({}),
          getNextPageParam: vi.fn(),
          initialPageParam: 0,
        }).queryKey,
      ).toEqual(['__TEST__'])
    })
  })

  describe('.mutationKey', () => {
    it('applies defaults when no options provided', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        mutationKey: { mutationKey: ['default-mutation-key'] },
      })

      expect(utils.mutationKey()).toEqual(['default-mutation-key'])
    })

    it('user options override defaults', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        mutationKey: { mutationKey: ['default-mutation-key'] },
      })

      expect(utils.mutationKey({ mutationKey: ['user-mutation-key'] })).toEqual(['user-mutation-key'])
    })

    it('applies a modifier function', () => {
      const mutationKey = vi.fn(() => ({ mutationKey: ['function-mutation-key'] }))
      const utils = new ProcedureUtils(['ping'], client, {
        mutationKey,
      })

      expect(utils.mutationKey({ mutationKey: ['per-call'] })).toEqual(['function-mutation-key'])
      expect(mutationKey).toHaveBeenCalledWith({ mutationKey: ['per-call'] })
    })
  })

  describe('.mutationOptions', () => {
    it('applies defaults when no options provided', () => {
      const onSuccess = vi.fn()
      const utils = new ProcedureUtils(['ping'], client, {
        mutationOptions: { onSuccess },
      })

      const options = utils.mutationOptions()

      expect(options.onSuccess).toBe(onSuccess)
    })

    it('user options override defaults', () => {
      const defaultOnSuccess = vi.fn()
      const userOnSuccess = vi.fn()
      const utils = new ProcedureUtils(['ping'], client, {
        mutationOptions: { onSuccess: defaultOnSuccess },
      })

      const options = utils.mutationOptions({ onSuccess: userOnSuccess })

      expect(options.onSuccess).toBe(userOnSuccess)
    })

    it('applies a modifier function', () => {
      const onSuccess = vi.fn()
      const mutationOptions = vi.fn(() => ({ onSuccess }))
      const utils = new ProcedureUtils(['ping'], client, {
        mutationOptions,
      })

      const options = utils.mutationOptions({ mutationKey: ['per-call'] })

      expect(options.onSuccess).toBe(onSuccess)
      expect(mutationOptions).toHaveBeenCalledWith({ mutationKey: ['per-call'] })
    })

    it('can use mutationKey options to configure the query key', () => {
      const utils = new ProcedureUtils(['ping'], client, {
        mutationKey: { mutationKey: ['__TEST__'] },
      })

      expect(utils.mutationOptions().mutationKey).toEqual(['__TEST__'])
    })
  })
})

describe('createProcedureUtils with interceptors', () => {
  const signal = new AbortController().signal
  const client = vi.fn()

  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('applies queryInterceptors', async () => {
    const queryInterceptor = vi.fn((options) => {
      const { next, ...rest } = options

      return next({
        ...rest,
        input: { search: '__intercepted__' },
        context: {
          ...rest.context,
          batch: '__intercepted_batch__',
        },
      })
    })

    const utils = new ProcedureUtils(['ping'], client, {
      queryInterceptors: [queryInterceptor],
    })

    const options = utils.queryOptions({ input: { search: '__search__' }, context: { batch: '__batch__' } })

    client.mockResolvedValueOnce('__output__')
    await expect(options.queryFn!({ signal } as any)).resolves.toBe('__output__')

    expect(queryInterceptor).toHaveBeenCalledTimes(1)
    expect(queryInterceptor.mock.calls[0]![0]).toMatchObject({
      path: ['ping'],
      input: { search: '__search__' },
      context: {
        batch: '__batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.queryKey,
          type: 'query',
        },
      },
      fnContext: { signal },
    })
    expect(client).toHaveBeenCalledWith({ search: '__intercepted__' }, {
      signal,
      context: {
        batch: '__intercepted_batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.queryKey,
          type: 'query',
        },
      },
    })
  })

  it('applies streamedInterceptors', async () => {
    const streamedInterceptor = vi.fn((options) => {
      const { next, ...rest } = options

      return next({
        ...rest,
        input: { search: '__intercepted__' },
        context: {
          ...rest.context,
          batch: '__intercepted_batch__',
        },
      })
    })

    const utils = new ProcedureUtils(['ping'], client, {
      streamedInterceptors: [streamedInterceptor],
    })

    const options = utils.streamedOptions({ input: { search: '__search__' }, context: { batch: '__batch__' } })

    client.mockImplementationOnce(async function* () {
      yield '__1__'
    })
    await expect(options.queryFn!({ signal, client: queryClient, queryKey: options.queryKey } as any)).resolves.toEqual(['__1__'])

    expect(streamedInterceptor).toHaveBeenCalledTimes(1)
    expect(streamedInterceptor.mock.calls[0]![0]).toMatchObject({
      path: ['ping'],
      input: { search: '__search__' },
      context: {
        batch: '__batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.queryKey,
          type: 'streamed',
        },
      },
      fnContext: { signal, client: queryClient, queryKey: options.queryKey },
    })
    expect(client).toHaveBeenCalledWith({ search: '__intercepted__' }, {
      signal,
      context: {
        batch: '__intercepted_batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.queryKey,
          type: 'streamed',
        },
      },
    })
  })

  it('applies liveInterceptors', async () => {
    const liveInterceptor = vi.fn((options) => {
      const { next, ...rest } = options

      return next({
        ...rest,
        input: { search: '__intercepted__' },
        context: {
          ...rest.context,
          batch: '__intercepted_batch__',
        },
      })
    })

    const utils = new ProcedureUtils(['ping'], client, {
      liveInterceptors: [liveInterceptor],
    })

    const options = utils.liveOptions({ input: { search: '__search__' }, context: { batch: '__batch__' } })

    client.mockImplementationOnce(async function* () {
      yield '__1__'
    })
    await expect(options.queryFn!({ signal, client: queryClient, queryKey: options.queryKey } as any)).resolves.toEqual('__1__')

    expect(liveInterceptor).toHaveBeenCalledTimes(1)
    expect(liveInterceptor.mock.calls[0]![0]).toMatchObject({
      path: ['ping'],
      input: { search: '__search__' },
      context: {
        batch: '__batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.queryKey,
          type: 'live',
        },
      },
      fnContext: { signal, client: queryClient, queryKey: options.queryKey },
    })
    expect(client).toHaveBeenCalledWith({ search: '__intercepted__' }, {
      signal,
      context: {
        batch: '__intercepted_batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.queryKey,
          type: 'live',
        },
      },
    })
  })

  it('applies infiniteInterceptors', async () => {
    const infiniteInterceptor = vi.fn((options) => {
      const { next, ...rest } = options

      return next({
        ...rest,
        input: { search: '__intercepted__', pageParam: '__intercepted_page__' },
        context: {
          ...rest.context,
          batch: '__intercepted_batch__',
        },
      })
    })

    const utils = new ProcedureUtils(['ping'], client, {
      infiniteInterceptors: [infiniteInterceptor],
    })

    const options = utils.infiniteOptions({
      input: pageParam => ({ search: '__search__', pageParam }),
      context: { batch: '__batch__' },
      getNextPageParam: vi.fn(),
      initialPageParam: '__initialPageParam__',
    })

    client.mockResolvedValueOnce('__output__')
    await expect(options.queryFn!({ signal, pageParam: '__pageParam__' } as any)).resolves.toBe('__output__')

    expect(infiniteInterceptor).toHaveBeenCalledTimes(1)
    expect(infiniteInterceptor.mock.calls[0]![0]).toMatchObject({
      path: ['ping'],
      input: { search: '__search__', pageParam: '__pageParam__' },
      context: {
        batch: '__batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.queryKey,
          type: 'infinite',
        },
      },
      fnContext: { signal, pageParam: '__pageParam__' },
    })
    expect(client).toHaveBeenCalledWith({ search: '__intercepted__', pageParam: '__intercepted_page__' }, {
      signal,
      context: {
        batch: '__intercepted_batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.queryKey,
          type: 'infinite',
        },
      },
    })
  })

  it('applies mutationInterceptors', async () => {
    const mutationInterceptor = vi.fn((options) => {
      const { next, ...rest } = options

      return next({
        ...rest,
        input: '__intercepted_input__',
        context: {
          ...rest.context,
          batch: '__intercepted_batch__',
        },
      })
    })

    const utils = new ProcedureUtils(['ping'], client, {
      mutationInterceptors: [mutationInterceptor],
    })

    const options = utils.mutationOptions({ context: { batch: '__batch__' } })

    client.mockResolvedValueOnce('__output__')
    await expect(options.mutationFn!('__input__', {} as any)).resolves.toBe('__output__')

    expect(mutationInterceptor).toHaveBeenCalledTimes(1)
    expect(mutationInterceptor.mock.calls[0]![0]).toMatchObject({
      path: ['ping'],
      input: '__input__',
      context: {
        batch: '__batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.mutationKey,
          type: 'mutation',
        },
      },
      fnContext: {},
    })
    expect(client).toHaveBeenCalledWith('__intercepted_input__', {
      context: {
        batch: '__intercepted_batch__',
        [OPERATION_CONTEXT_SYMBOL]: {
          key: options.mutationKey,
          type: 'mutation',
        },
      },
    })
  })
})

describe('isProcedureUtilsOptions', () => {
  it('accepts procedure utils options shapes', () => {
    expect(isProcedureUtilsOptions({})).toBe(true)
    expect(isProcedureUtilsOptions({ prefix: 'planet' })).toBe(true)
    expect(isProcedureUtilsOptions({ queryInterceptors: [], mutationInterceptors: [vi.fn()] })).toBe(true)
    expect(isProcedureUtilsOptions({ queryOptions: { staleTime: 1000 }, mutationKey: () => ({}) })).toBe(true)
    expect(isProcedureUtilsOptions({ liveOptions: undefined, streamedKey: undefined })).toBe(true)
    expect(isProcedureUtilsOptions({ unknown: 'allowed' })).toBe(true)
  })

  it('rejects non procedure utils options shapes', () => {
    expect(isProcedureUtilsOptions(undefined)).toBe(false)
    expect(isProcedureUtilsOptions('invalid')).toBe(false)
    expect(isProcedureUtilsOptions({ prefix: 123 })).toBe(false)
    expect(isProcedureUtilsOptions({ queryInterceptors: { invalid: true } })).toBe(false)
    expect(isProcedureUtilsOptions({ queryInterceptors: [{ invalid: true }] })).toBe(false)
    expect(isProcedureUtilsOptions({ queryOptions: 'invalid' })).toBe(false)
  })
})

describe('mergeProcedureUtilsOptions', () => {
  it('overrides by key presence, keeping absent keys from base', () => {
    const merged = mergeProcedureUtilsOptions<any, any, any, any>(
      { prefix: 'base', queryOptions: { staleTime: 1000 } },
      { prefix: 'override' },
    )

    expect(merged).toEqual({
      prefix: 'override',
      queryOptions: { staleTime: 1000 },
    })
  })

  it('resets keys explicitly set to undefined in override', () => {
    const merged = mergeProcedureUtilsOptions<any, any, any, any>(
      { queryOptions: { staleTime: 1000 }, queryInterceptors: [vi.fn()] },
      { queryOptions: undefined, queryInterceptors: undefined },
    )

    expect(merged).toEqual({})
  })

  it('concatenates interceptors when both defined, base first', () => {
    const interceptor1 = vi.fn()
    const interceptor2 = vi.fn()

    const merged = mergeProcedureUtilsOptions<any, any, any, any>(
      { mutationInterceptors: [interceptor1] },
      { mutationInterceptors: [interceptor2] },
    )

    expect(merged).toEqual({ mutationInterceptors: [interceptor1, interceptor2] })
  })

  it('spread-merges plain object modifiers', () => {
    const merged = mergeProcedureUtilsOptions<any, any, any, any>(
      { queryOptions: { staleTime: 1000, retry: 1 } },
      { queryOptions: { retry: 2 } },
    )

    expect(merged).toEqual({ queryOptions: { staleTime: 1000, retry: 2 } })
  })

  it('composes function modifiers, base applied first', () => {
    const merged = mergeProcedureUtilsOptions<any, any, any, any>(
      { queryOptions: (options: any) => ({ ...options, staleTime: 1000, retry: 1 }) },
      { queryOptions: (options: any) => ({ ...options, retry: 2 }) },
    )

    expect((merged.queryOptions as any)({ enabled: true })).toEqual({ enabled: true, staleTime: 1000, retry: 2 })
  })

  it('composes mixed object and function modifiers', () => {
    const objectFirst = mergeProcedureUtilsOptions<any, any, any, any>(
      { queryOptions: { staleTime: 1000, retry: 1 } },
      { queryOptions: (options: any) => ({ ...options, retry: 2 }) },
    )

    expect((objectFirst.queryOptions as any)({ enabled: true })).toEqual({ enabled: true, staleTime: 1000, retry: 2 })

    const functionFirst = mergeProcedureUtilsOptions<any, any, any, any>(
      { queryOptions: (options: any) => ({ ...options, staleTime: 1000 }) },
      { queryOptions: { retry: 2 } },
    )

    expect((functionFirst.queryOptions as any)({ enabled: true })).toEqual({ enabled: true, staleTime: 1000, retry: 2 })
  })

  it('lets an object override beat defaults of a function base, below per-call options', () => {
    const merged = mergeProcedureUtilsOptions<any, any, any, any>(
      { queryOptions: (options: any) => ({ staleTime: 1000, ...options }) },
      { queryOptions: { staleTime: 0 } },
    )

    expect((merged.queryOptions as any)({})).toEqual({ staleTime: 0 })
    expect((merged.queryOptions as any)({ staleTime: 5 })).toEqual({ staleTime: 5 })
  })
})
