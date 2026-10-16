import type { Procedure } from '@orpc/server'
import type { ProcedureServerFunction } from './server-function'
import { os } from '@orpc/server'
import { z } from 'zod'
import { createServerFunctionable } from './server-functionable'

const errorMap = {
  BASE: {
    data: z.object({ id: z.string() }),
    message: 'base',
  },
}

const schema1 = z.object({ schema1: z.number().transform(n => `${n}`) })
const schema2 = z.object({ schema2: z.number().transform(n => `${n}`) })

describe('createServerFunctionable', () => {
  const functionable = createServerFunctionable({
    context: { auth: true },
  })

  it('returns the wrapped server function and preserves the procedure metadata', () => {
    expectTypeOf(
      functionable(
        os.$context<{ auth: boolean }>().input(schema1).output(schema2).errors(errorMap).handler(() => ({ schema2: 123 })),
      ),
    ).toEqualTypeOf<
      & ProcedureServerFunction<typeof schema1, typeof schema2, typeof errorMap>
      & Procedure<{ auth: boolean }, object, typeof schema1, typeof schema2, typeof errorMap>
    >()
  })

  it('strict initial context', () => {
    functionable(os.$context<{ auth: boolean }>().handler(() => 'output'))

    // @ts-expect-error - initial context is invalid
    functionable(os.$context<{ auth: string }>().handler(() => 'output'))
  })
})
