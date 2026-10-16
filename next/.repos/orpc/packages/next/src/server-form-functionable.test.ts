import * as ServerModule from '@orpc/server'
import * as ServerFormFunctionModule from './server-form-function'
import { createServerFormFunctionable } from './server-form-functionable'

const createServerFormFunctionSpy = vi.spyOn(ServerFormFunctionModule, 'createServerFormFunction')
const { os, type } = ServerModule

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createServerFormFunctionable', () => {
  const procedure = os.input(type<any>()).output(type<any>()).handler(() => 'output')

  it('returns the wrapped server form function and preserves the procedure metadata', () => {
    const client = vi.fn().mockResolvedValue(undefined) as any

    const options = { context: { context: true } }
    createServerFormFunctionSpy.mockReturnValueOnce(client)

    const functionable = createServerFormFunctionable(options)(procedure)

    expect(createServerFormFunctionSpy).toHaveBeenCalledTimes(1)
    expect(createServerFormFunctionSpy).toHaveBeenCalledWith(procedure, options)
    expect(functionable).toBe(client)
    expect(functionable).toBeInstanceOf(ServerModule.Procedure)
    expect(functionable['~orpc']).toBe(procedure['~orpc'])
  })
})
