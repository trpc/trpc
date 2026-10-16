import type { ORPCError } from '@orpc/server'
import { os, safe } from '@orpc/server'
import * as z from 'zod'
import { createServerFunction } from '../server-function'
import { useServerFunction } from './server-function'

export const inputSchema = z.object({ input: z.number().transform(n => `${n}`) })

export const outputSchema = z.object({ output: z.number().transform(n => `${n}`) })

export const baseErrorMap = {
  BASE: {
    data: outputSchema,
  },
  OVERRIDE: {},
}

describe('useServerFunction', () => {
  const fn = createServerFunction(
    os
      .input(inputSchema.optional())
      .errors(baseErrorMap)
      .output(outputSchema)
      .handler(async ({ input }) => {
        return { output: Number(input) }
      }),
  )

  const state = useServerFunction(fn)

  it('infer correct input', () => {
    state.execute({ input: 123 })
    state.execute(undefined)
    state.execute()
    // @ts-expect-error --- input is invalid
    state.execute({ input: 'invalid' })

    expectTypeOf(state.input).toEqualTypeOf<undefined | { input: number }>()
  })

  it('require non-undefindable input ', () => {
    const action = os.input(z.string()).handler(() => 123).actionable()

    const state = useServerFunction(action)

    state.execute('123')
    // @ts-expect-error --- missing input
    state.execute()
    // @ts-expect-error --- invalid input
    state.execute(123)

    if (!state.isIdle || state.status !== 'idle') {
      expectTypeOf(state.input).toEqualTypeOf<string>()
    }
  })

  it('interceptors', async () => {
    const state = useServerFunction(fn, {
      interceptors: [
        async ({ input, next }) => {
          expectTypeOf(input).toEqualTypeOf<{ input: number } | undefined>()

          const [error, data, definedError] = await safe(next())

          if (definedError) {
            expectTypeOf(error).toEqualTypeOf<ORPCError<'BASE', { output: string }> | ORPCError<'OVERRIDE', unknown>>()
          }

          if (!error) {
            expectTypeOf(data).toEqualTypeOf<{ output: string }>()

            return data
          }

          return next()
        },
      ],
    })

    state.execute({ input: 123 }, {
      interceptors: [
        async ({ input, next }) => {
          expectTypeOf(input).toEqualTypeOf<{ input: number } | undefined>()

          const [error, data, definedError] = await safe(next())

          if (definedError) {
            expectTypeOf(error).toEqualTypeOf<ORPCError<'BASE', { output: string }> | ORPCError<'OVERRIDE', unknown>>()
          }

          if (!error) {
            expectTypeOf(data).toEqualTypeOf<{ output: string }>()

            return data
          }

          return next()
        },
      ],
    })
  })

  it('output & error', async () => {
    const [error, data, definedError] = await state.execute({ input: 123 })

    if (definedError) {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'BASE', { output: string }> | ORPCError<'OVERRIDE', unknown>>()
    }

    if (!error) {
      expectTypeOf(data).toEqualTypeOf<{ output: string }>()
    }

    if (state.isIdle || state.isPending || state.isError) {
      expectTypeOf(state.data).toEqualTypeOf<undefined>()
    }

    if (state.status === 'idle' || state.status === 'pending' || state.status === 'error') {
      expectTypeOf(state.data).toEqualTypeOf<undefined>()
    }

    if (state.isSuccess) {
      expectTypeOf(state.data).toEqualTypeOf<{ output: string }>()
    }

    if (state.status === 'success') {
      expectTypeOf(state.data).toEqualTypeOf<{ output: string }>()
    }
  })
})
