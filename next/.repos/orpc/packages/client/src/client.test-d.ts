import type { RouterContractClient } from '@orpc/contract'
import type { RouterClient } from '@orpc/server'
import type { PromiseWithError } from '@orpc/shared'
import type { ORPCError } from './error'
import type { ClientLink } from './types'
import { os, type } from '@orpc/server'
import { createORPCClient } from './client'

const router = {
  ping: os.input(type<number>()).handler(() => 'pong'),
  nested: {
    pong: os.input(type<string>()).errors({ TEST: { data: type<string>() } }).handler(({ errors }) => { throw errors.TEST({ data: 'string' }) }),
  },
}

describe('createORPCClient', () => {
  it('require match context between client and link', () => {
    const _1: RouterClient<typeof router, { cache: string }> = createORPCClient({} as ClientLink<{ cache: string }>)
    const _11: RouterClient<typeof router, { cache?: string }> = createORPCClient({} as ClientLink<{ cache?: string }>)
    const _111: RouterClient<typeof router, { cache?: string }> = createORPCClient({} as ClientLink<{ cache?: string, tags?: string[] }>)
    const _1111: RouterClient<typeof router> = createORPCClient({} as ClientLink<{ cache?: string }>)

    // @ts-expect-error -- cache is required
    const _11111: RouterClient<typeof router> = createORPCClient({} as ClientLink<{ cache: string }>)

    // @ts-expect-error -- expect cache is optional
    const _2: RouterClient<typeof router, { cache?: string }> = createORPCClient({} as ClientLink<{ cache: string }>)

    // @ts-expect-error -- expect cache is number
    const _3: RouterClient<typeof router, { cache?: number }> = createORPCClient({} as ClientLink<{ cache?: string }>)

    const _4: RouterContractClient<typeof router> = createORPCClient({} as ClientLink<{ cache?: string }>)

    // @ts-expect-error -- cache is required
    const _44: RouterContractClient<typeof router> = createORPCClient({} as ClientLink<{ cache: string }>)

    const _444: RouterContractClient<typeof router, { cache: string }> = createORPCClient({} as ClientLink<{ cache: string }>)
  })

  it('interceptors infer correct types', () => {
    const _client: RouterClient<typeof router, { cache: string }> = createORPCClient({} as ClientLink<{ cache: string }>, {
      interceptors: [
        ({ input, context, next }) => {
          expectTypeOf(input).toEqualTypeOf<unknown>()
          expectTypeOf(context).toEqualTypeOf<{ cache: string }>()

          const result = next()

          expectTypeOf(result).toEqualTypeOf<PromiseWithError<unknown, Error | ORPCError<'TEST', string>>>()

          return result
        },
      ],
    })
  })

  it('scoped expose correct client structure and infer correct types', () => {
    const _client: RouterClient<typeof router, { cache: string }> = createORPCClient({} as ClientLink<{ cache: string }>, {
      scoped: {
        ping: {
          interceptors: [
            ({ input, context, next }) => {
              expectTypeOf(input).toEqualTypeOf<number>()
              expectTypeOf(context).toEqualTypeOf<{ cache: string }>()

              const result = next()

              expectTypeOf(result).toEqualTypeOf<PromiseWithError<string, Error>>()

              return result
            },
          ],
        },
        nested: {
          pong: {
            interceptors: [
              ({ input, context, next }) => {
                expectTypeOf(input).toEqualTypeOf<string>()
                expectTypeOf(context).toEqualTypeOf<{ cache: string }>()

                const result = next()

                expectTypeOf(result).toEqualTypeOf<PromiseWithError<never, Error | ORPCError<'TEST', string>>>()

                return result
              },
            ],
          },
        },

        // @ts-expect-error - non exists
        nonExist: {},
      },
    })
  })
})
