import type { RouterContract } from '@orpc/contract'
import { oc } from '@orpc/contract'
import z from 'zod'
import { implement } from './implementer'
import { ImplementedProcedure, ProcedureImplementer } from './implementer-procedure'
import * as ImplementerRouter from './implementer-router'

const createRouterImplementerSpy = vi.spyOn(ImplementerRouter, 'createRouterImplementer')

const contract = {
  ping: oc.input(z.object({})).output(z.object({})).errors({ INTERNAL_SERVER_ERROR: {} }),
  nested: {
    pong: oc.input(z.string()),
  },

  // ensure can handle procedure/router with name that conflict with implementer methods
  $context: oc.output(z.boolean({})),
  $config: oc.output(z.boolean({})),
} satisfies RouterContract

beforeEach(() => {
  vi.clearAllMocks()
})

describe('implement', () => {
  const implementer = implement(contract, { disableInputValidation: false })

  it('crate with router implementer', () => {
    void implement(contract, { disableInputValidation: false })
    expect(createRouterImplementerSpy).toHaveBeenCalledTimes(1)
    expect(createRouterImplementerSpy).toHaveBeenCalledWith(contract, { disableInputValidation: false })
  })

  describe('.$context', () => {
    it('on conflict procedure name', () => {
      expect(implementer.$context()).toBe(implementer)
    })

    it('without conflict', () => {
      const contract2 = {
        ping: contract.ping,
      }

      const implementer = implement(contract2)
      expect(implementer.$context()).toBe(implementer)
    })
  })

  describe('.$config', () => {
    it('on conflict procedure name', () => {
      const applied = implementer.$config({ disableOutputValidation: true })
      expect(applied.ping['~orpc'].disableInputValidation).toBe(false)
      expect(applied.ping['~orpc'].disableOutputValidation).toBe(true)
    })

    it('without conflict', () => {
      const contract2 = {
        ping: contract.ping,
      }

      const implementer = implement(contract2, { disableInputValidation: false })
      const applied = implementer.$config({ disableOutputValidation: true })
      expect(applied.ping['~orpc'].disableInputValidation).toBe(false)
      expect(applied.ping['~orpc'].disableOutputValidation).toBe(true)
    })
  })

  it('router/procedure access', () => {
    expect(implementer.ping).toBeInstanceOf(ProcedureImplementer)
    expect(implementer.nested.pong).toBeInstanceOf(ProcedureImplementer)
  })

  it('can handle procedure/router with name that conflict with implementer methods', () => {
    const mid = vi.fn()

    expect(implementer.$context.use(mid)).toBeInstanceOf(ProcedureImplementer)
    expect(implementer.$context.use(mid)['~orpc']).toMatchObject(contract.$context['~orpc'])
    expect(implementer.$context.use(mid)['~orpc'].orderedMiddlewares).toEqual([expect.objectContaining({ middleware: mid })])

    expect(implementer.$context.handler(vi.fn())).toBeInstanceOf(ImplementedProcedure)
    expect(implementer.$context.handler(vi.fn())['~orpc']).toMatchObject(contract.$context['~orpc'])
  })

  it('support implement single procedure', () => {
    const implementer = implement(contract.ping)
    expect(implementer.$context()).toBe(implementer)

    const mid = vi.fn()
    expect(implementer.use(mid)).toBeInstanceOf(ProcedureImplementer)
    expect(implementer.use(mid)['~orpc']).toMatchObject(contract.ping['~orpc'])
    expect(implementer.use(mid)['~orpc'].orderedMiddlewares).toEqual([expect.objectContaining({ middleware: mid })])
  })
})
