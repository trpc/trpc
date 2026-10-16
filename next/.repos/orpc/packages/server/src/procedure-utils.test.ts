import type { AnyMetaPlugin } from '@orpc/contract'
import { oc } from '@orpc/contract'
import z from 'zod'
import { os } from './builder'
import { Lazy, unlazy } from './lazy'
import { Procedure } from './procedure'
import * as ProcedureClient from './procedure-client'
import { call, createContractProcedure, createGuardedProcedureLazy } from './procedure-utils'

const createProcedureClientSpy = vi.spyOn(ProcedureClient, 'createProcedureClient')

it('createGuardedProcedureLazy', async () => {
  const procedure = new Procedure({
    errorMap: {},
    meta: {},
    inputSchemas: [],
    outputSchemas: [],
    handler: vi.fn(),
    orderedMiddlewares: [],
    metaPlugins: [],
  })

  const validLazy = new Lazy({
    loader: async () => ({ default: procedure }),
    meta: { meta: true },
    metaPlugins: [{ name: 'test', apply: vi.fn() }],
  })

  const guarded = createGuardedProcedureLazy(validLazy)
  expect(guarded).toBeInstanceOf(Lazy)
  expect(guarded['~orpc'].meta).toEqual(validLazy['~orpc'].meta)
  expect(guarded['~orpc'].metaPlugins).toEqual(validLazy['~orpc'].metaPlugins)
  const { default: actualGuarded } = await unlazy(guarded)
  expect(actualGuarded).toBe(procedure)

  const invalidLazy = new Lazy({
    loader: async () => ({ default: {} }),
    meta: { meta: true },
    metaPlugins: [{ name: 'test', apply: vi.fn() }],
  })

  const guardedInvalid = createGuardedProcedureLazy(invalidLazy)
  expect(guardedInvalid).toBeInstanceOf(Lazy)
  expect(guardedInvalid['~orpc'].meta).toEqual(invalidLazy['~orpc'].meta)
  expect(guardedInvalid['~orpc'].metaPlugins).toEqual(invalidLazy['~orpc'].metaPlugins)
  await expect(unlazy(guardedInvalid)).rejects.toThrow(
    'Expected a lazy<procedure> but got lazy<unknown>.',
  )
})

it('createContractProcedure', () => {
  const metaPlugin1: AnyMetaPlugin = { name: 'plugin1', init: meta => ({ ...meta, plugin1: true }) }
  const metaPlugin2: AnyMetaPlugin = { name: 'plugin2', init: meta => ({ ...meta, plugin2: true }) }

  const procedure = os
    .errors({ CONFLICT: {}, NOT_FOUND: {} })
    .input(z.object({ name: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .meta(metaPlugin1, metaPlugin2)
    .handler(() => ({ greeting: 'hello' }))

  const contract = oc
    .errors({ CONFLICT: {} })
    .input(z.object({ name: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .meta(metaPlugin1)

  const contractProcedure = createContractProcedure(procedure, contract)

  expect(contractProcedure).toBeInstanceOf(Procedure)

  expect(contractProcedure['~orpc'].inputSchemas).toBe(procedure['~orpc'].inputSchemas)
  expect(contractProcedure['~orpc'].outputSchemas).toBe(procedure['~orpc'].outputSchemas)
  expect(contractProcedure['~orpc'].handler).toBe(procedure['~orpc'].handler)
  expect(contractProcedure['~orpc'].orderedMiddlewares).toBe(procedure['~orpc'].orderedMiddlewares)

  expect(contractProcedure['~orpc'].errorMap).toBe(contract['~orpc'].errorMap)
  expect(contractProcedure['~orpc'].meta).toBe(contract['~orpc'].meta)
  expect(contractProcedure['~orpc'].metaPlugins).toBe(contract['~orpc'].metaPlugins)
})

it('call', async () => {
  const procedure = os
    .input(z.object({ input: z.number() }))
    .output(z.string())
    .handler(() => '__unused__')

  const client = vi.fn(async () => '__output__')
  vi.mocked(createProcedureClientSpy).mockReturnValueOnce(client as any)

  const options = { context: { db: 'postgres' }, signal: AbortSignal.timeout(1000), lastEventId: '123' }
  const input = { input: 123 }
  const output = await call(procedure, input, options)

  expect(output).toBe('__output__')
  expect(createProcedureClientSpy).toHaveBeenCalledTimes(1)
  expect(createProcedureClientSpy).toHaveBeenCalledWith(procedure, options)
  expect(client).toHaveBeenCalledTimes(1)
  expect(client).toHaveBeenCalledWith(input, options)
})
