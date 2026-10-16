import type { MergedErrorMap, MetaPlugin, ORPCErrorConstructorMap, Schema } from '@orpc/contract'
import type { IntersectPick } from '@orpc/shared'
import type { Builder, DefaultInitialContext } from './builder'
import type { BuilderWithInput, BuilderWithMiddlewares, BuilderWithOutput } from './builder-variants'
import type { MergedContext, MergedInitialContext } from './context'
import type { Lazy } from './lazy'
import type { Middleware, MiddlewareDone } from './middleware'
import type { DecoratedMiddleware } from './middleware-decorated'
import type { Procedure } from './procedure'
import type { DecoratedProcedure } from './procedure-decorated'
import type { AugmentedRouter } from './router-utils'
import { onError, onFinish, onStart, onSuccess } from '@orpc/shared'
import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { os } from './builder'

const errorMap = {
  BASE: {
    data: z.object({ id: z.string() }),
    message: 'base',
  },
}

const builder = {} as Builder<{ auth: boolean }, typeof errorMap>

// Schemas should have distinct TInput and TOutput types to ensure correct inference.
const schema1 = z.object({ schema1: z.number().transform(n => `${n}`) })
const schema2 = z.object({ schema2: z.number().transform(n => `${n}`) })

describe('Builder', () => {
  it('$context', () => {
    expectTypeOf(builder.$context<{ user: string }>()).toEqualTypeOf<
      Builder<{ user: string } & object, typeof errorMap>
    >()

    // @ts-expect-error - invalid context
    builder.$context<'invalid'>()
  })

  it('$config', () => {
    expectTypeOf(builder.$config({ disableInputValidation: true, disableOutputValidation: true })).toEqualTypeOf<
      typeof builder
    >()

    // @ts-expect-error - invalid setting
    builder.$config('invalid')
  })

  it('.errors', () => {
    expectTypeOf(builder.errors({ INVALID: { message: 'invalid' }, OVERRIDE: { message: 'override' } })).toEqualTypeOf<
      Builder<
        { auth: boolean },
        MergedErrorMap<typeof errorMap, { INVALID: { message: string }, OVERRIDE: { message: string } }>
      >
    >()

    // @ts-expect-error - schema is invalid
    builder.errors({ TOO_MANY_REQUESTS: { data: {} } })
  })

  it('.meta', () => {
    const plugin = { name: 'test', init: (m: any) => m }
    expectTypeOf(builder.meta(plugin)).toEqualTypeOf<typeof builder>()

    // @ts-expect-error - invalid meta
    builder.meta({} as MetaPlugin<Schema<'invalid'>, any, any>)
  })

  describe('.use', () => {
    it('inline middleware', () => {
      const decorated = builder.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<unknown>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<unknown>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<{ auth: boolean }>()

        return next({ context: { extra: true } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        BuilderWithMiddlewares<
          { auth: boolean },
          { extra: boolean },
          typeof errorMap
        >
      >()

      // @ts-expect-error - input is invalid
      void builder.use(({ next, errors }, input: 'invalid', done) => {
        return next()
      })

      // @ts-expect-error - output is invalid
      void builder.use(({ next, errors }, input, done: MiddlewareDone<'invalid'>) => {
        return next()
      })

      // @ts-expect-error - conflict with TInitialContext
      void builder.use(({ next, errors }) => {
        return next({ context: { auth: 'invalid' } })
      })
    })

    it('keeps union and index-signature context', () => {
      void os.$context<{ kind: 'a', a: string } | { kind: 'b', b: number }>()
        .use(({ next }) => next({ context: { user: 1 } }))
        .handler(({ context }) => {
          if (context.kind === 'a') {
            expectTypeOf(context.a).toEqualTypeOf<string>()
          }
          else {
            expectTypeOf(context.b).toEqualTypeOf<number>()
          }
        })

      void os.$context<{ [k: string]: unknown, db: string }>()
        .use(({ next }) => next({ context: { user: 1 } }))
        .handler(({ context }) => {
          expectTypeOf(context.db).toEqualTypeOf<string>()
        })
    })

    it('outline middleware', () => {
      const middleware = {} as Middleware<{ auth: boolean, g?: boolean }, { extra: boolean }, unknown, any, { SOME_ERROR: { message: string } }>

      expectTypeOf(builder.use(middleware)).toEqualTypeOf<
        BuilderWithMiddlewares<
          MergedInitialContext<{ auth: boolean }, { extra: boolean }, { auth: boolean, g?: boolean }>,
          { extra: boolean },
          MergedErrorMap<{ SOME_ERROR: { message: string } }, typeof errorMap>
        >
      >()

      // @ts-expect-error - input is invalid
      void builder.use({} as Middleware<{ auth: boolean }, object, 'invalid', any, object>)

      // @ts-expect-error - output is invalid
      void builder.use({} as Middleware<{ auth: boolean }, object, unknown, 'invalid', object>)

      // @ts-expect-error - TInContext is not satisfy expected
      void builder.use({} as Middleware<{ something: string }, object, unknown, any, object>)

      // @ts-expect-error - conflict with TInitialContext
      void builder.use({} as Middleware<object, { auth: 'invalid' }, unknown, any, object>)
    })

    it('low-priority mid\'s errors and ignore conflicts', () => {
      const middleware = {} as Middleware<{ auth: boolean }, object, unknown, any, { BASE: { message: 'CONFLICT' }, EXTRA: { message: string } }>

      expectTypeOf(builder.use(middleware)).toEqualTypeOf<
        BuilderWithMiddlewares<
          { auth: boolean },
          object,
          MergedErrorMap<{ EXTRA: { message: string } }, typeof errorMap>
        >
      >()
    })
  })

  describe('.middleware', () => {
    it('pure', () => {
      // default expected TOutput should = any to ensure this middleware can be used in any procedure

      expectTypeOf(builder.middleware(({ next, context, errors }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<unknown>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<any>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, object>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()

        return next()
      })).toEqualTypeOf<
        DecoratedMiddleware<MergedContext<{ auth: boolean }, object>, object, unknown, any, typeof errorMap>
      >()
    })

    it('with TOutContext', () => {
      expectTypeOf(builder.middleware(({ next }) => next({ context: { extra: true } }))).toEqualTypeOf<
        DecoratedMiddleware<MergedContext<{ auth: boolean }, object>, { extra: boolean }, unknown, any, typeof errorMap>
      >()

      // @ts-expect-error - TOutContext is conflict with current context
      builder.middleware(({ next }) => next({ context: { auth: 'invalid' } }))
    })

    it('with expected input', () => {
      expectTypeOf(builder.middleware(({ next }, input: { schema1: number }) => next({}))).toEqualTypeOf<
        DecoratedMiddleware<MergedContext<{ auth: boolean }, object>, object, { schema1: number }, any, typeof errorMap>
      >()
    })

    it('with expected output', () => {
      expectTypeOf(builder.middleware(({ next }, input, done: MiddlewareDone<{ schema2: number }>) => next({}))).toEqualTypeOf<
        DecoratedMiddleware<MergedContext<{ auth: boolean }, object>, object, unknown, { schema2: number }, typeof errorMap>
      >()
    })
  })

  it('.input', () => {
    expectTypeOf(builder.input(schema1)).toEqualTypeOf<
      BuilderWithInput<
        { auth: boolean },
        object,
        typeof schema1,
        typeof errorMap
      >
    >()

    // @ts-expect-error - schema is invalid
    builder.input({})
  })

  it('.output', () => {
    expectTypeOf(builder.output(schema2)).toEqualTypeOf<
      BuilderWithOutput<
        { auth: boolean },
        object,
        typeof schema2,
        typeof errorMap
      >
    >()

    // @ts-expect-error - schema is invalid
    builder.output({})
  })

  describe('.handler', () => {
    it('simple', () => {
      expectTypeOf(builder.handler(async ({ errors, context }, input) => {
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(input).toEqualTypeOf<unknown>()
        expectTypeOf(context).toEqualTypeOf<{ auth: boolean }>()

        return 'out'
      })).toEqualTypeOf<
        DecoratedProcedure<
          { auth: boolean },
          object,
          Schema<void, unknown>,
          Schema<string>,
          typeof errorMap
        >
      >()
    })
  })

  it('.router', () => {
    const router = {
      ping: {} as Procedure<object, object, typeof schema1, typeof schema2, typeof errorMap>,
      // this builder has no middlewares, so it shouldn't restrict context
      ping2: {} as Procedure<{ something1: boolean }, object, Schema<void, unknown>, Schema<unknown>, object>,
      ping3: {} as Procedure<{ something2: boolean }, object, Schema<void, unknown>, Schema<unknown>, object>,
    }

    expectTypeOf(builder.router(router)).toEqualTypeOf<
      AugmentedRouter<typeof router, typeof errorMap>
    >()

    // @ts-expect-error - invalid router
    builder.router(123)
  })

  it('.lazy', () => {
    const router = {
      ping: {} as Procedure<object, object, typeof schema1, typeof schema2, typeof errorMap>,
      // this builder has no middlewares, so it shouldn't restrict context
      ping2: {} as Procedure<{ something1: boolean }, object, Schema<void, unknown>, Schema<unknown>, object>,
      ping3: {} as Procedure<{ something2: boolean }, object, Schema<void, unknown>, Schema<unknown>, object>,
    }

    expectTypeOf(builder.lazy(async () => ({ default: router }))).toEqualTypeOf<
      Lazy<AugmentedRouter<typeof router, typeof errorMap>>
    >()

    // @ts-expect-error - invalid router
    builder.lazy(() => 123)
  })
})

describe('os', () => {
  it('is a builder', () => {
    expectTypeOf(os).toEqualTypeOf<
      Builder<DefaultInitialContext & object, Record<never, never>>
    >()
  })

  it('can deal with "has no properties in common with type" in context', async () => {
    // When a router includes middleware, it restricts the initial context of its procedures.
    // If the builder's context and the procedure's context have no properties in common,
    // TypeScript may error with "has no properties in common". This can be resolved
    // by adding `& object` to the initial context (in .create and .$context).
    void os.$context<{ context1: string }>().use(({ next }) => next({ context: { context11: true } })).router({
      ping: os.$context<{ context2?: number }>().handler(async () => 'out'),
      nested: {
        ping: os
          .$context<{ context3?: boolean }>()
          .input(z.object({}))
          .output(z.string())
          .handler(async () => 'out'),
        nested: os.$context<{ context4?: boolean }>().use(({ next }) => next()).lazy(async () => ({
          default: {
            ping: os
              .$context<{ context5?: Date }>()
              .use(({ next }) => next())
              .output(z.string())
              .handler(async () => 'out'),
          },
        })),
      },
    })
  })

  it('onStart, onSuccess, onError, onFinish can be used as a middleware', () => {
    type ExpectedBuilder = BuilderWithMiddlewares<
        DefaultInitialContext & object,
        IntersectPick<DefaultInitialContext & object, unknown>,
        Record<never, never>
    >

    expectTypeOf(
      os.use(onStart(async () => {})),
    ).toEqualTypeOf<ExpectedBuilder>()

    expectTypeOf(
      os.use(onSuccess(async () => {})),
    ).toEqualTypeOf<ExpectedBuilder>()

    expectTypeOf(
      os.use(onError(async () => {})),
    ).toEqualTypeOf<ExpectedBuilder>()

    expectTypeOf(
      os.use(onFinish(async () => {})),
    ).toEqualTypeOf<ExpectedBuilder>()
  })
})
