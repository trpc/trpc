import type { ORPCErrorFromErrorMap } from '@orpc/contract'
import type { GetNextPageParamFunction, InfiniteData } from '@tanstack/react-query'
import type { ProcedureUtils } from './procedure-utils'
import { QueryClient, useInfiniteQuery, useMutation, useQueries, useQuery, useSuspenseInfiniteQuery, useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import z from 'zod'

export const outputSchema = z.object({ output: z.number().transform(n => `${n}`) })

const baseErrorMap = {
  BASE: {
    data: outputSchema,
  },
  OVERRIDE: {},
}

describe('ProcedureUtils', () => {
  type UtilsInput = { search?: string, cursor?: number } | undefined
  type UtilsOutput = { title: string }[]
  type UtilsError = ORPCErrorFromErrorMap<typeof baseErrorMap>

  const queryClient = new QueryClient()

  const optionalUtils = {} as ProcedureUtils<
    { batch?: boolean },
    UtilsInput,
    UtilsOutput,
    UtilsError
  >

  const streamUtils = {} as ProcedureUtils<
    { batch?: boolean },
    UtilsInput,
    AsyncIterable<UtilsOutput[number]>,
    UtilsError
  >

  describe('.queryOptions', () => {
    describe('useQuery', () => {
      it('without args', () => {
        const query = useQuery(optionalUtils.queryOptions())
        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput | undefined>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('can infer errors inside options', () => {
        const query = useQuery(optionalUtils.queryOptions({
          throwOnError(error) {
            expectTypeOf(error).toEqualTypeOf<UtilsError>()
            return false
          },
        }))
        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput | undefined>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('with initial data & select', () => {
        const query = useQuery(optionalUtils.queryOptions({
          select: data => ({ mapped: data }),
          initialData: [{ title: 'title' }],
        }))

        expectTypeOf(query.data).toEqualTypeOf<{ mapped: UtilsOutput }>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })
    })

    describe('useSuspenseQuery', () => {
      it('without args', () => {
        const query = useSuspenseQuery(optionalUtils.queryOptions())
        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('can infer errors inside options', () => {
        const query = useSuspenseQuery(optionalUtils.queryOptions({
          throwOnError(error) {
            expectTypeOf(error).toEqualTypeOf<UtilsError>()
            return false
          },
        }))

        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('with select', () => {
        const query = useSuspenseQuery(optionalUtils.queryOptions({
          select: data => ({ mapped: data }),
        }))

        expectTypeOf(query.data).toEqualTypeOf<{ mapped: UtilsOutput }>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })
    })

    it('useQueries', () => {
      const queries = useQueries({
        queries: [
          optionalUtils.queryOptions(),
          optionalUtils.queryOptions({
            input: { search: 'search' },
            context: { batch: true },
          }),
          optionalUtils.queryOptions({
            select: data => ({ mapped: data }),
          }),
        ],
      })

      expectTypeOf(queries[0].data).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(queries[1].data).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(queries[2].data).toEqualTypeOf<{ mapped: UtilsOutput } | undefined>()

      expectTypeOf(queries[0].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[1].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[2].error).toEqualTypeOf<null | UtilsError>()
    })

    it('useSuspenseQueries', () => {
      const queries = useSuspenseQueries({
        queries: [
          optionalUtils.queryOptions(),
          optionalUtils.queryOptions({
            input: { search: 'search' },
            context: { batch: true },
          }),
          optionalUtils.queryOptions({
            select: data => ({ mapped: data }),
          }),
        ],
      })

      expectTypeOf(queries[0].data).toEqualTypeOf<UtilsOutput>()
      expectTypeOf(queries[1].data).toEqualTypeOf<UtilsOutput>()
      expectTypeOf(queries[2].data).toEqualTypeOf<{ mapped: UtilsOutput }>()

      expectTypeOf(queries[0].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[1].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[2].error).toEqualTypeOf<null | UtilsError>()
    })

    it('fetchQuery', () => {
      expectTypeOf(
        queryClient.fetchQuery(optionalUtils.queryOptions()),
      ).toEqualTypeOf<
        Promise<UtilsOutput>
      >()
    })
  })

  describe('.streamedOptions', () => {
    describe('useQuery', () => {
      it('without args', () => {
        const query = useQuery(streamUtils.streamedOptions())
        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput | undefined>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('can infer errors inside options', () => {
        const query = useQuery(streamUtils.streamedOptions({
          throwOnError(error) {
            expectTypeOf(error).toEqualTypeOf<UtilsError>()
            return false
          },
        }))
        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput | undefined>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('with initial data & select', () => {
        const query = useQuery(streamUtils.streamedOptions({
          select: data => ({ mapped: data }),
          initialData: [{ title: 'title' }],
        }))

        expectTypeOf(query.data).toEqualTypeOf<{ mapped: UtilsOutput }>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })
    })

    describe('useSuspenseQuery', () => {
      it('without args', () => {
        const query = useSuspenseQuery(streamUtils.streamedOptions())
        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('can infer errors inside options', () => {
        const query = useSuspenseQuery(streamUtils.streamedOptions({
          throwOnError(error) {
            expectTypeOf(error).toEqualTypeOf<UtilsError>()
            return false
          },
        }))

        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('with select', () => {
        const query = useSuspenseQuery(streamUtils.streamedOptions({
          select: data => ({ mapped: data }),
        }))

        expectTypeOf(query.data).toEqualTypeOf<{ mapped: UtilsOutput }>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })
    })

    it('useQueries', () => {
      const queries = useQueries({
        queries: [
          streamUtils.streamedOptions(),
          streamUtils.streamedOptions({
            input: { search: 'search' },
            context: { batch: true },
          }),
          streamUtils.streamedOptions({
            select: data => ({ mapped: data }),
          }),
        ],
      })

      expectTypeOf(queries[0].data).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(queries[1].data).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(queries[2].data).toEqualTypeOf<{ mapped: UtilsOutput } | undefined>()

      expectTypeOf(queries[0].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[1].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[2].error).toEqualTypeOf<null | UtilsError>()
    })

    it('useSuspenseQueries', () => {
      const queries = useSuspenseQueries({
        queries: [
          streamUtils.streamedOptions(),
          streamUtils.streamedOptions({
            input: { search: 'search' },
            context: { batch: true },
          }),
          streamUtils.streamedOptions({
            select: data => ({ mapped: data }),
          }),
        ],
      })

      expectTypeOf(queries[0].data).toEqualTypeOf<UtilsOutput>()
      expectTypeOf(queries[1].data).toEqualTypeOf<UtilsOutput>()
      expectTypeOf(queries[2].data).toEqualTypeOf<{ mapped: UtilsOutput }>()

      expectTypeOf(queries[0].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[1].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[2].error).toEqualTypeOf<null | UtilsError>()
    })

    it('fetchQuery', () => {
      expectTypeOf(
        queryClient.fetchQuery(streamUtils.streamedOptions()),
      ).toEqualTypeOf<
        Promise<UtilsOutput>
      >()
    })
  })

  describe('.liveOptions', () => {
    describe('useQuery', () => {
      it('without args', () => {
        const query = useQuery(streamUtils.liveOptions())
        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput[number] | undefined>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('can infer errors inside options', () => {
        const query = useQuery(streamUtils.liveOptions({
          throwOnError(error) {
            expectTypeOf(error).toEqualTypeOf<UtilsError>()
            return false
          },
        }))
        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput[number] | undefined>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('with initial data & select', () => {
        const query = useQuery(streamUtils.liveOptions({
          select: data => ({ mapped: data }),
          initialData: { title: 'title' },
        }))

        expectTypeOf(query.data).toEqualTypeOf<{ mapped: UtilsOutput[number] }>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })
    })

    describe('useSuspenseQuery', () => {
      it('without args', () => {
        const query = useSuspenseQuery(streamUtils.liveOptions())
        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput[number]>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('can infer errors inside options', () => {
        const query = useSuspenseQuery(streamUtils.liveOptions({
          throwOnError(error) {
            expectTypeOf(error).toEqualTypeOf<UtilsError>()
            return false
          },
        }))

        expectTypeOf(query.data).toEqualTypeOf<UtilsOutput[number]>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('with select', () => {
        const query = useSuspenseQuery(streamUtils.liveOptions({
          select: data => ({ mapped: data }),
        }))

        expectTypeOf(query.data).toEqualTypeOf<{ mapped: UtilsOutput[number] }>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })
    })

    it('useQueries', () => {
      const queries = useQueries({
        queries: [
          streamUtils.liveOptions(),
          streamUtils.liveOptions({
            input: { search: 'search' },
            context: { batch: true },
          }),
          streamUtils.liveOptions({
            select: data => ({ mapped: data }),
          }),
        ],
      })

      expectTypeOf(queries[0].data).toEqualTypeOf<UtilsOutput[number] | undefined>()
      expectTypeOf(queries[1].data).toEqualTypeOf<UtilsOutput[number] | undefined>()
      expectTypeOf(queries[2].data).toEqualTypeOf<{ mapped: UtilsOutput[number] } | undefined>()

      expectTypeOf(queries[0].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[1].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[2].error).toEqualTypeOf<null | UtilsError>()
    })

    it('useSuspenseQueries', () => {
      const queries = useSuspenseQueries({
        queries: [
          streamUtils.liveOptions(),
          streamUtils.liveOptions({
            input: { search: 'search' },
            context: { batch: true },
          }),
          streamUtils.liveOptions({
            select: data => ({ mapped: data }),
          }),
        ],
      })

      expectTypeOf(queries[0].data).toEqualTypeOf<UtilsOutput[number]>()
      expectTypeOf(queries[1].data).toEqualTypeOf<UtilsOutput[number]>()
      expectTypeOf(queries[2].data).toEqualTypeOf<{ mapped: UtilsOutput[number] }>()

      expectTypeOf(queries[0].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[1].error).toEqualTypeOf<null | UtilsError>()
      expectTypeOf(queries[2].error).toEqualTypeOf<null | UtilsError>()
    })

    it('fetchQuery', () => {
      expectTypeOf(
        queryClient.fetchQuery(streamUtils.liveOptions()),
      ).toEqualTypeOf<
        Promise<UtilsOutput[number]>
      >()
    })
  })

  describe('.infiniteOptions', () => {
    const getNextPageParam: GetNextPageParamFunction<number, UtilsOutput> = () => 1
    const initialPageParam = 1

    describe('useInfiniteQuery', () => {
      it('with minimal args', () => {
        const query = useInfiniteQuery(optionalUtils.infiniteOptions({
          input: () => ({}),
          getNextPageParam,
          initialPageParam,
        }))
        expectTypeOf(query.data).toEqualTypeOf<InfiniteData<UtilsOutput, number> | undefined>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('can infer errors inside options', () => {
        const query = useInfiniteQuery(optionalUtils.infiniteOptions({
          input: () => ({}),
          getNextPageParam,
          initialPageParam,
          throwOnError(error) {
            expectTypeOf(error).toEqualTypeOf<UtilsError>()
            return false
          },
        }))

        expectTypeOf(query.data).toEqualTypeOf<InfiniteData<UtilsOutput, number> | undefined>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('with initial data & select', () => {
        const query = useInfiniteQuery(optionalUtils.infiniteOptions({
          input: () => ({}),
          getNextPageParam,
          initialPageParam,
          select: data => ({ mapped: data }),
          initialData: { pageParams: [], pages: [] },
        }))

        expectTypeOf(query.data).toEqualTypeOf<{ mapped: InfiniteData<UtilsOutput, number> }>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })
    })

    describe('useSuspenseInfiniteQuery', () => {
      it('with minimal args', () => {
        const query = useSuspenseInfiniteQuery(optionalUtils.infiniteOptions({
          input: () => ({}),
          getNextPageParam,
          initialPageParam,
        }))
        expectTypeOf(query.data).toEqualTypeOf<InfiniteData<UtilsOutput, number>>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('can infer errors inside options', () => {
        const query = useSuspenseInfiniteQuery(optionalUtils.infiniteOptions({
          input: () => ({}),
          getNextPageParam,
          initialPageParam,
          throwOnError(error) {
            expectTypeOf(error).toEqualTypeOf<UtilsError>()
            return false
          },
        }))

        expectTypeOf(query.data).toEqualTypeOf<InfiniteData<UtilsOutput, number>>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })

      it('with initial data & select', () => {
        const query = useSuspenseInfiniteQuery(optionalUtils.infiniteOptions({
          input: () => ({}),
          getNextPageParam,
          initialPageParam,
          select: data => ({ mapped: data }),
          initialData: { pageParams: [], pages: [] },
        }))

        expectTypeOf(query.data).toEqualTypeOf<{ mapped: InfiniteData<UtilsOutput, number> }>()
        expectTypeOf(query.error).toEqualTypeOf<UtilsError | null>()
      })
    })

    it('fetchQuery', () => {
      expectTypeOf(
        queryClient.fetchInfiniteQuery(optionalUtils.infiniteOptions({
          input: () => ({}),
          getNextPageParam,
          initialPageParam,
        })),
      ).toEqualTypeOf<
        Promise<InfiniteData<UtilsOutput, number>>
      >()
    })
  })

  describe('.mutationOptions', () => {
    describe('useMutation', () => {
      it('without args', () => {
        const mutation = useMutation(optionalUtils.mutationOptions())
        expectTypeOf(mutation.data).toEqualTypeOf<UtilsOutput | undefined>()
        expectTypeOf(mutation.error).toEqualTypeOf<UtilsError | null>()

        mutation.mutate({ cursor: 1 })
        // @ts-expect-error - invalid input
        mutation.mutate({ cursor: 'invalid' })
      })

      it('can infer errors & variables & mutation context inside options', () => {
        const mutation = useMutation(optionalUtils.mutationOptions({
          onMutate: (variables) => {
            expectTypeOf(variables).toEqualTypeOf<UtilsInput>()
            return ({ customContext: true })
          },
          onError: (error, variables, context) => {
            expectTypeOf(context?.customContext).toEqualTypeOf<boolean | undefined>()
            expectTypeOf(error).toEqualTypeOf<UtilsError>()
            expectTypeOf(variables).toEqualTypeOf<UtilsInput>()
          },
        }))

        expectTypeOf(mutation.data).toEqualTypeOf<UtilsOutput | undefined>()
        expectTypeOf(mutation.error).toEqualTypeOf<UtilsError | null>()

        mutation.mutate({ cursor: 1 })
        // @ts-expect-error - invalid input
        mutation.mutate({ cursor: 'invalid' })
      })
    })
  })
})
