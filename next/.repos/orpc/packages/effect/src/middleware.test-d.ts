import type { ORPCErrorConstructorMap } from '@orpc/server'
import type { WithEffectContext } from './context'
import { os } from '@orpc/server'
import { Context, Effect } from 'effect'
import { z } from 'zod'
import { middlewareGen } from './middleware'

class Service1 extends Context.Service<
  Service1,
  {
    readonly id: 'Service1'
  }
>()('Service1') {}

class Service2 extends Context.Service<
  Service2,
  {
    readonly id: 'Service2'
  }
>()('Service2') {}

const errorMap = {
  UNAUTHORIZED: {
    data: z.object({ reason: z.string() }),
    message: 'unauthorized',
  },
}

describe('middlewareGen', () => {
  it('can infer context and out context through next', () => {
    const procedure = os
      .$context<{ auth: boolean }>()
      .errors(errorMap)
      .use(middlewareGen(function* ({ context, next }) {
        expectTypeOf(context).toEqualTypeOf<{ auth: boolean } & object>()

        return yield* next({ context: { user: 'user' as const } })
      }))
      .handler(({ context }) => {
        expectTypeOf(context).toEqualTypeOf<{ auth: boolean } & { user: 'user' }>()
        return 'output'
      })

    void procedure
  })

  it('exposes downstream failures in the error channel of next', () => {
    void os.use(middlewareGen(function* ({ next }) {
      expectTypeOf(next()).toEqualTypeOf<Effect.Effect<{ context: object, output: unknown }, unknown>>()
      expectTypeOf(next({ context: { user: 'user' as const } })).toEqualTypeOf<Effect.Effect<{ context: { user: 'user' }, output: unknown }, unknown>>()

      const recovered = next().pipe(
        Effect.catch((error) => {
          expectTypeOf(error).toEqualTypeOf<unknown>()
          return Effect.fail(error)
        }),
      )

      return yield* recovered
    }))
  })

  it('can terminate the chain early with done', () => {
    void os.use(middlewareGen(function* ({ next }, input, done) {
      if (Math.random() < 0.5) {
        return done({ output: 'early' })
      }

      return yield* next()
    }))
  })

  it('can strict dependant-effect-service with WithEffectContext', () => {
    void os
      .$context<WithEffectContext<Service1>>()
      .use(middlewareGen(function* ({ next }) {
        yield* Service1
        return yield* next()
      }))

    void os
      .$context<WithEffectContext<Service1>>()
      // @ts-expect-error - Service2 is not provided
      .use(middlewareGen(function* ({ next }) {
        yield* Service2
        return yield* next()
      }))
  })

  it('works with os.middleware for standalone middleware', () => {
    const middleware = os
      .$context<{ auth: boolean }>()
      .middleware(middlewareGen(function* ({ context, next }) {
        expectTypeOf(context).toEqualTypeOf<{ auth: boolean } & object>()
        return yield* next({ context: { extra: true } })
      }))

    const procedure = os
      .$context<{ auth: boolean }>()
      .use(middleware)
      .handler(({ context }) => {
        expectTypeOf(context.extra).toEqualTypeOf<boolean>()
      })

    void procedure
  })

  it('infers everything without type arguments when created via os.middleware', () => {
    interface ServerContext extends WithEffectContext<Service1> {
      auth: boolean
    }

    const requireAuth = os
      .$context<ServerContext>()
      .middleware(middlewareGen(function* ({ context, next }) {
        expectTypeOf(context.auth).toEqualTypeOf<boolean>()
        yield* Service1

        return yield* next({ context: { user: 'user' as const } })
      }))

    const procedure = os
      .$context<ServerContext>()
      .input(z.object({ id: z.string() }))
      .output(z.string())
      .use(requireAuth)
      .handler(({ context }) => {
        expectTypeOf(context.user).toEqualTypeOf<'user'>()

        return 'output'
      })

    void procedure
  })

  it('supports standalone middleware on procedures with concrete input/output', () => {
    interface ServerContext extends WithEffectContext<Service1> {
      auth: boolean
    }

    const requireAuth = middlewareGen<ServerContext, { user: 'user' }>(
      function* ({ context, next }) {
        expectTypeOf(context.auth).toEqualTypeOf<boolean>()
        yield* Service1

        return yield* next({ context: { user: 'user' as const } })
      },
    )

    const procedure = os
      .$context<ServerContext>()
      .input(z.object({ id: z.string() }))
      .output(z.string())
      .use(requireAuth)
      .handler(({ context }) => {
        expectTypeOf(context.user).toEqualTypeOf<'user'>()

        return 'output'
      })

    void procedure

    const decorated = os
      .$context<ServerContext>()
      .middleware(requireAuth)

    const decoratedProcedure = os
      .$context<ServerContext>()
      .input(z.object({ id: z.string() }))
      .output(z.string())
      .use(decorated)
      .handler(() => 'output')

    void decoratedProcedure
  })

  it('can infer typed errors through os.middleware', () => {
    // Unlike `.use`, `os.middleware` types `errors` from the builder's error map
    // because its middleware parameter references the error map non-generically.
    void os
      .errors(errorMap)
      .middleware(middlewareGen(function* ({ next, errors }) {
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        return yield* next()
      }))
  })
})
