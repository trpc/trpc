import type { DecoratedProcedure, Procedure, ProcedureClient } from '@orpc/server'
import { z } from 'zod'
import './callable'

const errorMap = {
  BASE: {
    data: z.object({ id: z.string() }),
    message: 'base',
  },
}

const schema1 = z.object({ schema1: z.number().transform(n => `${n}`) })
const schema2 = z.object({ schema2: z.number().transform(n => `${n}`) })

it('adds .callable method to DecoratedProcedure', async () => {
  const procedure = {} as DecoratedProcedure<
    { auth: boolean },
    { extra: string },
    typeof schema1,
    typeof schema2,
    typeof errorMap
  >

  expectTypeOf(procedure.callable({ context: (cx: { cache?: boolean }) => ({ auth: true }) })).toEqualTypeOf<
    & ProcedureClient<
      { cache?: boolean },
        typeof schema1,
        typeof schema2,
        typeof errorMap
    >
    & Procedure<
      { auth: boolean },
      { extra: string },
        typeof schema1,
        typeof schema2,
        typeof errorMap
    >
  >()

  // @ts-expect-error - invalid initial context
  procedure.actionable({ context: { auth: 'invalid' } })
})
