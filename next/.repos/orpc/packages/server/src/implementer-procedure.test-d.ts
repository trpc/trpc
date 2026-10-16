import type { ORPCErrorConstructorMap, Schema } from '@orpc/contract'
import type { MergedContext, MergedInitialContext } from './context'
import type { ImplementedProcedure, ProcedureImplementer } from './implementer-procedure'
import type { Middleware, MiddlewareDone } from './middleware'
import { expectTypeOf } from 'vitest'
import { z } from 'zod'

const errorMap = {
  BASE: {
    data: z.object({ id: z.string() }),
    message: 'base',
  },
} as const

describe('ProcedureImplementer', () => {
  const implementer = {} as ProcedureImplementer<
    { auth: boolean },
    { user: string },
    Schema<number, string>,
    Schema<string, number>,
    typeof errorMap
  >

  describe('use', () => {
    it('inline middleware', () => {
      const decorated = implementer.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<string>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<string>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { user: string }>>()

        return next({ context: { extra: true } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        ProcedureImplementer<
          { auth: boolean },
          MergedContext<{ user: string }, { extra: boolean }>,
          Schema<number, string>,
          Schema<string, number>,
          typeof errorMap
        >
      >()

      // @ts-expect-error - input is invalid
      void implementer.use(({ next, errors }, input: 'invalid', done) => {
        return next()
      })

      // @ts-expect-error - output is invalid
      void implementer.use(({ next, errors }, input, done: MiddlewareDone<'invalid'>) => {
        return next()
      })

      // @ts-expect-error - conflict with TInitialContext
      void implementer.use(({ next }) => next({ context: { auth: 'invalid' } }))

      // @ts-expect-error - conflict with TInjectedContext
      void implementer.use(({ next }) => next({ context: { user: 123 } }))
    })

    it('outline middleware', () => {
      const middleware = {} as Middleware<
        { auth: boolean, user: string, g?: boolean },
        { extra: boolean },
        string,
        string,
        { SOME_ERROR: { message: string } }
      >

      expectTypeOf(implementer.use(middleware)).toEqualTypeOf<
        ProcedureImplementer<
          MergedInitialContext<{ auth: boolean }, { user: string }, { auth: boolean, user: string, g?: boolean }>,
          MergedContext<{ user: string }, { extra: boolean }>,
          Schema<number, string>,
          Schema<string, number>,
          typeof errorMap
        >
      >()

      // @ts-expect-error - input is invalid
      void implementer.use({} as Middleware<{ auth: boolean, user: string }, object, number, any, object>)

      // @ts-expect-error - output is invalid
      void implementer.use({} as Middleware<{ auth: boolean, user: string }, object, string, number, object>)

      // @ts-expect-error - TInContext is not satisfy expected
      void implementer.use({} as Middleware<{ something: string }, object, string, string, object>)

      // @ts-expect-error - conflict with TInitialContext
      void implementer.use({} as Middleware<object, { auth: 'invalid' }, string, string, object>)

      // @ts-expect-error - conflict with TInjectedContext
      void implementer.use({} as Middleware<object, { user: 123 }, string, string, object>)
    })
  })

  describe('.handler', () => {
    it('simple', () => {
      const procedure = implementer.handler(async ({ errors, context }, input) => {
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(input).toEqualTypeOf<string>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { user: string }>>()

        return '123'
      })

      expectTypeOf(procedure).toEqualTypeOf<
        ImplementedProcedure<
          { auth: boolean },
          { user: string },
          Schema<number, string>,
          Schema<string, number>,
        typeof errorMap
        >
      >()

      // @ts-expect-error - output is invalid
      void implementer.handler(async ({ errors, context }, input) => {
        return 1234
      })
    })
  })
})

describe('ImplementedProcedure', () => {
  const procedure = {} as ImplementedProcedure<
    { auth: boolean },
    { user: string },
    Schema<number, string>,
    Schema<string, number>,
    typeof errorMap
  >

  describe('use', () => {
    it('inline middleware', () => {
      const decorated = procedure.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<string>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<string>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<MergedContext<{ auth: boolean }, { user: string }>>()

        return next({ context: { extra: true } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        ImplementedProcedure<
          { auth: boolean },
          MergedContext<{ user: string }, { extra: boolean }>,
          Schema<number, string>,
          Schema<string, number>,
          typeof errorMap
        >
      >()

      // @ts-expect-error - input is invalid
      void procedure.use(({ next, errors }, input: 'invalid', done) => {
        return next()
      })

      // @ts-expect-error - output is invalid
      void procedure.use(({ next, errors }, input, done: MiddlewareDone<'invalid'>) => {
        return next()
      })

      // @ts-expect-error - TOutContext is conflict with initial context
      void procedure.use(({ next, errors }, input, done) => {
        return next({ context: { auth: 'invalid' } })
      })

      // @ts-expect-error - TOutContext is conflict with executed context
      void procedure.use(({ next, errors }, input, done) => {
        return next({ context: { user: 123 } })
      })
    })

    it('outline middleware', () => {
      const middleware = {} as Middleware<
        { auth: boolean, user: string, g?: boolean },
        { extra: boolean },
        string,
        string,
        { SOME_ERROR: { message: string } }
      >

      expectTypeOf(procedure.use(middleware)).toEqualTypeOf<
        ImplementedProcedure<
          MergedInitialContext<{ auth: boolean }, { user: string }, { auth: boolean, user: string, g?: boolean }>,
          MergedContext<{ user: string }, { extra: boolean }>,
          Schema<number, string>,
          Schema<string, number>,
          typeof errorMap
        >
      >()

      // @ts-expect-error - input is invalid
      void procedure.use({} as Middleware<{ auth: boolean, user: string }, object, number, any, object>)

      // @ts-expect-error - output is invalid
      void procedure.use({} as Middleware<{ auth: boolean, user: string }, object, string, number, object>)

      // @ts-expect-error - TInContext is not satisfy expected
      void procedure.use({} as Middleware<{ something: string }, object, string, string, object>)

      // @ts-expect-error - TOutContext is conflict with initial context
      void procedure.use({} as Middleware<object, { auth: 'invalid' }, string, string, object>)

      // @ts-expect-error - TOutContext is conflict with executed context
      void procedure.use({} as Middleware<object, { user: number }, string, string, object>)
    })
  })
})
