import { isDefinedError } from '@orpc/client'
import { useInfiniteQuery, useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed } from 'vue'
import { client, orpc } from './__shared__/orpc'

it('.key', () => {
  const queryCache = useQueryCache()

  queryCache.invalidateQueries({
    key: orpc.nested.key(),
  })

  orpc.ping.key({})
  // @ts-expect-error --- input is invalid
  orpc.ping.key({ input: { input: 'INVALID' } })
})

it('.call', () => {
  expectTypeOf(orpc.ping.call).toEqualTypeOf(client.ping)
})

describe('.queryOptions', () => {
  it('useQuery', () => {
    const query = useQuery(() => orpc.ping.queryOptions({
      input: { input: 123 },
    }))

    if (isDefinedError(query.error.value) && query.error.value.code === 'OVERRIDE') {
      expectTypeOf(query.error.value.data).toEqualTypeOf<unknown>()
    }

    expectTypeOf(query.data.value).toEqualTypeOf<{ output: string } | undefined>()

    useQuery(orpc.ping.queryOptions({
      // @ts-expect-error --- ref/computed input is not allowed
      input: computed(() => ({ input: 123 })),
    }))

    useQuery(orpc.ping.queryOptions({
      input: {
        // @ts-expect-error --- input is invalid
        input: '123',
      },
    }))

    useQuery(orpc.ping.queryOptions({
      input: { input: 123 },
      context: {
        // @ts-expect-error --- cache is invalid
        cache: 123,
      },
    }))
  })

  it('works with defineQueryOptions', () => {
    const query = useQuery(() => orpc.ping.queryOptions({ input: { input: 123 } }))

    expectTypeOf(query.data.value).toEqualTypeOf<{ output: string } | undefined>()
  })
})

describe('.streamedOptions & .liveOptions', () => {
  it('useQuery', () => {
    const streamed = useQuery(() => orpc.stream.streamedOptions({ input: { input: 2 } }))

    expectTypeOf(streamed.data.value).toEqualTypeOf<{ output: string }[] | undefined>()

    const live = useQuery(() => orpc.stream.liveOptions({ input: { input: 2 } }))

    expectTypeOf(live.data.value).toEqualTypeOf<{ output: string } | undefined>()

    useQuery(orpc.stream.streamedOptions({
      // @ts-expect-error --- input is invalid
      input: { input: 'INVALID' },
    }))
  })
})

describe('.infiniteOptions', () => {
  it('useInfiniteQuery', () => {
    const query = useInfiniteQuery(() => orpc.list.infiniteOptions({
      input: (cursor: number) => ({ cursor }),
      initialPageParam: 0,
      getNextPageParam: lastPage => lastPage.next,
    }))

    expectTypeOf(query.data.value?.pages).toEqualTypeOf<{ items: string[], next: number | null }[] | undefined>()

    useInfiniteQuery(() => orpc.list.infiniteOptions({
      // @ts-expect-error --- input is invalid
      input: (cursor: number) => ({ cursor: 'invalid' }),
      initialPageParam: 0,
      getNextPageParam: lastPage => lastPage.next,
    }))
  })
})

describe('.mutationOptions', () => {
  it('useMutation', async () => {
    const mutation = useMutation(orpc.ping.mutationOptions({
      onError(error, variables) {
        if (isDefinedError(error) && error.code === 'BASE') {
          expectTypeOf(error.data).toEqualTypeOf<{ output: string }>()
        }
      },
    }))

    if (isDefinedError(mutation.error.value) && mutation.error.value.code === 'OVERRIDE') {
      expectTypeOf(mutation.error.value.data).toEqualTypeOf<unknown>()
    }

    expectTypeOf(mutation.data.value).toEqualTypeOf<{ output: string } | undefined>()

    mutation.mutate({ input: 123 })

    mutation.mutateAsync({
      // @ts-expect-error --- input is invalid
      input: 'INVALID',
    })

    useMutation(orpc.ping.mutationOptions({
      context: {
        // @ts-expect-error --- cache is invalid
        cache: 123,
      },
    }))
  })
})
