import { z } from 'zod'
import { ImplementedProcedure, ProcedureImplementer } from './implementer-procedure'

describe('procedureImplementer', () => {
  const definition = {
    errorMap: {
      INTERNAL_SERVER_ERROR: { message: 'Internal Server Error' },
    },
    orderedMiddlewares: [
      { middleware: vi.fn() },
    ],
    inputSchemas: [z.string()],
    outputSchemas: [z.number()],
    meta: { meta: true },
    metaPlugins: [{ name: 'plugin', init: vi.fn() }],
    disableInputValidation: true,
  }

  const implementer = new ProcedureImplementer(definition)

  it('constructor', () => {
    expect(implementer['~orpc']).toBe(definition)
  })

  it('.use', () => {
    const middleware = vi.fn()
    const applied = implementer.use(middleware)

    expect(applied).toBeInstanceOf(ProcedureImplementer)
    expect(applied).not.toBe(implementer)
    expect(applied['~orpc']).toEqual({
      ...definition,
      orderedMiddlewares: [
        ...definition.orderedMiddlewares,
        {
          middleware,
          inputSchemasLengthAtUse: 1,
          outputSchemasLengthAtUse: 1,
        },
      ],
    })
  })

  describe('.handler', () => {
    it('should return ImplementedProcedure', () => {
      const handler = vi.fn()
      const applied = implementer.handler(handler)

      expect(applied).toBeInstanceOf(ImplementedProcedure)
      expect(applied['~orpc']).toEqual({
        ...implementer['~orpc'],
        handler,
      })
    })
  })
})

describe('implementedProcedure', () => {
  const definition = {
    errorMap: {},
    orderedMiddlewares: [
      { middleware: vi.fn(), inputSchemasLengthAtUse: 0, outputSchemasLengthAtUse: 0 },
    ],
    inputSchemas: [z.string()],
    outputSchemas: [z.number()],
    handler: vi.fn(),
    meta: { meta: true },
    metaPlugins: [{ name: 'plugin', init: vi.fn() }],
  }

  const implemented = new ImplementedProcedure(definition)

  it('.use', () => {
    const middleware = vi.fn()
    const applied = implemented.use(middleware)

    expect(applied).toBeInstanceOf(ImplementedProcedure)
    expect(applied).not.toBe(implemented)
    expect(applied['~orpc']).toEqual({
      ...definition,
      orderedMiddlewares: [
        ...definition.orderedMiddlewares,
        {
          middleware,
          inputSchemasLengthAtUse: 1,
          outputSchemasLengthAtUse: 1,
        },
      ],
    })
  })
})
