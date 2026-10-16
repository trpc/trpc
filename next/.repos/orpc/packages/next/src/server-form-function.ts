import type { AnySchema, Context, ErrorMap, Lazyable, Procedure, ProcedureClientOptions } from '@orpc/server'
import type { MaybeOptionalOptions } from '@orpc/shared'
import { BracketNotationSerializer } from '@orpc/openapi'
import { createProcedureClient } from '@orpc/server'
import { resolveMaybeOptionalOptions } from '@orpc/shared'

export interface ServerFormFunction {
  (form: FormData): Promise<void>
}

export function createServerFormFunction<
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
): ServerFormFunction {
  const options = resolveMaybeOptionalOptions(rest)
  const client = createProcedureClient(procedure, options)
  const serializer = new BracketNotationSerializer()

  return async (form) => {
    if (!(form instanceof FormData)) {
      throw new TypeError('Server form function expects FormData.')
    }

    const input = serializer.deserialize([...form])
    await client(input as any)
  }
}
