import type { ErrorMap, MergedErrorMap, ORPCErrorConstructorMap } from '@orpc/contract'
import type { MergedContext, MergedInitialContext } from './context'
import type { Middleware, MiddlewareDone } from './middleware'
import type { DecoratedMiddleware } from './middleware-decorated'

const errorMap = { BASE: { message: 'bad request' } } satisfies ErrorMap

describe('DecoratedMiddleware', () => {
  const middleware = {} as DecoratedMiddleware<{ a: string }, { b: number }, { x: number }, { y: string }, typeof errorMap>

  it('.adaptInput', () => {
    const mapped = middleware.adaptInput((input: string) => ({ x: Number(input) }))

    expectTypeOf(mapped).toEqualTypeOf<
      DecoratedMiddleware<{ a: string }, { b: number }, string, { y: string }, typeof errorMap>
    >()

    // @ts-expect-error result of adaptInput is invalid
    middleware.adaptInput((input: string) => ({ x: 'invalid' }))
  })

  it('.errors', () => {
    const withErrors = middleware.errors({ FORBIDDEN: { message: 'forbidden' } })

    expectTypeOf(withErrors).toEqualTypeOf<
      DecoratedMiddleware<{ a: string }, { b: number }, { x: number }, { y: string }, MergedErrorMap<typeof errorMap, { FORBIDDEN: { message: string } }>>
    >()

    // @ts-expect-error errors are invalid
    middleware.errors({ FORBIDDEN: { data: 'invalid' } })
  })

  describe('.use', () => {
    it('inline middleware', () => {
      const decorated = middleware.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<{ x: number }>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<{ y: string }>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ a: string }, { b: number }>>()

        return next({ context: { extra: true } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        DecoratedMiddleware<
          { a: string },
          MergedContext<{ b: number }, { extra: boolean }>,
          { x: number },
          { y: string },
          typeof errorMap
        >
      >()

      // @ts-expect-error - input is invalid
      void decorated.use(({ next, errors }, input: 'invalid', done) => {
        return next()
      })

      // @ts-expect-error - output is invalid
      void decorated.use(({ next, errors }, input, done: MiddlewareDone<'invalid'>) => {
        return next()
      })

      // @ts-expect-error - conflict with TInContext
      void decorated.use(({ next, errors }) => {
        return next({ context: { a: true } })
      })

      // @ts-expect-error - conflict with current TOutContext
      void decorated.use(({ next, errors }) => {
        return next({ context: { b: 'invalid' } })
      })
    })

    it('outline middleware', () => {
      const middleware2 = {} as Middleware<{ a: string, b: number, g?: number }, { extra: boolean }, unknown, any, { SOME_ERROR: { message: string } }>

      expectTypeOf(middleware.use(middleware2)).toEqualTypeOf<
        DecoratedMiddleware<
          MergedInitialContext<{ a: string }, { b: number }, { a: string, b: number, g?: number }>,
          MergedContext<{ b: number }, { extra: boolean }>,
          { x: number },
          { y: string },
          MergedErrorMap<{ SOME_ERROR: { message: string } }, typeof errorMap>
        >
      >()

      // @ts-expect-error - input is invalid
      void middleware.use({} as Middleware<{ a: string, b: number }, object, 'invalid', any, object>)

      // @ts-expect-error - output is invalid
      void middleware.use({} as Middleware<{ a: string, b: number }, object, unknown, 'invalid', object>)

      // @ts-expect-error - TInContext is not satisfy expected
      void middleware.use({} as Middleware<{ something: string }, object, unknown, any, object>)

      // @ts-expect-error - conflict with current TInContext
      void middleware.use({} as Middleware<{ b: number }, { a: true }, unknown, any, object>)

      // @ts-expect-error - conflict with current TOutContext
      void middleware.use({} as Middleware<{ a: string }, { b: 'invalid' }, unknown, any, object>)
    })

    it('low-priority mid\'s errors and ignore conflicts', () => {
      const middleware2 = {} as Middleware<object, object, unknown, any, { BASE: { message: 'CONFLICT' }, EXTRA: { message: string } }>

      expectTypeOf(middleware.use(middleware2)).toEqualTypeOf<
        DecoratedMiddleware<
          { a: string },
          { b: number },
          { x: number },
          { y: string },
          MergedErrorMap<{ EXTRA: { message: string } }, typeof errorMap>
        >
      >()
    })
  })
})
