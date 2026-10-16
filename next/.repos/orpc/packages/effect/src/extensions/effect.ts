import type { AnySchema, ErrorMap, InferSchemaInput, InferSchemaOutput, InitialInputSchema, Schema } from '@orpc/contract'
import type { Context, DecoratedProcedure, ImplementedProcedure, MergedContext, ORPCErrorConstructorMap } from '@orpc/server'
import type { Effect } from 'effect'
import type { InferEffectServices } from '../context'
import type { HandlerGen } from '../handler'
import { Builder, ProcedureImplementer } from '@orpc/server'
import { handlerGen } from '../handler'

declare module '@orpc/server' {
  interface Builder<
    TInitialContext extends Context,
    TErrorMap extends ErrorMap,
  > {
    effect<
      TYield extends Effect.Effect<any, any, InferEffectServices<TInitialContext>>,
      TReturn,
    >(
      handler: HandlerGen<
        TInitialContext,
        InferSchemaOutput<InitialInputSchema>,
        TYield,
        TReturn,
        ORPCErrorConstructorMap<TErrorMap>
      >,
    ): DecoratedProcedure<
      TInitialContext,
      object,
      InitialInputSchema,
      Schema<TReturn>,
      TErrorMap
    >
  }

  interface BuilderWithMiddlewares<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TErrorMap extends ErrorMap,
  > {
    effect<
      TYield extends Effect.Effect<any, any, InferEffectServices<MergedContext<TInitialContext, TInjectedContext>>>,
      TReturn,
    >(
      handler: HandlerGen<
        MergedContext<TInitialContext, TInjectedContext>,
        InferSchemaOutput<InitialInputSchema>,
        TYield,
        TReturn,
        ORPCErrorConstructorMap<TErrorMap>
      >,
    ): DecoratedProcedure<
      TInitialContext,
      TInjectedContext,
      InitialInputSchema,
      Schema<TReturn>,
      TErrorMap
    >
  }

  interface BuilderWithInput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    effect<
      TYield extends Effect.Effect<any, any, InferEffectServices<MergedContext<TInitialContext, TInjectedContext>>>,
      TReturn,
    >(
      handler: HandlerGen<
        MergedContext<TInitialContext, TInjectedContext>,
        InferSchemaOutput<TInputSchema>,
        TYield,
        TReturn,
        ORPCErrorConstructorMap<TErrorMap>
      >,
    ): DecoratedProcedure<
      TInitialContext,
      TInjectedContext,
      TInputSchema,
      Schema<TReturn>,
      TErrorMap
    >
  }

  interface BuilderWithOutput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    effect<
      TYield extends Effect.Effect<any, any, InferEffectServices<MergedContext<TInitialContext, TInjectedContext>>>,
      TReturn extends InferSchemaInput<TOutputSchema>,
    >(
      handler: HandlerGen<
        MergedContext<TInitialContext, TInjectedContext>,
        InferSchemaOutput<InitialInputSchema>,
        TYield,
        TReturn,
        ORPCErrorConstructorMap<TErrorMap>
      >,
    ): DecoratedProcedure<
      TInitialContext,
      TInjectedContext,
      InitialInputSchema,
      TOutputSchema,
      TErrorMap
    >
  }

  interface BuilderWithInputOutput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    effect<
      TYield extends Effect.Effect<any, any, InferEffectServices<MergedContext<TInitialContext, TInjectedContext>>>,
      TReturn extends InferSchemaInput<TOutputSchema>,
    >(
      handler: HandlerGen<
        MergedContext<TInitialContext, TInjectedContext>,
        InferSchemaOutput<TInputSchema>,
        TYield,
        TReturn,
        ORPCErrorConstructorMap<TErrorMap>
      >,
    ): DecoratedProcedure<
      TInitialContext,
      TInjectedContext,
      TInputSchema,
      TOutputSchema,
      TErrorMap
    >
  }

  interface ProcedureImplementer<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    effect(
      handler: HandlerGen<
        MergedContext<TInitialContext, TInjectedContext>,
        InferSchemaOutput<TInputSchema>,
        Effect.Effect<any, any, InferEffectServices<MergedContext<TInitialContext, TInjectedContext>>>,
        InferSchemaInput<TOutputSchema>,
        ORPCErrorConstructorMap<TErrorMap>
      >,
    ): ImplementedProcedure<
      TInitialContext,
      TInjectedContext,
      TInputSchema,
      TOutputSchema,
      TErrorMap
    >
  }
}

Builder.prototype.effect = function effect(handler) {
  return this.handler(handlerGen(handler))
}

ProcedureImplementer.prototype.effect = function effect(handler) {
  return this.handler(handlerGen(handler))
}
