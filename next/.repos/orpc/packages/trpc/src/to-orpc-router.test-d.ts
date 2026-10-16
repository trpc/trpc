import type { InferRouterInitialContext, Procedure, Router, Schema } from '@orpc/server'
import type { AsyncIteratorClass } from '@orpc/shared'
import type { TrackedData } from '@trpc/server/unstable-core-do-not-import'
import { initTRPC, lazy, tracked, TRPCError } from '@trpc/server'
import * as z from 'zod'
import { toORPCRouter } from './to-orpc-router'

type TRPCContext = { a: string }

const inputSchema = z.object({ input: z.number().transform(n => `${n}`) })

const outputSchema = z.object({ output: z.number().transform(n => `${n}`) })

const t = initTRPC.context<(req: Request) => TRPCContext>().create()

const trpcRouter = t.router({
  ping: t.procedure
    .input(inputSchema)
    .output(outputSchema)
    .query(({ input }) => {
      return { output: Number(input.input) }
    }),

  throw: t.procedure
    .input(z.object({ b: z.number(), c: z.string() }))
    .query(() => {
      throw new TRPCError({
        code: 'PARSE_ERROR',
        message: 'throw',
      })
    }),

  subscribe: t.procedure
    .input(z.object({ u: z.string() }))
    .subscription(async function* () {
      yield 'pong'
      yield tracked('id-1', { order: 1 })
    }),

  nested: {
    ping: t.procedure
      .input(z.object({ a: z.string() }))
      .output(z.string().transform(val => Number(val)))
      .query(({ input }) => {
        return `1234${input.a}`
      }),
  },

  lazy: lazy(() => Promise.resolve({ default: t.router({
    subscribe: t.procedure
      .subscription(async function* () {
        yield 'pong'
      }),

    lazy: lazy(() => Promise.resolve({ default: t.router({
      throw: t.procedure
        .input(inputSchema)
        .output(outputSchema)
        .query(() => {
          throw new Error('lazy.lazy.throw')
        }),
    }) })),
  }) })),
})

describe('toORPCRouter', () => {
  const orpcRouter = toORPCRouter(trpcRouter)

  expectTypeOf(orpcRouter).toExtend<Router<TRPCContext>>()

  expectTypeOf<InferRouterInitialContext<typeof orpcRouter>>().toEqualTypeOf<{ a: string }>()

  expectTypeOf(orpcRouter.ping).toEqualTypeOf<
    Procedure<TRPCContext, object, Schema<{ input: number }, unknown>, Schema<unknown, { output: string }>, object>
  >()

  expectTypeOf(orpcRouter.throw).toEqualTypeOf<
    Procedure<TRPCContext, object, Schema<{ b: number, c: string }, unknown>, Schema<unknown, never>, object>
  >()

  expectTypeOf(orpcRouter.subscribe).toEqualTypeOf<
    Procedure<TRPCContext, object, Schema<{ u: string }, unknown>, Schema<unknown, AsyncIteratorClass<'pong' | TrackedData<{ order: number }>, void, any>>, object>
  >()

  expectTypeOf(orpcRouter.nested).toEqualTypeOf<
    {
      ping: Procedure<TRPCContext, object, Schema<{ a: string }, unknown>, Schema<unknown, number>, object>
    }
  >()

  expectTypeOf(orpcRouter.lazy).toEqualTypeOf<
    {
      subscribe: Procedure<TRPCContext, object, Schema<void, unknown>, Schema<unknown, AsyncIteratorClass<string, void, any>>, object>
      lazy: {
        throw: Procedure<TRPCContext, object, Schema<{ input: number }, unknown>, Schema<unknown, { output: string }>, object>
      }
    }
  >()
})
