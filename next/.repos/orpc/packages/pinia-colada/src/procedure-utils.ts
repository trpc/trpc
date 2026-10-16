import type { Client, ClientContext } from '@orpc/client'
import type { Interceptor, MaybeOptionalOptions, PromiseWithError } from '@orpc/shared'
import type { _EmptyObject, EntryKeyTagged, UseInfiniteQueryData, UseInfiniteQueryFnContext } from '@pinia/colada'
import type { OperationKeyPrefixOptions } from './key'
import type { InferLiveQueryOutput, InferStreamedQueryOutput, InfiniteKeyOptions, InfiniteOptionsIn, InfiniteOptionsOut, MutationKeyOptions, MutationOptionsIn, MutationOptionsOut, OperationContext, QueryKeyOptions, QueryOptionsIn, QueryOptionsOut, StreamedKeyOptions, StreamedOptionsIn, StreamedOptionsOut, UseMutationFnContext, UseQueryFnContext } from './types'
import { intercept, isAsyncIteratorObject, isTypescriptObject, resolveMaybeOptionalOptions } from '@orpc/shared'
import { generateOperationKey } from './key'
import { liveQuery } from './live-query'
import { SharedUtils } from './shared-utils'
import { serializableStreamedQuery } from './stream-query'
import { OPERATION_CONTEXT_SYMBOL } from './types'

export interface ProcedureUtilsQueryInterceptorOptions<TClientContext extends ClientContext, TInput> {
  path: string[]
  context: TClientContext & OperationContext
  input: TInput
  fnContext: UseQueryFnContext
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

export interface ProcedureUtilsInfiniteInterceptorOptions<TClientContext extends ClientContext, TInput> {
  path: string[]
  context: TClientContext & OperationContext
  input: TInput
  fnContext: UseInfiniteQueryFnContext<any, any, any, any>
}
export type ProcedureUtilsInfiniteInterceptor<TClientContext extends ClientContext, TInput, TOutput, TError>
  = Interceptor<ProcedureUtilsInfiniteInterceptorOptions<TClientContext, TInput>, PromiseWithError<TOutput, TError>>

export interface ProcedureUtilsMutationInterceptorOptions<TClientContext extends ClientContext, TInput> {
  path: string[]
  context: TClientContext & OperationContext
  input: TInput
  fnContext: UseMutationFnContext
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
   * Interceptors that intercept query inside .queryOptions, guaranteed to be executed.
   */
  queryInterceptors?: ProcedureUtilsQueryInterceptor<TClientContext, TInput, TOutput, TError>[]

  /**
   * Options modifier for .queryOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  queryOptions?: ProcedureUtilsModifier<
    QueryOptionsIn<TClientContext, TInput, TOutput, TError, TOutput | undefined>
  >

  /**
   * Key options modifier for .streamedKey and .streamedOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  streamedKey?: ProcedureUtilsModifier<
    StreamedKeyOptions<TInput>
  >

  /**
   * Interceptors that intercept query inside .streamedOptions, guaranteed to be executed.
   */
  streamedInterceptors?: ProcedureUtilsStreamedInterceptor<TClientContext, TInput, TOutput, TError>[]

  /**
   * Options modifier for .streamedOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  streamedOptions?: ProcedureUtilsModifier<
    StreamedOptionsIn<TClientContext, TInput, InferStreamedQueryOutput<TOutput>, TError, InferStreamedQueryOutput<TOutput> | undefined>
  >

  /**
   * Key options modifier for .liveKey and .liveOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  liveKey?: ProcedureUtilsModifier<
    QueryKeyOptions<TInput>
  >

  /**
   * Interceptors that intercept query inside .liveOptions, guaranteed to be executed.
   */
  liveInterceptors?: ProcedureUtilsLiveInterceptor<TClientContext, TInput, TOutput, TError>[]

  /**
   * Options modifier for .liveOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  liveOptions?: ProcedureUtilsModifier<
    QueryOptionsIn<TClientContext, TInput, InferLiveQueryOutput<TOutput>, TError, InferLiveQueryOutput<TOutput> | undefined>
  >

  /**
   * Key options modifier for .infiniteKey and .infiniteOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  infiniteKey?: ProcedureUtilsModifier<
    InfiniteKeyOptions<TInput, unknown>
  >

  /**
   * Interceptors that intercept query inside .infiniteOptions, guaranteed to be executed.
   */
  infiniteInterceptors?: ProcedureUtilsInfiniteInterceptor<TClientContext, TInput, TOutput, TError>[]

  /**
   * Options modifier for .infiniteOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  infiniteOptions?: ProcedureUtilsModifier<
    InfiniteOptionsIn<TClientContext, TInput, TOutput, TError, unknown, UseInfiniteQueryData<TOutput, unknown> | undefined>
  >

  /**
   * Key options modifier for .mutationKey and .mutationOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  mutationKey?: ProcedureUtilsModifier<
    MutationKeyOptions<TInput>
  >

  /**
   * Interceptors that intercept mutation inside .mutationOptions, guaranteed to be executed.
   */
  mutationInterceptors?: ProcedureUtilsMutationInterceptor<TClientContext, TInput, TOutput, TError>[]

  /**
   * Options modifier for .mutationOptions
   * Can be partial options or a function that receives per-call options and returns override this.options.
   */
  mutationOptions?: ProcedureUtilsModifier<
    MutationOptionsIn<TClientContext, TInput, TOutput, TError, Record<any, any>>
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
   *
   * @see {@link https://orpc.dev/docs/integrations/pinia-colada#calling-procedure-clients | Pinia Colada Integration - Calling Procedure Clients}
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
   * Generate a **full matching** key for useQuery/...
   *
   * @see {@link https://orpc.dev/docs/integrations/pinia-colada#querymutation-key | Pinia Colada Integration - Query/Mutation Key}
   */
  queryKey(
    ...rest: MaybeOptionalOptions<QueryKeyOptions<TInput>>
  ): EntryKeyTagged<TOutput, TError> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.queryKey === 'function') {
      optionsIn = this.options.queryKey(optionsIn)
    }
    else if (this.options.queryKey) {
      optionsIn = { ...this.options.queryKey, ...optionsIn }
    }

    const key = (optionsIn as any).key
      ?? generateOperationKey(this.path, { prefix: this.options.prefix, type: 'query', input: (optionsIn as any).input })

    return key as EntryKeyTagged<TOutput, TError>
  }

  /**
   * Generate options used for useQuery/...
   *
   * @see {@link https://orpc.dev/docs/integrations/pinia-colada#query-options-utility | Pinia Colada Integration - Query Options Utility}
   */
  queryOptions<UInitialData extends TOutput | undefined = TOutput | undefined>(
    ...rest: MaybeOptionalOptions<
      QueryOptionsIn<TClientContext, TInput, TOutput, TError, UInitialData>
    >
  ): NoInfer<QueryOptionsOut<TOutput, TError, UInitialData>> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.queryOptions === 'function') {
      optionsIn = this.options.queryOptions(optionsIn as any) as any
    }
    else if (this.options.queryOptions) {
      optionsIn = { ...this.options.queryOptions, ...optionsIn } as any
    }

    const { input, context, key: _keyIn, query: queryIn, ...restOptions } = optionsIn as Record<string, any>

    const key = this.queryKey(optionsIn as QueryKeyOptions<TInput>)

    return {
      ...restOptions,
      key,
      query: (fnContext: UseQueryFnContext) => {
        return intercept(
          this.options.queryInterceptors,
          {
            path: this.path,
            context: {
              [OPERATION_CONTEXT_SYMBOL]: {
                key,
                type: 'query',
              },
              ...context,
            } satisfies OperationContext as any,
            input: input as TInput,
            fnContext,
          },
          ({ context, input, fnContext }) => {
            if (queryIn) {
              return queryIn(fnContext) as PromiseWithError<TOutput, TError>
            }

            return this.call(input, { signal: fnContext.signal, context })
          },
        )
      },
    } as any
  }

  /**
   * Generate a **full matching** key for [Streamed Query Options](https://orpc.dev/docs/integrations/pinia-colada#streamed-query-options-utility).
   *
   * @see {@link https://orpc.dev/docs/integrations/pinia-colada#querymutation-key | Pinia Colada Integration - Query/Mutation Key}
   */
  streamedKey(
    ...rest: MaybeOptionalOptions<StreamedKeyOptions<TInput>>
  ): EntryKeyTagged<InferStreamedQueryOutput<TOutput>, TError> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.streamedKey === 'function') {
      optionsIn = this.options.streamedKey(optionsIn)
    }
    else if (this.options.streamedKey) {
      optionsIn = { ...this.options.streamedKey, ...optionsIn }
    }

    const key = (optionsIn as any).key
      ?? generateOperationKey(this.path, { prefix: this.options.prefix, type: 'streamed', input: (optionsIn as any).input, fnOptions: (optionsIn as any).fnOptions })

    return key as EntryKeyTagged<InferStreamedQueryOutput<TOutput>, TError>
  }

  /**
   * Configure queries for [AsyncIteratorObject](https://orpc.dev/docs/async-iterator-object).
   * The resulting data is an array of chunks, and each new chunk is appended as it arrives.
   * Works with `useQuery` and any other API that accepts query options.
   */
  streamedOptions<UInitialData extends InferStreamedQueryOutput<TOutput> | undefined = undefined>(
    ...rest: MaybeOptionalOptions<
      StreamedOptionsIn<TClientContext, TInput, InferStreamedQueryOutput<TOutput>, TError, UInitialData>
    >
  ): NoInfer<StreamedOptionsOut<InferStreamedQueryOutput<TOutput>, TError, UInitialData>> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.streamedOptions === 'function') {
      optionsIn = this.options.streamedOptions(optionsIn as any) as any
    }
    else if (this.options.streamedOptions) {
      optionsIn = { ...this.options.streamedOptions, ...optionsIn } as any
    }

    const { input, context, key: _keyIn, query: queryIn, fnOptions, ...restOptions } = optionsIn as Record<string, any>

    const key = this.streamedKey(optionsIn as StreamedKeyOptions<TInput>)

    return {
      ...restOptions,
      key,
      query: (fnContext: UseQueryFnContext) => {
        return intercept(
          this.options.streamedInterceptors,
          {
            path: this.path,
            context: {
              [OPERATION_CONTEXT_SYMBOL]: {
                key,
                type: 'streamed',
              },
              ...context,
            } satisfies OperationContext as any,
            input: input as TInput,
            fnContext,
          },
          ({ context, input, fnContext }) => {
            if (queryIn) {
              return queryIn(fnContext) as PromiseWithError<InferStreamedQueryOutput<TOutput>, TError>
            }

            return serializableStreamedQuery(
              async (queryContext) => {
                const output = await this.call(input, { signal: queryContext.signal, context })

                if (!isAsyncIteratorObject(output)) {
                  throw new Error('streamedQuery requires an AsyncIteratorObject output')
                }

                return output
              },
              fnOptions,
            )(fnContext) as PromiseWithError<InferStreamedQueryOutput<TOutput>, TError>
          },
        )
      },
    } as any
  }

  /**
   * Generate a **full matching** key for [Live Query Options](https://orpc.dev/docs/integrations/pinia-colada#live-query-options-utility).
   *
   * @see {@link https://orpc.dev/docs/integrations/pinia-colada#querymutation-key | Pinia Colada Integration - Query/Mutation Key}
   */
  liveKey(
    ...rest: MaybeOptionalOptions<QueryKeyOptions<TInput>>
  ): EntryKeyTagged<InferLiveQueryOutput<TOutput>, TError> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.liveKey === 'function') {
      optionsIn = this.options.liveKey(optionsIn)
    }
    else if (this.options.liveKey) {
      optionsIn = { ...this.options.liveKey, ...optionsIn }
    }

    const key = (optionsIn as any).key
      ?? generateOperationKey(this.path, { prefix: this.options.prefix, type: 'live', input: (optionsIn as any).input })

    return key as EntryKeyTagged<InferLiveQueryOutput<TOutput>, TError>
  }

  /**
   * Configure live queries for [AsyncIteratorObject](https://orpc.dev/docs/async-iterator-object).
   * Unlike `.streamedOptions` which accumulates chunks, live queries replace the entire result with each new chunk received.
   * Works with `useQuery` and any other API that accepts query options.
   */
  liveOptions<UInitialData extends InferLiveQueryOutput<TOutput> | undefined = undefined>(
    ...rest: MaybeOptionalOptions<
      QueryOptionsIn<TClientContext, TInput, InferLiveQueryOutput<TOutput>, TError, UInitialData>
    >
  ): NoInfer<QueryOptionsOut<InferLiveQueryOutput<TOutput>, TError, UInitialData>> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.liveOptions === 'function') {
      optionsIn = this.options.liveOptions(optionsIn as any) as any
    }
    else if (this.options.liveOptions) {
      optionsIn = { ...this.options.liveOptions, ...optionsIn } as any
    }

    const { input, context, key: _keyIn, query: queryIn, ...restOptions } = optionsIn as Record<string, any>

    const key = this.liveKey(optionsIn as QueryKeyOptions<TInput>)

    return {
      ...restOptions,
      key,
      query: (fnContext: UseQueryFnContext) => {
        return intercept(
          this.options.liveInterceptors,
          {
            path: this.path,
            context: {
              [OPERATION_CONTEXT_SYMBOL]: {
                key,
                type: 'live',
              },
              ...context,
            } satisfies OperationContext as any,
            input: input as TInput,
            fnContext,
          },
          ({ context, input, fnContext }) => {
            if (queryIn) {
              return queryIn(fnContext) as PromiseWithError<InferLiveQueryOutput<TOutput>, TError>
            }

            return liveQuery(async (queryContext) => {
              const output = await this.call(input, { signal: queryContext.signal, context })

              if (!isAsyncIteratorObject(output)) {
                throw new Error('liveQuery requires an AsyncIteratorObject output')
              }

              return output
            })(fnContext)
          },
        )
      },
    } as any
  }

  /**
   * Generate a **full matching** key for useInfiniteQuery/...
   *
   * @see {@link https://orpc.dev/docs/integrations/pinia-colada#querymutation-key | Pinia Colada Integration - Query/Mutation Key}
   */
  infiniteKey<UPageParam>(
    optionsIn: InfiniteKeyOptions<TInput, UPageParam>,
  ): EntryKeyTagged<UseInfiniteQueryData<TOutput, UPageParam>, TError> {
    if (typeof this.options.infiniteKey === 'function') {
      optionsIn = this.options.infiniteKey(optionsIn as any) as any
    }
    else if (this.options.infiniteKey) {
      optionsIn = { ...this.options.infiniteKey, ...optionsIn } as any
    }

    const key = (optionsIn as any).key
      ?? generateOperationKey(this.path, {
        prefix: this.options.prefix,
        type: 'infinite',
        input: (optionsIn as any).input(
          typeof (optionsIn as any).initialPageParam === 'function'
            ? (optionsIn as any).initialPageParam()
            : (optionsIn as any).initialPageParam,
        ),
      })

    return key as EntryKeyTagged<UseInfiniteQueryData<TOutput, UPageParam>, TError>
  }

  /**
   * Generate options used for useInfiniteQuery/...
   *
   * @see {@link https://orpc.dev/docs/integrations/pinia-colada#infinite-query-options-utility | Pinia Colada Integration - Infinite Query Options Utility}
   */
  infiniteOptions<UPageParam, UInitialData extends UseInfiniteQueryData<TOutput, UPageParam> | undefined = undefined>(
    optionsIn: InfiniteOptionsIn<TClientContext, TInput, TOutput, TError, UPageParam, UInitialData>,
  ): NoInfer<InfiniteOptionsOut<TOutput, TError, UPageParam, UInitialData>> {
    if (typeof this.options.infiniteOptions === 'function') {
      optionsIn = this.options.infiniteOptions(optionsIn as any) as any
    }
    else if (this.options.infiniteOptions) {
      optionsIn = { ...this.options.infiniteOptions, ...optionsIn } as any
    }

    const { input, context, key: _keyIn, query: queryIn, ...restOptions } = optionsIn as Record<string, any>

    const key = this.infiniteKey(optionsIn as InfiniteKeyOptions<TInput, UPageParam>)

    return {
      ...restOptions,
      key,
      query: (fnContext: UseInfiniteQueryFnContext<any, any, any, any>) => {
        return intercept(
          this.options.infiniteInterceptors,
          {
            path: this.path,
            context: {
              [OPERATION_CONTEXT_SYMBOL]: {
                key,
                type: 'infinite',
              },
              ...context,
            } satisfies OperationContext as any,
            input: input(fnContext.pageParam) as TInput,
            fnContext,
          },
          ({ context, input, fnContext }) => {
            if (queryIn) {
              return queryIn(fnContext) as PromiseWithError<TOutput, TError>
            }

            return this.call(input, { signal: fnContext.signal, context })
          },
        )
      },
    } as any
  }

  /**
   * Generate a **full matching** key for useMutation/...
   *
   * @see {@link https://orpc.dev/docs/integrations/pinia-colada#querymutation-key | Pinia Colada Integration - Query/Mutation Key}
   */
  mutationKey(
    ...rest: MaybeOptionalOptions<MutationKeyOptions<TInput>>
  ): MutationOptionsOut<TInput, TOutput, TError, _EmptyObject>['key'] {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.mutationKey === 'function') {
      optionsIn = this.options.mutationKey(optionsIn)
    }
    else if (this.options.mutationKey) {
      optionsIn = { ...this.options.mutationKey, ...optionsIn }
    }

    const key = optionsIn.key
      ?? ((input: TInput) => generateOperationKey(this.path, { prefix: this.options.prefix, type: 'mutation', input: input as any }))

    return key as MutationOptionsOut<TInput, TOutput, TError, _EmptyObject>['key']
  }

  /**
   * Generate options used for useMutation/...
   *
   * @see {@link https://orpc.dev/docs/integrations/pinia-colada#mutation-options | Pinia Colada Integration - Mutation Options}
   */
  mutationOptions<UMutationContext extends Record<any, any> = _EmptyObject>(
    ...rest: MaybeOptionalOptions<
      MutationOptionsIn<TClientContext, TInput, TOutput, TError, UMutationContext>
    >
  ): NoInfer<MutationOptionsOut<TInput, TOutput, TError, UMutationContext>> {
    let optionsIn = resolveMaybeOptionalOptions(rest)

    if (typeof this.options.mutationOptions === 'function') {
      optionsIn = this.options.mutationOptions(optionsIn as any) as any
    }
    else if (this.options.mutationOptions) {
      optionsIn = { ...this.options.mutationOptions, ...optionsIn } as any
    }

    const { context, key: _keyIn, mutation: mutationIn, ...restOptions } = optionsIn as Record<string, any>

    const key = this.mutationKey(optionsIn as MutationKeyOptions<TInput>)

    return {
      ...restOptions,
      key,
      mutation: (input: TInput, fnContext: UseMutationFnContext) => {
        return intercept(
          this.options.mutationInterceptors,
          {
            path: this.path,
            context: {
              [OPERATION_CONTEXT_SYMBOL]: {
                key: typeof key === 'function' ? key(input) : key,
                type: 'mutation',
              },
              ...context,
            } satisfies OperationContext as any,
            input,
            fnContext,
          },
          ({ context, input, fnContext }) => {
            if (mutationIn) {
              return mutationIn(input, fnContext) as PromiseWithError<TOutput, TError>
            }

            return this.call(input, { context })
          },
        )
      },
    } as any
  }
}
