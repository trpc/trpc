import type { AnyORPCErrorJSON, AnySchema, Context, ErrorMap, InferSchemaInput, InferSchemaOutput, Lazyable, ORPCError, ORPCErrorCode, ORPCErrorFromErrorMap, ORPCErrorJSON, Procedure, ProcedureClientOptions, ThrowableError } from '@orpc/server'
import type { MaybeOptionalOptions } from '@orpc/shared'
import { createProcedureClient, toORPCError } from '@orpc/server'
import { resolveMaybeOptionalOptions } from '@orpc/shared'
import { unstable_rethrow } from 'next/navigation'

export type ServerFunctionORPCErrorJSON<T>
  = T extends ORPCError<infer U, infer V>
    ? ORPCErrorJSON<U, V> & { defined: true }
    : ORPCErrorJSON<ORPCErrorCode, unknown> & { defined: false }

export type ServerFunctionError<T extends AnyORPCErrorJSON>
  = T extends ORPCErrorJSON<infer U, infer V> & { defined: true }
    ? ORPCError<U, V>
    : ThrowableError

export type ServerFunctionRest<TInput>
  = | [input: TInput]
    | (undefined extends TInput ? [input?: TInput] : [input: TInput])

export type ServerFunctionResult<TOutput, TError> = [error: null, data: TOutput] | [error: TError, data: undefined]

export interface ServerFunction<TInput, TOutput, TError extends AnyORPCErrorJSON> {
  (...rest: ServerFunctionRest<TInput>): Promise<ServerFunctionResult<TOutput, TError>>
}

export type ProcedureServerFunction<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> = ServerFunction<
  InferSchemaInput<TInputSchema>,
  InferSchemaOutput<TOutputSchema>,
  ServerFunctionORPCErrorJSON<ORPCErrorFromErrorMap<TErrorMap> | ThrowableError>
>

/**
 * Creates a Next.js [server function](https://nextjs.org/docs/app/api-reference/directives/use-server)
 * from a [procedure](https://orpc.dev/docs/procedure). It accepts the same options as server-side
 * clients, and the returned function accepts the same input as the original procedure.
 *
 * @remarks
 * **Note**: Instead of throwing, the returned function resolves an `[error, data]` tuple
 * with errors serialized as plain JSON (`ORPCErrorJSON`).
 *
 * @see {@link https://orpc.dev/docs/integrations/next#server-functions | Next.js Integration - Server Functions}
 */
export function createServerFunction<
  TInitialContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
>(
  procedure: Lazyable<Procedure<
    TInitialContext,
    any,
    TInputSchema,
    TOutputSchema,
    TErrorMap
  >>,
  ...rest: MaybeOptionalOptions<
    ProcedureClientOptions<
      TInitialContext,
      TOutputSchema,
      TErrorMap,
      object
    >
  >
): ProcedureServerFunction<TInputSchema, TOutputSchema, TErrorMap> {
  const options = resolveMaybeOptionalOptions(rest)
  const client = createProcedureClient(procedure, options)

  return async (...[input]) => {
    try {
      return [null, await client(input as any)]
    }
    catch (error) {
      // https://nextjs.org/docs/app/api-reference/functions/unstable_rethrow
      unstable_rethrow(error)

      return [
        toORPCError(error).toJSON() as ServerFunctionORPCErrorJSON<ORPCErrorFromErrorMap<TErrorMap> | ThrowableError>,
        undefined,
      ]
    }
  }
}
