import type { AnyMetaPlugin, ErrorMap, ORPCErrorConstructorMap } from '@orpc/contract'
import type { MaybeOptionalOptions, Promisable } from '@orpc/shared'
import type { Context } from './context'
import type { AnyProcedure } from './procedure'

export type MiddlewareResult<TOutContext extends Context, TOutput> = Promisable<{
  output: TOutput
  context: TOutContext
}>

export type MiddlewareNextOptions<TOutContext extends Context> = object extends TOutContext
  ? { context?: TOutContext }
  : { context: TOutContext }

export interface MiddlewareNext<TOutput> {
  <T extends Context = object>(
    ...rest: MaybeOptionalOptions<MiddlewareNextOptions<T>>
  ): MiddlewareResult<T, TOutput>
}

export type MiddlewareDoneOptions<TOutContext, TOutput>
  = & (object extends TOutContext ? { context?: TOutContext } : { context: TOutContext })
    & { output: TOutput }

export interface MiddlewareDone<TOutput> {
  /**
   * Create a successful result and terminate the middleware chain early.
   */
  <TOutContext extends Context = object>(
    ...rest: MaybeOptionalOptions<MiddlewareDoneOptions<TOutContext, TOutput>>
  ): MiddlewareResult<TOutContext, TOutput>
}

export interface MiddlewareOptions<
  TInContext extends Context,
  TOutput,
  TErrorConstructorMap extends ORPCErrorConstructorMap<any>,
> {
  context: TInContext
  path: string[]
  procedure: AnyProcedure
  signal?: AbortSignal | undefined
  lastEventId: string | undefined
  /**
   * Invoke to continue the middleware chain.
   */
  next: MiddlewareNext<TOutput>
  errors: TErrorConstructorMap
}

export interface MiddlewareDefinition<TErrorMap extends ErrorMap> {
  errorMap?: TErrorMap | undefined
  metaPlugins?: AnyMetaPlugin[] | undefined
}

export interface Middleware<
  TInContext extends Context,
  TOutContext extends Context,
  TInput,
  TOutput,
  TErrorMap extends ErrorMap,
> {
  /** this property should be optional to support inline middleware */
  '~orpc'?: MiddlewareDefinition<TErrorMap> | undefined

  (
    opts: MiddlewareOptions<TInContext, TOutput, ORPCErrorConstructorMap<TErrorMap>>,
    input: TInput,
    done: MiddlewareDone<TOutput>,
  ): Promisable<
    MiddlewareResult<TOutContext, TOutput>
  >
}

export type AnyMiddleware = Middleware<any, any, any, any, any>
