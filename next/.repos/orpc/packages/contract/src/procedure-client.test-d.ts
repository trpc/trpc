import type { Client, ORPCError, ThrowableError } from '@orpc/client'
import type { ProcedureContractClient } from './procedure-client'
import { z } from 'zod'

// Schemas should have distinct TInput and TOutput types to ensure correct inference.
const inputSchema = z.object({ input: z.number().transform(n => `${n}`) })
const outputSchema = z.object({ output: z.string().transform(s => Number(s)) })

const errorMap = {
  BASE: {
    data: z.object({ id: z.string().transform(s => Number(s)) }),
    message: 'base',
  },
}

describe('ProcedureContractClient', () => {
  it('is a client', () => {
    expectTypeOf<
      ProcedureContractClient<{ cache?: boolean }, typeof inputSchema, typeof outputSchema, typeof errorMap>
    >().toEqualTypeOf<
      Client<
        { cache?: boolean },
        { input: number },
        { output: number },
        ThrowableError | ORPCError<'BASE', { id: number }>
      >
    >()
  })
})
