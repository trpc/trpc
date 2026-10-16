import { isDefinedError, ORPCError } from '@orpc/client'
import { useInfiniteQuery, useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { defineComponent, ref } from 'vue'
import { createPiniaColadaUtils, PINIA_COLADA_OPERATION_CONTEXT_SYMBOL } from '../src'
import { client, mount, orpc, router } from './__shared__/orpc'

beforeEach(() => {
  vi.clearAllMocks()
})

it('case: call directly', async () => {
  expect(await orpc.ping.call({ input: 123 })).toEqual({ output: '123' })
})

it('case: with useQuery', async () => {
  const mounted = mount(defineComponent({
    setup() {
      const id = ref(123)

      const queryCache = useQueryCache()
      const query = useQuery(() => orpc.nested.ping.queryOptions({ input: { input: id.value } }))

      const setId = (value: number) => {
        id.value = value
      }

      return { query, queryCache, setId }
    },
    render: () => null,
  }))

  // I don't know why but we should put error case in the top of the test or it will fail by `Unhandled Rejection`
  vi.mocked(router.nested.ping['~orpc'].handler).mockRejectedValueOnce(new ORPCError('OVERRIDE'))
  await vi.waitFor(
    () => expect(mounted.vm.query.error.value).toSatisfy((e: any) => isDefinedError(e) && e.code === 'OVERRIDE'),
  )

  mounted.vm.queryCache.invalidateQueries({ key: orpc.ping.key() })
  expect(mounted.vm.query.isLoading.value).toEqual(false)

  mounted.vm.queryCache.invalidateQueries({ key: orpc.nested.pong.key() })
  expect(mounted.vm.query.isLoading.value).toEqual(false)

  mounted.vm.queryCache.invalidateQueries({ key: orpc.nested.key() })
  expect(mounted.vm.query.isLoading.value).toEqual(true)

  await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual({ output: '123' }))

  expect(
    mounted.vm.queryCache.getQueryData(orpc.nested.ping.queryKey({ input: { input: 123 } })),
  ).toEqual({ output: '123' })

  mounted.vm.setId(456)

  await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual({ output: '456' }))
})

it('case: with streamed/useQuery', async () => {
  const mounted = mount(defineComponent({
    setup() {
      const input = ref(2)

      const queryCache = useQueryCache()
      const query = useQuery(() => orpc.stream.streamedOptions({
        input: { input: input.value },
        fnOptions: { refetchMode: 'append', maxChunks: 3 },
      }))

      const setInput = (value: number) => {
        input.value = value
      }

      return { query, queryCache, setInput }
    },
    render: () => null,
  }))

  // I don't know why but we should put error case in the top of the test or it will fail by `Unhandled Rejection`
  vi.mocked(router.stream['~orpc'].handler).mockRejectedValueOnce(new ORPCError('OVERRIDE'))
  await vi.waitFor(
    () => expect(mounted.vm.query.error.value).toSatisfy((e: any) => isDefinedError(e) && e.code === 'OVERRIDE'),
  )

  // next fetch streams chunk by chunk, gated so intermediate states are observable
  const releases: (() => void)[] = []
  vi.mocked(router.stream['~orpc'].handler).mockImplementationOnce(async function* () {
    yield { output: '0' }
    await new Promise<void>(resolve => releases.push(resolve))
    yield { output: '1' }
  } as any)

  mounted.vm.queryCache.invalidateQueries({ key: orpc.ping.key() })
  expect(mounted.vm.query.isLoading.value).toEqual(false)

  mounted.vm.queryCache.invalidateQueries({ key: orpc.stream.key({ type: 'live' }) })
  expect(mounted.vm.query.isLoading.value).toEqual(false)

  mounted.vm.queryCache.invalidateQueries({ key: orpc.stream.key({ type: 'streamed' }) })
  expect(mounted.vm.query.isLoading.value).toEqual(true)

  // the first chunk is visible while the stream is still open
  await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual([{ output: '0' }]))
  expect(mounted.vm.query.isLoading.value).toEqual(true)

  releases[0]!()

  await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual([
    { output: '0' },
    { output: '1' },
  ]))
  await vi.waitFor(() => expect(mounted.vm.query.isLoading.value).toEqual(false))

  expect(
    mounted.vm.queryCache.getQueryData(orpc.stream.streamedKey({
      input: { input: 2 },
      fnOptions: { refetchMode: 'append', maxChunks: 3 },
    })),
  ).toEqual([{ output: '0' }, { output: '1' }])

  // append mode: refetching appends new chunks, limited by maxChunks
  await mounted.vm.query.refetch()

  await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual([
    { output: '1' },
    { output: '0' },
    { output: '1' },
  ]))

  // changing the input targets a fresh entry
  mounted.vm.setInput(1)

  await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual([{ output: '0' }]))
})

it('case: with live/useQuery', async () => {
  const mounted = mount(defineComponent({
    setup() {
      const queryCache = useQueryCache()
      const query = useQuery(orpc.stream.liveOptions({ input: { input: 2 } }))

      return { query, queryCache }
    },
    render: () => null,
  }))

  // I don't know why but we should put error case in the top of the test or it will fail by `Unhandled Rejection`
  vi.mocked(router.stream['~orpc'].handler).mockRejectedValueOnce(new ORPCError('OVERRIDE'))
  await vi.waitFor(
    () => expect(mounted.vm.query.error.value).toSatisfy((e: any) => isDefinedError(e) && e.code === 'OVERRIDE'),
  )

  // next fetch streams chunk by chunk, gated so intermediate states are observable
  const releases: (() => void)[] = []
  vi.mocked(router.stream['~orpc'].handler).mockImplementationOnce(async function* () {
    yield { output: '0' }
    await new Promise<void>(resolve => releases.push(resolve))
    yield { output: '1' }
  } as any)

  mounted.vm.queryCache.invalidateQueries({ key: orpc.stream.key({ type: 'streamed' }) })
  expect(mounted.vm.query.isLoading.value).toEqual(false)

  mounted.vm.queryCache.invalidateQueries({ key: orpc.stream.key({ type: 'live' }) })
  expect(mounted.vm.query.isLoading.value).toEqual(true)

  // each chunk replaces the previous value while the stream is still open
  await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual({ output: '0' }))
  expect(mounted.vm.query.isLoading.value).toEqual(true)

  releases[0]!()

  await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual({ output: '1' }))
  await vi.waitFor(() => expect(mounted.vm.query.isLoading.value).toEqual(false))

  expect(
    mounted.vm.queryCache.getQueryData(orpc.stream.liveKey({ input: { input: 2 } })),
  ).toEqual({ output: '1' })
})

it('case: with useInfiniteQuery', async () => {
  const mounted = mount(defineComponent({
    setup() {
      const queryCache = useQueryCache()
      const query = useInfiniteQuery(() => orpc.list.infiniteOptions({
        input: (cursor: number) => ({ cursor }),
        initialPageParam: 0,
        getNextPageParam: lastPage => lastPage.next,
      }))

      return { query, queryCache }
    },
    render: () => null,
  }))

  await vi.waitFor(() => expect(mounted.vm.query.data.value?.pages).toEqual([
    { items: ['item-0'], next: 1 },
  ]))

  expect(mounted.vm.query.hasNextPage.value).toEqual(true)

  await mounted.vm.query.loadNextPage()
  await mounted.vm.query.loadNextPage()

  await vi.waitFor(() => expect(mounted.vm.query.data.value?.pages).toEqual([
    { items: ['item-0'], next: 1 },
    { items: ['item-1'], next: 2 },
    { items: ['item-2'], next: null },
  ]))

  expect(mounted.vm.query.hasNextPage.value).toEqual(false)

  expect(
    mounted.vm.queryCache.getQueryData(orpc.list.infiniteKey({ input: (cursor: number) => ({ cursor }), initialPageParam: 0 })),
  ).toEqual({
    pages: [
      { items: ['item-0'], next: 1 },
      { items: ['item-1'], next: 2 },
      { items: ['item-2'], next: null },
    ],
    pageParams: [0, 1, 2],
  })
})

it('case: with useMutation', async () => {
  const mounted = mount(defineComponent({
    setup() {
      const mutation = useMutation(orpc.nested.ping.mutationOptions())

      return { mutation }
    },
    render: () => null,
  }))

  mounted.vm.mutation.mutate({ input: 123 })

  await vi.waitFor(() => expect(mounted.vm.mutation.data.value).toEqual({ output: '123' }))

  vi.mocked(router.nested.ping['~orpc'].handler).mockRejectedValueOnce(new ORPCError('OVERRIDE'))

  mounted.vm.mutation.mutate({ input: 456 })

  await vi.waitFor(() => {
    expect((mounted.vm.mutation as any).error.value).toBeInstanceOf(ORPCError)
    expect((mounted.vm.mutation as any).error.value).toSatisfy(isDefinedError)
    expect((mounted.vm.mutation as any).error.value.code).toEqual('OVERRIDE')
  })
})

it('case: with prefix', async () => {
  const prefixed = createPiniaColadaUtils(client, { prefix: '__prefix__' })

  expect(prefixed.nested.ping.key({ type: 'query' })).toEqual(['__prefix__', ['nested', 'ping'], { type: 'query' }])
  expect(prefixed.nested.ping.queryKey({ input: { input: 123 } })).not.toEqual(orpc.nested.ping.queryKey({ input: { input: 123 } }))

  const mounted = mount(defineComponent({
    setup() {
      const queryCache = useQueryCache()
      const prefixedQuery = useQuery(prefixed.nested.ping.queryOptions({ input: { input: 123 } }))
      const query = useQuery(orpc.nested.ping.queryOptions({ input: { input: 123 } }))

      return { prefixedQuery, query, queryCache }
    },
    render: () => null,
  }))

  await vi.waitFor(() => expect(mounted.vm.prefixedQuery.data.value).toEqual({ output: '123' }))
  await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual({ output: '123' }))

  expect(
    mounted.vm.queryCache.getQueryData(prefixed.nested.ping.queryKey({ input: { input: 123 } })),
  ).toEqual({ output: '123' })

  // invalidating un-prefixed keys does not touch prefixed entries
  mounted.vm.queryCache.invalidateQueries({ key: orpc.key() })
  expect(mounted.vm.prefixedQuery.isLoading.value).toEqual(false)
  expect(mounted.vm.query.isLoading.value).toEqual(true)

  // invalidating prefixed keys does not touch un-prefixed entries
  await vi.waitFor(() => expect(mounted.vm.query.isLoading.value).toEqual(false))
  mounted.vm.queryCache.invalidateQueries({ key: prefixed.key() })
  expect(mounted.vm.prefixedQuery.isLoading.value).toEqual(true)
  expect(mounted.vm.query.isLoading.value).toEqual(false)
})

it('case: with interceptors and plugins', async () => {
  const queryInterceptor = vi.fn(({ next }: any) => next())
  const mutationInterceptor = vi.fn(({ next }: any) => next())

  const utils = createPiniaColadaUtils(client, {
    queryInterceptors: [queryInterceptor],
    plugins: [
      {
        name: 'test-plugin',
        init: options => ({
          ...options,
          mutationInterceptors: [...(options.mutationInterceptors ?? []), mutationInterceptor],
        }),
      },
    ],
  })

  const mounted = mount(defineComponent({
    setup() {
      const query = useQuery(utils.nested.ping.queryOptions({ input: { input: 123 } }))
      const mutation = useMutation(utils.nested.ping.mutationOptions())

      return { query, mutation }
    },
    render: () => null,
  }))

  await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual({ output: '123' }))

  expect(queryInterceptor).toHaveBeenCalledTimes(1)
  expect(queryInterceptor).toHaveBeenCalledWith(expect.objectContaining({
    path: ['nested', 'ping'],
    input: { input: 123 },
    context: expect.objectContaining({
      [PINIA_COLADA_OPERATION_CONTEXT_SYMBOL]: {
        key: utils.nested.ping.key({ type: 'query', input: { input: 123 } }),
        type: 'query',
      },
    }),
  }))

  mounted.vm.mutation.mutate({ input: 456 })

  await vi.waitFor(() => expect(mounted.vm.mutation.data.value).toEqual({ output: '456' }))

  expect(mutationInterceptor).toHaveBeenCalledTimes(1)
  expect(mutationInterceptor).toHaveBeenCalledWith(expect.objectContaining({
    path: ['nested', 'ping'],
    input: { input: 456 },
    context: expect.objectContaining({
      [PINIA_COLADA_OPERATION_CONTEXT_SYMBOL]: {
        key: utils.nested.ping.key({ type: 'mutation', input: { input: 456 } }),
        type: 'mutation',
      },
    }),
  }))
})
