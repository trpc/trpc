import type { ProcedureContract, RouterContract } from '@orpc/contract'
import type { Implementer } from './implementer'
import type { RouterImplementer } from './implementer-router'

const contract = {
  ping: {} as ProcedureContract<any, any, any>,
  nested: {
    pong: {} as ProcedureContract<any, any, any>,
  },

  // ensure can handle procedure/router with name that conflict with implementer methods
  $context: {} as ProcedureContract<any, any, any>,
} satisfies RouterContract

type TContract = typeof contract

describe('Implementer', () => {
  const implementer = {} as Implementer<TContract, { auth: boolean }>

  it('.$context', () => {
    const withContext = implementer.$context<{ auth: string }>()
    expectTypeOf(withContext).toEqualTypeOf<Implementer<TContract, { auth: string } & object>>()
  })

  it('.$config', () => {
    const withConfig = implementer.$config({ disableInputValidation: true })
    expectTypeOf(withConfig).toEqualTypeOf<typeof implementer>()
  })

  it('is a RouterImplementer', () => {
    expectTypeOf(implementer).toExtend<RouterImplementer<TContract, { auth: boolean } & object>>()
  })

  it('support implement single procedure', () => {
    const implementer = {} as Implementer<TContract['ping'], { auth: boolean }>

    expectTypeOf(implementer.$context<{ auth: string }>()).toEqualTypeOf<
      Implementer<TContract['ping'], { auth: string } & object>
    >()

    expectTypeOf(implementer).toExtend<RouterImplementer<TContract['ping'], { auth: boolean } & object>>()
  })
})
