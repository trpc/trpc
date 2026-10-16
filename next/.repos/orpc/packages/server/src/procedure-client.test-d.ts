import type { Client, ThrowableError } from '@orpc/client'
import type { ORPCErrorFromErrorMap } from '@orpc/contract'
import type { ProcedureClient } from './procedure-client'
import z from 'zod'

const errorMap = {
  BASE: {
    data: z.string(),
  },
}

// Schemas should have distinct TInput and TOutput types to ensure correct inference.
const schema1 = z.object({ schema1: z.number().transform(n => `${n}`) })
const schema2 = z.object({ schema2: z.number().transform(n => `${n}`) })

it('ProcedureClient', () => {
  expectTypeOf<
    ProcedureClient<
      { cache?: boolean },
      typeof schema1,
      typeof schema2,
      typeof errorMap
    >
  >().toEqualTypeOf<
    Client<
      { cache?: boolean },
      { schema1: number },
      { schema2: string },
      ORPCErrorFromErrorMap<typeof errorMap> | ThrowableError
    >
  >()
})
