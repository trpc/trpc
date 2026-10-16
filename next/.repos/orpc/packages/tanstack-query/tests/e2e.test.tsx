import { ORPCError } from '@orpc/client'
import { skipToken, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { orpc, queryClient, router } from './__shared__/orpc'

beforeEach(() => {
  queryClient.clear()
  vi.clearAllMocks()
})

it('case: call directly', async () => {
  expect(await orpc.static.call({ input: 123 })).toEqual({ output: '123' })
})

it('case: with useQuery', async () => {
  const { result } = renderHook(() => useQuery(orpc.static.queryOptions({ input: { input: 123 } }), queryClient))

  expect(queryClient.isFetching({ queryKey: orpc.key() })).toEqual(1)
  expect(queryClient.isFetching({ queryKey: orpc.static.key() })).toEqual(1)
  expect(queryClient.isFetching({ queryKey: orpc.static.key({ input: { input: 123 } }) })).toEqual(1)
  expect(queryClient.isFetching({ queryKey: orpc.static.key({ input: { input: 123 }, type: 'query' }) })).toEqual(1)

  expect(queryClient.isFetching({ queryKey: orpc.static.key({ input: { input: 234 }, type: 'query' }) })).toEqual(0)
  expect(queryClient.isFetching({ queryKey: orpc.static.key({ input: { input: 123 }, type: 'infinite' }) })).toEqual(0)
  expect(queryClient.isFetching({ queryKey: orpc.stream.key() })).toEqual(0)

  await act(async () => {
    await vi.waitFor(() => expect(result.current.data).toEqual({ output: '123' }))
  })

  expect(
    queryClient.getQueryData(orpc.static.queryKey({ input: { input: 123 } })),
  ).toEqual({ output: '123' })

  await act(async () => {
    vi.mocked(router.static['~orpc'].handler).mockRejectedValueOnce(new ORPCError('TEST'))
    result.current.refetch()

    await vi.waitFor(() => {
      expect((result as any).current.error).toBeInstanceOf(ORPCError)
      expect((result as any).current.error.code).toEqual('TEST')
    })
  })
})

it('case: with useQuery and skipToken', async () => {
  const { result } = renderHook(() => useQuery(orpc.static.queryOptions({ input: skipToken }), queryClient))

  expect(result.current.status).toEqual('pending')
  expect(queryClient.isFetching({ queryKey: orpc.key() })).toEqual(0)

  await new Promise(resolve => setTimeout(resolve, 10))

  expect(queryClient.isFetching({ queryKey: orpc.key() })).toEqual(0)
  expect(result.current.status).toEqual('pending')
})

it('case: useQuery with and without skipToken do not share a query', async () => {
  const { result } = renderHook(() => ({
    unskipped: useQuery(orpc.stream.streamedOptions(), queryClient),
    skipped: useQuery(orpc.stream.streamedOptions({ input: skipToken }), queryClient),
  }))

  await act(async () => {
    await vi.waitFor(() => expect(result.current.unskipped.status).toEqual('success'))
  })

  expect(queryClient.getQueryCache().findAll({ queryKey: orpc.stream.key() })).toHaveLength(2)

  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: orpc.stream.key() })
  })

  expect(result.current.unskipped.status).toEqual('success')
  expect(result.current.skipped.status).toEqual('pending')
})

it('case: with streamed/useQuery', async () => {
  const { result } = renderHook(() => useQuery(orpc.stream.streamedOptions({
    queryFnOptions: {
      refetchMode: 'append',
      maxChunks: 3,
    },
    input: { input: 2 },
  }), queryClient))

  expect(queryClient.isFetching({ queryKey: orpc.key() })).toEqual(1)
  expect(queryClient.isFetching({ queryKey: orpc.stream.key() })).toEqual(1)
  expect(queryClient.isFetching({ queryKey: orpc.stream.key({ input: { input: 2 } }) })).toEqual(1)
  expect(queryClient.isFetching({ queryKey: orpc.stream.key({ input: { input: 2 }, type: 'streamed' }) })).toEqual(1)

  expect(queryClient.isFetching({ queryKey: orpc.stream.key({ input: { input: 234 }, type: 'query' }) })).toEqual(0)
  expect(queryClient.isFetching({ queryKey: orpc.stream.key({ input: { input: 2 }, type: 'infinite' }) })).toEqual(0)
  expect(queryClient.isFetching({ queryKey: orpc.key({ type: 'infinite' }) })).toEqual(0)
  expect(queryClient.isFetching({ queryKey: orpc.static.key() })).toEqual(0)

  await act(async () => {
    await vi.waitFor(() => expect(result.current.data).toEqual([{ output: '0' }, { output: '1' }]))
  })

  expect(
    queryClient.getQueryData(orpc.stream.streamedKey({ input: { input: 2 }, queryFnOptions: { refetchMode: 'append', maxChunks: 3 } })),
  ).toEqual([{ output: '0' }, { output: '1' }])

  await act(async () => {
    // make sure refetch mode works
    result.current.refetch()

    await vi.waitFor(() => expect(result.current.data).toEqual([{ output: '1' }, { output: '0' }, { output: '1' }]))
  })

  await act(async () => {
    vi.mocked(router.stream['~orpc'].handler).mockRejectedValueOnce(new ORPCError('TEST'))
    result.current.refetch()

    await vi.waitFor(() => {
      expect((result as any).current.error).toBeInstanceOf(ORPCError)
      expect((result as any).current.error.code).toEqual('TEST')
    })
  })
})

it('case: with streamed/useQuery and skipToken', async () => {
  const { result } = renderHook(() => useQuery(orpc.stream.streamedOptions({ input: skipToken }), queryClient))

  expect(result.current.status).toEqual('pending')
  expect(queryClient.isFetching({ queryKey: orpc.key() })).toEqual(0)

  await new Promise(resolve => setTimeout(resolve, 10))

  expect(queryClient.isFetching({ queryKey: orpc.key() })).toEqual(0)
  expect(result.current.status).toEqual('pending')
})

it('case: with useInfiniteQuery', async () => {
  const { result } = renderHook(() => useInfiniteQuery(orpc.static.infiniteOptions({
    input: pageParam => ({ input: pageParam }),
    getNextPageParam: lastPage => Number(lastPage.output) + 1,
    initialPageParam: 1,
  }), queryClient))

  expect(queryClient.isFetching({ queryKey: orpc.key() })).toEqual(1)
  expect(queryClient.isFetching({ queryKey: orpc.static.key() })).toEqual(1)
  expect(queryClient.isFetching({ queryKey: orpc.static.key({ input: { input: 1 } }) })).toEqual(1)
  expect(queryClient.isFetching({ queryKey: orpc.static.key({ input: { input: 1 }, type: 'infinite' }) })).toEqual(1)

  expect(queryClient.isFetching({ queryKey: orpc.static.key({ input: { input: 2 }, type: 'infinite' }) })).toEqual(0)
  expect(queryClient.isFetching({ queryKey: orpc.static.key({ input: { input: 1 }, type: 'query' }) })).toEqual(0)
  expect(queryClient.isFetching({ queryKey: orpc.static.key({ type: 'query' }) })).toEqual(0)
  expect(queryClient.isFetching({ queryKey: orpc.stream.key() })).toEqual(0)

  await act(async () => {
    await vi.waitFor(() => expect(result.current.data).toEqual({
      pageParams: [1],
      pages: [
        { output: '1' },
      ],
    }))
  })

  expect(
    queryClient.getQueryData(orpc.static.infiniteKey({ input: input => ({ input }), initialPageParam: 1 })),
  ).toEqual({
    pageParams: [1],
    pages: [
      { output: '1' },
    ],
  })

  await act(async () => {
    result.current.fetchNextPage()

    await vi.waitFor(() => expect(result.current.data).toEqual({
      pageParams: [1, 2],
      pages: [
        { output: '1' },
        { output: '2' },
      ],
    }))
  })

  expect(
    queryClient.getQueryData(orpc.static.key({ input: { input: 1 }, type: 'infinite' })),
  ).toEqual({
    pageParams: [1, 2],
    pages: [
      { output: '1' },
      { output: '2' },
    ],
  })

  await act(async () => {
    vi.mocked(router.static['~orpc'].handler).mockRejectedValueOnce(new ORPCError('TEST'))
    result.current.fetchNextPage()

    await vi.waitFor(() => {
      expect((result as any).current.error).toBeInstanceOf(ORPCError)
      expect((result as any).current.error.code).toEqual('TEST')
    })
  })
})

it('case: with useInfiniteQuery with skipToken', async () => {
  const { result } = renderHook(() => useInfiniteQuery(orpc.static.infiniteOptions({
    input: skipToken,
    getNextPageParam: lastPage => Number(lastPage.output) + 1,
    initialPageParam: 1,
  }), queryClient))

  expect(result.current.status).toEqual('pending')
  expect(queryClient.isFetching({ queryKey: orpc.key() })).toEqual(0)

  await new Promise(resolve => setTimeout(resolve, 10))

  expect(queryClient.isFetching({ queryKey: orpc.key() })).toEqual(0)
  expect(result.current.status).toEqual('pending')
})

it('case: with useMutation', async () => {
  const { result } = renderHook(() => useMutation(orpc.static.mutationOptions(), queryClient))

  act(() => {
    result.current.mutate({ input: 123 })
  })

  expect(queryClient.isMutating({ mutationKey: orpc.key() })).toEqual(1)
  expect(queryClient.isMutating({ mutationKey: orpc.static.key() })).toEqual(1)
  expect(queryClient.isMutating({ mutationKey: orpc.static.key({ type: 'mutation' }) })).toEqual(1)

  expect(queryClient.isMutating({ mutationKey: orpc.static.key({ type: 'query' }) })).toEqual(0)
  expect(queryClient.isMutating({ mutationKey: orpc.stream.key() })).toEqual(0)

  await act(async () => {
    await vi.waitFor(() => expect(result.current.data).toEqual({ output: '123' }))
  })

  await act(async () => {
    vi.mocked(router.static['~orpc'].handler).mockRejectedValueOnce(new ORPCError('TEST'))
    result.current.mutate({ input: 456 })

    await vi.waitFor(() => {
      expect((result as any).current.error).toBeInstanceOf(ORPCError)
      expect((result as any).current.error.code).toEqual('TEST')
    })
  })
})
