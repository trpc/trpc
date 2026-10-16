import type { AnySchema, ErrorMap, InferSchemaInput, InferSchemaOutput, ORPCErrorConstructorMap } from '@orpc/contract'
import type { IntersectPick } from '@orpc/shared'
import type { BuilderDefinition } from './builder'
import type { Context, MergedContext, MergedInitialContext } from './context'
import type { Middleware } from './middleware'
import type { ProcedureHandler } from './procedure'
import { Procedure } from './procedure'

export class ProcedureImplementer<
  TInitialContext extends Context,
  TInjectedContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> {
  '~orpc': BuilderDefinition<TInputSchema, TOutputSchema, TErrorMap>

  constructor(definition: BuilderDefinition<TInputSchema, TOutputSchema, TErrorMap>) {
    this['~orpc'] = definition
  }

  'use'<
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
  ): ProcedureImplementer<
    MergedInitialContext<TInitialContext, TInjectedContext, $InContext>,
    MergedContext<TInjectedContext, $OutContext>,
    TInputSchema,
    TOutputSchema,
    TErrorMap
  > {
    return new ProcedureImplementer({
      ...this['~orpc'],
      orderedMiddlewares: [...this['~orpc'].orderedMiddlewares, {
        middleware,
        inputSchemasLengthAtUse: this['~orpc'].inputSchemas?.length,
        outputSchemasLengthAtUse: this['~orpc'].outputSchemas?.length,
      }],
    })
  }

  'handler'(
    handler: ProcedureHandler<
      MergedContext<TInitialContext, TInjectedContext>,
      InferSchemaOutput<TInputSchema>,
      InferSchemaInput<TOutputSchema>,
      ORPCErrorConstructorMap<TErrorMap>
    >,
  ): ImplementedProcedure<
    TInitialContext,
    TInjectedContext,
    TInputSchema,
    TOutputSchema,
    TErrorMap
  > {
    return new ImplementedProcedure({
      ...this['~orpc'],
      handler,
    })
  }
}

export class ImplementedProcedure<
  TInitialContext extends Context,
  TInjectedContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> extends Procedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap> {
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
  ): ImplementedProcedure<
    MergedInitialContext<TInitialContext, TInjectedContext, $InContext>,
    MergedContext<TInjectedContext, $OutContext>,
    TInputSchema,
    TOutputSchema,
    TErrorMap
  > {
    // Since middleware executes before the handler, we use `IntersectPick` to ensure
    // that the middleware's output context ($OutContext) is compatible with the
    // context requirements of the handler, which may have already been defined.

    return new ImplementedProcedure({
      ...this['~orpc'],
      orderedMiddlewares: [...this['~orpc'].orderedMiddlewares, {
        middleware,
        inputSchemasLengthAtUse: this['~orpc'].inputSchemas?.length,
        outputSchemasLengthAtUse: this['~orpc'].outputSchemas?.length,
      }],
    }) as any
  }
}
