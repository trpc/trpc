import type { MergedErrorMap, Schema } from '@orpc/contract'
import type { MergedInitialContext } from './context'
import type { Lazy } from './lazy'
import type { Procedure } from './procedure'
import type { AugmentedRouter, AugmentedRouterWithMiddlewares, UnlaziedRouter } from './router-utils'

describe('AugmentedRouter', () => {
  const router = {
    ping: {} as Procedure<{ i: 1 }, { c: 2 }, Schema<number>, Schema<string>, { E1: { message: string } }>,
    nested: {
      pong: {} as Procedure<{ i: 1 }, object, Schema<number>, Schema<string>, object>,
    },
  }

  it('signal procedure', () => {
    type ErrorMap = { E2: { message: string } }

    expectTypeOf<AugmentedRouter<typeof router.ping, ErrorMap>>().toEqualTypeOf<
      Procedure<
        { i: 1 },
        { c: 2 },
        Schema<number>,
        Schema<string>,
        MergedErrorMap<ErrorMap, { E1: { message: string } }>
      >
    >()
  })

  it('nested router', () => {
    type ErrorMap = { E2: { message: string } }

    expectTypeOf<AugmentedRouter<typeof router, ErrorMap>>().toEqualTypeOf<{
      ping: Procedure<
        { i: 1 },
        { c: 2 },
        Schema<number>,
        Schema<string>,
        MergedErrorMap<ErrorMap, { E1: { message: string } }>
      >
      nested: {
        pong: Procedure<
          { i: 1 },
          object,
          Schema<number>,
          Schema<string>,
          MergedErrorMap<ErrorMap, object>
        >
      }
    }>()
  })

  it('lazy router', () => {
    type ErrorMap = { E2: { message: string } }

    const lazyRouter = {
      lazy: {} as Lazy<typeof router>,
    }

    expectTypeOf<AugmentedRouter<typeof lazyRouter, ErrorMap>>().toEqualTypeOf<{
      lazy: Lazy<{
        ping: Procedure<
          { i: 1 },
          { c: 2 },
          Schema<number>,
          Schema<string>,
          MergedErrorMap<ErrorMap, { E1: { message: string } }>
        >
        nested: {
          pong: Procedure<
            { i: 1 },
            object,
            Schema<number>,
            Schema<string>,
            MergedErrorMap<ErrorMap, object>
          >
        }
      }>
    }>()
  })
})

describe('AugmentedRouterWithMiddlewares', () => {
  const router = {
    ping: {} as Procedure<{ i: 1 }, { c: 2 }, Schema<number>, Schema<string>, { E1: { message: string } }>,
    nested: {
      pong: {} as Procedure<{ i: 1 }, object, Schema<number>, Schema<string>, object>,
    },
  }

  it('signal procedure', () => {
    type ErrorMap = { E2: { message: string } }
    type TInitialContext = { baseI: string }
    type TInjectedContext = { baseC: number }

    expectTypeOf<AugmentedRouterWithMiddlewares<typeof router.ping, TInitialContext, TInjectedContext, ErrorMap>>().toEqualTypeOf<
      Procedure<
        MergedInitialContext<TInitialContext, TInjectedContext, { i: 1 }>,
        { c: 2 },
        Schema<number>,
        Schema<string>,
        MergedErrorMap<ErrorMap, { E1: { message: string } }>
      >
    >()
  })

  it('nested router', () => {
    type ErrorMap = { E2: { message: string } }
    type TInitialContext = { baseI: string }
    type TInjectedContext = { baseC: number }

    expectTypeOf<AugmentedRouterWithMiddlewares<typeof router, TInitialContext, TInjectedContext, ErrorMap>>().toEqualTypeOf<{
      ping: Procedure<
        MergedInitialContext<TInitialContext, TInjectedContext, { i: 1 }>,
        { c: 2 },
        Schema<number>,
        Schema<string>,
        MergedErrorMap<ErrorMap, { E1: { message: string } }>
      >
      nested: {
        pong: Procedure<
          MergedInitialContext<TInitialContext, TInjectedContext, { i: 1 }>,
          object,
          Schema<number>,
          Schema<string>,
          MergedErrorMap<ErrorMap, object>
        >
      }
    }>()
  })

  it('lazy router', () => {
    type ErrorMap = { E2: { message: string } }
    type TInitialContext = { baseI: string }
    type TInjectedContext = { baseC: number }

    const lazyRouter = {
      lazy: {} as Lazy<typeof router>,
    }

    expectTypeOf<AugmentedRouterWithMiddlewares<typeof lazyRouter, TInitialContext, TInjectedContext, ErrorMap>>().toEqualTypeOf<{
      lazy: Lazy<{
        ping: Procedure<
          MergedInitialContext<TInitialContext, TInjectedContext, { i: 1 }>,
          { c: 2 },
          Schema<number>,
          Schema<string>,
          MergedErrorMap<ErrorMap, { E1: { message: string } }>
        >
        nested: {
          pong: Procedure<
            MergedInitialContext<TInitialContext, TInjectedContext, { i: 1 }>,
            object,
            Schema<number>,
            Schema<string>,
            MergedErrorMap<ErrorMap, object>
          >
        }
      }>
    }>()
  })
})

it('UnlaziedRouter', () => {
  const ping = {} as Procedure<{ i: 1 }, { c: 2 }, Schema<number>, Schema<string>, { E1: { message: string } }>
  const pong = {} as Procedure<{ i: 1 }, object, Schema<number>, Schema<string>, object>

  const router = {
    ping,
    pong: {} as Lazy<typeof pong>,
    nested: {} as Lazy<{
      ping: typeof ping
      pong: Lazy<typeof pong>
    }>,
  }

  type Unlazied = UnlaziedRouter<typeof router>

  expectTypeOf<Unlazied>().toEqualTypeOf({
    ping,
    pong,
    nested: {
      ping,
      pong,
    },
  })
})
