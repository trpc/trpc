import type { ErrorMap, ORPCErrorConstructorMap } from '@orpc/contract'
import type { Middleware } from './middleware'
import z from 'zod'

const errorMap = {
  BASE: {
    data: z.object({ output: z.number() }),
  },
} satisfies ErrorMap

describe('Middleware', () => {
  it('can be a regular function', () => {
    type T = Middleware<
      { in: string },
      object,
      { input: boolean },
      string,
      typeof errorMap
    >

    const mid: T = ({ next, context, errors }, input, done) => {
      expectTypeOf(context).toEqualTypeOf<{ in: string }>()
      expectTypeOf(input).toEqualTypeOf<{ input: boolean }>()
      expectTypeOf(errors).toEqualTypeOf<ORPCErrorConstructorMap<typeof errorMap>>()

      if (Math.random() > 0.5) {
        return done({ output: '123' })
      }

      return next()
    }
  })

  it('can stop by using done function', () => {
    type T = Middleware<
      { in: string },
      object,
      { input: boolean },
      number,
      typeof errorMap
    >

    const mid: T = ({ next, context, errors }, input, done) => {
      return done({ output: 123 })
    }

    const mid2: T = ({ next, context, errors }, input, done) => {
      if (Math.random() > 0.5) {
        // @ts-expect-error - missing output
        return done()
      }

      // @ts-expect-error - invalid data
      return done({ output: 'invalid' })
    }
  })

  it('require return context', () => {
    type T = Middleware<
      { in: string },
      { out: number },
      { input: boolean },
      string,
      typeof errorMap
    >

    const mid: T = ({ next }) => {
      return next({ context: { out: 123 } })
    }

    // @ts-expect-error - invalid out context
    const mid2: T = ({ next }) => {
      return next({ context: { out: 'invalid' } })
    }

    const mid3: T = ({ next }) => {
      // @ts-expect-error - missing out context
      return next()
    }

    const midDone: T = ({ next }, input, done) => {
      return done({ output: '123', context: { out: 123 } })
    }

    // @ts-expect-error - invalid out context
    const midDone2: T = ({ next }, input, done) => {
      return done({ output: '123', context: { out: 'invalid' } })
    }

    const midDone3: T = ({ next }, input, done) => {
      // @ts-expect-error - missing out context
      return done({ output: '123' })
    }
  })

  it('can infer back error map', async () => {
    const mid: Middleware<
      { in: string },
      object,
      { input: boolean },
      string,
      typeof errorMap
    > = ({ next }) => {
      return next()
    }

    expectTypeOf(mid['~orpc']?.errorMap).toEqualTypeOf<typeof errorMap | undefined>()
    expectTypeOf<typeof mid extends Middleware<any, any, any, any, infer TErrorMap> ? TErrorMap : never>().toEqualTypeOf<typeof errorMap>()
  })
})
