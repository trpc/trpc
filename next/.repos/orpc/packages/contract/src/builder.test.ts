import type { ErrorMap } from './error'
import type { AnyMetaPlugin } from './meta'
import z from 'zod'
import { ContractBuilder, oc } from './builder'
import * as ErrorUtilsModule from './error-utils'
import { setHiddenMetaPlugins } from './meta'
import * as MetaUtilsModule from './meta-utils'
import { ProcedureContract } from './procedure'
import * as RouterUtilsModule from './router-utils'

const resolveMetaPluginsSpy = vi.spyOn(MetaUtilsModule, 'resolveMetaPlugins')
const mergeErrorMapSpy = vi.spyOn(ErrorUtilsModule, 'mergeErrorMap')
const augmentContractRouterSpy = vi.spyOn(RouterUtilsModule, 'augmentContractRouter')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('contractBuilder', () => {
  const builder = ContractBuilder.create()
  builder['~orpc'] = {
    errorMap: {
      BASE: { status: 400 },
    },
    inputSchemas: [
      z.object({ init: z.string() }),
    ],
    outputSchemas: [
      z.object({ init: z.string() }),
    ],
    meta: {
      base: true,
    },
    metaPlugins: [
      {
        name: 'test1',
        init: m => m,
      },
    ],
  }

  const metaPlugin: AnyMetaPlugin = {
    name: 'test2',
    init: m => ({ ...m, metaPlugin: true }),
  }

  it('is a procedure contract', () => {
    expect(builder).toBeInstanceOf(ProcedureContract)
  })

  it('create', () => {
    expect(oc).toBeInstanceOf(ContractBuilder)
    expect(oc['~orpc']).toEqual({
      errorMap: {},
      meta: {},
    })
  })

  it('.meta', () => {
    const applied = builder.meta(metaPlugin)
    expect(applied).toBeInstanceOf(ContractBuilder)
    expect(applied).not.toBe(builder)

    expect(resolveMetaPluginsSpy).toHaveBeenCalledOnce()
    expect(resolveMetaPluginsSpy).toHaveBeenCalledWith(
      builder['~orpc'].meta,
      builder['~orpc'].metaPlugins,
      [metaPlugin],
    )

    expect(applied['~orpc']).toEqual({
      ...builder['~orpc'],
      meta: resolveMetaPluginsSpy.mock.results[0]?.value[0],
      metaPlugins: resolveMetaPluginsSpy.mock.results[0]?.value[1],
    })
  })

  describe('.errors', () => {
    it('without meta plugins', () => {
      const errors = {
        OVERRIDE: { message: 'override' },
      } satisfies ErrorMap

      const applied = builder.errors(errors)
      expect(applied).toBeInstanceOf(ContractBuilder)
      expect(applied).not.toBe(builder)

      expect(mergeErrorMapSpy).toHaveBeenCalledOnce()
      expect(mergeErrorMapSpy).toHaveBeenCalledWith(
        builder['~orpc'].errorMap,
        errors,
      )

      expect(applied['~orpc']).toEqual({
        ...builder['~orpc'],
        errorMap: mergeErrorMapSpy.mock.results[0]?.value,
      })
    })

    it('with meta plugins', () => {
      const errors = {
        OVERRIDE: { message: 'override' },
      } satisfies ErrorMap

      setHiddenMetaPlugins(errors, [metaPlugin])

      const applied = builder.errors(errors)
      expect(applied).toBeInstanceOf(ContractBuilder)
      expect(applied).not.toBe(builder)

      expect(mergeErrorMapSpy).toHaveBeenCalledOnce()
      expect(mergeErrorMapSpy).toHaveBeenCalledWith(
        builder['~orpc'].errorMap,
        errors,
      )

      expect(resolveMetaPluginsSpy).toHaveBeenCalledOnce()
      expect(resolveMetaPluginsSpy).toHaveBeenCalledWith(
        builder['~orpc'].meta,
        builder['~orpc'].metaPlugins,
        [metaPlugin],
      )

      expect(applied['~orpc']).toEqual({
        ...builder['~orpc'],
        errorMap: mergeErrorMapSpy.mock.results[0]?.value,
        meta: resolveMetaPluginsSpy.mock.results[0]?.value[0],
        metaPlugins: resolveMetaPluginsSpy.mock.results[0]?.value[1],
      })
    })
  })

  describe('.input', () => {
    it('without meta plugins', () => {
      const schema = z.object({ input: z.string() })
      const applied = builder.input(schema)
      expect(applied).toBeInstanceOf(ContractBuilder)
      expect(applied).not.toBe(builder)

      expect(applied['~orpc']).toEqual({
        ...builder['~orpc'],
        inputSchemas: [...builder['~orpc'].inputSchemas!, schema],
      })
    })

    it('with meta plugins', () => {
      const schema = z.object({ input: z.string() })

      setHiddenMetaPlugins(schema, [metaPlugin])

      const applied = builder.input(schema)
      expect(applied).toBeInstanceOf(ContractBuilder)
      expect(applied).not.toBe(builder)

      expect(resolveMetaPluginsSpy).toHaveBeenCalledOnce()
      expect(resolveMetaPluginsSpy).toHaveBeenCalledWith(
        builder['~orpc'].meta,
        builder['~orpc'].metaPlugins,
        [metaPlugin],
      )

      expect(applied['~orpc']).toEqual({
        ...builder['~orpc'],
        meta: resolveMetaPluginsSpy.mock.results[0]?.value[0],
        metaPlugins: resolveMetaPluginsSpy.mock.results[0]?.value[1],
        inputSchemas: [...builder['~orpc'].inputSchemas!, schema],
      })
    })
  })

  describe('.output', () => {
    it('without meta plugins', () => {
      const schema = z.object({ output: z.string() })
      const applied = builder.output(schema)
      expect(applied).toBeInstanceOf(ContractBuilder)
      expect(applied).not.toBe(builder)
      expect(applied['~orpc']).toEqual({
        ...builder['~orpc'],
        outputSchemas: [...builder['~orpc'].outputSchemas!, schema],
      })
    })

    it('with meta plugins', () => {
      const schema = z.object({ output: z.string() })

      setHiddenMetaPlugins(schema, [metaPlugin])

      const applied = builder.output(schema)
      expect(applied).toBeInstanceOf(ContractBuilder)
      expect(applied).not.toBe(builder)

      expect(resolveMetaPluginsSpy).toHaveBeenCalledOnce()
      expect(resolveMetaPluginsSpy).toHaveBeenCalledWith(
        builder['~orpc'].meta,
        builder['~orpc'].metaPlugins,
        [metaPlugin],
      )

      expect(applied['~orpc']).toEqual({
        ...builder['~orpc'],
        meta: resolveMetaPluginsSpy.mock.results[0]?.value[0],
        metaPlugins: resolveMetaPluginsSpy.mock.results[0]?.value[1],
        outputSchemas: [...builder['~orpc'].outputSchemas!, schema],
      })
    })
  })

  it('.router', () => {
    const router = {
      ping: builder.output(z.string()),
      pong: builder.input(z.string()).output(z.string()),
    }

    const applied = builder.router(router)
    expect(applied).toBe(augmentContractRouterSpy.mock.results[0]?.value)
    expect(augmentContractRouterSpy).toHaveBeenCalledOnce()
    expect(augmentContractRouterSpy).toHaveBeenCalledWith(router, builder['~orpc'])
  })
})
