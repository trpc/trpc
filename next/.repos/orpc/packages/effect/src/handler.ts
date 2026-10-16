import type { Context, ORPCErrorConstructorMap, ProcedureHandler, ProcedureHandlerOptions } from '@orpc/server'
import type { InferEffectServices, WithEffectContext } from './context'
import { Effect, Context as EffectContext } from 'effect'
import { runPromise } from './runtime'

export type InferYieldError<Eff> = [Eff] extends [never] ? never : [Eff] extends [Effect.Effect<infer _A, infer E, infer _R>] ? E : never

export interface HandlerGen<
  TCurrentContext extends Context,
  TInput,
  TYield extends Effect.Effect<any, any, InferEffectServices<TCurrentContext>>,
  TReturn,
  TErrorConstructorMap extends ORPCErrorConstructorMap<any>,
> {
  (
    opts: ProcedureHandlerOptions<TCurrentContext, TInput, TErrorConstructorMap>,
    input: TInput,
  ): Generator<
    TYield,
    TReturn,
    never
  >
}

/**
 * Creates a procedure handler from an Effect generator function.
 * Inside the generator you can yield Effect operations, and `handlerGen`
 * handles the execution and error handling for you.
 *
 * @see {@link https://orpc.dev/docs/integrations/effect#effectful-handlers | Effect Integration - Effectful Handlers}
 */
export function handlerGen<
  TCurrentContext extends Context,
  TInput,
  TErrorConstructorMap extends ORPCErrorConstructorMap<any>,
  TYield extends Effect.Effect<any, any, InferEffectServices<TCurrentContext>>,
  TReturn,
>(
  handler: HandlerGen<TCurrentContext, TInput, TYield, TReturn, TErrorConstructorMap>,
): ProcedureHandler<TCurrentContext, TInput, TReturn, TErrorConstructorMap> {
  return (opts, input) => {
    let ef = Effect.gen(() => handler(opts, input)) as Effect.Effect<TReturn, InferYieldError<TYield>>

    if (EffectContext.isContext(opts.context['effect/context'])) {
      ef = ef.pipe(Effect.provide(opts.context['effect/context']))
    }

    if (typeof opts.context['effect/wrap'] === 'function') {
      const intercept = opts.context['effect/wrap'] as Exclude<WithEffectContext<any>['effect/wrap'], undefined>
      ef = intercept(ef, opts)
    }

    return runPromise(ef, { signal: opts.signal })
  }
}
