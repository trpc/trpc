import type { MergedErrorMap, MergedSchema, MetaPlugin, ORPCErrorConstructorMap, Schema } from '@orpc/contract'
import type { BuilderWithInput, BuilderWithInputOutput, BuilderWithMiddlewares, BuilderWithOutput } from './builder-variants'
import type { MergedContext, MergedInitialContext } from './context'
import type { Lazy } from './lazy'
import type { Middleware, MiddlewareDone } from './middleware'
import type { DecoratedMiddleware } from './middleware-decorated'
import type { Procedure } from './procedure'
import type { DecoratedProcedure } from './procedure-decorated'
import type { AugmentedRouterWithMiddlewares } from './router-utils'
import { expectTypeOf } from 'vitest'
import { z } from 'zod'

const errorMap = {
  BASE: {
    data: z.object({ id: z.string() }),
    message: 'base',
  },
}

const schema1 = z.object({ schema1: z.number().transform(n => `${n}`) })
const schema2 = z.object({ schema2: z.number().transform(n => `${n}`) })

describe('BuilderWithMiddlewares', () => {
  const builder = {} as BuilderWithMiddlewares<{ auth: boolean }, { extra: boolean }, typeof errorMap>

  it('.meta', () => {
    const plugin = { name: 'test', init: (m: any) => m }
    expectTypeOf(builder.meta(plugin)).toEqualTypeOf<typeof builder>()

    // @ts-expect-error - invalid meta
    builder.meta({} as MetaPlugin<Schema<'invalid'>, any, any>)
  })

  it('.errors', () => {
    expectTypeOf(builder.errors({ INVALID: { message: 'invalid' } })).toEqualTypeOf<
      BuilderWithMiddlewares<
        { auth: boolean },
        { extra: boolean },
        MergedErrorMap<typeof errorMap, { INVALID: { message: string } }>
      >
    >()

    // @ts-expect-error - schema is invalid
    builder.errors({ TOO_MANY_REQUESTS: { data: {} } })
  })

  describe('.use', () => {
    it('inline middleware', () => {
      const decorated = builder.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<unknown>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<unknown>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()

        return next({ context: { more: 'yes' } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        BuilderWithMiddlewares<
          { auth: boolean },
          { extra: boolean } & { more: string },
          typeof errorMap
        >
      >()

      // @ts-expect-error - input is invalid
      void builder.use(({ next }, input: 'invalid') => next({}))

      // @ts-expect-error - output is invalid
      void builder.use(({ next }, input, done: MiddlewareDone<'invalid'>) => next({}))

      // @ts-expect-error - conflict with current TInitialContext
      void builder.use(({ next }) => next({ context: { auth: 'invalid' } }))

      // @ts-expect-error - conflict with current TInjectedContext
      void builder.use(({ next }) => next({ context: { extra: 'invalid' } }))
    })

    it('outline middleware', () => {
      const middleware = {} as Middleware<{ auth: boolean, extra: boolean, g?: boolean }, { more: string }, unknown, any, { SOME_ERROR: { message: string } }>

      expectTypeOf(builder.use(middleware)).toEqualTypeOf<
        BuilderWithMiddlewares<
          MergedInitialContext<{ auth: boolean }, { extra: boolean }, { auth: boolean, extra: boolean, g?: boolean }>,
          MergedContext<{ extra: boolean }, { more: string }>,
          MergedErrorMap<{ SOME_ERROR: { message: string } }, typeof errorMap>
        >
      >()

      // @ts-expect-error - input is invalid
      void middleware.use({} as Middleware<object, object, 'invalid', any, object>)

      // @ts-expect-error - output is invalid
      void middleware.use({} as Middleware<object, object, unknown, 'invalid', object>)

      // @ts-expect-error - TInContext is not satisfy expected
      void middleware.use({} as Middleware<{ does_not_satisfy: string }, object, unknown, any, object>)

      // @ts-expect-error - conflict with TInitialContext
      void builder.use({} as Middleware<object, { auth: 'invalid' }, unknown, any, object>)

      // @ts-expect-error - conflict with TInjectedContext
      void builder.use({} as Middleware<object, { extra: 'invalid' }, unknown, any, object>)
    })

    it('low-priority mid\'s errors and ignore conflicts', () => {
      const middleware = {} as Middleware<{ auth: boolean, extra: boolean }, object, unknown, any, { BASE: { message: 'CONFLICT' }, EXTRA: { message: string } }>

      expectTypeOf(builder.use(middleware)).toEqualTypeOf<
        BuilderWithMiddlewares<
          { auth: boolean },
          { extra: boolean },
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
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()

        return next()
      })).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, { extra: boolean }, unknown, any, typeof errorMap>
      >()
    })

    it('with TOutContext', () => {
      expectTypeOf(builder.middleware(({ next }) => next({ context: { more: 'yes' } }))).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, MergedContext<{ extra: boolean }, { more: string }>, unknown, any, typeof errorMap>
      >()

      // @ts-expect-error - conflict with TInitialContext
      void builder.middleware(({ next }) => next({ context: { auth: 'invalid' } }))

      // @ts-expect-error - conflict with TInjectedContext
      void builder.middleware(({ next }) => next({ context: { extra: 'invalid' } }))
    })

    it('with expected input', () => {
      expectTypeOf(builder.middleware(({ next }, input: { schema1: number }) => next({}))).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, { extra: boolean }, { schema1: number }, any, typeof errorMap>
      >()
    })

    it('with expected output', () => {
      expectTypeOf(builder.middleware(({ next }, input, done: MiddlewareDone<{ schema2: number }>) => next({}))).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, { extra: boolean }, unknown, { schema2: number }, typeof errorMap>
      >()
    })
  })

  it('.input', () => {
    expectTypeOf(builder.input(schema1)).toEqualTypeOf<
      BuilderWithInput<{ auth: boolean }, { extra: boolean }, typeof schema1, typeof errorMap>
    >()

    // @ts-expect-error - invalid schema
    builder.input({})
  })

  it('.output', () => {
    expectTypeOf(builder.output(schema2)).toEqualTypeOf<
      BuilderWithOutput<{ auth: boolean }, { extra: boolean }, typeof schema2, typeof errorMap>
    >()

    // @ts-expect-error - invalid schema
    builder.output({})
  })

  describe('.handler', () => {
    it('simple', () => {
      expectTypeOf(builder.handler(async ({ errors, context }, input) => {
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()
        expectTypeOf(input).toEqualTypeOf<unknown>()

        return 'out'
      })).toEqualTypeOf<
        DecoratedProcedure<
          { auth: boolean },
          { extra: boolean },
          Schema<void, unknown>,
          Schema<string>,
          typeof errorMap
        >
      >()
    })
  })

  it('.router', () => {
    const router = {
      ping: {} as Procedure<{ auth: boolean, extra: boolean }, object, Schema<void, unknown>, Schema<unknown>, object>,
      ping2: {} as Procedure<{ auth: boolean, extra: boolean, something?: boolean }, object, Schema<void, unknown>, Schema<unknown>, object>,
    }

    expectTypeOf(builder.router(router)).toEqualTypeOf<
      AugmentedRouterWithMiddlewares<typeof router, { auth: boolean }, { extra: boolean }, typeof errorMap>
    >()

    builder.router({
      // @ts-expect-error - extra is invalid
      ping: {} as Procedure<{ auth: boolean, extra: 'invalid' }, object, Schema<void, unknown>, Schema<unknown>, object>,
      // @ts-expect-error - something is required but missing in builder
      ping2: {} as Procedure<{ auth: boolean, something: boolean }, object, Schema<void, unknown>, Schema<unknown>, object>,
    })
  })

  it('.lazy', () => {
    const router = {
      ping: {} as Procedure<{ auth: boolean, extra: boolean }, object, Schema<void, unknown>, Schema<unknown>, object>,
      ping2: {} as Procedure<{ auth: boolean, extra: boolean, something?: boolean }, object, Schema<void, unknown>, Schema<unknown>, object>,
    }

    expectTypeOf(builder.lazy(async () => ({ default: router }))).toEqualTypeOf<
      Lazy<AugmentedRouterWithMiddlewares<typeof router, { auth: boolean }, { extra: boolean }, typeof errorMap>>
    >()

    // @ts-expect-error - extra is invalid and something is required but missing in builder
    builder.lazy(async () => ({
      default: {
        ping: {} as Procedure<{ auth: boolean, extra: 'invalid' }, object, Schema<void, unknown>, Schema<unknown>, object>,
        ping2: {} as Procedure<{ auth: boolean, something: boolean }, object, Schema<void, unknown>, Schema<unknown>, object>,
      },
    }))
  })
})

describe('BuilderWithInput', () => {
  const builder = {} as BuilderWithInput<{ auth: boolean }, { extra: boolean }, typeof schema1, typeof errorMap>

  it('.meta', () => {
    const plugin = { name: 'test', init: (m: any) => m }
    expectTypeOf(builder.meta(plugin)).toEqualTypeOf<typeof builder>()

    // @ts-expect-error - invalid meta
    builder.meta({} as MetaPlugin<Schema<'invalid'>, any, any>)
  })

  it('.errors', () => {
    expectTypeOf(builder.errors({ INVALID: { message: 'invalid' } })).toEqualTypeOf<
      BuilderWithInput<
        { auth: boolean },
        { extra: boolean },
        typeof schema1,
        MergedErrorMap<typeof errorMap, { INVALID: { message: string } }>
      >
    >()

    // @ts-expect-error - invalid errors
    builder.errors({ INTERNAL_SERVER_ERROR: { data: {} } })
  })

  describe('.use', () => {
    it('inline', () => {
      const decorated = builder.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<{ schema1: string }>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<unknown>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()

        return next({ context: { more: 'yes' } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        BuilderWithInput<
          { auth: boolean },
          MergedContext<{ extra: boolean }, { more: string }>,
          typeof schema1,
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
      void builder.use(({ next }) => next({ context: { auth: 'invalid' } }))

      // @ts-expect-error - conflict with TInjectedContext
      void builder.use(({ next }) => next({ context: { extra: 'invalid' } }))
    })

    it('outline middleware', () => {
      const middleware = {} as Middleware<{ auth: boolean, extra: boolean, g?: boolean }, { more: boolean }, unknown, any, { SOME_ERROR: { message: string } }>

      expectTypeOf(builder.use(middleware)).toEqualTypeOf<
        BuilderWithInput<
          MergedInitialContext<{ auth: boolean }, { extra: boolean }, { auth: boolean, extra: boolean, g?: boolean }>,
          MergedContext<{ extra: boolean }, { more: boolean }>,
          typeof schema1,
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

      // @ts-expect-error - conflict with TInjectedContext
      void builder.use({} as Middleware<object, { extra: 'invalid' }, unknown, any, object>)
    })

    it('low-priority mid\'s errors and ignore conflicts', () => {
      const middleware = {} as Middleware<{ auth: boolean }, object, unknown, any, { BASE: { message: 'CONFLICT' }, EXTRA: { message: string } }>

      expectTypeOf(builder.use(middleware)).toEqualTypeOf<
        BuilderWithInput<
          { auth: boolean },
          { extra: boolean },
          typeof schema1,
          MergedErrorMap<{ EXTRA: { message: string } }, typeof errorMap>
        >
      >()
    })
  })

  it('.input', () => {
    expectTypeOf(builder.input(schema2)).toEqualTypeOf<
      BuilderWithInput<
        { auth: boolean },
        { extra: boolean },
        MergedSchema<typeof schema2, typeof schema1>,
        typeof errorMap
      >
    >()

    // @ts-expect-error - invalid schema
    builder.input({})
  })

  it('.output', () => {
    expectTypeOf(builder.output(schema2)).toEqualTypeOf<
      BuilderWithInputOutput<{ auth: boolean }, { extra: boolean }, typeof schema1, typeof schema2, typeof errorMap>
    >()

    // @ts-expect-error - invalid schema
    builder.output({})
  })

  describe('.handler', () => {
    it('simple', () => {
      expectTypeOf(builder.handler(async ({ errors, context }, input) => {
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()
        expectTypeOf(input).toEqualTypeOf<{ schema1: string }>()

        return 'out'
      })).toEqualTypeOf<
        DecoratedProcedure<
          { auth: boolean },
          { extra: boolean },
          typeof schema1,
          Schema<string>,
          typeof errorMap
        >
      >()
    })
  })
})

describe('BuilderWithOutput', () => {
  const builder = {} as BuilderWithOutput<{ auth: boolean }, { extra: boolean }, typeof schema2, typeof errorMap>

  it('.meta', () => {
    const plugin = { name: 'test', init: (m: any) => m }
    expectTypeOf(builder.meta(plugin)).toEqualTypeOf<typeof builder>()

    // @ts-expect-error - invalid meta
    builder.meta({} as MetaPlugin<Schema<'invalid'>, any, any>)
  })

  it('.errors', () => {
    expectTypeOf(builder.errors({ INVALID: { message: 'invalid' } })).toEqualTypeOf<
      BuilderWithOutput<
        { auth: boolean },
        { extra: boolean },
        typeof schema2,
        MergedErrorMap<typeof errorMap, { INVALID: { message: string } }>
      >
    >()

    // @ts-expect-error - invalid errors
    builder.errors({ INTERNAL_SERVER_ERROR: { data: {} } })
  })

  describe('.use', () => {
    it('inline', () => {
      const decorated = builder.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<unknown>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<{ schema2: number }>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()

        return next({ context: { more: 'yes' } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        BuilderWithOutput<
          { auth: boolean },
          MergedContext<{ extra: boolean }, { more: string }>,
          typeof schema2,
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
      void builder.use(({ next }) => next({ context: { auth: 'invalid' } }))

      // @ts-expect-error - conflict with TInjectedContext
      void builder.use(({ next }) => next({ context: { extra: 'invalid' } }))
    })

    it('outline middleware', () => {
      const middleware = {} as Middleware<{ auth: boolean, extra: boolean, g?: boolean }, { more: boolean }, unknown, any, { SOME_ERROR: { message: string } }>

      expectTypeOf(builder.use(middleware)).toEqualTypeOf<
        BuilderWithOutput<
          MergedInitialContext<{ auth: boolean }, { extra: boolean }, { auth: boolean, extra: boolean, g?: boolean }>,
          MergedContext<{ extra: boolean }, { more: boolean }>,
          typeof schema2,
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

      // @ts-expect-error - conflict with TInjectedContext
      void builder.use({} as Middleware<object, { extra: 'invalid' }, unknown, any, object>)
    })

    it('low-priority mid\'s errors and ignore conflicts', () => {
      const middleware = {} as Middleware<{ auth: boolean }, object, unknown, any, { BASE: { message: 'CONFLICT' }, EXTRA: { message: string } }>

      expectTypeOf(builder.use(middleware)).toEqualTypeOf<
        BuilderWithOutput<
          { auth: boolean },
          { extra: boolean },
          typeof schema2,
          MergedErrorMap<{ EXTRA: { message: string } }, typeof errorMap>
        >
      >()
    })
  })

  it('.input', () => {
    expectTypeOf(builder.input(schema1)).toEqualTypeOf<
      BuilderWithInputOutput<{ auth: boolean }, { extra: boolean }, typeof schema1, typeof schema2, typeof errorMap>
    >()

    // @ts-expect-error - invalid schema
    builder.input({})
  })

  it('.output', () => {
    expectTypeOf(builder.output(schema1)).toEqualTypeOf<
      BuilderWithOutput<
        { auth: boolean },
        { extra: boolean },
        MergedSchema<typeof schema1, typeof schema2>,
        typeof errorMap
      >
    >()

    // @ts-expect-error - invalid schema
    builder.output({})
  })

  describe('.handler', () => {
    it('simple', () => {
      const procedure = builder.handler(async ({ errors, context }, input) => {
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()
        expectTypeOf(input).toEqualTypeOf<unknown>()

        return { schema2: 123 }
      })

      expectTypeOf(procedure).toEqualTypeOf<
        DecoratedProcedure<
          { auth: boolean },
          { extra: boolean },
          Schema<void, unknown>,
          typeof schema2,
          typeof errorMap
        >
      >()

      // @ts-expect-error - output is invalid
      void builder.handler(async ({ errors, context }, input) => {
        return 'invalid'
      })
    })
  })
})

describe('BuilderWithInputOutput', () => {
  const builder = {} as BuilderWithInputOutput<{ auth: boolean }, { extra: boolean }, typeof schema1, typeof schema2, typeof errorMap>

  it('.meta', () => {
    const plugin = { name: 'test', init: (m: any) => m }
    expectTypeOf(builder.meta(plugin)).toEqualTypeOf<typeof builder>()

    // @ts-expect-error - invalid meta
    builder.meta({} as MetaPlugin<Schema<'invalid'>, any, any>)
  })

  it('.errors', () => {
    expectTypeOf(builder.errors({ INVALID: { message: 'invalid' } })).toEqualTypeOf<
      BuilderWithInputOutput<
        { auth: boolean },
        { extra: boolean },
        typeof schema1,
        typeof schema2,
        MergedErrorMap<typeof errorMap, { INVALID: { message: string } }>
      >
    >()

    // @ts-expect-error - invalid errors
    builder.errors({ INTERNAL_SERVER_ERROR: { data: {} } })
  })

  describe('.use', () => {
    it('inline', () => {
      const decorated = builder.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<{ schema1: string }>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<{ schema2: number }>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()

        return next({ context: { more: 'yes' } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        BuilderWithInputOutput<
          { auth: boolean },
          MergedContext<{ extra: boolean }, { more: string }>,
          typeof schema1,
          typeof schema2,
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
      void builder.use(({ next }) => next({ context: { auth: 'invalid' } }))

      // @ts-expect-error - conflict with TInjectedContext
      void builder.use(({ next }) => next({ context: { extra: 'invalid' } }))
    })

    it('outline middleware', () => {
      const middleware = {} as Middleware<{ auth: boolean, extra: boolean, g?: boolean }, { more: boolean }, unknown, any, { SOME_ERROR: { message: string } }>

      expectTypeOf(builder.use(middleware)).toEqualTypeOf<
        BuilderWithInputOutput<
          MergedInitialContext<{ auth: boolean }, { extra: boolean }, { auth: boolean, extra: boolean, g?: boolean }>,
          MergedContext<{ extra: boolean }, { more: boolean }>,
          typeof schema1,
          typeof schema2,
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

      // @ts-expect-error - conflict with TInjectedContext
      void builder.use({} as Middleware<object, { extra: 'invalid' }, unknown, any, object>)
    })

    it('low-priority mid\'s errors and ignore conflicts', () => {
      const middleware = {} as Middleware<{ auth: boolean }, object, unknown, any, { BASE: { message: 'CONFLICT' }, EXTRA: { message: string } }>

      expectTypeOf(builder.use(middleware)).toEqualTypeOf<
        BuilderWithInputOutput<
          { auth: boolean },
          { extra: boolean },
          typeof schema1,
          typeof schema2,
          MergedErrorMap<{ EXTRA: { message: string } }, typeof errorMap>
        >
      >()
    })
  })

  it('.input', () => {
    expectTypeOf(builder.input(schema2)).toEqualTypeOf<
      BuilderWithInputOutput<
        { auth: boolean },
        { extra: boolean },
        MergedSchema<typeof schema2, typeof schema1>,
        typeof schema2,
        typeof errorMap
      >
    >()

    // @ts-expect-error - invalid schema
    builder.input({})
  })

  it('.output', () => {
    expectTypeOf(builder.output(schema1)).toEqualTypeOf<
      BuilderWithInputOutput<
        { auth: boolean },
        { extra: boolean },
        typeof schema1,
        MergedSchema<typeof schema1, typeof schema2>,
        typeof errorMap
      >
    >()

    // @ts-expect-error - invalid schema
    builder.output({})
  })

  describe('.handler', () => {
    it('simple', () => {
      const procedure = builder.handler(async ({ errors, context }, input) => {
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()
        expectTypeOf(input).toEqualTypeOf<z.output<typeof schema1>>()

        return { schema2: 123 }
      })

      expectTypeOf(procedure).toEqualTypeOf<
        DecoratedProcedure<
          { auth: boolean },
          { extra: boolean },
          typeof schema1,
          typeof schema2,
          typeof errorMap
        >
      >()

      // @ts-expect-error invalid return type
      builder.handler(() => 'invalid')
    })
  })
})
