import type { AsyncIteratorClass } from '@orpc/client'
import type { InfiniteData } from '@tanstack/react-query'
import { isDefinedError } from '@orpc/client'
import { useInfiniteQuery, useMutation, useQueries, useQuery, useSuspenseInfiniteQuery, useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { client, orpc, queryClient } from './__shared__/orpc'

it('.key', () => {
  queryClient.invalidateQueries({
    queryKey: orpc.key({ type: 'query' }),
  })

  orpc.static.key({})
  orpc.static.key({ input: { input: 123 } })
  // @ts-expect-error --- input is invalid
  orpc.static.key({ input: { input: 'INVALID' } })
})

it('.call', () => {
  expectTypeOf(orpc.static.call).toEqualTypeOf(client.static)
  expectTypeOf(orpc.stream.call).toEqualTypeOf(client.stream)
})

it('.queryKey', () => {
  const state = queryClient.getQueryState(orpc.static.queryKey({ input: { input: 123 } }))

  expectTypeOf(state?.data).toEqualTypeOf<{ output: string } | undefined>()

  if (isDefinedError(state?.error) && state.error.code === 'STATIC_ERROR') {
    expectTypeOf(state.error.data).toEqualTypeOf<{ static: string }>()
  }
})

describe('.queryOptions', () => {
  it('useQuery', () => {
    const query = useQuery(orpc.static.queryOptions({
      input: { input: 123 },
      retry(failureCount, error) {
        if (isDefinedError(error) && error.code === 'STATIC_ERROR') {
          expectTypeOf(error.data).toEqualTypeOf<{ static: string }>()
        }

        return false
      },
    }))

    if (query.status === 'error' && isDefinedError(query.error) && query.error.code === 'STATIC_ERROR') {
      expectTypeOf(query.error.data).toEqualTypeOf<{ static: string }>()
    }

    if (query.status === 'success') {
      expectTypeOf(query.data).toEqualTypeOf<{ output: string }>()
    }

    useQuery(orpc.static.queryOptions({
      input: {
        // @ts-expect-error --- input is invalid
        input: '123',
      },
    }))

    useQuery(orpc.static.queryOptions({
      input: { input: 123 },
      context: {
        // @ts-expect-error --- cache is invalid
        cache: 123,
      },
    }))
  })

  it('useSuspenseQuery', () => {
    const query = useSuspenseQuery(orpc.static.queryOptions({
      input: { input: 123 },
      retry(failureCount, error) {
        if (isDefinedError(error) && error.code === 'STATIC_ERROR') {
          expectTypeOf(error.data).toEqualTypeOf<{ static: string }>()
        }

        return false
      },
    }))

    if (query.status === 'error' && isDefinedError(query.error) && query.error.code === 'STATIC_ERROR') {
      expectTypeOf(query.error.data).toEqualTypeOf<{ static: string }>()
    }

    expectTypeOf(query.data).toEqualTypeOf<{ output: string }>()

    useSuspenseQuery(orpc.static.queryOptions({
      input: {
        // @ts-expect-error --- input is invalid
        input: '123',
      },
    }))

    useSuspenseQuery(orpc.static.queryOptions({
      input: { input: 123 },
      context: {
        // @ts-expect-error --- cache is invalid
        cache: 123,
      },
    }))
  })

  it('useQueries', async () => {
    const queries = useQueries({
      queries: [
        orpc.static.queryOptions({
          input: { input: 123 },
          select: data => ({ mapped: data }),
          retry(failureCount, error) {
            if (isDefinedError(error) && error.code === 'STATIC_ERROR') {
              expectTypeOf(error.data).toEqualTypeOf<{ static: string }>()
            }

            return false
          },
        }),
        orpc.stream.queryOptions({
          context: { cache: true },
        }),
      ],
    })

    if (queries[0].status === 'error' && isDefinedError(queries[0].error) && queries[0].error.code === 'STATIC_ERROR') {
      expectTypeOf(queries[0].error.data).toEqualTypeOf<{ static: string }>()
    }

    if (queries[0].status === 'success') {
      expectTypeOf(queries[0].data.mapped).toEqualTypeOf<{ output: string }>()
    }

    if (queries[1].status === 'error' && isDefinedError(queries[1].error) && queries[1].error.code === 'STREAM_ERROR') {
      expectTypeOf(queries[1].error.data).toEqualTypeOf<{ stream: string }>()
    }

    if (queries[1].status === 'success') {
      expectTypeOf(queries[1].data).toEqualTypeOf<AsyncIteratorClass<{ output: string }>>()
    }
  })

  it('useSuspenseQueries', async () => {
    const queries = useSuspenseQueries({
      queries: [
        orpc.static.queryOptions({
          input: { input: 123 },
          select: data => ({ mapped: data }),
          retry(failureCount, error) {
            if (isDefinedError(error) && error.code === 'STATIC_ERROR') {
              expectTypeOf(error.data).toEqualTypeOf<{ static: string }>()
            }

            return false
          },
        }),
        orpc.stream.queryOptions({
          context: { cache: true },
        }),
      ],
    })

    if (queries[0].status === 'error' && isDefinedError(queries[0].error) && queries[0].error.code === 'STATIC_ERROR') {
      expectTypeOf(queries[0].error.data).toEqualTypeOf<{ static: string }>()
    }

    expectTypeOf(queries[0].data.mapped).toEqualTypeOf<{ output: string }>()

    if (queries[0].status === 'error' && isDefinedError(queries[0].error) && queries[0].error.code === 'STATIC_ERROR') {
      expectTypeOf(queries[0].error.data).toEqualTypeOf<{ static: string }>()
    }

    expectTypeOf(queries[1].data).toEqualTypeOf<AsyncIteratorClass<{ output: string }>>()
  })

  it('fetchQuery', async () => {
    const query = await queryClient.fetchQuery(orpc.static.queryOptions({
      input: { input: 123 },
    }))

    expectTypeOf(query).toEqualTypeOf<{ output: string }>()
  })
})

it('.streamedKey', () => {
  const state = queryClient.getQueryState(orpc.stream.streamedKey({ input: { input: 123 } }))

  expectTypeOf(state?.data).toEqualTypeOf<{ output: string }[] | undefined>()

  if (isDefinedError(state?.error) && state.error.code === 'STREAM_ERROR') {
    expectTypeOf(state.error.data).toEqualTypeOf<{ stream: string }>()
  }
})

describe('.streamedOptions', () => {
  it('useQuery', () => {
    const query = useQuery(orpc.stream.streamedOptions({
      input: { input: 123 },
      retry(failureCount, error) {
        if (isDefinedError(error) && error.code === 'STREAM_ERROR') {
          expectTypeOf(error.data).toEqualTypeOf<{ stream: string }>()
        }

        return false
      },
    }))

    if (query.status === 'error' && isDefinedError(query.error) && query.error.code === 'STREAM_ERROR') {
      expectTypeOf(query.error.data).toEqualTypeOf<{ stream: string }>()
    }

    if (query.status === 'success') {
      expectTypeOf(query.data).toEqualTypeOf<{ output: string }[]>()
    }

    useQuery(orpc.stream.streamedOptions({
      input: {
        // @ts-expect-error --- input is invalid
        input: 'invalid',
      },
    }))

    useQuery(orpc.stream.streamedOptions({
      input: { input: 123 },
      context: {
        // @ts-expect-error --- cache is invalid
        cache: 'invalid',
      },
    }))
  })

  it('useSuspenseQuery', () => {
    const query = useSuspenseQuery(orpc.stream.streamedOptions({
      input: { input: 123 },
      retry(failureCount, error) {
        if (isDefinedError(error) && error.code === 'STREAM_ERROR') {
          expectTypeOf(error.data).toEqualTypeOf<{ stream: string }>()
        }

        return false
      },
    }))

    if (query.status === 'error' && isDefinedError(query.error) && query.error.code === 'STREAM_ERROR') {
      expectTypeOf(query.error.data).toEqualTypeOf<{ stream: string }>()
    }

    expectTypeOf(query.data).toEqualTypeOf<{ output: string }[]>()

    useSuspenseQuery(orpc.stream.streamedOptions({
      input: {
        // @ts-expect-error --- input is invalid
        input: 'invalid',
      },
    }))

    useSuspenseQuery(orpc.stream.streamedOptions({
      input: { input: 123 },
      context: {
        // @ts-expect-error --- cache is invalid
        cache: 'invalid',
      },
    }))
  })

  it('useQueries', async () => {
    const queries = useQueries({
      queries: [
        orpc.stream.streamedOptions({
          input: { input: 123 },
          select: data => ({ mapped: data }),
          retry(failureCount, error) {
            if (isDefinedError(error) && error.code === 'STREAM_ERROR') {
              expectTypeOf(error.data).toEqualTypeOf<{ stream: string }>()
            }

            return false
          },
        }),
        orpc.static.queryOptions({
          context: { cache: true },
          input: { input: 456 },
        }),
      ],
    })

    if (queries[0].status === 'error' && isDefinedError(queries[0].error) && queries[0].error.code === 'STREAM_ERROR') {
      expectTypeOf(queries[0].error.data).toEqualTypeOf<{ stream: string }>()
    }

    if (queries[0].status === 'success') {
      expectTypeOf(queries[0].data.mapped).toEqualTypeOf<{ output: string }[]>()
    }

    if (queries[1].status === 'error' && isDefinedError(queries[1].error) && queries[1].error.code === 'STATIC_ERROR') {
      expectTypeOf(queries[1].error.data).toEqualTypeOf<{ static: string }>()
    }

    if (queries[1].status === 'success') {
      expectTypeOf(queries[1].data).toEqualTypeOf<{ output: string }>()
    }
  })

  it('useSuspenseQueries', async () => {
    const queries = useSuspenseQueries({
      queries: [
        orpc.stream.streamedOptions({
          input: { input: 123 },
          select: data => ({ mapped: data }),
          retry(failureCount, error) {
            if (isDefinedError(error) && error.code === 'STREAM_ERROR') {
              expectTypeOf(error.data).toEqualTypeOf<{ stream: string }>()
            }

            return false
          },
        }),
        orpc.static.queryOptions({
          context: { cache: true },
          input: { input: 456 },
        }),
      ],
    })

    if (queries[0].status === 'error' && isDefinedError(queries[0].error) && queries[0].error.code === 'STREAM_ERROR') {
      expectTypeOf(queries[0].error.data).toEqualTypeOf<{ stream: string }>()
    }

    expectTypeOf(queries[0].data.mapped).toEqualTypeOf<{ output: string }[]>()

    if (queries[1].status === 'error' && isDefinedError(queries[1].error) && queries[1].error.code === 'STATIC_ERROR') {
      expectTypeOf(queries[1].error.data).toEqualTypeOf<{ static: string }>()
    }

    expectTypeOf(queries[1].data).toEqualTypeOf<{ output: string }>()
  })

  it('fetchQuery', async () => {
    const query = await queryClient.fetchQuery(orpc.stream.streamedOptions({
      input: { input: 123 },
    }))

    expectTypeOf(query).toEqualTypeOf<{ output: string }[]>()
  })
})

it('.infiniteKey', () => {
  const state = queryClient.getQueryState(orpc.static.infiniteKey({
    input: input => ({ input }),
    initialPageParam: 1,
  }))

  expectTypeOf(state?.data).toEqualTypeOf<InfiniteData<{ output: string }, number> | undefined>()

  if (isDefinedError(state?.error) && state.error.code === 'STATIC_ERROR') {
    expectTypeOf(state.error.data).toEqualTypeOf<{ static: string }>()
  }
})

describe('.infiniteOptions', () => {
  it('useInfiniteQuery', () => {
    const query = useInfiniteQuery(orpc.static.infiniteOptions({
      input: pagePram => ({ input: pagePram }),
      getNextPageParam: () => 2,
      initialPageParam: 2,
      retry(failureCount, error) {
        if (isDefinedError(error) && error.code === 'STATIC_ERROR') {
          expectTypeOf(error.data).toEqualTypeOf<{ static: string }>()
        }

        return false
      },
    }))

    if (query.status === 'error' && isDefinedError(query.error) && query.error.code === 'STATIC_ERROR') {
      expectTypeOf(query.error.data).toEqualTypeOf<{ static: string }>()
    }

    if (query.status === 'success') {
      expectTypeOf(query.data.pages[0]!).toEqualTypeOf<{ output: string }>()
    }

    useInfiniteQuery(orpc.static.infiniteOptions({
      // @ts-expect-error --- input is invalid
      input: pagePram => ({
        input: pagePram,
      }),
      getNextPageParam: () => '2',
      initialPageParam: '2',
    }))

    useInfiniteQuery(orpc.static.infiniteOptions({
      input: pagePram => ({ input: pagePram }),
      context: {
        // @ts-expect-error --- cache is invalid
        cache: 123,
      },
      getNextPageParam: () => 2,
      initialPageParam: 1,
    }))
  })

  it('useSuspenseInfiniteQuery', () => {
    const query = useSuspenseInfiniteQuery(orpc.static.infiniteOptions({
      input: pagePram => ({ input: pagePram }),
      getNextPageParam: () => 2,
      initialPageParam: 2,
      retry(failureCount, error) {
        if (isDefinedError(error) && error.code === 'STATIC_ERROR') {
          expectTypeOf(error.data).toEqualTypeOf<{ static: string }>()
        }

        return false
      },
    }))

    if (query.status === 'error' && isDefinedError(query.error) && query.error.code === 'STATIC_ERROR') {
      expectTypeOf(query.error.data).toEqualTypeOf<{ static: string }>()
    }

    if (query.status === 'success') {
      expectTypeOf(query.data.pages[0]!).toEqualTypeOf<{ output: string }>()
    }

    useSuspenseInfiniteQuery(orpc.static.infiniteOptions({
      // @ts-expect-error --- input is invalid
      input: pagePram => ({
        input: pagePram,
      }),
      getNextPageParam: () => '2',
      initialPageParam: '2',
    }))

    useSuspenseInfiniteQuery(orpc.static.infiniteOptions({
      input: pagePram => ({ input: pagePram }),
      context: {
        // @ts-expect-error --- cache is invalid
        cache: 123,
      },
      getNextPageParam: () => 2,
      initialPageParam: 1,
    }))
  })

  it('fetchInfiniteQuery', async () => {
    const query = await queryClient.fetchInfiniteQuery(orpc.static.infiniteOptions({
      input: pagePram => ({ input: pagePram }),
      getNextPageParam: () => 2,
      initialPageParam: 2,
    }))

    expectTypeOf(query).toEqualTypeOf<InfiniteData<{ output: string }, number>>()
  })
})

describe('.mutationOptions', () => {
  it('useMutation', async () => {
    const mutation = useMutation(orpc.static.mutationOptions({
      onMutate(variables) {
        expectTypeOf(variables).toEqualTypeOf<{ input: number }>()
        return { customContext: true }
      },
      onError(error, variables, context) {
        if (isDefinedError(error) && error.code === 'STATIC_ERROR') {
          expectTypeOf(error.data).toEqualTypeOf<{ static: string }>()
        }

        expectTypeOf(context?.customContext).toEqualTypeOf<boolean | undefined>()
        expectTypeOf(variables).toEqualTypeOf<{ input: number }>()
      },
    }))

    if (mutation.status === 'error' && isDefinedError(mutation.error) && mutation.error.code === 'STATIC_ERROR') {
      expectTypeOf(mutation.error.data).toEqualTypeOf<{ static: string }>()
    }

    if (mutation.status === 'success') {
      expectTypeOf(mutation.data).toEqualTypeOf<{ output: string }>()
    }

    mutation.mutate({ input: 123 })

    mutation.mutateAsync({
    // @ts-expect-error --- input is invalid
      input: 'invalid',
    })

    useMutation(orpc.static.mutationOptions({
      context: {
        // @ts-expect-error --- cache is invalid
        cache: 'invalid',
      },
    }))
  })
})
