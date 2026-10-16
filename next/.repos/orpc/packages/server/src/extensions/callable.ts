import type { ClientContext } from '@orpc/client'
import type { AnySchema, ErrorMap } from '@orpc/contract'
import type { MaybeOptionalOptions } from '@orpc/shared'
import type { Context } from '../context'
import type { Procedure } from '../procedure'
import type { ProcedureClient, ProcedureClientOptions } from '../procedure-client'
import { createProcedureClient } from '../procedure-client'
import { DecoratedProcedure } from '../procedure-decorated'

declare module '@orpc/server' {
  interface DecoratedProcedure<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    callable<TClientContext extends ClientContext>(
      ...rest: MaybeOptionalOptions<
        ProcedureClientOptions<
          TInitialContext,
          TOutputSchema,
          TErrorMap,
          TClientContext
        >
      >
    ): Procedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap>
      & ProcedureClient<TClientContext, TInputSchema, TOutputSchema, TErrorMap>
  }
}

DecoratedProcedure.prototype.callable = function callable(...rest) {
  const callable = createProcedureClient(this, ...rest) as any
  callable['~orpc'] = this['~orpc']
  return callable
}
