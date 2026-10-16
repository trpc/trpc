import { os } from '@orpc/server'
import { z } from 'zod'
import { createServerFunction } from '../server-function'
import { useOptimisticServerFunction } from './optimistic-server-function'

const inputSchema = z.object({ input: z.number().transform(v => v.toString()) })

describe('useOptimisticServerFunction', () => {
  const fn = createServerFunction(
    os
      .input(inputSchema.optional())
      .handler(async ({ input }) => {
        return { output: Number(input) }
      }),
  )

  it('can infer optimistic state', () => {
    const state = useOptimisticServerFunction(fn, {
      optimisticPassthrough: [{ output: 0 }],
      optimisticReducer(state, input) {
        expectTypeOf(state).toEqualTypeOf<{ output: number }[]>()
        expectTypeOf(input).toEqualTypeOf<{ input: number } | undefined>()
        return [...state, { output: Number(input?.input) }]
      },
    })

    expectTypeOf(state.optimisticState).toEqualTypeOf<{ output: number }[]>()
  })
})
