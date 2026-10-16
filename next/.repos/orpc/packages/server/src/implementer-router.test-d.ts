import type { InferRouterContractErrorMap, ORPCErrorConstructorMap, ProcedureContract, Schema } from '@orpc/contract'
import type { MergedContext, MergedInitialContext } from './context'
import type { ProcedureImplementer } from './implementer-procedure'
import type { RouterImplementer, RouterImplementerWithMiddlewares, SharedRouterImplementer, SharedRouterImplementerWithMiddlewares } from './implementer-router'
import type { Middleware, MiddlewareDone } from './middleware'
import type { DecoratedMiddleware } from './middleware-decorated'
import type { Procedure } from './procedure'
import type { AugmentedRouterWithMiddlewares } from './router-utils'
import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { Lazy } from './lazy'

const errorMap = {
  BASE: {
    data: z.object({ id: z.string() }),
    message: 'base',
  },
}

// Schemas should have distinct TInput and TOutput types to ensure correct inference.
const schema1 = z.object({ schema1: z.number().transform(n => `${n}`) })
const schema2 = z.object({ schema2: z.string().transform(n => Number(n)) })
const schema3 = z.object({ schema3: z.boolean().transform(n => `${n}`) })

const contract = {
  ping: {} as ProcedureContract<typeof schema1, typeof schema2, typeof errorMap>,
  nested: {
    pong: {} as ProcedureContract<typeof schema2, typeof schema1, object>,
  },

  // ensure can handle procedure/router with name that conflict with implementer methods
  use: {} as ProcedureContract<typeof schema3, typeof schema3, object>,
  middleware: {} as ProcedureContract<typeof schema1, typeof schema1, object>,
  router: {
    router: {} as ProcedureContract<typeof schema2, typeof schema2, object>,
  },
  lazy: {
    lazy: {} as ProcedureContract<typeof schema2, typeof schema2, object>,
  },
}

type TContract = typeof contract

describe('RouterImplementer', () => {
  const implementer = {} as RouterImplementer<TContract, { auth: boolean }>

  describe('deep access', () => {
    it('normal', () => {
      expectTypeOf(implementer.ping).toEqualTypeOf<
        ProcedureImplementer<{ auth: boolean }, object, typeof schema1, typeof schema2, typeof errorMap>
      >()

      expectTypeOf(implementer.nested).toEqualTypeOf<
        RouterImplementer<TContract['nested'], { auth: boolean }>
      >()

      expectTypeOf(implementer.nested.pong).toEqualTypeOf<
        ProcedureImplementer<{ auth: boolean }, object, typeof schema2, typeof schema1, object>
      >()
    })

    it('conflict procedure/router names with implementer methods', () => {
      expectTypeOf(implementer.use).toEqualTypeOf<
        & SharedRouterImplementer<TContract, { auth: boolean }>['use']
        & ProcedureImplementer<{ auth: boolean }, object, typeof schema3, typeof schema3, object>
      >()

      expectTypeOf(implementer.middleware).toEqualTypeOf<
        & SharedRouterImplementer<TContract, { auth: boolean }>['middleware']
        & ProcedureImplementer<{ auth: boolean }, object, typeof schema1, typeof schema1, object>
      >()

      expectTypeOf(implementer.router).toEqualTypeOf<
        & SharedRouterImplementer<TContract, { auth: boolean }>['router']
        & RouterImplementer<TContract['router'], { auth: boolean }>
      >()

      expectTypeOf(implementer.router.router).toEqualTypeOf<
        & SharedRouterImplementer<TContract['router'], { auth: boolean }>['router']
        & ProcedureImplementer<{ auth: boolean }, object, typeof schema2, typeof schema2, object>
      >()

      expectTypeOf(implementer.lazy).toEqualTypeOf<
        & SharedRouterImplementer<TContract, { auth: boolean }>['lazy']
        & RouterImplementer<TContract['lazy'], { auth: boolean }>
      >()

      expectTypeOf(implementer.lazy.lazy).toEqualTypeOf<
        & SharedRouterImplementer<TContract['lazy'], { auth: boolean }>['lazy']
        & ProcedureImplementer<{ auth: boolean }, object, typeof schema2, typeof schema2, object>
      >()
    })
  })

  describe('.use', () => {
    it('inline middleware', () => {
      const decorated = implementer.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<unknown>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<unknown>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<InferRouterContractErrorMap<TContract>>>()
        expectTypeOf(context).toEqualTypeOf<{ auth: boolean }>()

        if ('BASE' in errors) {
          expectTypeOf(errors.BASE).toBeFunction()
        }

        return next({ context: { more: 'yes' } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        RouterImplementerWithMiddlewares<
          TContract,
          { auth: boolean },
          { more: string }
        >
      >()

      // @ts-expect-error - input is invalid
      void implementer.use(({ next }, input: 'invalid') => next({}))

      // @ts-expect-error - output is invalid
      void implementer.use(({ next }, input, done: MiddlewareDone<'invalid'>) => next({}))

      // @ts-expect-error - conflict with TInitialContext
      void implementer.use(({ next }) => next({ context: { auth: 'invalid' } }))
    })

    it('outline middleware', () => {
      const middleware = {} as Middleware<{ auth: boolean, g?: boolean }, { more: string }, unknown, any, { SOME_ERROR: { message: string } }>

      expectTypeOf(implementer.use(middleware)).toEqualTypeOf<
        RouterImplementerWithMiddlewares<
          TContract,
          MergedInitialContext<{ auth: boolean }, object, { auth: boolean, g?: boolean }>,
          { more: string }
        >
      >()

      // @ts-expect-error - context is invalid
      implementer.use({} as Middleware<{ invalid: string }, object, unknown, any, object>)

      // @ts-expect-error - conflict with TInitialContext
      implementer.use({} as Middleware<object, { auth: 'invalid' }, unknown, any, object>)
    })

    it('deep access', () => {
      const decorated = implementer.nested.use(({ next }) => next({ context: { extra: true } }))

      expectTypeOf(decorated).toEqualTypeOf<
        RouterImplementerWithMiddlewares<
          TContract['nested'],
          { auth: boolean },
          { extra: boolean }
        >
      >()
    })

    it('conflict procedure/router names with implementer methods', () => {
      const decorated = implementer.use(({ next }) => next({ context: { more: true } }))

      expectTypeOf(decorated).toEqualTypeOf<
        RouterImplementerWithMiddlewares<
          TContract,
          { auth: boolean },
          { more: boolean }
        >
      >()
    })
  })

  describe('.middleware', () => {
    it('pure', () => {
      // default expected TOutput should = any to ensure this middleware can be used in any procedure

      const mid = implementer.middleware(({ next, context, errors }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<unknown>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<any>>()
        expectTypeOf(context).toEqualTypeOf<{ auth: boolean }>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<InferRouterContractErrorMap<TContract>>>()

        if ('BASE' in errors) {
          expectTypeOf(errors.BASE).toBeFunction()
        }

        return next()
      })

      expectTypeOf(mid).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, object, unknown, any, object>
      >()
    })

    it('with TOutContext', () => {
      expectTypeOf(implementer.middleware(({ next }) => next({ context: { more: 'yes' } }))).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, { more: string }, unknown, any, object>
      >()

      // @ts-expect-error - conflict with TInitialContext
      implementer.middleware(({ next }) => next({ context: { auth: 'invalid' } }))
    })

    it('with expected input', () => {
      expectTypeOf(implementer.middleware(({ next }, input: { schema1: number }) => next({}))).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, object, { schema1: number }, any, object>
      >()
    })

    it('with expected output', () => {
      expectTypeOf(implementer.middleware(({ next }, input, done: MiddlewareDone<{ schema2: number }>) => next({}))).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, object, unknown, { schema2: number }, object>
      >()
    })

    it('deep access', () => {
      const mid = implementer.nested.middleware(({ next }) => next({ context: { more: true } }))

      expectTypeOf(mid).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, { more: boolean }, unknown, any, object>
      >()
    })

    it('conflict procedure/router names with implementer methods', () => {
      const mid = implementer.middleware(({ next }) => next({ context: { more: true } }))

      expectTypeOf(mid).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, { more: boolean }, unknown, any, object>
      >()
    })
  })

  describe('.router', () => {
    it('works', () => {
      const router = {
        ping: {} as Procedure<{ anything: boolean }, object, typeof schema1, typeof schema2, typeof errorMap>,
        nested: {
          pong: {} as Procedure<{ anything: boolean, optional?: boolean }, { anything: boolean }, typeof schema2, typeof schema1, object>,
        },

        use: {} as Procedure<{ anything: boolean }, object, typeof schema3, typeof schema3, object>,
        middleware: {} as Procedure<{ anything: boolean }, object, typeof schema1, typeof schema1, object>,
        router: {
          router: {} as Procedure<{ anything: boolean }, object, typeof schema2, typeof schema2, object>,
        },
        lazy: new Lazy({
          loader: () => Promise.resolve({ default: {
            lazy: {} as Procedure<{ anything: boolean }, object, typeof schema2, typeof schema2, object>,
          } }),
          meta: {},
        }),
      }

      const implemented = implementer.router(router)

      expectTypeOf(implemented).toEqualTypeOf<typeof router>()

      implementer.router({
        // @ts-expect-error - error map is conflict
        ping: {} as Procedure<{ anything: boolean }, object, typeof schema1, typeof schema2, { BASE: { data: typeof schema1 } }>,

        nested: {
          // @ts-expect-error - input schema is conflict
          pong: {} as Procedure<{ anything: boolean, optional?: boolean }, { anything: boolean }, Schema<'invalid'>, typeof schema1, object>,
        },

        // @ts-expect-error - output schema is conflict
        use: {} as Procedure<{ anything: boolean }, object, typeof schema3, typeof schema1, object>,

        // @ts-expect-error - missing procedures
        router: {},
        // @ts-expect-error - missing procedures
        lazy: new Lazy({
          loader: () => Promise.resolve({ default: { } }),
          meta: {},
        }),
      })
    })

    it('deep access', () => {
      const router = {
        pong: {} as Procedure<{ anything: boolean, something?: boolean }, { anything: boolean }, typeof schema2, typeof schema1, object>,
      }

      const implemented = implementer.nested.router(router)

      expectTypeOf(implemented).toEqualTypeOf<typeof router>()

      implementer.nested.router({
        // @ts-expect-error - expect a procedure
        pong: {},
      })
    })

    it('conflict method', () => {
      const router = {
        router: {} as Procedure<{ anything: boolean }, object, typeof schema2, typeof schema2, object>,
      }

      const implemented = implementer.router.router(router)

      expectTypeOf(implemented).toEqualTypeOf<typeof router>()

      implementer.router.router({
        // @ts-expect-error - input schema is conflict
        router: {} as Procedure<{ anything: boolean }, object, Schema<'invalid'>, typeof schema2, object>,
      })
    })
  })

  describe('.lazy', () => {
    it('works', () => {
      const router = {
        ping: {} as Procedure<{ anything: boolean, extra: boolean }, object, typeof schema1, typeof schema2, typeof errorMap>,
        nested: {
          pong: {} as Procedure<{ anything: boolean, optional?: boolean }, { anything: boolean }, typeof schema2, typeof schema1, object>,
        },

        use: {} as Procedure<{ anything: boolean }, object, typeof schema3, typeof schema3, object>,
        middleware: {} as Procedure<{ anything: boolean }, object, typeof schema1, typeof schema1, object>,
        router: {
          router: {} as Procedure<{ anything: boolean }, object, typeof schema2, typeof schema2, object>,
        },
        lazy: new Lazy({
          loader: () => Promise.resolve({ default: {
            lazy: {} as Procedure<{ anything: boolean }, object, typeof schema2, typeof schema2, object>,
          } }),
          meta: {},
        }),
      }

      const implemented = implementer.lazy(() => Promise.resolve({ default: router }))

      expectTypeOf(implemented).toEqualTypeOf<Lazy<typeof router>>()

      // @ts-expect-error - invalid loader
      implementer.lazy(() => Promise.resolve({ default: {
        ping: {} as Procedure<{ anything: boolean }, object, typeof schema1, typeof schema2, { BASE: { data: typeof schema1 } }>,

        nested: {
          pong: {} as Procedure<{ anything: boolean, optional?: boolean }, { anything: boolean }, Schema<'invalid'>, typeof schema1, object>,
        },

        use: {} as Procedure<{ anything: boolean }, object, typeof schema3, typeof schema1, object>,

        middleware: {} as Procedure<{ anything: boolean }, object, typeof schema1, typeof schema1, object>,

        router: {},

        lazy: new Lazy({
          loader: () => Promise.resolve({ default: {} }),
          meta: {},
        }),
      } }))
    })

    it('deep access', () => {
      const router = {
        pong: {} as Procedure<{ anything: boolean, something?: boolean }, { anything: boolean }, typeof schema2, typeof schema1, object>,
      }

      const implemented = implementer.nested.lazy(() => Promise.resolve({ default: router }))

      expectTypeOf(implemented).toEqualTypeOf<Lazy<typeof router>>()

      // @ts-expect-error - expect a procedure
      implementer.nested.lazy(() => Promise.resolve({ default: {
        pong: {},
      } }))
    })

    it('conflict method', () => {
      const router = {
        lazy: {} as Procedure<{ auth: boolean }, object, typeof schema2, typeof schema2, object>,
      }

      const implemented = implementer.lazy.lazy(() => Promise.resolve({ default: router }))

      expectTypeOf(implemented).toEqualTypeOf<Lazy<typeof router>>()

      // @ts-expect-error - input schema is conflict
      implementer.lazy.lazy(() => Promise.resolve({ default: {
        lazy: {} as Procedure<{ anything: boolean }, object, Schema<'invalid'>, typeof schema2, object>,
      } }))
    })
  })

  describe('edge case', () => {
    it('is procedure implementer if implementer for single procedure', () => {
      expectTypeOf<RouterImplementer<TContract['ping'], { auth: boolean }>>()
        .toEqualTypeOf<ProcedureImplementer<{ auth: boolean }, object, typeof schema1, typeof schema2, typeof errorMap>>()
    })
  })
})

describe('RouterImplementerWithMiddlewares', () => {
  const implementer = {} as RouterImplementerWithMiddlewares<TContract, { auth: boolean }, { extra: boolean }>

  describe('deep access', () => {
    it('normal', () => {
      expectTypeOf(implementer.ping).toEqualTypeOf<
        ProcedureImplementer<{ auth: boolean }, { extra: boolean }, typeof schema1, typeof schema2, typeof errorMap>
      >()

      expectTypeOf(implementer.nested).toEqualTypeOf<
        RouterImplementerWithMiddlewares<TContract['nested'], { auth: boolean }, { extra: boolean }>
      >()

      expectTypeOf(implementer.nested.pong).toEqualTypeOf<
        ProcedureImplementer<{ auth: boolean }, { extra: boolean }, typeof schema2, typeof schema1, object>
      >()
    })

    it('conflict methods', () => {
      expectTypeOf(implementer.use).toEqualTypeOf<
        & SharedRouterImplementerWithMiddlewares<TContract, { auth: boolean }, { extra: boolean }>['use']
        & ProcedureImplementer<{ auth: boolean }, { extra: boolean }, typeof schema3, typeof schema3, object>
      >()

      expectTypeOf(implementer.middleware).toEqualTypeOf<
        & SharedRouterImplementerWithMiddlewares<TContract, { auth: boolean }, { extra: boolean }>['middleware']
        & ProcedureImplementer<{ auth: boolean }, { extra: boolean }, typeof schema1, typeof schema1, object>
      >()

      expectTypeOf(implementer.router).toEqualTypeOf<
        & SharedRouterImplementerWithMiddlewares<TContract, { auth: boolean }, { extra: boolean }>['router']
        & RouterImplementerWithMiddlewares<TContract['router'], { auth: boolean }, { extra: boolean }>
      >()

      expectTypeOf(implementer.router.router).toEqualTypeOf<
        & SharedRouterImplementerWithMiddlewares<TContract['router'], { auth: boolean }, { extra: boolean }>['router']
        & ProcedureImplementer<{ auth: boolean }, { extra: boolean }, typeof schema2, typeof schema2, object>
      >()

      expectTypeOf(implementer.lazy).toEqualTypeOf<
        & SharedRouterImplementerWithMiddlewares<TContract, { auth: boolean }, { extra: boolean }>['lazy']
        & RouterImplementerWithMiddlewares<TContract['lazy'], { auth: boolean }, { extra: boolean }>
      >()

      expectTypeOf(implementer.lazy.lazy).toEqualTypeOf<
        & SharedRouterImplementerWithMiddlewares<TContract['lazy'], { auth: boolean }, { extra: boolean }>['lazy']
        & ProcedureImplementer<{ auth: boolean }, { extra: boolean }, typeof schema2, typeof schema2, object>
      >()
    })
  })

  describe('.use', () => {
    it('inline middleware', () => {
      const decorated = implementer.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<unknown>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<unknown>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<InferRouterContractErrorMap<TContract>>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()

        if ('BASE' in errors) {
          expectTypeOf(errors.BASE).toBeFunction()
        }

        return next({ context: { more: 'yes' } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        RouterImplementerWithMiddlewares<
          TContract,
          { auth: boolean },
          MergedContext<{ extra: boolean }, { more: string }>
        >
      >()

      // @ts-expect-error - input is invalid
      void implementer.use(({ next }, input: 'invalid') => next({}))

      // @ts-expect-error - output is invalid
      void implementer.use(({ next }, input, done: MiddlewareDone<'invalid'>) => next({}))

      // @ts-expect-error - conflict with TInitialContext
      void implementer.use(({ next }) => next({ context: { auth: 'invalid' } }))

      // @ts-expect-error - conflict with TInjectedContext
      void implementer.use(({ next }) => next({ context: { extra: 'invalid' } }))
    })

    it('outline middleware', () => {
      const middleware = {} as Middleware<{ auth: boolean, g?: boolean }, { more: string }, unknown, any, { SOME_ERROR: { message: string } }>

      expectTypeOf(implementer.use(middleware)).toEqualTypeOf<
        RouterImplementerWithMiddlewares<
          TContract,
          MergedInitialContext<{ auth: boolean }, { extra: boolean }, { auth: boolean, g?: boolean }>,
          MergedContext<{ extra: boolean }, { more: string }>
        >
      >()

      // @ts-expect-error - context is invalid
      implementer.use({} as Middleware<{ invalid: string }, object, unknown, any, object>)

      // @ts-expect-error - conflict with TInitialContext
      implementer.use({} as Middleware<object, { auth: 'invalid' }, unknown, any, object>)

      // @ts-expect-error - conflict with TInjectedContext
      implementer.use({} as Middleware<object, { extra: 'invalid' }, unknown, any, object>)
    })

    it('deep access', () => {
      const decorated = implementer.nested.use(({ next }) => next({ context: { more: true } }))

      expectTypeOf(decorated).toEqualTypeOf<
        RouterImplementerWithMiddlewares<
          TContract['nested'],
          { auth: boolean },
          MergedContext<{ extra: boolean }, { more: boolean }>
        >
      >()
    })

    it('conflict procedure/router names with implementer methods', () => {
      const decorated = implementer.use(({ next }) => next({ context: { more: true } }))

      expectTypeOf(decorated).toEqualTypeOf<
        RouterImplementerWithMiddlewares<
          TContract,
          { auth: boolean },
          MergedContext<{ extra: boolean }, { more: boolean }>
        >
      >()
    })
  })

  describe('.middleware', () => {
    it('pure', () => {
      // default expected TOutput should = any to ensure this middleware can be used in any procedure

      const mid = implementer.middleware(({ next, context, errors }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<unknown>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<any>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { extra: boolean }>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<InferRouterContractErrorMap<TContract>>>()

        if ('BASE' in errors) {
          expectTypeOf(errors.BASE).toBeFunction()
        }

        return next()
      })

      expectTypeOf(mid).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, { extra: boolean }, unknown, any, object>
      >()
    })

    it('with TOutContext', () => {
      expectTypeOf(implementer.middleware(({ next }) => next({ context: { more: 'yes' } }))).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, MergedContext<{ extra: boolean }, { more: string }>, unknown, any, object>
      >()

      // @ts-expect-error - conflict with TInitialContext
      implementer.middleware(({ next }) => next({ context: { auth: 'invalid' } }))

      // @ts-expect-error - conflict with TInjectedContext
      implementer.middleware(({ next }) => next({ context: { extra: 'invalid' } }))
    })

    it('with expected input', () => {
      expectTypeOf(implementer.middleware(({ next }, input: { schema1: number }) => next({}))).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, { extra: boolean }, { schema1: number }, any, object>
      >()
    })

    it('with expected output', () => {
      expectTypeOf(implementer.middleware(({ next }, input, done: MiddlewareDone<{ schema2: number }>) => next({}))).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, { extra: boolean }, unknown, { schema2: number }, object>
      >()
    })

    it('deep access', () => {
      const mid = implementer.nested.middleware(({ next }) => next({ context: { more: true } }))

      expectTypeOf(mid).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, MergedContext<{ extra: boolean }, { more: boolean }>, unknown, any, object>
      >()
    })

    it('conflict procedure/router names with implementer methods', () => {
      const mid = implementer.middleware(({ next }) => next({ context: { more: true } }))

      expectTypeOf(mid).toEqualTypeOf<
        DecoratedMiddleware<{ auth: boolean }, MergedContext<{ extra: boolean }, { more: boolean }>, unknown, any, object>
      >()
    })
  })

  describe('.router', () => {
    it('works', () => {
      const router = {
        ping: {} as Procedure<{ auth: boolean, extra: boolean }, object, typeof schema1, typeof schema2, typeof errorMap>,
        nested: {
          pong: {} as Procedure<{ auth: boolean, optional?: boolean }, { anything: boolean }, typeof schema2, typeof schema1, object>,
        },

        use: {} as Procedure<{ auth: boolean }, object, typeof schema3, typeof schema3, object>,
        middleware: {} as Procedure<{ auth: boolean }, object, typeof schema1, typeof schema1, object>,
        router: {
          router: {} as Procedure<{ auth: boolean }, object, typeof schema2, typeof schema2, object>,
        },
        lazy: new Lazy({
          loader: () => Promise.resolve({ default: {
            lazy: {} as Procedure<{ auth: boolean }, object, typeof schema2, typeof schema2, object>,
          } }),
          meta: {},
        }),
      }

      const implemented = implementer.router(router)

      expectTypeOf(implemented).toEqualTypeOf<
        AugmentedRouterWithMiddlewares<
          typeof router,
          { auth: boolean },
          { extra: boolean },
          object
        >
      >()

      implementer.router({
        // @ts-expect-error - error map is conflict
        ping: {} as Procedure<{ auth: boolean }, object, typeof schema1, typeof schema2, { BASE: { data: typeof schema1 } }>,

        nested: {
          // @ts-expect-error - input schema is conflict
          pong: {} as Procedure<{ auth: boolean, optional?: boolean }, { anything: boolean }, Schema<'invalid'>, typeof schema1, object>,
        },

        // @ts-expect-error - output schema is conflict
        use: {} as Procedure<{ auth: boolean }, object, typeof schema3, typeof schema1, object>,

        // @ts-expect-error - missing procedures
        router: {},
        // @ts-expect-error - context is conflict
        lazy: new Lazy({
          loader: () => Promise.resolve({ default: {
            lazy: {} as Procedure<{ auth: 'invalid' }, object, typeof schema2, typeof schema2, object>,
          } }),
          meta: {},
        }),
      })
    })

    it('deep access', () => {
      const router = {
        pong: {} as Procedure<{ auth: boolean, something?: boolean }, { anything: boolean }, typeof schema2, typeof schema1, object>,
      }

      const implemented = implementer.nested.router(router)

      expectTypeOf(implemented).toEqualTypeOf<
        AugmentedRouterWithMiddlewares<
          typeof router,
          { auth: boolean },
          { extra: boolean },
          object
        >
      >()

      implementer.nested.router({
        // @ts-expect-error - expect a procedure
        pong: {},
      })
    })

    it('conflict method', () => {
      const router = {
        router: {} as Procedure<{ auth: boolean }, object, typeof schema2, typeof schema2, object>,
      }

      const implemented = implementer.router.router(router)

      expectTypeOf(implemented).toEqualTypeOf<
        AugmentedRouterWithMiddlewares<
          typeof router,
          { auth: boolean },
          { extra: boolean },
          object
        >
      >()

      implementer.router.router({
        // @ts-expect-error - input schema is conflict
        router: {} as Procedure<{ auth: boolean }, object, Schema<'invalid'>, typeof schema2, object>,
      })
    })
  })

  describe('.lazy', () => {
    it('works', () => {
      const router = {
        ping: {} as Procedure<{ auth: boolean, extra: boolean }, object, typeof schema1, typeof schema2, typeof errorMap>,
        nested: {
          pong: {} as Procedure<{ auth: boolean, optional?: boolean }, { anything: boolean }, typeof schema2, typeof schema1, object>,
        },

        use: {} as Procedure<{ auth: boolean }, object, typeof schema3, typeof schema3, object>,
        middleware: {} as Procedure<{ auth: boolean }, object, typeof schema1, typeof schema1, object>,
        router: {
          router: {} as Procedure<{ auth: boolean }, object, typeof schema2, typeof schema2, object>,
        },
        lazy: new Lazy({
          loader: () => Promise.resolve({ default: {
            lazy: {} as Procedure<{ auth: boolean }, object, typeof schema2, typeof schema2, object>,
          } }),
          meta: {},
        }),
      }

      const implemented = implementer.lazy(() => Promise.resolve({ default: router }))

      expectTypeOf(implemented).toEqualTypeOf<
        Lazy<
          AugmentedRouterWithMiddlewares<
            typeof router,
            { auth: boolean },
            { extra: boolean },
            object
          >
        >
      >()

      // @ts-expect-error - invalid loader
      implementer.lazy(() => Promise.resolve({ default: {
        ping: {} as Procedure<{ auth: boolean, extra: boolean }, object, typeof schema1, typeof schema2, { BASE: { data: typeof schema1 } }>,

        nested: {
          pong: {} as Procedure<{ auth: boolean, optional?: boolean }, { anything: boolean }, Schema<'invalid'>, typeof schema1, object>,
        },

        use: {} as Procedure<{ auth: boolean }, object, typeof schema3, typeof schema1, object>,

        middleware: {} as Procedure<{ auth: boolean }, object, typeof schema1, typeof schema1, object>,

        router: {},

        lazy: new Lazy({
          loader: () => Promise.resolve({ default: {
            lazy: {} as Procedure<{ auth: 'invalid' }, object, typeof schema2, typeof schema2, object>,
          } }),
          meta: {},
        }),
      } }))
    })

    it('deep access', () => {
      const router = {
        pong: {} as Procedure<{ auth: boolean, something?: boolean }, { anything: boolean }, typeof schema2, typeof schema1, object>,
      }

      const implemented = implementer.nested.lazy(() => Promise.resolve({ default: router }))

      expectTypeOf(implemented).toEqualTypeOf<
        Lazy<
          AugmentedRouterWithMiddlewares<
            typeof router,
            { auth: boolean },
            { extra: boolean },
            object
          >
        >
      >()

      // @ts-expect-error - expect a procedure
      implementer.nested.lazy(() => Promise.resolve({ default: {
        pong: {},
      } }))
    })

    it('conflict procedure/router names with implementer methods', () => {
      const router = {
        lazy: {} as Procedure<{ auth: boolean }, object, typeof schema2, typeof schema2, object>,
      }

      const implemented = implementer.lazy.lazy(() => Promise.resolve({ default: router }))

      expectTypeOf(implemented).toEqualTypeOf<Lazy<typeof router>>()

      // @ts-expect-error - input schema is conflict
      implementer.lazy.lazy(() => Promise.resolve({ default: {
        lazy: {} as Procedure<{ anything: boolean }, object, Schema<'invalid'>, typeof schema2, object>,
      } }))
    })
  })

  describe('edge case', () => {
    it('is procedure implementer if implementer for single procedure', () => {
      expectTypeOf<RouterImplementerWithMiddlewares<TContract['ping'], { auth: boolean }, { extra: boolean }>>()
        .toEqualTypeOf<ProcedureImplementer<{ auth: boolean }, { extra: boolean }, typeof schema1, typeof schema2, typeof errorMap>>()
    })
  })
})
