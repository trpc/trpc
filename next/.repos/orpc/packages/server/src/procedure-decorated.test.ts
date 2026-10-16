import type { AnyMetaPlugin, ErrorMap } from '@orpc/contract'
import type { AnyMiddleware } from './middleware'
import { setHiddenMetaPlugins } from '@orpc/contract'
import * as ContractModule from '@orpc/contract'
import z from 'zod'
import { Procedure } from './procedure'
import { DecoratedProcedure } from './procedure-decorated'

const resolveMetaPluginsSpy = vi.spyOn(ContractModule, 'resolveMetaPlugins')
const mergeErrorMapSpy = vi.spyOn(ContractModule, 'mergeErrorMap')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('decoratedProcedure', () => {
  const procedure = new DecoratedProcedure({
    errorMap: {
      BASE: { },
    },
    inputSchemas: [z.object({})],
    outputSchemas: [z.object({})],
    meta: { base: true },
    metaPlugins: [{ name: 'test1', init: m => m }],
    orderedMiddlewares: [],
    handler: async () => {},
  })

  const metaPlugin: AnyMetaPlugin = {
    name: 'test2',
    init: m => ({ ...m, metaPlugin: true }),
  }

  it('is a procedure', () => {
    expect(procedure).toBeInstanceOf(Procedure)
  })

  it('.meta', () => {
    const applied = procedure.meta(metaPlugin)
    expect(applied).toBeInstanceOf(DecoratedProcedure)
    expect(applied).not.toBe(procedure)

    expect(resolveMetaPluginsSpy).toHaveBeenCalledOnce()
    expect(resolveMetaPluginsSpy).toHaveBeenCalledWith(
      procedure['~orpc'].meta,
      procedure['~orpc'].metaPlugins,
      [metaPlugin],
    )

    expect(applied['~orpc']).toEqual({
      ...procedure['~orpc'],
      meta: resolveMetaPluginsSpy.mock.results[0]?.value[0],
      metaPlugins: resolveMetaPluginsSpy.mock.results[0]?.value[1],
    })
  })

  describe('.errors', () => {
    it('without meta plugins', () => {
      const errors = {
        OVERRIDE: { message: 'override' },
      } satisfies ErrorMap

      const applied = procedure.errors(errors)
      expect(applied).toBeInstanceOf(DecoratedProcedure)
      expect(applied).not.toBe(procedure)

      expect(mergeErrorMapSpy).toHaveBeenCalledOnce()
      expect(mergeErrorMapSpy).toHaveBeenCalledWith(
        procedure['~orpc'].errorMap,
        errors,
      )

      expect(applied['~orpc']).toEqual({
        ...procedure['~orpc'],
        errorMap: mergeErrorMapSpy.mock.results[0]?.value,
      })
    })

    it('with meta plugins', () => {
      const errors = {
        OVERRIDE: { message: 'override' },
      } satisfies ErrorMap

      setHiddenMetaPlugins(errors, [metaPlugin])

      const applied = procedure.errors(errors)
      expect(applied).toBeInstanceOf(DecoratedProcedure)
      expect(applied).not.toBe(procedure)

      expect(mergeErrorMapSpy).toHaveBeenCalledOnce()
      expect(mergeErrorMapSpy).toHaveBeenCalledWith(
        procedure['~orpc'].errorMap,
        errors,
      )

      expect(resolveMetaPluginsSpy).toHaveBeenCalledOnce()
      expect(resolveMetaPluginsSpy).toHaveBeenCalledWith(
        procedure['~orpc'].meta,
        procedure['~orpc'].metaPlugins,
        [metaPlugin],
      )

      expect(applied['~orpc']).toEqual({
        ...procedure['~orpc'],
        errorMap: mergeErrorMapSpy.mock.results[0]?.value,
        meta: resolveMetaPluginsSpy.mock.results[0]?.value[0],
        metaPlugins: resolveMetaPluginsSpy.mock.results[0]?.value[1],
      })
    })
  })

  describe('.use', () => {
    it('with middleware error map', () => {
      const middleware: AnyMiddleware = ({ next }) => next()
      middleware['~orpc'] = {
        errorMap: {
          PAYMENT_REQUIRED: {
            status: 402,
          },
        },
      }

      const applied = procedure.use(middleware)

      expect(applied).toBeInstanceOf(DecoratedProcedure)
      expect(applied).not.toBe(procedure)

      expect(mergeErrorMapSpy).toHaveBeenCalledOnce()
      expect(mergeErrorMapSpy).toHaveBeenCalledWith(
        middleware['~orpc'].errorMap,
        procedure['~orpc'].errorMap,
      )

      expect(applied['~orpc']).toEqual({
        ...procedure['~orpc'],
        errorMap: mergeErrorMapSpy.mock.results[0]?.value,
        orderedMiddlewares: [
          ...procedure['~orpc'].orderedMiddlewares,
          {
            middleware,
            inputSchemasLengthAtUse: 1,
            outputSchemasLengthAtUse: 1,
          },
        ],
      })
    })

    it('with meta plugins', () => {
      const middleware: AnyMiddleware = ({ next }) => next()
      middleware['~orpc'] = {
        metaPlugins: [metaPlugin],
      }

      const applied = procedure.use(middleware)

      expect(applied).toBeInstanceOf(DecoratedProcedure)
      expect(applied).not.toBe(procedure)

      expect(mergeErrorMapSpy).toHaveBeenCalledOnce()
      expect(mergeErrorMapSpy).toHaveBeenCalledWith(
        middleware['~orpc']?.errorMap,
        procedure['~orpc'].errorMap,
      )

      expect(resolveMetaPluginsSpy).toHaveBeenCalledOnce()
      expect(resolveMetaPluginsSpy).toHaveBeenCalledWith(
        procedure['~orpc'].meta,
        procedure['~orpc'].metaPlugins,
        [metaPlugin],
      )

      expect(applied['~orpc']).toEqual({
        ...procedure['~orpc'],
        errorMap: mergeErrorMapSpy.mock.results[0]?.value,
        meta: resolveMetaPluginsSpy.mock.results[0]?.value[0],
        metaPlugins: resolveMetaPluginsSpy.mock.results[0]?.value[1],
        orderedMiddlewares: [
          ...procedure['~orpc'].orderedMiddlewares,
          {
            middleware,
            inputSchemasLengthAtUse: 1,
            outputSchemasLengthAtUse: 1,
          },
        ],
      })
    })
  })
})
