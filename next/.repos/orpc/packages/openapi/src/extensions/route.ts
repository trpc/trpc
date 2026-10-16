import type { AnySchema, ErrorMap } from '@orpc/contract'
import type { Context } from '@orpc/server'
import type { OpenAPIMeta } from '../meta'
import { ContractBuilder } from '@orpc/contract'
import { Builder, DecoratedProcedure } from '@orpc/server'
import { openapi } from '../meta'

declare module '@orpc/contract' {
  interface ContractBuilder<
    TErrorMap extends ErrorMap,
  > {
    route(meta: OpenAPIMeta): ContractBuilder<TErrorMap>
  }

  interface ProcedureContractBuilderWithInput<
    TInputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    route(meta: OpenAPIMeta): ProcedureContractBuilderWithInput<TInputSchema, TErrorMap>
  }

  interface ProcedureContractBuilderWithOutput<
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    route(meta: OpenAPIMeta): ProcedureContractBuilderWithOutput<TOutputSchema, TErrorMap>
  }

  interface ProcedureContractBuilderWithInputOutput<
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    route(meta: OpenAPIMeta): ProcedureContractBuilderWithInputOutput<TInputSchema, TOutputSchema, TErrorMap>
  }
}

ContractBuilder.prototype.route = function route(meta) {
  return this.meta(openapi(meta))
}

declare module '@orpc/server' {
  interface Builder<
    TInitialContext extends Context,
    TErrorMap extends ErrorMap,
  > {
    route(meta: OpenAPIMeta): Builder<TInitialContext, TErrorMap>
  }

  interface BuilderWithMiddlewares<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TErrorMap extends ErrorMap,
  > {
    route(meta: OpenAPIMeta): BuilderWithMiddlewares<TInitialContext, TInjectedContext, TErrorMap>
  }

  interface BuilderWithInput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    route(meta: OpenAPIMeta): BuilderWithInput<TInitialContext, TInjectedContext, TInputSchema, TErrorMap>
  }

  interface BuilderWithOutput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    route(meta: OpenAPIMeta): BuilderWithOutput<TInitialContext, TInjectedContext, TOutputSchema, TErrorMap>
  }

  interface BuilderWithInputOutput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    route(meta: OpenAPIMeta): BuilderWithInputOutput<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap>
  }

  interface DecoratedProcedure<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    route(meta: OpenAPIMeta): DecoratedProcedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap>
  }
}

Builder.prototype.route = function route(meta) {
  return this.meta(openapi(meta))
}

DecoratedProcedure.prototype.route = function route(meta) {
  return this.meta(openapi(meta))
}
