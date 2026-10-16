import type { AnySchema, Context, ErrorMap, Procedure, ProcedureClientOptions } from '@orpc/server'
import type { MaybeOptionalOptions } from '@orpc/shared'
import type { ProcedureServerFunction } from '../server-function'
import { DecoratedProcedure } from '@orpc/server'
import { createServerFunction } from '../server-function'

declare module '@orpc/server' {
  interface DecoratedProcedure<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    actionable(
      ...rest: MaybeOptionalOptions<
        ProcedureClientOptions<
          TInitialContext,
          TOutputSchema,
          TErrorMap,
          object
        >
      >
    ):
      & ProcedureServerFunction<TInputSchema, TOutputSchema, TErrorMap>
      & Procedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap>
  }
}

DecoratedProcedure.prototype.actionable = function callable(...rest) {
  const actionable = createServerFunction(this, ...rest) as any
  actionable['~orpc'] = this['~orpc']
  return actionable
}
