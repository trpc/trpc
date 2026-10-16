import type { MergedErrorMap, MetaPlugin, ORPCErrorConstructorMap, Schema } from '@orpc/contract'
import type { MergedInitialContext } from './context'
import type { Middleware, MiddlewareDone } from './middleware'
import type { DecoratedProcedure } from './procedure-decorated'
import { expectTypeOf } from 'vitest'
import { z } from 'zod'

const errorMap = {
  BASE: {
    data: z.object({ id: z.string() }),
    message: 'base',
  },
} as const

const procedure = {} as DecoratedProcedure<
  { auth: boolean },
  { user: string },
  Schema<number, string>,
  Schema<string, number>,
  typeof errorMap
>

describe('DecoratedProcedure', () => {
  it('meta', () => {
    const plugin = { name: 'test', init: (m: any) => m }
    expectTypeOf(procedure.meta(plugin)).toEqualTypeOf<typeof procedure>()

    // @ts-expect-error - invalid meta
    procedure.meta({} as MetaPlugin<Schema<'invalid'>, any, any>)
  })

  it('errors', () => {
    const errors = {
      OVERRIDE: { message: 'override' },
    } as const

    expectTypeOf(procedure.errors(errors)).toEqualTypeOf<
      DecoratedProcedure<
        { auth: boolean },
        { user: string },
        Schema<number, string>,
        Schema<string, number>,
        MergedErrorMap<typeof errorMap, typeof errors>
      >
    >()

    // @ts-expect-error - schema is invalid
    procedure.errors({ TOO_MANY_REQUESTS: { data: {} } })
  })

  describe('use', () => {
    it('inline middleware', () => {
      const decorated = procedure.use(({ next, errors, context }, input, done) => {
        expectTypeOf(input).toEqualTypeOf<string>()
        expectTypeOf(done).toEqualTypeOf<MiddlewareDone<string>>()
        expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()
        expectTypeOf(context).toEqualTypeOf<{ auth: boolean } & { user: string }>()

        return next({ context: { extra: true } })
      })

      expectTypeOf(decorated).toEqualTypeOf<
        DecoratedProcedure<
          { auth: boolean },
          { user: string } & { extra: boolean },
          Schema<number, string>,
          Schema<string, number>,
          MergedErrorMap<typeof errorMap, typeof errorMap>
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
        DecoratedProcedure<
          MergedInitialContext<{ auth: boolean }, { user: string }, { auth: boolean, user: string, g?: boolean }>,
          { user: string } & { extra: boolean },
          Schema<number, string>,
          Schema<string, number>,
          MergedErrorMap<{ SOME_ERROR: { message: string } }, typeof errorMap>
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

    it('low-priority mid\'s errors and ignore conflicts', () => {
      const middleware = {} as Middleware<
        { auth: boolean, user: string },
          object,
          string,
          string,
          { BASE: { message: 'CONFLICT' }, EXTRA: { message: string } }
      >

      expectTypeOf(procedure.use(middleware)).toEqualTypeOf<
        DecoratedProcedure<
          { auth: boolean },
          { user: string },
          Schema<number, string>,
          Schema<string, number>,
          MergedErrorMap<{ EXTRA: { message: string } }, typeof errorMap>
        >
      >()
    })
  })
})
