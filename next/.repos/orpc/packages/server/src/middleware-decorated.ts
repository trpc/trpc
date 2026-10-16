import type { ErrorMap, MergedErrorMap } from '@orpc/contract'
import type { IntersectPick } from '@orpc/shared'
import type { Context, MergedContext, MergedInitialContext } from './context'
import type { AnyMiddleware, Middleware, MiddlewareNextOptions, MiddlewareResult } from './middleware'
import { mergeErrorMap } from '@orpc/contract'
import { toArray } from '@orpc/shared'

export interface DecoratedMiddleware<
  TInContext extends Context,
  TOutContext extends Context,
  TInput,
  TOutput,
  TErrorMap extends ErrorMap,
> extends Middleware<TInContext, TOutContext, TInput, TOutput, TErrorMap> {
  adaptInput<T>(
    adapt: (input: T) => TInput,
  ): DecoratedMiddleware<TInContext, TOutContext, T, TOutput, TErrorMap>

  errors<T extends ErrorMap>(
    errors: T,
  ): DecoratedMiddleware<TInContext, TOutContext, TInput, TOutput, MergedErrorMap<TErrorMap, T>>

  use<
    $OutContext extends IntersectPick<MergedContext<TInContext, TOutContext>, $OutContext>,
    $Input extends TInput,
    $InContext extends Context = MergedContext<TInContext, TOutContext>,
    $ErrorMap extends ErrorMap = TErrorMap,
  >(
    middleware: Middleware<
      $InContext | MergedContext<TInContext, TOutContext>,
      $OutContext,
      $Input,
      TOutput,
      $ErrorMap
    >,
  ): DecoratedMiddleware<
    MergedInitialContext<TInContext, TOutContext, $InContext>,
    MergedContext<TOutContext, $OutContext>,
    $Input,
    TOutput,
    MergedErrorMap<$ErrorMap, TErrorMap>
  >
}

export function decorateMiddleware<
  TInContext extends Context,
  TOutContext extends Context,
  TInput,
  TOutput,
  TErrorMap extends ErrorMap,
>(
  middleware: Middleware<TInContext, TOutContext, TInput, TOutput, TErrorMap>,
): DecoratedMiddleware<TInContext, TOutContext, TInput, TOutput, TErrorMap> {
  const decorated = ((...args) => middleware(...args)) as DecoratedMiddleware<TInContext, TOutContext, TInput, TOutput, TErrorMap>

  decorated['~orpc'] = middleware['~orpc']
  Object.defineProperty(decorated, 'name', {
    value: middleware.name,
  })

  decorated.adaptInput = (adapt) => {
    const mapped = decorateMiddleware(
      (opts: any, input: any, ...args: [any]) => {
        return middleware(opts, adapt(input), ...args)
      },
    )

    mapped['~orpc'] = decorated['~orpc']
    Object.defineProperty(mapped, 'name', {
      value: decorated.name,
    })

    return mapped as any
  }

  decorated.errors = (errors) => {
    const newMiddleware = decorateMiddleware(decorated)

    newMiddleware['~orpc'] = {
      ...decorated['~orpc'],
      errorMap: mergeErrorMap(decorated['~orpc']?.errorMap, errors) as any,
    }

    return newMiddleware as any
  }

  decorated.use = (usedMiddleware: AnyMiddleware) => {
    const merged = decorateMiddleware((opts, ...args: [any, any]) => {
      return middleware(
        {
          ...opts,
          async next(nextOpts1: undefined | MiddlewareNextOptions<any>) {
            const result: MiddlewareResult<Context, unknown> = await usedMiddleware({
              ...opts,
              context: { ...opts.context, ...nextOpts1?.context },
              next(nextOpts2: undefined | MiddlewareNextOptions<any>, ...args: []) {
                return opts.next({
                  ...opts,
                  context: {
                    ...nextOpts1?.context,
                    ...nextOpts2?.context,
                  },
                }, ...args)
              },
            } as any, ...args)

            return {
              ...result,
              context: {
                ...nextOpts1?.context,
                ...result.context,
              },
            }
          },
        } as any,
        ...args,
      )
    })

    merged['~orpc'] = {
      ...decorated['~orpc'],
      errorMap: mergeErrorMap(usedMiddleware['~orpc']?.errorMap, decorated['~orpc']?.errorMap),
      metaPlugins: [
        ...toArray(decorated['~orpc']?.metaPlugins),
        ...toArray(usedMiddleware['~orpc']?.metaPlugins),
      ],
    }
    Object.defineProperty(merged, 'name', {
      value: `${decorated.name} + ${usedMiddleware.name}`,
    })

    return merged as any
  }

  return decorated
}
