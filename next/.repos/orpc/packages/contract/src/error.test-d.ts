import type { ORPCError } from '@orpc/client'
import type { ORPCErrorFromErrorMap } from './error'
import z from 'zod'

describe('ORPCErrorFromErrorMap', () => {
  it('converts an error map to an ORPCError union and defaults to unknown when schema is undefined', () => {
    const errorMap = {
      TEST1: { data: z.string() },
      TEST2: { data: z.number().transform(() => 'string') },
      UNDEFINED_SCHEMA: {},
    }

    expectTypeOf<
      ORPCErrorFromErrorMap<typeof errorMap>
    >().toEqualTypeOf<
      | ORPCError<'TEST1', string>
      | ORPCError<'TEST2', string>
      | ORPCError<'UNDEFINED_SCHEMA', unknown>
    >()
  })
})
