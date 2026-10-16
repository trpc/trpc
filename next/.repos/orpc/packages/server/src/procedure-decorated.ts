import type { AnySchema, ErrorMap, InferSchemaInput, InferSchemaOutput, MergedErrorMap, MetaPlugin } from '@orpc/contract'
import type { IntersectPick } from '@orpc/shared'
import type { Context, MergedContext, MergedInitialContext } from './context'
import type { Middleware } from './middleware'
import { getHiddenMetaPlugins, mergeErrorMap, resolveMetaPlugins } from '@orpc/contract'
import { Procedure } from './procedure'

export class DecoratedProcedure<
  TInitialContext extends Context,
  TInjectedContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> extends Procedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap> {
  meta(
    ...plugins: MetaPlugin<TInputSchema, TOutputSchema, TErrorMap>[]
  ): DecoratedProcedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap> {
    const [meta, metaPlugins] = resolveMetaPlugins(this['~orpc'].meta, this['~orpc'].metaPlugins, plugins)

    return new DecoratedProcedure({
      ...this['~orpc'],
      meta,
      metaPlugins,
    })
  }

  errors<T extends ErrorMap>(
    errors: T,
  ): DecoratedProcedure<
    TInitialContext,
    TInjectedContext,
    TInputSchema,
    TOutputSchema,
    MergedErrorMap<TErrorMap, T>
  > {
    let procedure = new DecoratedProcedure({
      ...this['~orpc'],
      errorMap: mergeErrorMap(this['~orpc'].errorMap, errors),
    })

    const plugins = getHiddenMetaPlugins(errors)
    if (plugins) {
      procedure = procedure.meta(...plugins) as any
    }

    return procedure as any
  }

  use<
    $OutContext extends IntersectPick<MergedContext<TInitialContext, TInjectedContext>, $OutContext>,
    $InContext extends Context = MergedContext<TInitialContext, TInjectedContext>,
    $ErrorMap extends ErrorMap = TErrorMap,
  >(
    middleware: Middleware<
        $InContext | MergedContext<TInitialContext, TInjectedContext>,
        $OutContext,
        InferSchemaOutput<TInputSchema>,
        InferSchemaInput<TOutputSchema>,
        $ErrorMap
    >,
  ): DecoratedProcedure<
    MergedInitialContext<TInitialContext, TInjectedContext, $InContext>,
    MergedContext<TInjectedContext, $OutContext>,
    TInputSchema,
    TOutputSchema,
    MergedErrorMap<$ErrorMap, TErrorMap>
  > {
    // Since middleware executes before the handler, we use `IntersectPick` to ensure
    // that the middleware's output context ($OutContext) is compatible with the
    // context requirements of the handler, which may have already been defined.

    let procedure = new DecoratedProcedure({
      ...this['~orpc'],
      errorMap: mergeErrorMap(middleware['~orpc']?.errorMap, this['~orpc'].errorMap),
      orderedMiddlewares: [...this['~orpc'].orderedMiddlewares, {
        middleware,
        inputSchemasLengthAtUse: this['~orpc'].inputSchemas?.length,
        outputSchemasLengthAtUse: this['~orpc'].outputSchemas?.length,
      }],
    })

    if (middleware['~orpc']?.metaPlugins) {
      procedure = procedure.meta(...middleware['~orpc']?.metaPlugins) as any
    }

    return procedure as any
  }
}
