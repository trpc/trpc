import { oc } from '@orpc/contract'
import { call, DecoratedProcedure, implement, ImplementedProcedure, os } from '@orpc/server'
import { z } from 'zod'
import * as Handler from '../handler'
import '@orpc/server/extensions/callable' // not sure why, but we need import this to make type work
import './effect'

const handlerGen = vi.spyOn(Handler, 'handlerGen')

beforeEach(() => {
  vi.clearAllMocks()
})

it('adds .effect into Builder', async () => {
  const InputSchema = z.string()
  const handler = vi.fn(function* ({ input, context }) {
    return { output: true, auth: context.auth, input }
  })
  const procedure = os
    .$context<{ auth: boolean }>()
    .input(InputSchema)
    .effect(handler)

  expect(handlerGen).toHaveBeenCalledTimes(1)
  expect(handlerGen).toHaveBeenNthCalledWith(1, handler)

  expect(procedure).toBeInstanceOf(DecoratedProcedure)
  expect(procedure['~orpc'].handler).toBe(handlerGen.mock.results[0]?.value)
  expect(procedure['~orpc'].inputSchemas).toEqual([InputSchema])

  await expect(call(procedure, 'input', { context: { auth: false } })).resolves.toEqual({ output: true, auth: false, input: 'input' })
})

it('adds .effect into ProcedureImplementer', async () => {
  const InputSchema = z.string()
  const handler = vi.fn(function* ({ input, context }) {
    return { output: true, auth: context.auth, input }
  })

  const os = implement({
    ping: oc.input(InputSchema),
  })

  const procedure = os
    .$context<{ auth: boolean }>()
    .ping
    .effect(handler)

  expect(handlerGen).toHaveBeenCalledTimes(1)
  expect(handlerGen).toHaveBeenNthCalledWith(1, handler)

  expect(procedure).toBeInstanceOf(ImplementedProcedure)
  expect(procedure['~orpc'].handler).toBe(handlerGen.mock.results[0]?.value)
  expect(procedure['~orpc'].inputSchemas).toEqual([InputSchema])

  await expect(call(procedure, 'input', { context: { auth: false } })).resolves.toEqual({ output: true, auth: false, input: 'input' })
})
