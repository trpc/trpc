import type { RateLimiter } from './types'
import { os, type } from '@orpc/server'
import { ratelimit } from './middleware'

describe('ratelimit', () => {
  it('can infer context & input & meta types', () => {
    const procedure = os
      .$context<{ userId: string, rateLimiter: RateLimiter }>()
      .input(type<{ amount: number }>())
      .use(({ next }) => {
        return next({
          context: {
            db: 'postgres',
          },
        })
      })
      .use(
        ratelimit({
          limiter: async ({ context }, input) => {
            expectTypeOf(input.amount).toBeNumber()
            expectTypeOf(context.userId).toBeString()
            expectTypeOf(context.db).toBeString()

            return context.rateLimiter
          },
          key: ({ context }, input) => {
            expectTypeOf(input.amount).toBeNumber()
            expectTypeOf(context.userId).toBeString()
            expectTypeOf(context.db).toBeString()

            return context.userId
          },
          weight: ({ context }, input) => {
            expectTypeOf(input.amount).toBeNumber()
            expectTypeOf(context.userId).toBeString()
            expectTypeOf(context.db).toBeString()

            return 1
          },
        }),
      )
      .handler(({ context, input }) => {
        expectTypeOf(context.rateLimiter).toEqualTypeOf<RateLimiter>()
        expectTypeOf(context.userId).toBeString()
        expectTypeOf(context.db).toBeString()
        expectTypeOf(input.amount).toBeNumber()

        return 'ok'
      })
  })
})
