import type { Client, ClientContext } from '@orpc/client'
import type { Interceptor, MaybeOptionalOptions, PromiseWithError } from '@orpc/shared'
import type { DataTag, InfiniteData, MutationFunctionContext, QueryFunctionContext, QueryKey, SkipToken } from '@tanstack/query-core'
import type { OperationKeyPrefixOptions } from './key'
import type {
  InferLiveQueryOutput,
  InferStreamedQueryOutput,
  InfiniteKeyOptions,
  InfiniteOptionsIn,
  InfiniteOptionsOut,
  MutationKeyOptions,
  MutationOptionsIn,
  MutationOptionsOut,
  OperationContext,
  QueryKeyOptions,
  QueryOptionsIn,
  QueryOptionsOut,
  StreamedKeyOptions,
  StreamedOptionsIn,
  StreamedOptionsOut,
} from './types'
import { intercept, isAsyncIteratorObject, isTypescriptObject, resolveMaybeOptionalOptions, toArray } from '@orpc/shared'
import { skipToken } from '@tanstack/query-core'
import { generateOperationKey } from './key'
import { liveQuery } from './live-query'
import { SharedUtils } from './shared-utils'
import { serializableStreamedQuery } from './stream-query'
import { OPERATION_CONTEXT_SYMBOL } from './types'

export interface ProcedureUtilsQueryInterceptorOptions<TClientContext extends ClientContext, TInput> {
  path: string[]
  context: TClientContext & OperationContext
  input: TInput | SkipToken
  fnContext: QueryFunctionContext
}
export type ProcedureUtilsQueryInterceptor<TClientContext extends ClientContext, TInput, TOutput, TError>
  = Interceptor<ProcedureUtilsQueryInterceptorOptions<TClientContext, TInput>, PromiseWithError<TOutput, TError>>

export interface ProcedureUtilsStreamedInterceptorOptions<TClientContext extends ClientContext, TInput> extends ProcedureUtilsQueryInterceptorOptions<TClientContext, TInput> {
}
export type ProcedureUtilsStreamedInterceptor<TClientContext extends ClientContext, TInput, TOutput, TError>
  = Interceptor<ProcedureUtilsStreamedInterceptorOptions<TClientContext, TInput>, PromiseWithError<InferStreamedQueryOutput<TOutput>, TError>>

export interface ProcedureUtilsLiveInterceptorOptions<TClientContext extends ClientContext, TInput> extends ProcedureUtilsQueryInterceptorOptions<TClientContext, TInput> {
}
export type ProcedureUtilsLiveInterceptor<TClientContext extends ClientContext, TInput, TOutput, TError>
  = Interceptor<ProcedureUtilsLiveInterceptorOptions<TClientContext, TInput>, PromiseWithError<InferLiveQueryOutput<TOutput>, TError>>

export interface ProcedureUtilsInfiniteInterceptorOptions<TClientContext extends ClientContext, TInput> extends ProcedureUtilsQueryInterceptorOptions<TClientContext, TInput> {
  fnContext: QueryFunctionContext<QueryKey, any>
}
export type ProcedureUtilsInfiniteInterceptor<TClientContext extends ClientContext, TInput, TOutput, TError>
  = Interceptor<ProcedureUtilsInfiniteInterceptorOptions<TClientContext, TInput>, PromiseWithError<TOutput, TError>>

export interface ProcedureUtilsMutationInterceptorOptions<TClientContext extends ClientContext, TInput> extends Omit<ProcedureUtilsQueryInterceptorOptions<TClientContext, TInput>, 'input' | 'fnContext'> {
  input: TInput
  fnContext: MutationFunctionContext
}
export type ProcedureUtilsMutationInterceptor<TClientContext extends ClientContext, TInput, TOutput, TError>
  = Interceptor<ProcedureUtilsMutationInterceptorOptions<TClientContext, TInput>, PromiseWithError<TOutput, TError>>

/**
 * Can be partial options for spread-merged options,
 * or a function that receives per-call options and returns overridden this.options.
 */
export type ProcedureUtilsModifier<T extends object> = Partial<T> | ((options: T) => T)

export interface ProcedureUtilsOptions<TClientContext extends ClientContext, TInput, TOutput, TError> extends OperationKeyPrefixOptions {
  /**
   * Key options modifier for .queryKey and .queryOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  queryKey?: ProcedureUtilsModifier<
    QueryKeyOptions<TInput>
  >

  /**
   * Interceptors that intercept queryFn inside .queryOptions, guaranteed to be executed.
   */
  queryInterceptors?: ProcedureUtilsQueryInterceptor<TClientContext, TInput, TOutput, TError>[]

  /**
   * Options modifier for .queryOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  queryOptions?: ProcedureUtilsModifier<
    QueryOptionsIn<TClientContext, TInput, TOutput, TError, unknown, unknown>
  >

  /**
   * Key options modifier for .streamedKey and .streamedOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  streamedKey?: ProcedureUtilsModifier<
    StreamedKeyOptions<TInput>
  >

  /**
   * Interceptors that intercept queryFn inside .streamedOptions, guaranteed to be executed.
   */
  streamedInterceptors?: ProcedureUtilsStreamedInterceptor<TClientContext, TInput, TOutput, TError>[]

  /**
   * Options modifier for .streamedOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  streamedOptions?: ProcedureUtilsModifier<
    StreamedOptionsIn<TClientContext, TInput, InferStreamedQueryOutput<TOutput>, TError, unknown, unknown>
  >

  /**
   * Key options modifier for .liveKey and .liveOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  liveKey?: ProcedureUtilsModifier<
    QueryKeyOptions<TInput>
  >

  /**
   * Interceptors that intercept queryFn inside .liveOptions, guaranteed to be executed.
   */
  liveInterceptors?: ProcedureUtilsLiveInterceptor<TClientContext, TInput, TOutput, TError>[]

  /**
   * Options modifier for .liveOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  liveOptions?: ProcedureUtilsModifier<
    QueryOptionsIn<TClientContext, TInput, InferLiveQueryOutput<TOutput>, TError, unknown, unknown>
  >

  /**
   * Key options modifier for .infiniteKey and .infiniteOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  infiniteKey?: ProcedureUtilsModifier<
    InfiniteKeyOptions<TInput, unknown>
  >

  /**
   * Interceptors that intercept queryFn inside .infiniteOptions, guaranteed to be executed.
   */
  infiniteInterceptors?: ProcedureUtilsInfiniteInterceptor<TClientContext, TInput, TOutput, TError>[]

  /**
   * Options modifier for .infiniteOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  infiniteOptions?: ProcedureUtilsModifier<
    InfiniteOptionsIn<TClientContext, TInput, TOutput, TError, unknown, unknown, unknown>
  >

  /**
   * Key options modifier for .mutationKey and .mutationOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  mutationKey?: ProcedureUtilsModifier<
    MutationKeyOptions
  >

  /**
   * Interceptors that intercept mutationFn inside .mutationOptions, guaranteed to be executed.
   */
  mutationInterceptors?: ProcedureUtilsMutationInterceptor<TClientContext, TInput, TOutput, TError>[]

  /**
   * Options modifier for .mutationOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  mutationOptions?: ProcedureUtilsModifier<
    MutationOptionsIn<TClientContext, TInput, TOutput, TError, unknown>
  >
}

const PROCEDURE_UTILS_INTERCEPTOR_KEYS: string[] = [
  'queryInterceptors',
  'streamedInterceptors',
  'liveInterceptors',
  'infiniteInterceptors',
  'mutationInterceptors',
]

const PROCEDURE_UTILS_MODIFIER_KEYS: string[] = [
  'queryKey',
  'queryOptions',
  'streamedKey',
  'streamedOptions',
  'liveKey',
  'liveOptions',
  'infiniteKey',
  'infiniteOptions',
  'mutationKey',
  'mutationOptions',
]

export function isProcedureUtilsOptions(value: unknown): value is ProcedureUtilsOptions<any, any, any, any> {
  if (!isTypescriptObject(value)) {
    return false
  }

  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      continue
    }

    if (key === 'prefix') {
      if (typeof value[key] !== 'string') {
        return false
      }
    }
    else if (PROCEDURE_UTILS_INTERCEPTOR_KEYS.includes(key)) {
      if (!Array.isArray(value[key]) || value[key].some(i => typeof i !== 'function')) {
        return false
      }
    }
    else if (PROCEDURE_UTILS_MODIFIER_KEYS.includes(key)) {
      if (!isTypescriptObject(value[key])) {
        return false
      }
    }
  }

  return true
}

function mergeProcedureUtilsModifier<T extends object>(
  base: ProcedureUtilsModifier<T>,
  override: ProcedureUtilsModifier<T>,
): ProcedureUtilsModifier<T> {
  if (typeof override !== 'function') {
    if (typeof base !== 'function') {
      return { ...base, ...override } as Partial<T>
    }

    return options => base({ ...override, ...options })
  }

  const applyBase = typeof base === 'function' ? base : (options: T) => ({ ...base, ...options })

  return options => override(applyBase(options))
}

/**
 * Merge two procedure utils options where `override` takes priority.
 * A key explicitly set to `undefined` in `override` resets the base value.
 * When both sides define a key, interceptors are concatenated (base ones run first) and
 * modifiers are combined so that, for object values, per-call options beat `override`,
 * which beats `base`. A function modifier receives the merged options and its result wins.
 */
export function mergeProcedureUtilsOptions<TClientContext extends ClientContext, TInput, TOutput, TError>(
  base: ProcedureUtilsOptions<TClientContext, TInput, TOutput, TError>,
  override: ProcedureUtilsOptions<TClientContext, TInput, TOutput, TError>,
): ProcedureUtilsOptions<TClientContext, TInput, TOutput, TError> {
  const merged: Record<string, unknown> = { ...base, ...override }

  for (const key of PROCEDURE_UTILS_INTERCEPTOR_KEYS) {
    const baseValue = (base as Record<string, unknown>)[key] as ProcedureUtilsQueryInterceptor<any, any, any, any>[] | undefined
    const overrideValue = (override as Record<string, unknown>)[key] as ProcedureUtilsQueryInterceptor<any, any, any, any>[] | undefined

    if (baseValue && overrideValue) {
      merged[key] = [...baseValue, ...overrideValue]
    }
  }

  for (const key of PROCEDURE_UTILS_MODIFIER_KEYS) {
    const baseValue = (base as Record<string, unknown>)[key] as ProcedureUtilsModifier<any> | undefined
    const overrideValue = (override as Record<string, unknown>)[key] as ProcedureUtilsModifier<any> | undefined

    if (baseValue && overrideValue) {
      merged[key] = mergeProcedureUtilsModifier(baseValue, overrideValue)
    }
  }

  return merged as ProcedureUtilsOptions<TClientContext, TInput, TOutput, TError>
}

export class ProcedureUtils<TClientContext extends ClientContext, TInput, TOutput, TError> extends SharedUtils<TInput> {
  declare protected readonly options: ProcedureUtilsOptions<TClientContext, TInput, TOutput, TError>

  /**
   * Calling corresponding procedure client
   */
  call: Client<TClientContext, TInput, TOutput, TError>

  constructor(
    path: string[],
    client: Client<TClientContext, TInput, TOutput, TError>,
    options: ProcedureUtilsOptions<TClientContext, TInput, TOutput, TError> = {},
  ) {
    super(path, options)
    this.call = client
  }

  /**
   * Generate a **full matching** key for [Query Options](https://orpc.dev/docs/integrations/tanstack-query#query-options).
   */
  queryKey(
    ...rest: MaybeOptionalOptions<QueryKeyOptions<TInput>>
  ): DataTag<QueryKey, TOutput, TError> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.queryKey === 'function') {
      optionsIn = this.options.queryKey(optionsIn)
    }
    else if (this.options.queryKey) {
      optionsIn = { ...this.options.queryKey, ...optionsIn }
    }

    const queryKey = (optionsIn as any).queryKey
      ?? generateOperationKey(this.path, { prefix: this.options.prefix, type: 'query', input: (optionsIn as any).input })

    return queryKey as DataTag<QueryKey, TOutput, TError>
  }

  /**
   * Generate options used for useQuery/useSuspenseQuery/prefetchQuery/...
   */
  queryOptions<USelectData = TOutput, UInitialData = undefined>(
    ...rest: MaybeOptionalOptions<
      QueryOptionsIn<TClientContext, TInput, TOutput, TError, USelectData, UInitialData>
    >
  ): NoInfer<QueryOptionsOut<TOutput, TError, USelectData, UInitialData>> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.queryOptions === 'function') {
      optionsIn = this.options.queryOptions(optionsIn) as any
    }
    else if (this.options.queryOptions) {
      optionsIn = { ...this.options.queryOptions, ...optionsIn }
    }

    const queryKey = this.queryKey(optionsIn)

    return {
      ...optionsIn as any,
      queryKey,
      queryFn: (fnContext) => {
        return intercept(
          this.options.queryInterceptors,
          {
            path: this.path,
            context: {
              [OPERATION_CONTEXT_SYMBOL]: {
                key: queryKey,
                type: 'query',
              },
              ...optionsIn.context,
            } satisfies OperationContext as any,
            input: optionsIn.input as TInput | SkipToken,
            fnContext,
          },
          ({ context, input, fnContext }) => {
            if (input === skipToken || optionsIn.queryFn === skipToken) {
              throw new Error('queryFn should not be called when skipToken used for skipping')
            }

            if (optionsIn.queryFn) {
              return optionsIn.queryFn(fnContext) as PromiseWithError<TOutput, TError>
            }

            return this.call(input, { signal: fnContext.signal, context })
          },
        )
      },
      ...optionsIn.input === skipToken || optionsIn.queryFn === skipToken ? { enabled: false } : {},
    }
  }

  /**
   * Generate a **full matching** key for [Streamed Query Options](https://orpc.dev/docs/integrations/tanstack-query#streamed-query-options).
   */
  streamedKey(
    ...rest: MaybeOptionalOptions<StreamedKeyOptions<TInput>>
  ): DataTag<QueryKey, InferStreamedQueryOutput<TOutput>, TError> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.streamedKey === 'function') {
      optionsIn = this.options.streamedKey(optionsIn)
    }
    else if (this.options.streamedKey) {
      optionsIn = { ...this.options.streamedKey, ...optionsIn }
    }

    const queryKey = (optionsIn as any).queryKey
      ?? generateOperationKey(this.path, { prefix: this.options.prefix, type: 'streamed', input: (optionsIn as any).input, fnOptions: (optionsIn as any).queryFnOptions })

    return queryKey as DataTag<QueryKey, InferStreamedQueryOutput<TOutput>, TError>
  }

  /**
   * Configure queries for [AsyncIteratorObject](https://orpc.dev/docs/async-iterator-object).
   * This is built on [TanStack Query streamedQuery](https://tanstack.com/query/latest/docs/reference/streamedQuery)
   * and works with hooks like `useQuery`, `useSuspenseQuery`, or `prefetchQuery`.
   */
  streamedOptions<USelectData = InferStreamedQueryOutput<TOutput>, UInitialData = undefined>(
    ...rest: MaybeOptionalOptions<
      StreamedOptionsIn<TClientContext, TInput, InferStreamedQueryOutput<TOutput>, TError, USelectData, UInitialData>
    >
  ): NoInfer<StreamedOptionsOut<InferStreamedQueryOutput<TOutput>, TError, USelectData, UInitialData>> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.streamedOptions === 'function') {
      optionsIn = this.options.streamedOptions(optionsIn) as any
    }
    else if (this.options.streamedOptions) {
      optionsIn = { ...this.options.streamedOptions, ...optionsIn }
    }

    const queryKey = this.streamedKey(optionsIn)

    return {
      ...optionsIn as any,
      queryKey,
      queryFn: (fnContext) => {
        return intercept(
          toArray(this.options.streamedInterceptors),
          {
            path: this.path,
            context: {
              [OPERATION_CONTEXT_SYMBOL]: {
                key: queryKey,
                type: 'streamed',
              },
              ...optionsIn.context,
            } satisfies OperationContext as any,
            input: optionsIn.input as TInput | SkipToken,
            fnContext,
          },
          ({ context, fnContext, input }) => {
            if (input === skipToken || optionsIn.queryFn === skipToken) {
              throw new Error('queryFn should not be called when skipToken used for skipping')
            }

            if (optionsIn.queryFn) {
              return optionsIn.queryFn(fnContext) as any
            }

            return serializableStreamedQuery(
              async (queryContext) => {
                const output = await this.call(input, { signal: queryContext.signal, context })

                if (!isAsyncIteratorObject(output)) {
                  throw new Error('streamedQuery requires an AsyncIteratorObject output')
                }

                return output
              },
              optionsIn.queryFnOptions,
            )(fnContext)
          },
        )
      },
      ...optionsIn.input === skipToken || optionsIn.queryFn === skipToken ? { enabled: false } : {},
    }
  }

  /**
   * Generate a **full matching** key for [Live Query Options](https://orpc.dev/docs/integrations/tanstack-query#live-query-options).
   */
  liveKey(
    ...rest: MaybeOptionalOptions<QueryKeyOptions<TInput>>
  ): DataTag<QueryKey, InferLiveQueryOutput<TOutput>, TError> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.liveKey === 'function') {
      optionsIn = this.options.liveKey(optionsIn)
    }
    else if (this.options.liveKey) {
      optionsIn = { ...this.options.liveKey, ...optionsIn }
    }

    const queryKey = (optionsIn as any).queryKey
      ?? generateOperationKey(this.path, { prefix: this.options.prefix, type: 'live', input: (optionsIn as any).input })

    return queryKey as DataTag<QueryKey, InferLiveQueryOutput<TOutput>, TError>
  }

  /**
   * Configure live queries for [AsyncIteratorObject](https://orpc.dev/docs/async-iterator-object).
   * Unlike `.streamedOptions` which accumulates chunks, live queries replace the entire result with each new chunk received.
   * Works with hooks like `useQuery`, `useSuspenseQuery`, or `prefetchQuery`.
   */
  liveOptions<USelectData = InferLiveQueryOutput<TOutput>, UInitialData = undefined>(
    ...rest: MaybeOptionalOptions<
      QueryOptionsIn<TClientContext, TInput, InferLiveQueryOutput<TOutput>, TError, USelectData, UInitialData>
    >
  ): NoInfer<QueryOptionsOut<InferLiveQueryOutput<TOutput>, TError, USelectData, UInitialData>> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.liveOptions === 'function') {
      optionsIn = this.options.liveOptions(optionsIn) as any
    }
    else if (this.options.liveOptions) {
      optionsIn = { ...this.options.liveOptions, ...optionsIn }
    }

    const queryKey = this.liveKey(optionsIn)

    return {
      ...optionsIn as any,
      queryKey,
      queryFn: (fnContext) => {
        return intercept(
          toArray(this.options.liveInterceptors),
          {
            path: this.path,
            context: {
              [OPERATION_CONTEXT_SYMBOL]: {
                key: queryKey,
                type: 'live',
              },
              ...optionsIn.context,
            } satisfies OperationContext as any,
            input: optionsIn.input as TInput | SkipToken,
            fnContext,
          },
          ({ fnContext, input, context }) => {
            if (input === skipToken || optionsIn.queryFn === skipToken) {
              throw new Error('queryFn should not be called when skipToken used for skipping')
            }

            if (optionsIn.queryFn) {
              return optionsIn.queryFn(fnContext)
            }

            return liveQuery(async (queryContext) => {
              const output = await this.call(input, {
                signal: queryContext.signal,
                context,
              })

              if (!isAsyncIteratorObject(output)) {
                throw new Error('liveQuery requires an AsyncIteratorObject output')
              }

              return output
            })(fnContext)
          },
        )
      },
      ...optionsIn.input === skipToken || optionsIn.queryFn === skipToken ? { enabled: false } : {},
    }
  }

  /**
   * Generate a **full matching** key for [Infinite Query Options](https://orpc.dev/docs/integrations/tanstack-query#infinite-query-options).
   */
  infiniteKey<UPageParam>(
    optionsIn: InfiniteKeyOptions<TInput, UPageParam>,
  ): DataTag<QueryKey, InfiniteData<TOutput, UPageParam>, TError> {
    if (typeof this.options.infiniteKey === 'function') {
      optionsIn = this.options.infiniteKey(optionsIn as any) as any
    }
    else if (this.options.infiniteKey) {
      optionsIn = { ...this.options.infiniteKey, ...optionsIn }
    }

    const queryKey = (optionsIn as any).queryKey
      ?? generateOperationKey(this.path, {
        prefix: this.options.prefix,
        type: 'infinite',
        input: (optionsIn as any).input === skipToken ? skipToken : (optionsIn as any).input((optionsIn as any).initialPageParam),
      })

    return queryKey as DataTag<QueryKey, InfiniteData<TOutput, any>, TError>
  }

  /**
   * Generate options used for useInfiniteQuery/useSuspenseInfiniteQuery/prefetchInfiniteQuery/...
   */
  infiniteOptions<UPageParam, USelectData = InfiniteData<TOutput, UPageParam>, UInitialData = undefined>(
    optionsIn: InfiniteOptionsIn<TClientContext, TInput, TOutput, TError, USelectData, UPageParam, UInitialData>,
  ): NoInfer<InfiniteOptionsOut<TOutput, TError, USelectData, UPageParam, UInitialData>> {
    if (typeof this.options.infiniteOptions === 'function') {
      optionsIn = this.options.infiniteOptions(optionsIn as any) as any
    }
    else if (this.options.infiniteOptions) {
      optionsIn = { ...this.options.infiniteOptions, ...optionsIn }
    }

    const queryKey = this.infiniteKey(optionsIn)

    return {
      ...optionsIn as any,
      queryKey,
      queryFn: (fnContext) => {
        return intercept(
          toArray(this.options.infiniteInterceptors),
          {
            path: this.path,
            context: {
              [OPERATION_CONTEXT_SYMBOL]: {
                key: queryKey,
                type: 'infinite',
              },
              ...optionsIn.context,
            } satisfies OperationContext as any,
            input: optionsIn.input === skipToken ? skipToken : optionsIn.input(fnContext.pageParam as any),
            fnContext: fnContext as QueryFunctionContext<QueryKey, any>,
          },
          ({ context, input, fnContext }) => {
            if (input === skipToken || optionsIn.queryFn === skipToken) {
              throw new Error('queryFn should not be called when skipToken used for skipping')
            }

            if (optionsIn.queryFn) {
              return optionsIn.queryFn(fnContext) as PromiseWithError<TOutput, TError>
            }

            return this.call(input, { signal: fnContext.signal, context })
          },
        )
      },
      ...optionsIn.input === skipToken || optionsIn.queryFn === skipToken ? { enabled: false } : {},
    }
  }

  /**
   * Generate a **full matching** key for [Mutation Options](https://orpc.dev/docs/integrations/tanstack-query#mutation-options).
   */
  mutationKey(
    optionsIn: MutationKeyOptions = {},
  ): DataTag<QueryKey, TOutput, TError> {
    if (typeof this.options.mutationKey === 'function') {
      optionsIn = this.options.mutationKey(optionsIn)
    }
    else if (this.options.mutationKey) {
      optionsIn = { ...this.options.mutationKey, ...optionsIn }
    }

    const mutationKey = optionsIn.mutationKey ?? generateOperationKey(this.path, { prefix: this.options.prefix, type: 'mutation' })
    return mutationKey as DataTag<QueryKey, TOutput, TError>
  }

  /**
   * Generate options used for useMutation/...
   */
  mutationOptions<UMutationContext>(
    ...rest: MaybeOptionalOptions<
      MutationOptionsIn<TClientContext, TInput, TOutput, TError, UMutationContext>
    >
  ): NoInfer<MutationOptionsOut<TInput, TOutput, TError, UMutationContext>> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.mutationOptions === 'function') {
      optionsIn = this.options.mutationOptions(optionsIn as any) as any
    }
    else if (this.options.mutationOptions) {
      optionsIn = { ...this.options.mutationOptions, ...optionsIn }
    }

    const mutationKey = this.mutationKey(optionsIn)

    return {
      ...optionsIn,
      mutationKey,
      mutationFn: (input, fnContext) => {
        return intercept(
          toArray(this.options.mutationInterceptors),
          {
            path: this.path,
            context: {
              [OPERATION_CONTEXT_SYMBOL]: {
                key: mutationKey,
                type: 'mutation',
              },
              ...optionsIn.context,
            } satisfies OperationContext as any,
            fnContext,
            input,
          },
          ({ input, fnContext, context }) => {
            if (optionsIn.mutationFn) {
              return optionsIn.mutationFn(input, fnContext)
            }

            return this.call(input, { context })
          },
        )
      },
    }
  }
}
