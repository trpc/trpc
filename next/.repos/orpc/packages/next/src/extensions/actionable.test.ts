import { os, Procedure } from '@orpc/server'
import { z } from 'zod'
import * as ServerFunctionModule from '../server-function'
import './actionable'

const createServerFunctionSpy = vi.spyOn(ServerFunctionModule, 'createServerFunction')

it('adds .actionable method to DecoratedProcedure', async () => {
  const procedure = os.input(z.string()).handler(({ input }) => `Hello, ${input}!`)

  const actionable = procedure.actionable({ context: { auth: true } })
  expect(createServerFunctionSpy).toHaveBeenCalledTimes(1)
  expect(createServerFunctionSpy).toHaveBeenCalledWith(procedure, { context: { auth: true } })
  expect(actionable).toBe(createServerFunctionSpy.mock.results[0]?.value)
  expect(actionable).toBeInstanceOf(Procedure)
  expect(actionable['~orpc']).toBe(procedure['~orpc'])

  await expect(actionable('Jack')).resolves.toEqual([null, 'Hello, Jack!'])
})
