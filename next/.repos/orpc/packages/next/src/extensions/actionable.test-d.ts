import type { DecoratedProcedure, Procedure } from '@orpc/server'
import type { ProcedureServerFunction } from '../server-function'
import { z } from 'zod'
import './actionable'

const errorMap = {
  BASE: {
    data: z.object({ id: z.string() }),
    message: 'base',
  },
}

const schema1 = z.object({ schema1: z.number().transform(n => `${n}`) })
const schema2 = z.object({ schema2: z.number().transform(n => `${n}`) })

it('adds .actionable method to DecoratedProcedure', async () => {
  const procedure = {} as DecoratedProcedure<
    { auth: boolean },
    { extra: string },
    typeof schema1,
    typeof schema2,
    typeof errorMap
  >

  expectTypeOf(procedure.actionable({ context: { auth: true } })).toEqualTypeOf<
    & ProcedureServerFunction<
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
