import type { OpenAPIMeta } from '@orpc/openapi'
import { getOpenAPIMeta } from '@orpc/openapi'
import { call, createRouterClient, getEventMeta, Lazy, ORPCError, Procedure, unlazy } from '@orpc/server'
import { isAsyncIteratorObject } from '@orpc/shared'
import { initTRPC, lazy, tracked, TRPCError } from '@trpc/server'
import * as z from 'zod'
import { toORPCRouter } from './to-orpc-router'

const inputSchema = z.object({ input: z.number().transform(n => `${n}`) })

const outputSchema = z.object({ output: z.number().transform(n => `${n}`) })

interface TRPCMeta {
  '~openapi'?: OpenAPIMeta
  'meta1'?: string
}

const t = initTRPC.context<(req: Request) => ({ a: string })>().meta<TRPCMeta>().create()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('toORPCRouter', () => {
  it('shape', async () => {
    const orpcRouter = toORPCRouter(t.router({
      ping: t.procedure.query(() => 'pong'),

      lazy: lazy(() => Promise.resolve({ default: t.router({
        ping: t.procedure.query(() => 'pong'),

        lazy: lazy(() => Promise.resolve({ default: t.router({
          ping: t.procedure.query(() => 'pong'),
        }) })),
      }) })),

      nested: {
        ping: t.procedure.query(() => 'pong'),

        lazy: lazy(() => Promise.resolve({ default: t.router({
          ping: t.procedure.query(() => 'pong'),

          lazy: lazy(() => Promise.resolve({ default: t.router({
            ping: t.procedure.query(() => 'pong'),
          }) })),
        }) })),
      },
    }))

    expect(orpcRouter.ping).toBeInstanceOf(Procedure)
    expect(orpcRouter.nested.ping).toBeInstanceOf(Procedure)

    expect(orpcRouter.lazy).toBeInstanceOf(Lazy)
    const unlazyLazy = await unlazy(orpcRouter.lazy)
    expect(unlazyLazy.default.ping).toBeInstanceOf(Procedure)

    expect(unlazyLazy.default.lazy).toBeInstanceOf(Lazy)
    const unlazyLazyLazy = await unlazy(unlazyLazy.default.lazy)
    expect(unlazyLazyLazy.default.ping).toBeInstanceOf(Procedure)

    expect(orpcRouter.nested.lazy).toBeInstanceOf(Lazy)
    const unlazyNestedLazy = await unlazy(orpcRouter.nested.lazy)
    expect(unlazyNestedLazy.default.ping).toBeInstanceOf(Procedure)

    expect(unlazyNestedLazy.default.lazy).toBeInstanceOf(Lazy)
    const unlazyNestedLazyUnlazy = await unlazy(unlazyNestedLazy.default.lazy)
    expect(unlazyNestedLazyUnlazy.default.ping).toBeInstanceOf(Procedure)
  })

  it('with input/output schema and validation happen inside handler only', async () => {
    const orpcRouter = toORPCRouter(t.router({
      ping: t.procedure
        .input(inputSchema)
        .output(outputSchema)
        .query(({ input }) => {
          return { output: Number(input.input) }
        }),
    }))

    expect((orpcRouter as any).ping['~orpc'].inputSchemas[0]['~standard'].vendor).toBe('zod')
    expect((orpcRouter as any).ping['~orpc'].inputSchemas[0]._def).toBe(inputSchema._def)
    expect((orpcRouter as any).ping['~orpc'].disableInputValidation).toBe(true)

    expect((orpcRouter as any).ping['~orpc'].outputSchemas[0]['~standard'].vendor).toBe('zod')
    expect((orpcRouter as any).ping['~orpc'].outputSchemas[0]._def).toBe(outputSchema._def)
    expect((orpcRouter as any).ping['~orpc'].disableOutputValidation).toBe(true)

    const withoutHandlerProcedure = new Procedure({
      ...(orpcRouter as any).ping['~orpc'],
      handler: async ({ input }: any) => input,
    })

    await expect(call(withoutHandlerProcedure as any, 'invalid')).resolves.toEqual('invalid') // validation not happen at oRPC level
    await expect(call((orpcRouter as any).ping, 'invalid')).rejects.toThrow('Invalid input') // validation happen at tRPC level
  })

  it('meta', async () => {
    const orpcRouter = toORPCRouter(t.router({
      ping: t.procedure
        .meta({ meta1: 'test' })
        .query(() => 'pong'),

      openapi: t.procedure
        .meta({ '~openapi': { path: '/openapi', description: 'OpenAPI procedure' } })
        .query(() => 'pong'),
    }))

    expect(orpcRouter.ping['~orpc'].meta).toEqual({ meta1: 'test' })
    expect(orpcRouter.openapi['~orpc'].meta).toEqual({ '~openapi': { path: '/openapi', description: 'OpenAPI procedure' } })
    expect(getOpenAPIMeta(orpcRouter.openapi)).toEqual({ path: '/openapi', description: 'OpenAPI procedure' })
  })

  describe('calls', () => {
    const handler = vi.fn()
    const router = toORPCRouter(t.router({
      procedure: t.procedure.input(z.object({ input: z.number() })).query(handler),
    }))

    it('on success', async () => {
      handler.mockResolvedValueOnce({ output: '1234' })
      const controller = new AbortController()

      const result = await call(router.procedure, { input: 1234 } as any, {
        context: { a: 'test' },
        signal: controller.signal,
        path: ['nested', 'procedure'],
      })

      expect(result).toEqual({ output: '1234' })
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        ctx: { a: 'test' },
        input: { input: 1234 },
        path: 'nested.procedure',
        type: 'query',
        signal: controller.signal,
      }))
    })

    it('strips keys the input schema does not declare', async () => {
      const orpcRouter = toORPCRouter(t.router({
        update: t.procedure
          .input(z.object({ name: z.string() }))
          .input(z.object({ age: z.number() }))
          .mutation(({ input }) => input),
      }))

      await expect(
        call(orpcRouter.update, { name: 'n', age: 1, role: 'admin' } as any, { context: { a: 'test' } }),
      ).resolves.toEqual({ name: 'n', age: 1 })
    })

    it('async iterator', async () => {
      const orpcRouter = toORPCRouter(t.router({
        subscribe: t.procedure.subscription(async function* () {
          yield 'pong'
        }),
      }))

      const result = await call(orpcRouter.subscribe, undefined, { context: { a: 'test' } })
      expect(result).toSatisfy(isAsyncIteratorObject)
      expect(await (result as any).next()).toEqual({ done: false, value: 'pong' })
    })

    it('error', async () => {
      const orpcRouter = toORPCRouter(t.router({
        throw: t.procedure.query(() => {
          throw new TRPCError({
            code: 'PARSE_ERROR',
            message: 'throw',
          })
        }),

        ping: t.procedure
          .input(inputSchema)
          .query(({ input }) => input),
      }))

      await expect(
        call(orpcRouter.throw, undefined, { context: { a: 'test' } }),
      ).rejects.toSatisfy((err: any) => {
        return err instanceof ORPCError && err.code === 'PARSE_ERROR' && err.message === 'throw'
      })

      await expect(
        call(orpcRouter.ping, { input: 'invalid' } as any, { context: { a: 'test' } }),
      ).rejects.toSatisfy((err: any) => {
        expect(err).toBeInstanceOf(ORPCError)
        expect(err.cause).toBeInstanceOf(TRPCError)
        expect(err.cause.cause).toBeInstanceOf(z.ZodError)

        return true
      })
    })

    it('converts TRPCError thrown while iterating', async () => {
      const orpcRouter = toORPCRouter(t.router({
        subscribe: t.procedure.subscription(async function* () {
          yield 'pong'
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'login required' })
        }),
      }))

      const output = await call(orpcRouter.subscribe, undefined, { context: { a: 'test' } }) as any
      await expect(output.next()).resolves.toEqual({ done: false, value: 'pong' })
      await expect(output.next()).rejects.toSatisfy((err: any) => {
        expect(err).toBeInstanceOf(ORPCError)
        expect(err.code).toBe('UNAUTHORIZED')
        expect(err.message).toBe('login required')
        expect(err.cause).toBeInstanceOf(TRPCError)

        return true
      })
    })

    it('rethrows non-TRPCError errors as-is', async () => {
      const error = new Error('broken')
      const orpcRouter = toORPCRouter(t.router({
        // tRPC wraps resolver errors in TRPCError, so a plain query cannot
        // produce a non-TRPCError - only errors thrown while consuming the
        // returned value can escape unwrapped
        broken: t.procedure.mutation(() => ({
          [Symbol.asyncIterator]: () => {
            throw error
          },
        } as AsyncIterable<unknown>)),
      }))

      await expect(
        call(orpcRouter.broken, undefined, { context: { a: 'test' } }),
      ).rejects.toBe(error)
    })

    it('deep lazy', async () => {
      const orpcRouter = toORPCRouter(t.router({
        lazy: lazy(() => Promise.resolve({ default: t.router({
          subscribe: t.procedure.subscription(async function* () {
            yield 'pong'
          }),

          lazy: lazy(() => Promise.resolve({ default: t.router({
            throw: t.procedure
              .input(inputSchema)
              .query(() => {
                throw new Error('lazy.lazy.throw')
              }),
          }) })),
        }) })),
      }))

      const client = createRouterClient(orpcRouter, {
        context: { a: 'test' },
      })

      await expect(
        client.lazy.subscribe(),
      ).resolves.toSatisfy(isAsyncIteratorObject)

      await expect(
        client.lazy.lazy.throw({ input: 1234 }),
      ).rejects.toSatisfy((err: any) => {
        return err instanceof ORPCError && err.message === 'lazy.lazy.throw'
      })
    })
  })

  describe('event iterators', () => {
    it('subscribe & tracked', async () => {
      const orpcRouter = toORPCRouter(t.router({
        subscribe: t.procedure.subscription(async function* () {
          yield 'pong'
          yield tracked('id-1', { order: 1 })
          yield tracked('id-2', { order: 2 })
        }),
      }))

      const output = await call(orpcRouter.subscribe, undefined, { context: { a: 'test' } }) as any
      expect(output).toSatisfy(isAsyncIteratorObject)
      await expect(output.next()).resolves.toEqual({ done: false, value: 'pong' })
      await expect(output.next()).resolves.toSatisfy((result) => {
        expect(result.done).toEqual(false)
        expect(result.value).toEqual({ id: 'id-1', data: { order: 1 } })
        expect(getEventMeta(result.value)).toEqual({ id: 'id-1' })

        return true
      })
      await expect(output.next()).resolves.toSatisfy((result) => {
        expect(result.done).toEqual(false)
        expect(result.value).toEqual({ id: 'id-2', data: { order: 2 } })
        expect(getEventMeta(result.value)).toEqual({ id: 'id-2' })

        return true
      })
      await expect(output.next()).resolves.toEqual({ done: true, value: undefined })
    })

    it('lastEventId', async () => {
      const trackedSubscription = vi.fn(async function* () {
        yield { order: 1 }
        yield tracked('id-2', { order: 2 })
      })

      const orpcRouter = toORPCRouter(t.router({
        tracked: t.procedure
          .input(z.any())
          .subscription(trackedSubscription),
      }))

      await call(orpcRouter.tracked, { u: 'u' }, { lastEventId: 'id-1', context: { a: 'test' } })
      expect(trackedSubscription).toHaveBeenNthCalledWith(1, expect.objectContaining({
        input: { u: 'u', lastEventId: 'id-1' },
      }))

      await call(orpcRouter.tracked, undefined, { lastEventId: 'id-2', context: { a: 'test' } })
      expect(trackedSubscription).toHaveBeenNthCalledWith(2, expect.objectContaining({
        input: { lastEventId: 'id-2' },
      }))

      await call(orpcRouter.tracked, 1234, { lastEventId: 'id-3', context: { a: 'test' } })
      expect(trackedSubscription).toHaveBeenNthCalledWith(3, expect.objectContaining({
        input: 1234,
      }))
    })

    it('works with AsyncIterable & cleanup', async () => {
      let cleanupCalled = false

      const trackedSubscription = vi.fn(async () => {
        return {
          async* [Symbol.asyncIterator]() {
            try {
              yield { order: 1 }
              yield tracked('id-2', { order: 2 })
            }
            finally {
              cleanupCalled = true
            }
          },
        }
      })

      const orpcRouter = toORPCRouter(t.router({
        tracked: t.procedure
          .input(z.any())
          .subscription(trackedSubscription),
      }))

      const output = await call(orpcRouter.tracked, { u: 'u' }, { lastEventId: 'id-1', context: { a: 'test' } })

      await expect(output.next()).resolves.toEqual({ done: false, value: { order: 1 } })
      await expect(output.return?.()).resolves.toEqual({ done: true, value: undefined })
      expect(cleanupCalled).toBe(true)
    })
  })
})
