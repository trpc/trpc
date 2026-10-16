import type { Client, ORPCError } from '@orpc/client'
import type { ORPCErrorFromErrorMap } from '@orpc/contract'
import type { PromiseWithError, Public } from '@orpc/shared'
import type { UseInfiniteQueryData, UseInfiniteQueryFnContext } from '@pinia/colada'
import type { ProcedureUtils, ProcedureUtilsOptions } from './procedure-utils'
import type { InfiniteOptionsIn, MutationKeyOptions, MutationOptionsIn, QueryKeyOptions, QueryOptionsIn, StreamedKeyOptions, StreamedOptionsIn, UseMutationFnContext, UseQueryFnContext } from './types'
import { useInfiniteQuery, useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed } from 'vue'
import z from 'zod'

const outputSchema = z.object({ output: z.number().transform(n => `${n}`) })

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

  const utils = {} as Public<ProcedureUtils<
    { batch?: boolean },
    UtilsInput,
    UtilsOutput,
    UtilsError
  >>

  it('.call', () => {
    expectTypeOf(utils.call).toEqualTypeOf<
      Client<
        { batch?: boolean },
        UtilsInput,
        UtilsOutput,
        UtilsError
      >
    >()
  })

  describe('.queryKey', () => {
    it('returns tagged key & infers correct input type', () => {
      const queryCache = useQueryCache()

      expectTypeOf(
        queryCache.getQueryData(utils.queryKey({ input: { search: 'search' } })),
      ).toEqualTypeOf<UtilsOutput | undefined>()

      utils.queryKey()
      utils.queryKey({})
      utils.queryKey({ key: ['__custom__'] })

      // @ts-expect-error invalid input
      utils.queryKey({ input: 'invalid' })

      const requiredUtils = {} as Public<ProcedureUtils<{ batch?: boolean }, 'input', UtilsOutput, Error>>
      requiredUtils.queryKey({ input: 'input' })
      // @ts-expect-error input is required
      requiredUtils.queryKey()
    })
  })

  describe('.streamedOptions & .liveOptions', () => {
    const streamUtils = {} as Public<ProcedureUtils<
      { batch?: boolean },
      UtilsInput,
      AsyncIterable<UtilsOutput[number]>,
      UtilsError
    >>

    it('works with useQuery', () => {
      const streamed = useQuery(streamUtils.streamedOptions({
        input: { search: 'search' },
        fnOptions: { refetchMode: 'append', maxChunks: 3 },
      }))

      expectTypeOf(streamed.data.value).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(streamed.error.value).toEqualTypeOf<UtilsError | null>()

      const live = useQuery(() => streamUtils.liveOptions({ input: { search: 'search' } }))

      expectTypeOf(live.data.value).toEqualTypeOf<UtilsOutput[number] | undefined>()
      expectTypeOf(live.error.value).toEqualTypeOf<UtilsError | null>()
    })

    it('returns tagged keys', () => {
      const queryCache = useQueryCache()

      expectTypeOf(
        queryCache.getQueryData(streamUtils.streamedKey({ input: { search: 'search' } })),
      ).toEqualTypeOf<UtilsOutput | undefined>()

      expectTypeOf(
        queryCache.getQueryData(streamUtils.liveKey({ input: { search: 'search' } })),
      ).toEqualTypeOf<UtilsOutput[number] | undefined>()
    })

    it('infer correct input & fnOptions types', () => {
      // @ts-expect-error invalid input
      streamUtils.streamedOptions({ input: 'invalid' })
      // @ts-expect-error invalid fnOptions
      streamUtils.streamedOptions({ fnOptions: { refetchMode: 'invalid' } })
      // @ts-expect-error invalid input
      streamUtils.liveOptions({ input: 'invalid' })
    })
  })

  describe('.infiniteKey', () => {
    it('returns tagged key & infers correct input type', () => {
      const queryCache = useQueryCache()

      expectTypeOf(
        queryCache.getQueryData(utils.infiniteKey({ input: (cursor: number) => ({ cursor }), initialPageParam: 0 })),
      ).toEqualTypeOf<UseInfiniteQueryData<UtilsOutput, number> | undefined>()

      utils.infiniteKey({ key: ['__custom__'] })

      utils.infiniteKey({
        // @ts-expect-error invalid input
        input: (cursor: number) => ({ cursor: 'invalid' }),
        initialPageParam: 0,
      })
    })
  })

  describe('.mutationKey', () => {
    it('works', () => {
      const key = utils.mutationKey()

      if (typeof key === 'function') {
        expectTypeOf(key).parameter(0).toEqualTypeOf<UtilsInput>()
      }

      utils.mutationKey({})
      utils.mutationKey({ key: ['__custom__'] })
      utils.mutationKey({ key: input => [{ input }] as any })
    })
  })

  describe('.queryOptions', () => {
    it('can optional options', () => {
      const requiredUtils = {} as Public<ProcedureUtils<{ batch?: boolean }, 'input', UtilsOutput, Error>>

      utils.queryOptions()
      utils.queryOptions({ context: { batch: true } })
      utils.queryOptions({ input: { search: 'search' } })

      requiredUtils.queryOptions({
        context: { batch: true },
        input: 'input',
      })
      // @ts-expect-error input and context is required
      requiredUtils.queryOptions()
      // @ts-expect-error input and context is required
      requiredUtils.queryOptions({})
      // @ts-expect-error input is required
      requiredUtils.queryOptions({ context: { batch: true } })
    })

    it('infer correct input type', () => {
      utils.queryOptions({ input: { cursor: 1 }, context: { batch: true } })
      // @ts-expect-error invalid input
      utils.queryOptions({ input: { cursor: 'invalid' }, context: { batch: true } })
    })

    it('infer correct context type', () => {
      utils.queryOptions({ context: { batch: true } })
      // @ts-expect-error invalid context
      utils.queryOptions({ context: { batch: 'invalid' } })
    })

    it('not allow ref/computed values, reactivity via useQuery callback instead', () => {
      // @ts-expect-error ref/computed input is not allowed
      utils.queryOptions({ input: computed(() => ({ cursor: 1 })) })
      // @ts-expect-error getter input is not allowed
      utils.queryOptions({ input: () => ({ cursor: 1 }) })
      // @ts-expect-error ref/computed context is not allowed
      utils.queryOptions({ context: computed(() => ({ batch: true })) })

      const query = useQuery(() => utils.queryOptions({ input: { cursor: 1 } }))

      expectTypeOf(query.data.value).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(query.error.value).toEqualTypeOf<UtilsError | null>()
    })

    describe('works with useQuery', () => {
      it('without initial data', () => {
        const query = useQuery(utils.queryOptions())

        expectTypeOf(query.data.value).toEqualTypeOf<UtilsOutput | undefined>()
        expectTypeOf(query.error.value).toEqualTypeOf<UtilsError | null>()
      })

      it('with initial data', () => {
        const query = useQuery(utils.queryOptions({
          initialData: () => [{ title: 'title' }],
        }))

        expectTypeOf(query.data.value).toEqualTypeOf<UtilsOutput>()
        expectTypeOf(query.error.value).toEqualTypeOf<UtilsError | null>()
      })
    })
  })

  describe('.infiniteOptions', () => {
    it('infer correct input & page param types', () => {
      utils.infiniteOptions({
        input: (cursor: number) => ({ cursor }),
        initialPageParam: 0,
        getNextPageParam: (lastPage) => {
          expectTypeOf(lastPage).toEqualTypeOf<UtilsOutput>()
          return 1
        },
      })

      utils.infiniteOptions({
        // @ts-expect-error invalid input
        input: (cursor: number) => ({ cursor: 'invalid' }),
        initialPageParam: 0,
        getNextPageParam: () => 1,
      })

      // @ts-expect-error initialPageParam & getNextPageParam are required
      utils.infiniteOptions({
        input: (cursor: number) => ({ cursor }),
      })
    })

    it('infer correct context type', () => {
      utils.infiniteOptions({
        input: () => undefined,
        initialPageParam: 0,
        getNextPageParam: () => 1,
        context: { batch: true },
      })

      utils.infiniteOptions({
        input: () => undefined,
        initialPageParam: 0,
        getNextPageParam: () => 1,
        // @ts-expect-error invalid context
        context: { batch: 'invalid' },
      })
    })

    it('works with useInfiniteQuery', () => {
      const query = useInfiniteQuery(utils.infiniteOptions({
        input: (cursor: number) => ({ cursor }),
        initialPageParam: 0,
        getNextPageParam: () => 1,
      }))

      expectTypeOf(query.data.value?.pages).toEqualTypeOf<UtilsOutput[] | undefined>()
      expectTypeOf(query.data.value?.pageParams).toEqualTypeOf<number[] | undefined>()
      expectTypeOf(query.error.value).toEqualTypeOf<UtilsError | null>()

      const lazyQuery = useInfiniteQuery(() => utils.infiniteOptions({
        input: (cursor: number) => ({ cursor }),
        initialPageParam: 0,
        getNextPageParam: () => 1,
      }))

      expectTypeOf(lazyQuery.data.value?.pages).toEqualTypeOf<UtilsOutput[] | undefined>()
    })
  })

  describe('.mutationOptions', () => {
    it('can optional options', () => {
      const requiredUtils = {} as Public<ProcedureUtils<{ batch: boolean }, 'input', UtilsOutput, Error>>

      utils.mutationOptions()
      utils.mutationOptions({})

      requiredUtils.mutationOptions({
        context: { batch: true },
      })
      // @ts-expect-error context is required
      requiredUtils.mutationOptions()
      // @ts-expect-error context is required
      requiredUtils.mutationOptions({})
    })

    it('infer correct context type', () => {
      utils.mutationOptions({ context: { batch: true } })
      // @ts-expect-error invalid context
      utils.mutationOptions({ context: { batch: 'invalid' } })
    })

    it('not allow ref/computed context', () => {
      // @ts-expect-error ref/computed context is not allowed
      utils.mutationOptions({ context: computed(() => ({ batch: true })) })
      // @ts-expect-error getter context is not allowed
      utils.mutationOptions({ context: () => ({ batch: true }) })
    })

    it('works with useMutation', () => {
      const mutation = useMutation(utils.mutationOptions({
        onSuccess: (data, input) => {
          expectTypeOf(data).toEqualTypeOf<UtilsOutput>()
          expectTypeOf(input).toEqualTypeOf<UtilsInput>()
        },
        onError: (error) => {
          expectTypeOf(error).toEqualTypeOf<UtilsError>()
        },
      }))

      expectTypeOf<Parameters<typeof mutation.mutate>[0]>().toEqualTypeOf<UtilsInput>()
      expectTypeOf(mutation.data.value).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(mutation.error.value).toEqualTypeOf<UtilsError | null>()
    })

    it('infer correct mutation context type', () => {
      useMutation({
        ...utils.mutationOptions({
          onMutate: () => ({ mutationContext: true }),
          onError: (e, v, context) => {
            expectTypeOf(context.mutationContext).toEqualTypeOf<undefined | boolean>()
          },
        }),
        onSettled: (d, e, v, context) => {
          expectTypeOf(context.mutationContext).toEqualTypeOf<undefined | boolean>()
        },
      })
    })
  })
})

describe('ProcedureUtilsOptions', () => {
  type TestClientContext = { batch?: boolean }
  type TestInput = { search?: string }
  type TestOutput = { title: string }
  type TestError = ORPCError<'TEST', unknown>

  type TestOptions = ProcedureUtilsOptions<TestClientContext, TestInput, TestOutput, TestError>

  type TestStreamedOutput = AsyncIterable<TestOutput>
  type TestStreamedOptions = ProcedureUtilsOptions<TestClientContext, TestInput, TestStreamedOutput, TestError>

  it('should have all keys that ProcedureUtils provides', () => {
    // Ensures every utility method in ProcedureUtils (except 'call') has a corresponding key in ProcedureUtilsOptions
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

    const _defaults2: TestOptions = {
      queryKey: {
        key: ['__custom__'],
      },
    }

    const _invalid: TestOptions = {
      queryKey: {
        // @ts-expect-error - invalid input type
        input: { invalid: 'test' },
      },
    }

    const _defaults3: TestOptions = {
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
          expectTypeOf(opts.input).toEqualTypeOf<TestInput>()
          expectTypeOf(opts.next()).toEqualTypeOf<PromiseWithError<TestOutput, TestError>>()
          expectTypeOf(opts.fnContext).toEqualTypeOf<UseQueryFnContext>()

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
        expectTypeOf(options).toEqualTypeOf<QueryOptionsIn<TestClientContext, TestInput, TestOutput, TestError, TestOutput | undefined>>()

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
        fnOptions: { maxChunks: 10 },
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
          fnOptions: { maxChunks: 10 },
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
          expectTypeOf(opts.input).toEqualTypeOf<TestInput>()
          expectTypeOf(opts.next()).toEqualTypeOf<PromiseWithError<TestOutput[], TestError>>()
          expectTypeOf(opts.fnContext).toEqualTypeOf<UseQueryFnContext>()

          return opts.next()
        },
      ],
    }
  })

  it('streamedOptions should accept Partial<StreamedOptionsIn> | modifier function', () => {
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
        expectTypeOf(options).toEqualTypeOf<StreamedOptionsIn<TestClientContext, TestInput, never, TestError, undefined>>()

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
          expectTypeOf(opts.input).toEqualTypeOf<TestInput>()
          expectTypeOf(opts.next()).toEqualTypeOf<PromiseWithError<TestOutput, TestError>>()
          expectTypeOf(opts.fnContext).toEqualTypeOf<UseQueryFnContext>()

          return opts.next()
        },
      ],
    }
  })

  it('liveOptions should accept Partial<QueryOptionsIn> | modifier function', () => {
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
        expectTypeOf(options).toEqualTypeOf<QueryOptionsIn<TestClientContext, TestInput, never, TestError, undefined>>()

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

  it('infiniteKey should accept Partial input, initialPageParam, key', () => {
    const _defaults: TestOptions = {
      infiniteKey: {
        initialPageParam: 0,
      },
    }

    const _defaults2: TestOptions = {
      infiniteKey: {
        key: ['__custom__'],
      },
    }

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
          expectTypeOf(opts.input).toEqualTypeOf<TestInput>()
          expectTypeOf(opts.next()).toEqualTypeOf<PromiseWithError<TestOutput, TestError>>()
          expectTypeOf(opts.fnContext).toEqualTypeOf<UseInfiniteQueryFnContext<any, any, any, any>>()

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
        expectTypeOf(options).toEqualTypeOf<InfiniteOptionsIn<TestClientContext, TestInput, TestOutput, TestError, unknown, UseInfiniteQueryData<TestOutput, unknown> | undefined>>()

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

  it('mutationKey should accept Partial key | modifier function', () => {
    const _defaults: TestOptions = {
      mutationKey: {
        key: ['__custom__'],
      },
    }

    const _invalid: TestOptions = {
      mutationKey: {
        // @ts-expect-error - invalid key type
        key: 1,
      },
    }

    const _defaults2: TestOptions = {
      mutationKey: (options) => {
        expectTypeOf(options).toEqualTypeOf<MutationKeyOptions<TestInput>>()

        return {
          key: ['__custom__'],
        }
      },
    }

    const _invalid2: TestOptions = {
      // @ts-expect-error - invalid key type
      mutationKey: options => ({
        key: 1,
      }),
    }
  })

  it('mutationInterceptors should infer correct types', () => {
    const defaults: TestOptions = {
      mutationInterceptors: [
        (opts) => {
          expectTypeOf(opts.input).toEqualTypeOf<TestInput>()
          expectTypeOf(opts.next()).toEqualTypeOf<PromiseWithError<TestOutput, TestError>>()
          expectTypeOf(opts.fnContext).toEqualTypeOf<UseMutationFnContext>()

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
        expectTypeOf(options).toEqualTypeOf<MutationOptionsIn<TestClientContext, TestInput, TestOutput, TestError, Record<any, any>>>()

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
