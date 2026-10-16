import type { ClientOptions } from '@orpc/client'
import type { AnySchema, ErrorMap, InferSchemaInput, InferSchemaOutput, ORPCErrorFromErrorMap, ProcedureContract } from '@orpc/contract'
import type { PromiseWithError, ThrowableError } from '@orpc/shared'
import type { Context } from './context'
import type { Lazyable } from './lazy'
import type { AnyProcedure } from './procedure'
import type { ProcedureClientOptions } from './procedure-client'
import { Lazy, unlazy } from './lazy'
import { Procedure } from './procedure'
import { createProcedureClient } from './procedure-client'

export function createGuardedProcedureLazy(lazy: Lazy<unknown>): Lazy<AnyProcedure> {
  const guarded = new Lazy({
    ...lazy['~orpc'],
    async loader() {
      const { default: maybeProcedure } = await unlazy(lazy)

      if (!(maybeProcedure instanceof Procedure)) {
        throw new TypeError(`
          Expected a lazy<procedure> but got lazy<unknown>.
          This should be caught by TypeScript compilation.
          Please report this issue if you think this is a bug.
        `)
      }

      return { default: maybeProcedure }
    },
  })

  return guarded
}

/**
 * Create a new procedure that ensure the contract is applied to the procedure.
 *
 * .input/.output/.handler mismatches are already caught by the `implementer.router`,
 * but .errors (in case implemented procedure error map is more than enough) and .meta cannot be
 * validated that way - so they must be overridden here to ensure the client always sees what the contract defines.
 */
export function createContractProcedure<
  TInitialContext extends Context,
  TInjectedContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
>(
  procedure: Procedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, any>,
  contract: ProcedureContract<any, any, TErrorMap>,
): Procedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap> {
  return new Procedure({
    ...procedure['~orpc'],
    errorMap: contract['~orpc'].errorMap,
    meta: contract['~orpc'].meta,
    metaPlugins: contract['~orpc'].metaPlugins,
  }) as any
}

export type CallOptions<
  TInitialContext extends Context,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
>
  = & ProcedureClientOptions<TInitialContext, TOutputSchema, TErrorMap, object>
    & Omit<ClientOptions<object>, 'context'>

export type CallRest<
  TInitialContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> = object extends CallOptions<TInitialContext, TOutputSchema, TErrorMap>
  ? undefined extends InferSchemaInput<TInputSchema>
    ? [input?: InferSchemaInput<TInputSchema>, options?: CallOptions<TInitialContext, TOutputSchema, TErrorMap>]
    : [input: InferSchemaInput<TInputSchema>, options?: CallOptions<TInitialContext, TOutputSchema, TErrorMap>]
  : [input: InferSchemaInput<TInputSchema>, options: CallOptions<TInitialContext, TOutputSchema, TErrorMap>]

/**
 * Quickly call a procedure without creating a client.
 *
 * @example
 * ```ts
 * const output = await call(getting, 'input')
 * const output = await call(getting, 'input', { context: { db: 'postgres' } })
 * ```
 *
 * @see {@link https://orpc.dev/docs/client/server-side#one-off-calls | Server-Side Clients - One-Off Calls}
 */
export function call<
  TInitialContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
>(
  lazyableProcedure: Lazyable<Procedure<TInitialContext, any, TInputSchema, TOutputSchema, TErrorMap>>,
  ...[
    input = undefined as InferSchemaInput<TInputSchema>,
    options = {} as CallOptions<TInitialContext, TOutputSchema, TErrorMap>,
  ]: CallRest<TInitialContext, TInputSchema, TOutputSchema, TErrorMap>
): PromiseWithError<InferSchemaOutput<TOutputSchema>, ORPCErrorFromErrorMap<TErrorMap> | ThrowableError> {
  return createProcedureClient(lazyableProcedure, options)(input, options)
}
