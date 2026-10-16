import type { Client, ORPCError } from '@orpc/client'
import type { ORPCErrorFromErrorMap } from '@orpc/contract'
import type { PromiseWithError } from '@orpc/shared'
import type { DataTag, GetNextPageParamFunction, InfiniteData, InfiniteQueryObserverOptions, MutationFunctionContext, MutationObserverOptions, QueryFunction, QueryFunctionContext, QueryKey, QueryObserverOptions, SkipToken } from '@tanstack/query-core'
import type { ProcedureUtils, ProcedureUtilsOptions } from './procedure-utils'
import type { InfiniteOptionsIn, MutationKeyOptions, MutationOptionsIn, QueryKeyOptions, QueryOptionsIn, StreamedKeyOptions, StreamedOptionsIn } from './types'
import { QueryClient, skipToken } from '@tanstack/query-core'
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

  const condition = {} as boolean

  const optionalUtils = {} as ProcedureUtils<
    { batch?: boolean },
    UtilsInput,
    UtilsOutput,
    UtilsError
  >

  const requiredUtils = {} as ProcedureUtils<
    { batch: boolean },
    'input',
    UtilsOutput,
    Error
  >

  const streamUtils = {} as ProcedureUtils<
    { batch?: boolean },
    UtilsInput,
    AsyncIterable<UtilsOutput[number]>,
    UtilsError
  >

  it('.call', () => {
    expectTypeOf(optionalUtils.call).toEqualTypeOf<
      Client<{ batch?: boolean }, UtilsInput, UtilsOutput, UtilsError>
    >()
  })

  describe('.queryKey', () => {
    it('should handle optional `input` correctly', () => {
      optionalUtils.queryKey()
      optionalUtils.queryKey({ })
      optionalUtils.queryKey({ input: { search: 'search' } })
    })

    it('should handle required `input` correctly', () => {
      // @ts-expect-error - `input` is required
      requiredUtils.queryKey()
    })

    it('should infer types for `input` correctly', () => {
      optionalUtils.queryKey({ input: { cursor: 1 } })
      // @ts-expect-error - Should error on invalid input type
      optionalUtils.queryKey({ input: { cursor: 'invalid' } })

      requiredUtils.queryKey({ input: 'input' })
      // @ts-expect-error - Should error on invalid input type
      requiredUtils.queryKey({ input: 123 })
    })

    it('allow use skipToken as input', () => {
      optionalUtils.queryKey({ input: condition ? skipToken : { search: 'search' } })
      // @ts-expect-error - invalid input type
      optionalUtils.queryKey({ input: condition ? skipToken : { cursor: 'invalid' } })

      requiredUtils.queryKey({ input: condition ? skipToken : 'input' })
      // @ts-expect-error - invalid input type
      requiredUtils.queryKey({ input: condition ? skipToken : 123 })
    })

    it('allow override query key', () => {
      optionalUtils.queryKey({ queryKey: ['1'] })
      // @ts-expect-error - invalid query key type
      optionalUtils.queryKey({ queryKey: 1 })
    })

    it('return valid query key', () => {
      expectTypeOf(optionalUtils.queryKey()).toExtend<QueryKey>()
      expectTypeOf(optionalUtils.queryKey({ input: { search: 'search' } })).toExtend<QueryKey>()
    })

    it('.getQueryState is typed correctly', () => {
      const state = queryClient.getQueryState(optionalUtils.queryKey())
      expectTypeOf(state?.data).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(state?.error).toEqualTypeOf<UtilsError | null | undefined>()
    })
  })

  describe('.queryOptions', () => {
    it('should handle optional `context` and `input` correctly', () => {
      optionalUtils.queryOptions()
      optionalUtils.queryOptions({ context: { batch: true } })
      optionalUtils.queryOptions({ input: { search: 'search' } })
    })

    it('should handle required `context` and `input` correctly', () => {
      // @ts-expect-error - `input` and `context` are required
      requiredUtils.queryOptions()
      // @ts-expect-error - `input` is required
      requiredUtils.queryOptions({ context: { batch: true } })
      // @ts-expect-error - `context` is required
      requiredUtils.queryOptions({ input: 'input' })
    })

    it('should infer types for `input` and `context` correctly', () => {
      optionalUtils.queryOptions({ input: { cursor: 1 } })
      // @ts-expect-error - Should error on invalid input type
      optionalUtils.queryOptions({ input: { cursor: 'invalid' } })

      optionalUtils.queryOptions({ context: { batch: true } })
      // @ts-expect-error - Should error on invalid context type
      optionalUtils.queryOptions({ context: { batch: 'invalid' } })

      requiredUtils.queryOptions({ input: 'input', context: { batch: true } })
      // @ts-expect-error - Should error on invalid input type
      requiredUtils.queryOptions({ input: 123, context: { batch: true } })
      // @ts-expect-error - Should error on invalid context type
      requiredUtils.queryOptions({ input: 'input', context: { batch: 'invalid' } })
    })

    it('allow use skipToken as input', () => {
      optionalUtils.queryOptions({ input: condition ? skipToken : { search: 'search' } })
      // @ts-expect-error - invalid input type
      optionalUtils.queryOptions({ input: condition ? skipToken : { cursor: 'invalid' } })

      requiredUtils.queryOptions({ input: condition ? skipToken : 'input', context: { batch: true } })
      // @ts-expect-error - invalid input type
      requiredUtils.queryOptions({ input: condition ? skipToken : 123, context: { batch: true } })
    })

    it('should infer types initialData correctly', () => {
      optionalUtils.queryOptions({ initialData: [{ title: '' }] })
      // @ts-expect-error - invalid initialData
      optionalUtils.queryOptions({ initialData: 'invalid' })

      optionalUtils.queryOptions({ initialData: () => [{ title: '' }] })
      // @ts-expect-error - invalid initialData
      optionalUtils.queryOptions({ initialData: () => 'invalid' })

      requiredUtils.queryOptions({ input: 'input', context: { batch: true }, initialData: [{ title: '' }] })
      // @ts-expect-error - invalid initialData
      requiredUtils.queryOptions({ input: 'input', context: { batch: true }, initialData: 'invalid' })
    })

    it('return valid query options', () => {
      expectTypeOf(optionalUtils.queryOptions()).toExtend<QueryObserverOptions<
        UtilsOutput,
        UtilsError,
        UtilsOutput,
        UtilsOutput,
        DataTag<QueryKey, UtilsOutput, UtilsError>
      >>()
      expectTypeOf(optionalUtils.queryOptions({ context: { batch: true } })).toExtend<QueryObserverOptions<
        UtilsOutput,
        UtilsError,
        UtilsOutput,
        UtilsOutput,
        DataTag<QueryKey, UtilsOutput, UtilsError>
      >>()
      expectTypeOf(optionalUtils.queryOptions({ initialData: [] })).toExtend<QueryObserverOptions<
        UtilsOutput,
        UtilsError,
        UtilsOutput,
        UtilsOutput,
        DataTag<QueryKey, UtilsOutput, UtilsError>
      >>()
      expectTypeOf(requiredUtils.queryOptions({ input: 'input', context: { batch: true } })).toExtend<QueryObserverOptions<
        UtilsOutput,
        Error,
        UtilsOutput,
        UtilsOutput,
        DataTag<QueryKey, UtilsOutput, Error>
      >>()
    })

    it('can change query data by define select', () => {
      expectTypeOf(optionalUtils.queryOptions({
        select: mapped => ({ mapped }),
      })).toExtend<QueryObserverOptions<
        UtilsOutput,
        UtilsError,
        { mapped: UtilsOutput },
        UtilsOutput,
        DataTag<QueryKey, UtilsOutput, UtilsError>
      >>()
    })

    it('.getQueryState is typed correctly', () => {
      const state = queryClient.getQueryState(optionalUtils.queryOptions().queryKey)
      expectTypeOf(state?.data).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(state?.error).toEqualTypeOf<UtilsError | null | undefined>()
    })
  })

  describe('.streamedKey', () => {
    it('should handle optional `input` correctly', () => {
      optionalUtils.streamedKey()
      optionalUtils.streamedKey({})
      optionalUtils.streamedKey({ input: { search: 'search' } })
    })

    it('should handle required `input` correctly', () => {
      // @ts-expect-error - `input` is required
      requiredUtils.streamedKey()
    })

    it('should infer types for `input` correctly', () => {
      optionalUtils.streamedKey({ input: { cursor: 1 } })
      // @ts-expect-error - Should error on invalid input type
      optionalUtils.streamedKey({ input: { cursor: 'invalid' } })

      requiredUtils.streamedKey({ input: 'input' })
      // @ts-expect-error - Should error on invalid input type
      requiredUtils.streamedKey({ input: 123 })
    })

    it('allow use skipToken as input', () => {
      optionalUtils.streamedKey({ input: condition ? skipToken : { search: 'search' } })
      // @ts-expect-error - invalid input type
      optionalUtils.streamedKey({ input: condition ? skipToken : { cursor: 'invalid' } })

      requiredUtils.streamedKey({ input: condition ? skipToken : 'input' })
      // @ts-expect-error - invalid input type
      requiredUtils.streamedKey({ input: condition ? skipToken : 123 })
    })

    it('allow override query key', () => {
      optionalUtils.streamedKey({ queryKey: ['1'] })
      // @ts-expect-error - invalid query key type
      optionalUtils.streamedKey({ queryKey: 1 })
    })

    it('return valid query key', () => {
      expectTypeOf(optionalUtils.streamedKey()).toExtend<QueryKey>()
      expectTypeOf(optionalUtils.streamedKey({
        input: { search: 'search' },
        queryFnOptions: {
          maxChunks: 1,
          refetchMode: 'replace',
        },
      })).toExtend<QueryKey>()
    })

    it('.getQueryState is typed correctly', () => {
      const state = queryClient.getQueryState(streamUtils.streamedKey())
      expectTypeOf(state?.data).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(state?.error).toEqualTypeOf<UtilsError | null | undefined>()
    })
  })

  describe('.streamedOptions', () => {
    it('should handle optional `context` and `input` correctly', () => {
      streamUtils.streamedOptions()
      streamUtils.streamedOptions({ context: { batch: true } })
      streamUtils.streamedOptions({ input: { search: 'search' } })
    })

    it('should handle required `context` and `input` correctly', () => {
      // @ts-expect-error - `input` and `context` are required
      requiredUtils.streamedOptions()
      // @ts-expect-error - `input` is required
      requiredUtils.streamedOptions({ context: { batch: true } })
      // @ts-expect-error - `context` is required
      requiredUtils.streamedOptions({ input: 'input' })
    })

    it('should infer types for `input` and `context` correctly', () => {
      streamUtils.streamedOptions({ input: { cursor: 1 } })
      // @ts-expect-error - Should error on invalid input type
      streamUtils.streamedOptions({ input: { cursor: 'invalid' } })

      streamUtils.streamedOptions({ context: { batch: true } })
      // @ts-expect-error - Should error on invalid context type
      streamUtils.streamedOptions({ context: { batch: 'invalid' } })

      requiredUtils.streamedOptions({ input: 'input', context: { batch: true } })
      // @ts-expect-error - Should error on invalid input type
      requiredUtils.streamedOptions({ input: 123, context: { batch: true } })
      // @ts-expect-error - Should error on invalid context type
      requiredUtils.streamedOptions({ input: 'input', context: { batch: 'invalid' } })
    })

    it('allow use skipToken as input', () => {
      streamUtils.streamedOptions({ input: condition ? skipToken : { search: 'search' } })
      // @ts-expect-error - invalid input type
      streamUtils.streamedOptions({ input: condition ? skipToken : { cursor: 'invalid' } })

      requiredUtils.streamedOptions({ input: condition ? skipToken : 'input', context: { batch: true } })
      // @ts-expect-error - invalid input type
      requiredUtils.streamedOptions({ input: condition ? skipToken : 123, context: { batch: true } })
    })

    it('should infer types for initialData correctly', () => {
      streamUtils.streamedOptions({ initialData: [{ title: '' }] })
      // @ts-expect-error - Invalid Initial Data
      streamUtils.streamedOptions({ initialData: 'invalid' })

      streamUtils.streamedOptions({ initialData: () => [{ title: '' }] })
      // @ts-expect-error - Invalid Initial Data
      streamUtils.streamedOptions({ initialData: () => 'invalid' })

      streamUtils.streamedOptions({ initialData: () => [{ title: '' }] })
      // @ts-expect-error - Invalid Initial Data
      streamUtils.streamedOptions({ initialData: () => 'invalid' })
    })

    it('return valid streamed options', () => {
      expectTypeOf(streamUtils.streamedOptions()).toExtend<QueryObserverOptions<
        UtilsOutput,
        UtilsError,
        UtilsOutput,
        UtilsOutput,
        DataTag<QueryKey, UtilsOutput, UtilsError>
      >>()
      expectTypeOf(streamUtils.streamedOptions({ initialData: [] })).toExtend<QueryObserverOptions<
        UtilsOutput,
        UtilsError,
        UtilsOutput,
        UtilsOutput,
        DataTag<QueryKey, UtilsOutput, UtilsError>
      >>()
    })

    it('return invalid streamed options if output is not an async iterable', () => {
      expectTypeOf(optionalUtils.streamedOptions().queryFn)
        .toEqualTypeOf<QueryFunction<never, DataTag<QueryKey, never, UtilsError>>>()
    })

    it('can change streamed data by define select', () => {
      expectTypeOf(streamUtils.streamedOptions({
        select: mapped => ({ mapped }),
      })).toExtend<QueryObserverOptions<UtilsOutput, UtilsError, { mapped: UtilsOutput }, UtilsOutput, DataTag<QueryKey, UtilsOutput, UtilsError>>>()
    })

    it('.getQueryState is typed correctly', () => {
      const state = queryClient.getQueryState(streamUtils.streamedOptions().queryKey)
      expectTypeOf(state?.data).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(state?.error).toEqualTypeOf<UtilsError | null | undefined>()
    })
  })

  describe('.liveKey', () => {
    it('should handle optional `input` correctly', () => {
      optionalUtils.liveKey()
      optionalUtils.liveKey({})
      optionalUtils.liveKey({ input: { search: 'search' } })
    })

    it('should handle required `input` correctly', () => {
      // @ts-expect-error - `input` is required
      requiredUtils.liveKey()
    })

    it('should infer types for `input` correctly', () => {
      optionalUtils.liveKey({ input: { cursor: 1 } })
      // @ts-expect-error - Should error on invalid input type
      optionalUtils.liveKey({ input: { cursor: 'invalid' } })

      requiredUtils.liveKey({ input: 'input' })
      // @ts-expect-error - Should error on invalid input type
      requiredUtils.liveKey({ input: 123 })
    })

    it('allow use skipToken as input', () => {
      optionalUtils.liveKey({ input: condition ? skipToken : { search: 'search' } })
      // @ts-expect-error - invalid input type
      optionalUtils.liveKey({ input: condition ? skipToken : { cursor: 'invalid' } })

      requiredUtils.liveKey({ input: condition ? skipToken : 'input' })
      // @ts-expect-error - invalid input type
      requiredUtils.liveKey({ input: condition ? skipToken : 123 })
    })

    it('allow override query key', () => {
      optionalUtils.liveKey({ queryKey: ['1'] })
      // @ts-expect-error - invalid query key type
      optionalUtils.liveKey({ queryKey: 1 })
    })

    it('return valid query key', () => {
      expectTypeOf(optionalUtils.liveKey()).toExtend<QueryKey>()
      expectTypeOf(optionalUtils.liveKey({
        input: { search: 'search' },
      })).toExtend<QueryKey>()
    })

    it('.getQueryState is typed correctly', () => {
      const state = queryClient.getQueryState(streamUtils.liveKey())
      expectTypeOf(state?.data).toEqualTypeOf<UtilsOutput[number] | undefined>()
      expectTypeOf(state?.error).toEqualTypeOf<UtilsError | null | undefined>()
    })
  })

  describe('.liveOptions', () => {
    it('should handle optional `context` and `input` correctly', () => {
      streamUtils.liveOptions()
      streamUtils.liveOptions({ context: { batch: true } })
      streamUtils.liveOptions({ input: { search: 'search' } })
    })

    it('should handle required `context` and `input` correctly', () => {
      // @ts-expect-error - `input` and `context` are required
      requiredUtils.liveOptions()
      // @ts-expect-error - `input` is required
      requiredUtils.liveOptions({ context: { batch: true } })
      // @ts-expect-error - `context` is required
      requiredUtils.liveOptions({ input: 'input' })
    })

    it('should infer types for `input` and `context` correctly', () => {
      streamUtils.liveOptions({ input: { cursor: 1 } })
      // @ts-expect-error - Should error on invalid input type
      streamUtils.liveOptions({ input: { cursor: 'invalid' } })

      streamUtils.liveOptions({ context: { batch: true } })
      // @ts-expect-error - Should error on invalid context type
      streamUtils.liveOptions({ context: { batch: 'invalid' } })

      requiredUtils.liveOptions({ input: 'input', context: { batch: true } })
      // @ts-expect-error - Should error on invalid input type
      requiredUtils.liveOptions({ input: 123, context: { batch: true } })
      // @ts-expect-error - Should error on invalid context type
      requiredUtils.liveOptions({ input: 'input', context: { batch: 'invalid' } })
    })

    it('allow use skipToken as input', () => {
      streamUtils.liveOptions({ input: condition ? skipToken : { search: 'search' } })
      // @ts-expect-error - invalid input type
      streamUtils.liveOptions({ input: condition ? skipToken : { cursor: 'invalid' } })

      requiredUtils.liveOptions({ input: condition ? skipToken : 'input', context: { batch: true } })
      // @ts-expect-error - invalid input type
      requiredUtils.liveOptions({ input: condition ? skipToken : 123, context: { batch: true } })
    })

    it('should infer types for initialData correctly', () => {
      streamUtils.liveOptions({ initialData: { title: '' } })
      // @ts-expect-error - Invalid initialData
      streamUtils.liveOptions({ initialData: 'invalid' })

      streamUtils.liveOptions({ initialData: () => ({ title: '' }) })
      // @ts-expect-error - Invalid initialData
      streamUtils.liveOptions({ initialData: () => 'invalid' })
    })

    it('return valid streamed options', () => {
      expectTypeOf(streamUtils.liveOptions()).toExtend<QueryObserverOptions<UtilsOutput[number], UtilsError, UtilsOutput[number], UtilsOutput[number], DataTag<QueryKey, UtilsOutput[number], UtilsError>>>()
      expectTypeOf(streamUtils.liveOptions({ initialData: { title: '123' } })).toExtend<QueryObserverOptions<UtilsOutput[number], UtilsError, UtilsOutput[number], UtilsOutput[number], DataTag<QueryKey, UtilsOutput[number], UtilsError>>>()
    })

    it('return invalid streamed live if output is not an async iterable', () => {
      expectTypeOf(optionalUtils.liveOptions().queryFn)
        .toEqualTypeOf<QueryFunction<never, DataTag<QueryKey, never, UtilsError>>>()
    })

    it('can change live data by define select', () => {
      expectTypeOf(streamUtils.liveOptions({
        select: mapped => ({ mapped }),
      })).toExtend<QueryObserverOptions<
        UtilsOutput[number],
        UtilsError,
        { mapped: UtilsOutput[number] },
        UtilsOutput[number],
        DataTag<QueryKey, UtilsOutput[number], UtilsError>
      >>()
    })

    it('.getQueryState is typed correctly', () => {
      const state = queryClient.getQueryState(streamUtils.liveOptions().queryKey)
      expectTypeOf(state?.data).toEqualTypeOf<UtilsOutput[number] | undefined>()
      expectTypeOf(state?.error).toEqualTypeOf<UtilsError | null | undefined>()
    })
  })

  describe('.infiniteKey', () => {
    const initialPageParam = 1

    it('should infer types for `input` correctly', () => {
      optionalUtils.infiniteKey({
        input: () => ({}),
        initialPageParam,
      })
      optionalUtils.infiniteKey({
        // @ts-expect-error - Should error on invalid input type
        input: () => ({ cursor: 'invalid' }),
        initialPageParam,
      })
    })

    it('allow use skipToken as input', () => {
      optionalUtils.infiniteKey({
        input: condition ? skipToken : () => ({}),
        initialPageParam,
      })
      optionalUtils.infiniteKey({
        // @ts-expect-error - invalid input type
        input: condition ? skipToken : () => ({ cursor: 'invalid' }),
        initialPageParam,
      })
    })

    it('should infer `pageParam` type correctly', () => {
      optionalUtils.infiniteKey({
        input: (pageParam) => {
          expectTypeOf(pageParam).toEqualTypeOf<number>()
          return { cursor: pageParam }
        },
        initialPageParam,
      })

      optionalUtils.infiniteKey({
        input: condition
          ? skipToken
          : (pageParam) => {
              expectTypeOf(pageParam).toEqualTypeOf<number>()
              return { cursor: pageParam }
            },
        initialPageParam,
      })
    })

    it('should error on conflicting `pageParam` types', () => {
      optionalUtils.infiniteKey({
        input: (pageParam: number | undefined) => {
          return { cursor: pageParam }
        },
        initialPageParam,
      })

      optionalUtils.infiniteKey({
        input: condition
          ? skipToken
          : (pageParam: number) => {
              return { cursor: pageParam }
            },
        // @ts-expect-error - conflict pageParam type
        initialPageParam: undefined,
      })
    })

    it('allow override query key', () => {
      optionalUtils.infiniteKey({
        input: () => ({}),
        initialPageParam,
        queryKey: ['1'],
      })

      // @ts-expect-error - invalid query key type
      optionalUtils.infiniteKey({
        input: () => ({}),
        initialPageParam,
        queryKey: 1,
      })
    })

    it('return valid query key', () => {
      expectTypeOf(optionalUtils.infiniteKey({
        input: () => ({}),
        initialPageParam,
      })).toExtend<QueryKey>()
    })

    it('.getQueryState is typed correctly', () => {
      const state = queryClient.getQueryState(optionalUtils.infiniteKey({
        input: () => ({}),
        initialPageParam,
      }))

      expectTypeOf(state?.data).toEqualTypeOf<InfiniteData<UtilsOutput, number> | undefined>()
      expectTypeOf(state?.error).toEqualTypeOf<UtilsError | null | undefined>()
    })
  })

  describe('.infiniteOptions', () => {
    const getNextPageParam: GetNextPageParamFunction<number, UtilsOutput> = () => 1
    const initialPageParam = 1

    it('should handle optional/required `context` correctly', () => {
      optionalUtils.infiniteOptions({
        input: () => ({}),
        getNextPageParam,
        initialPageParam,
      })

      requiredUtils.infiniteOptions({
        context: { batch: true },
        input: () => 'input',
        getNextPageParam,
        initialPageParam,
      })

      // @ts-expect-error - `context` is required
      requiredUtils.infiniteOptions({
        input: () => 'input',
        getNextPageParam,
        initialPageParam,
      })

      // @ts-expect-error - options is required
      requiredUtils.infiniteOptions()
    })

    it('should infer types for `input` and `context` correctly', () => {
      optionalUtils.infiniteOptions({
        input: () => ({}),
        getNextPageParam,
        initialPageParam,
      })
      optionalUtils.infiniteOptions({
        // @ts-expect-error - Should error on invalid input type
        input: () => ({ cursor: 'invalid' }),
        getNextPageParam,
        initialPageParam,
      })

      requiredUtils.infiniteOptions({
        context: { batch: true },
        input: () => 'input',
        getNextPageParam,
        initialPageParam,
      })
      requiredUtils.infiniteOptions({
        // @ts-expect-error - Should error on invalid context type
        context: { batch: 'invalid' },
        input: () => 'input',
        getNextPageParam,
        initialPageParam,
      })
    })

    it('allow use skipToken as input', () => {
      optionalUtils.infiniteOptions({
        input: condition ? skipToken : () => ({}),
        getNextPageParam,
        initialPageParam,
      })
      optionalUtils.infiniteOptions({
        // @ts-expect-error - invalid input type
        input: condition ? skipToken : () => ({ cursor: 'invalid' }),
        getNextPageParam,
        initialPageParam,
      })
    })

    it('should infer `pageParam` type correctly', () => {
      optionalUtils.infiniteOptions({
        input: (pageParam) => {
          expectTypeOf(pageParam).toEqualTypeOf<number>()
          return { cursor: pageParam }
        },
        getNextPageParam,
        initialPageParam,
      })

      optionalUtils.infiniteOptions({
        input: condition
          ? skipToken
          : (pageParam) => {
              expectTypeOf(pageParam).toEqualTypeOf<number>()
              return { cursor: pageParam }
            },
        getNextPageParam,
        initialPageParam,
      })
    })

    it('should error on conflicting `pageParam` types', () => {
      optionalUtils.infiniteOptions({
        input: (pageParam: number | undefined) => {
          return { cursor: pageParam }
        },
        getNextPageParam,
        initialPageParam,
      })

      optionalUtils.infiniteOptions({
        input: condition
          ? skipToken
          : (pageParam: number) => {
              return { cursor: pageParam }
            },
        getNextPageParam,
        // @ts-expect-error - conflict pageParam type
        initialPageParam: undefined,
      })
    })

    it('should infer `initial` type correctly', () => {
      optionalUtils.infiniteOptions({
        input: (pageParam) => {
          return { cursor: pageParam }
        },
        getNextPageParam,
        initialPageParam,
        initialData: { pages: [], pageParams: [] },
      })
      optionalUtils.infiniteOptions({
        input: (pageParam) => {
          return { cursor: pageParam }
        },
        getNextPageParam,
        initialPageParam,
        // @ts-expect-error Invalid initialData
        initialData: 'invalid',
      })

      optionalUtils.infiniteOptions({
        input: (pageParam) => {
          return { cursor: pageParam }
        },
        getNextPageParam,
        initialPageParam,
        initialData: () => ({ pages: [], pageParams: [] }),
      })
      optionalUtils.infiniteOptions({
        input: (pageParam) => {
          return { cursor: pageParam }
        },
        getNextPageParam,
        initialPageParam,
        // @ts-expect-error Invalid initialData
        initialData: () => 'invalid',
      })
    })

    it('return valid infinite options', () => {
      expectTypeOf(optionalUtils.infiniteOptions({
        input: () => ({}),
        getNextPageParam,
        initialPageParam,
      })).toExtend<InfiniteQueryObserverOptions<
        UtilsOutput,
        UtilsError,
        InfiniteData<UtilsOutput, number>,
        DataTag<QueryKey, InfiniteData<UtilsOutput, number>, UtilsError>,
        number
      >>()

      expectTypeOf(optionalUtils.infiniteOptions({
        input: () => ({}),
        getNextPageParam,
        initialPageParam,
        initialData: { pageParams: [], pages: [] },
      })).toExtend<InfiniteQueryObserverOptions<
        UtilsOutput,
        UtilsError,
        InfiniteData<UtilsOutput, number>,
        DataTag<QueryKey, InfiniteData<UtilsOutput, number>, UtilsError>,
        number
      >>()
    })

    it('can change infinite data by define select', () => {
      expectTypeOf(optionalUtils.infiniteOptions({
        input: () => ({}),
        getNextPageParam,
        initialPageParam,
        select: mapped => ({ mapped }),
      })).toExtend<InfiniteQueryObserverOptions<
        UtilsOutput,
        UtilsError,
        { mapped: InfiniteData<UtilsOutput, number> },
        DataTag<QueryKey, InfiniteData<UtilsOutput, number>, UtilsError>,
        number
      >>()
    })

    it('.getQueryState is typed correctly', () => {
      const state = queryClient.getQueryState(optionalUtils.infiniteOptions({
        input: () => ({}),
        getNextPageParam,
        initialPageParam,
      }).queryKey)

      expectTypeOf(state?.data).toEqualTypeOf<InfiniteData<UtilsOutput, number> | undefined>()
      expectTypeOf(state?.error).toEqualTypeOf<UtilsError | null | undefined>()
    })
  })

  describe('.mutationKey', () => {
    it('should optional arguments', () => {
      optionalUtils.mutationKey()
    })

    it('allow override query key', () => {
      optionalUtils.mutationKey({
        mutationKey: ['1'],
      })
      optionalUtils.mutationKey({
        // @ts-expect-error - invalid query key type
        mutationKey: 1,
      })
    })

    it('return valid query key', () => {
      expectTypeOf(optionalUtils.mutationKey()).toExtend<QueryKey>()
    })
  })

  describe('.mutationOptions', () => {
    it('should handle optional/required `context`', () => {
      optionalUtils.mutationOptions()
      optionalUtils.mutationOptions({})

      requiredUtils.mutationOptions({
        context: { batch: true },
      })
      // @ts-expect-error context is required
      requiredUtils.mutationOptions()
      // @ts-expect-error context is required
      requiredUtils.mutationOptions({})
    })

    it('should infer `context` type correctly', () => {
      optionalUtils.mutationOptions({ context: { batch: true } })
      // @ts-expect-error - Should error on invalid context type
      optionalUtils.mutationOptions({ context: { batch: 'invalid' } })
    })

    it('should infer mutation context type in lifecycle hooks', () => {
      optionalUtils.mutationOptions({
        onMutate: variables => ({ customContext: true }),
        onSuccess: (data, variables, context) => {
          expectTypeOf(context.customContext).toEqualTypeOf<boolean>()
        },
        onError: (e, variables, context) => {
          expectTypeOf(context?.customContext).toEqualTypeOf<boolean | undefined>()
        },
      })
    })

    it('return valid mutation options', () => {
      expectTypeOf(optionalUtils.mutationOptions()).toExtend<MutationObserverOptions<UtilsOutput, UtilsError, UtilsInput>>()
      expectTypeOf(optionalUtils.mutationOptions({
        onMutate: variables => ({ customContext: true }),
      })).toExtend<MutationObserverOptions<UtilsOutput, UtilsError, UtilsInput, { customContext: boolean }>>()
    })
  })
})

describe('ProcedureUtilsOptions', () => {
  type TestClientContext = { batch?: boolean }
  type TestInput = { search?: string }
  type TestOutput = { title: string }
  type TestError = ORPCError<'TEST', unknown>

  type TestOptions = ProcedureUtilsOptions<TestClientContext, TestInput, TestOutput, TestError>

  type TestStreamedOutput = AsyncIteratorObject<TestOutput>
  type TestStreamedOptions = ProcedureUtilsOptions<TestClientContext, TestInput, TestStreamedOutput, TestError>

  it('should have all keys that ProcedureUtils provides', () => {
    // Ensures every utility method in ProcedureUtils (except 'call') has a corresponding key in CreateProcedureUtilsOptions
    type ProcedureUtilsKeys = Exclude<keyof ProcedureUtils<any, any, any, any>, 'call' | 'key'>
    type DefaultsKeys = keyof ProcedureUtilsOptions<any, any, any, any>

    expectTypeOf<ProcedureUtilsKeys>().toExtend<DefaultsKeys>()
  })

  it('all properties should be optional', () => {
    const emptyDefaults: TestOptions = {}
    expectTypeOf(emptyDefaults).toExtend<TestOptions>()
  })

  it('queryKey should accept Partial<QueryKeyOptions> | modifier function', () => {
    const _defaults: TestOptions = {
      queryKey: {
        input: { search: 'test' },
      },
    }

    const _invalid: TestOptions = {
      queryKey: {
        // @ts-expect-error - invalid input type
        input: { invalid: 'test' },
      },
    }

    const _defaults2: TestOptions = {
      queryKey: (options) => {
        expectTypeOf(options).toEqualTypeOf<QueryKeyOptions<TestInput>>()

        return { input: { search: 'test' } }
      },
    }

    const _invalid2: TestOptions = {
      // @ts-expect-error - invalid input type
      queryKey: (options) => {
        return { input: { invalid: 'test' } }
      },
    }
  })

  it('queryInterceptors should infer correct types', () => {
    const defaults: TestOptions = {
      queryInterceptors: [
        (opts) => {
          expectTypeOf(opts.input).toEqualTypeOf<TestInput | SkipToken>()
          expectTypeOf(opts.next()).toEqualTypeOf<PromiseWithError<TestOutput, TestError>>()
          expectTypeOf(opts.fnContext).toEqualTypeOf<QueryFunctionContext>()

          return opts.next()
        },
      ],
    }
  })

  it('queryOptions should accept Partial<QueryOptionsIn> | modifier function', () => {
    const _defaults: TestOptions = {
      queryOptions: {
        input: { search: 'test' },
        staleTime: 1000,
        context: { batch: true },
      },
    }

    const _invalid: TestOptions = {
      queryOptions: {
        // @ts-expect-error - invalid input type
        input: { invalid: 'test' },
      },
    }

    const _defaults2: TestOptions = {
      queryOptions: (options) => {
        expectTypeOf(options).toEqualTypeOf<QueryOptionsIn<TestClientContext, TestInput, TestOutput, TestError, unknown, unknown>>()

        return {
          ...options,
          input: { search: 'test' },
          staleTime: 1000,
          context: { batch: true },
        }
      },
    }

    const _invalid2: TestOptions = {
      // @ts-expect-error - invalid input type
      queryOptions: options => ({
        ...options,
        input: { invalid: 'test' },
      }),
    }
  })

  it('streamedKey should accept Partial<StreamedKeyOptions> | modifier function', () => {
    const _defaults: TestOptions = {
      streamedKey: {
        input: { search: 'test' },
        queryFnOptions: { maxChunks: 10 },
      },
    }

    const _invalid: TestOptions = {
      streamedKey: {
        // @ts-expect-error - invalid input type
        input: { invalid: 'test' },
      },
    }

    const _defaults2: TestOptions = {
      streamedKey: (options) => {
        expectTypeOf(options).toEqualTypeOf<StreamedKeyOptions<TestInput>>()

        return {
          input: { search: 'test' },
          queryFnOptions: { maxChunks: 10 },
        }
      },
    }

    const _invalid2: TestOptions = {
      // @ts-expect-error - invalid input type
      streamedKey: () => ({
        input: { invalid: 'test' },
      }),
    }
  })

  it('streamedInterceptors should infer correct types', () => {
    const defaults: TestStreamedOptions = {
      streamedInterceptors: [
        (opts) => {
          expectTypeOf(opts.input).toEqualTypeOf<TestInput | SkipToken>()
          expectTypeOf(opts.next()).toEqualTypeOf<PromiseWithError<TestOutput[], TestError>>()
          expectTypeOf(opts.fnContext).toEqualTypeOf<QueryFunctionContext>()

          return opts.next()
        },
      ],
    }
  })

  it('streamedOptions should accept Partial<StreamedOptionsIn>| modifier function', () => {
    const _defaults: TestOptions = {
      streamedOptions: {
        input: { search: 'test' },
        staleTime: 1000,
      },
    }

    const _invalid: TestOptions = {
      streamedOptions: {
        // @ts-expect-error - invalid input type
        input: { invalid: 'test' },
      },
    }

    const _defaults2: TestOptions = {
      streamedOptions: (options) => {
        expectTypeOf(options).toEqualTypeOf<StreamedOptionsIn<TestClientContext, TestInput, never, TestError, unknown, unknown>>()

        return {
          ...options,
          input: { search: 'test' },
          staleTime: 1000,
        }
      },
    }

    const _invalid2: TestOptions = {
      // @ts-expect-error - invalid input type
      streamedOptions: options => ({
        ...options,
        input: { invalid: 'test' },
      }),
    }
  })

  it('liveKey should accept Partial<QueryKeyOptions> | modifier function', () => {
    const _defaults: TestOptions = {
      liveKey: {
        input: { search: 'test' },
      },
    }

    const _invalid: TestOptions = {
      liveKey: {
        // @ts-expect-error - invalid input type
        input: { invalid: 'test' },
      },
    }

    const _defaults2: TestOptions = {
      liveKey: (options) => {
        expectTypeOf(options).toEqualTypeOf<QueryKeyOptions<TestInput>>()

        return {
          input: { search: 'test' },
        }
      },
    }

    const _invalid2: TestOptions = {
      // @ts-expect-error - invalid input type
      liveKey: options => ({
        ...options,
        input: { invalid: 'test' },
      }),
    }
  })

  it('liveInterceptors should infer correct types', () => {
    const defaults: TestStreamedOptions = {
      liveInterceptors: [
        (opts) => {
          expectTypeOf(opts.input).toEqualTypeOf<TestInput | SkipToken>()
          expectTypeOf(opts.next()).toEqualTypeOf<PromiseWithError<TestOutput, TestError>>()
          expectTypeOf(opts.fnContext).toEqualTypeOf<QueryFunctionContext>()

          return opts.next()
        },
      ],
    }
  })

  it('liveOptions should accept Partial<StreamedOptionsIn> | modifier function', () => {
    const _defaults: TestOptions = {
      liveOptions: {
        input: { search: 'test' },
        staleTime: 1000,
      },
    }

    const _invalid: TestOptions = {
      liveOptions: {
        // @ts-expect-error - invalid input type
        input: { invalid: 'test' },
      },
    }

    const _defaults2: TestOptions = {
      liveOptions: (options) => {
        expectTypeOf(options).toEqualTypeOf<QueryOptionsIn<TestClientContext, TestInput, never, TestError, unknown, unknown>>()

        return {
          ...options,
          input: { search: 'test' },
          staleTime: 1000,
        }
      },
    }

    const _invalid2: TestOptions = {
      // @ts-expect-error - invalid input type
      liveOptions: options => ({
        ...options,
        input: { invalid: 'test' },
      }),
    }
  })

  it('infiniteKey should accept Partial input, initialPageParam, queryKey', () => {
    const defaults: TestOptions = {
      infiniteKey: {
        initialPageParam: 0,
        queryKey: ['custom-key'],
      },
    }
    expectTypeOf(defaults).toExtend<TestOptions>()

    const _invalid: TestOptions = {
      infiniteKey: {
        // @ts-expect-error - invalid input type
        input: { invalid: 'test' },
      },
    }
  })

  it('infiniteInterceptors should infer correct types', () => {
    const defaults: TestOptions = {
      infiniteInterceptors: [
        (opts) => {
          expectTypeOf(opts.input).toEqualTypeOf<TestInput | SkipToken>()
          expectTypeOf(opts.next()).toEqualTypeOf<PromiseWithError<TestOutput, TestError>>()
          expectTypeOf(opts.fnContext).toExtend<QueryFunctionContext>()

          return opts.next()
        },
      ],
    }
  })

  it('infiniteOptions should accept Partial<InfiniteOptionsIn> | modifier function', () => {
    const _defaults: TestOptions = {
      infiniteOptions: {
        staleTime: 1000,
      },
    }

    const _invalid: TestOptions = {
      infiniteOptions: {
        // @ts-expect-error - invalid input type
        input: { invalid: 'test' },
      },
    }

    const _defaults2: TestOptions = {
      infiniteOptions: (options) => {
        expectTypeOf(options).toEqualTypeOf<InfiniteOptionsIn<TestClientContext, TestInput, TestOutput, TestError, unknown, unknown, unknown>>()

        return {
          ...options,
          staleTime: 1000,
        }
      },
    }

    const _invalid2: TestOptions = {
      // @ts-expect-error - invalid input type
      infiniteOptions: options => ({
        ...options,
        input: { invalid: 'test' },
      }),
    }
  })

  it('mutationKey should accept Partial mutationKey | modifier function', () => {
    const _defaults: TestOptions = {
      mutationKey: {
        mutationKey: ['custom-mutation-key'],
      },
    }

    const _invalid: TestOptions = {
      mutationKey: {
        // @ts-expect-error - invalid mutationKey type
        mutationKey: 1,
      },
    }

    const _defaults2: TestOptions = {
      mutationKey: (options) => {
        expectTypeOf(options).toEqualTypeOf<MutationKeyOptions>()

        return {
          mutationKey: ['custom-mutation-key'],
        }
      },
    }

    const _invalid2: TestOptions = {
      // @ts-expect-error - invalid mutationKey type
      mutationKey: options => ({
        mutationKey: 1,
      }),
    }
  })

  it('mutationInterceptors should infer correct types', () => {
    const defaults: TestOptions = {
      mutationInterceptors: [
        (opts) => {
          expectTypeOf(opts.input).toEqualTypeOf<TestInput>()
          expectTypeOf(opts.next()).toEqualTypeOf<PromiseWithError<TestOutput, TestError>>()
          expectTypeOf(opts.fnContext).toExtend<MutationFunctionContext>()

          return opts.next()
        },
      ],
    }
  })

  it('mutationOptions should accept Partial<MutationOptionsIn> | modifier function', () => {
    const _defaults: TestOptions = {
      mutationOptions: {
        onSuccess: (output) => {
          expectTypeOf(output).toEqualTypeOf<TestOutput>()
        },
        context: { batch: true },
      },
    }

    const _invalid: TestOptions = {
      mutationOptions: {
        // @ts-expect-error - invalid context type
        context: { batch: 'invalid' },
      },
    }

    const _defaults2: TestOptions = {
      mutationOptions: (options) => {
        expectTypeOf(options).toEqualTypeOf<MutationOptionsIn<TestClientContext, TestInput, TestOutput, TestError, unknown>>()

        return {
          ...options,
          onSuccess: (output) => {
            expectTypeOf(output).toEqualTypeOf<TestOutput>()
          },
          context: { batch: true },
        }
      },
    }

    const _invalid2: TestOptions = {
      // @ts-expect-error - invalid context type
      mutationOptions: options => ({
        ...options,
        context: { batch: 'invalid' },
      }),
    }
  })
})
