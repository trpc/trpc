import type { ErrorMap } from '@orpc/contract'
import type { Context, Middleware, MiddlewareDone, MiddlewareNextOptions, MiddlewareOptions, MiddlewareResult, ORPCErrorConstructorMap } from '@orpc/server'
import type { MaybeOptionalOptions } from '@orpc/shared'
import type { InferEffectServices, WithEffectContext } from './context'
import { Effect, Context as EffectContext } from 'effect'
import { runPromise } from './runtime'

export interface MiddlewareGenNext<TOutput> {
  <U extends Context = object>(
    ...rest: MaybeOptionalOptions<MiddlewareNextOptions<U>>
  ): Effect.Effect<Awaited<MiddlewareResult<U, TOutput>>, unknown>
}

export interface MiddlewareGenOptions<
  TInContext extends Context,
  TOutput,
  TErrorConstructorMap extends ORPCErrorConstructorMap<any>,
> extends Omit<MiddlewareOptions<TInContext, TOutput, TErrorConstructorMap>, 'next'> {
  next: MiddlewareGenNext<TOutput>
}

export interface MiddlewareGen<
  TInContext extends Context,
  TOutContext extends Context,
  TInput,
  TOutput,
  TYield extends Effect.Effect<any, any, InferEffectServices<TInContext>>,
  TErrorConstructorMap extends ORPCErrorConstructorMap<any>,
> {
  (
    opts: MiddlewareGenOptions<TInContext, TOutput, TErrorConstructorMap>,
    input: TInput,
    done: MiddlewareDone<TOutput>,
  ): Generator<
    TYield,
    MiddlewareResult<TOutContext, TOutput>,
    never
  >
}

export type AnyMiddlewareGen = MiddlewareGen<any, any, any, any, any, any>

/**
 * Creates an oRPC middleware from an Effect generator function.
 * Inside the generator you can yield Effect operations and `yield* next()`
 * to continue the chain, and `middlewareGen` handles the execution and
 * error handling for you.
 *
 * @see {@link https://orpc.dev/docs/integrations/effect#effectful-middleware | Effect Integration - Effectful Middleware}
 */
export function middlewareGen<
  TInContext extends Context,
  TOutContext extends Context = object,
  TInput = unknown,
  TOutput = any, // TOutput = any by default is important to make middleware can be used in any output by default
  TErrorMap extends ErrorMap = Record<never, never>,
  TYield extends Effect.Effect<any, any, InferEffectServices<TInContext>> = Effect.Effect<any, any, InferEffectServices<TInContext>>,
>(
  middleware: MiddlewareGen<TInContext, TOutContext, TInput, TOutput, TYield, ORPCErrorConstructorMap<TErrorMap>>,
): Middleware<TInContext, TOutContext, TInput, TOutput, TErrorMap> {
  const mid: Middleware<TInContext, TOutContext, TInput, TOutput, TErrorMap> = (opts, input, done) => {
    const next: MiddlewareGenNext<TOutput> = <U extends Context = object>(...rest: MaybeOptionalOptions<MiddlewareNextOptions<U>>) => Effect.tryPromise({
      try: async () => opts.next<U>(...rest),
      catch: error => error,
    })

    let ef = Effect.gen(() => middleware({ ...opts, next }, input, done)) as Effect.Effect<MiddlewareResult<TOutContext, TOutput>, unknown>

    if (EffectContext.isContext(opts.context['effect/context'])) {
      ef = ef.pipe(Effect.provide(opts.context['effect/context']))
    }

    if (typeof opts.context['effect/wrap'] === 'function') {
      const intercept = opts.context['effect/wrap'] as Exclude<WithEffectContext<any>['effect/wrap'], undefined>
      ef = intercept(ef, opts)
    }

    return runPromise(ef, { signal: opts.signal })
  }

  Object.defineProperty(mid, 'name', { value: middleware.name })

  return mid
}
