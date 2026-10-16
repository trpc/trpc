import type { AnySchema, Context, ErrorMap, Procedure, ProcedureClientOptions, Schema } from '@orpc/server'
import type { MaybeOptionalOptions } from '@orpc/shared'
import type { ServerFormFunction } from './server-form-function'
import { resolveMaybeOptionalOptions } from '@orpc/shared'
import { createServerFormFunction } from './server-form-function'

export interface ServerFormFunctionable<TInitialContext extends Context> {
  <
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  >(
    procedure: Procedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap>
  ):
    & ServerFormFunction
    & Procedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap>
}

/**
 * Creates a preconfigured helper for reusing the same options across multiple
 * server form functions. The helper takes a procedure and returns a value that
 * works as both a server form function and the original procedure.
 *
 * @see {@link https://orpc.dev/docs/integrations/next#createserverformfunctionable | Next.js Integration - createServerFormFunctionable}
 */
export function createServerFormFunctionable<TInitialContext extends Context = object>(
  ...rest: MaybeOptionalOptions<
    ProcedureClientOptions<
      TInitialContext,
      Schema<unknown>,
      ErrorMap,
      object
    >
  >
): ServerFormFunctionable<TInitialContext> {
  const options = resolveMaybeOptionalOptions(rest)

  return <
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  >(
    procedure: Procedure<
      TInitialContext,
      TInjectedContext,
      TInputSchema,
      TOutputSchema,
      TErrorMap
    >,
  ) => {
    const functionable = createServerFormFunction(
      procedure,
      options,
    ) as
    & ServerFormFunction
    & Procedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap>

    functionable['~orpc'] = procedure['~orpc']

    return functionable
  }
}
