import type { AnyMetaPlugin, ErrorMap } from '@orpc/contract'
import type { AnyFunction } from '@orpc/shared'
import type { AnyMiddleware } from './middleware'
import * as ContractModule from '@orpc/contract'
import { toArray } from '@orpc/shared'
import { z } from 'zod'
import { Builder, os } from './builder'
import * as LazyModule from './lazy'
import * as MiddlewareDecoratedModule from './middleware-decorated'
import * as ProcedureDecoratedModule from './procedure-decorated'
import * as RouterUtilsModule from './router-utils'

const resolveMetaPluginsSpy = vi.spyOn(ContractModule, 'resolveMetaPlugins')
const mergeErrorMapSpy = vi.spyOn(ContractModule, 'mergeErrorMap')
const augmentRouterSpy = vi.spyOn(RouterUtilsModule, 'augmentRouter')
const decorateMiddlewareSpy = vi.spyOn(MiddlewareDecoratedModule, 'decorateMiddleware')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('builder', () => {
  const builder = Builder.create()
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
        name: 'test',
        init: m => m,
      },
    ],
    orderedMiddlewares: [
      { middleware: vi.fn() as AnyFunction, inputSchemasLengthAtUse: 0, outputSchemasLengthAtUse: 0 },
    ],
    disableInputValidation: false,
    disableOutputValidation: false,
  }

  const metaPlugin: AnyMetaPlugin = {
    name: 'test',
    init: m => ({ ...m, metaPlugin: true }),
  }

  it('create', () => {
    expect(os).toBeInstanceOf(Builder)
    expect(os['~orpc']).toEqual({
      errorMap: {},
      meta: {},
      orderedMiddlewares: [],
    })
  })

  it('$context', () => {
    expect(builder.$context()).toBe(builder)
  })

  it('$config', () => {
    const applied = builder.$config({
      disableOutputValidation: undefined,
    })

    expect(applied).toBeInstanceOf(Builder)
    expect(applied).not.toBe(builder)

    expect(applied['~orpc']).toEqual({
      ...builder['~orpc'],
      disableOutputValidation: undefined,
    })
  })

  it('.meta', () => {
    const applied = builder.meta(metaPlugin)
    expect(applied).toBeInstanceOf(Builder)
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
      expect(applied).toBeInstanceOf(Builder)
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

      ContractModule.setHiddenMetaPlugins(errors, [metaPlugin])

      const applied = builder.errors(errors)
      expect(applied).toBeInstanceOf(Builder)
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

  describe('.use', () => {
    it('without meta plugins', () => {
      const middleware = vi.fn()
      const applied = builder.use(middleware)
      expect(applied).toBeInstanceOf(Builder)
      expect(applied).not.toBe(builder)

      expect(mergeErrorMapSpy).toHaveBeenCalledOnce()
      expect(mergeErrorMapSpy).toHaveBeenCalledWith(
        {},
        builder['~orpc'].errorMap,
      )

      expect(applied['~orpc']).toEqual({
        ...builder['~orpc'],
        errorMap: mergeErrorMapSpy.mock.results[0]?.value,
        orderedMiddlewares: [
          ...builder['~orpc'].orderedMiddlewares,
          {
            middleware,
            inputSchemasLengthAtUse: builder['~orpc'].inputSchemas!.length,
            outputSchemasLengthAtUse: builder['~orpc'].outputSchemas!.length,
          },
        ],
      })
    })

    it('with middleware error map', () => {
      const middleware: any = vi.fn()
      middleware['~orpc'] = { errorMap: { MID: { status: 400 } } }
      const applied = builder.use(middleware)

      expect(mergeErrorMapSpy).toHaveBeenCalledOnce()
      expect(mergeErrorMapSpy).toHaveBeenCalledWith(
        middleware['~orpc'].errorMap,
        builder['~orpc'].errorMap,
      )
    })

    it('with meta plugins', () => {
      const middleware: any = vi.fn()
      middleware['~orpc'] = { metaPlugins: [metaPlugin] }

      const applied = builder.use(middleware)
      expect(applied).toBeInstanceOf(Builder)
      expect(applied).not.toBe(builder)

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
        orderedMiddlewares: [
          ...builder['~orpc'].orderedMiddlewares,
          {
            middleware,
            inputSchemasLengthAtUse: builder['~orpc'].inputSchemas!.length,
            outputSchemasLengthAtUse: builder['~orpc'].outputSchemas!.length,
          },
        ],
      })
    })
  })

  describe('.middleware', () => {
    it('without previous middleware', () => {
      const b = Builder.create()
      const middleware = vi.fn()
      const decorated = { use: vi.fn().mockReturnThis() }
      decorateMiddlewareSpy.mockReturnValue(decorated as any)

      const applied = b.middleware(middleware)
      expect(applied).toBe(decorated)
      expect(applied['~orpc']).toEqual({
        errorMap: b['~orpc'].errorMap,
        metaPlugins: toArray(b['~orpc'].metaPlugins),
      })

      expect(decorateMiddlewareSpy).toHaveBeenCalledWith(middleware)
      expect(decorated.use).not.toHaveBeenCalled()
    })

    it('with previous middleware', () => {
      const middleware = vi.fn()
      const result = { use: vi.fn() }
      const decorated = { use: vi.fn().mockReturnValue(result) }
      decorateMiddlewareSpy.mockReturnValue(decorated as any)

      const applied = builder.middleware(middleware)
      expect(applied).toBe(result)
      expect(applied['~orpc']).toEqual({
        errorMap: builder['~orpc'].errorMap,
        metaPlugins: builder['~orpc'].metaPlugins,
      })

      expect(decorateMiddlewareSpy).toHaveBeenCalledWith(builder['~orpc'].orderedMiddlewares[0]!.middleware)
      expect(decorated.use).toHaveBeenCalledWith(middleware)
    })

    it('with meta plugins', () => {
      const middleware: AnyMiddleware = vi.fn() as any
      const midMetaPlugin: AnyMetaPlugin = { name: 'test', init: m => m }
      middleware['~orpc'] = {
        metaPlugins: [midMetaPlugin],
      }
      const decorated = { use: vi.fn().mockReturnThis() }
      decorateMiddlewareSpy.mockReturnValue(decorated as any)

      const applied = builder.middleware(middleware)
      expect(applied).toBe(decorated)
      expect(applied['~orpc']).toEqual({
        errorMap: builder['~orpc'].errorMap,
        metaPlugins: [...builder['~orpc'].metaPlugins!, midMetaPlugin],
      })
    })
  })

  describe('.input', () => {
    it('without meta plugins', () => {
      const schema = z.object({ input: z.string() })
      const applied = builder.input(schema)
      expect(applied).toBeInstanceOf(Builder)
      expect(applied).not.toBe(builder)

      expect(applied['~orpc']).toEqual({
        ...builder['~orpc'],
        inputSchemas: [...builder['~orpc'].inputSchemas!, schema],
      })
    })

    it('with meta plugins', () => {
      const schema = z.object({ input: z.string() })
      ContractModule.setHiddenMetaPlugins(schema, [metaPlugin])

      const applied = builder.input(schema)
      expect(applied).toBeInstanceOf(Builder)
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
      expect(applied).toBeInstanceOf(Builder)
      expect(applied).not.toBe(builder)
      expect(applied['~orpc']).toEqual({
        ...builder['~orpc'],
        outputSchemas: [...builder['~orpc'].outputSchemas!, schema],
      })
    })

    it('with meta plugins', () => {
      const schema = z.object({ output: z.string() })
      ContractModule.setHiddenMetaPlugins(schema, [metaPlugin])

      const applied = builder.output(schema)
      expect(applied).toBeInstanceOf(Builder)
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

  describe('.handler', () => {
    it('without meta plugins', () => {
      const handler = vi.fn()
      const applied = builder.handler(handler)
      expect(applied).toBeInstanceOf(ProcedureDecoratedModule.DecoratedProcedure)
      expect(applied['~orpc']).toEqual({
        ...builder['~orpc'],
        handler,
      })
    })

    it('with meta plugins', () => {
      const handler = vi.fn()
      ContractModule.setHiddenMetaPlugins(handler, [metaPlugin])

      const applied = builder.handler(handler)
      expect(applied).toBeInstanceOf(ProcedureDecoratedModule.DecoratedProcedure)

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
        handler,
      })
    })
  })

  it('.router', () => {
    const router = { ping: builder.handler(vi.fn()) }
    const applied = builder.router(router)
    expect(applied).toBe(augmentRouterSpy.mock.results[0]?.value)
    expect(augmentRouterSpy).toHaveBeenCalledOnce()
    expect(augmentRouterSpy).toHaveBeenCalledWith(router, {
      ...builder['~orpc'],
      middlewares: builder['~orpc'].orderedMiddlewares.map((m: any) => m.middleware),
    })
  })

  it('.lazy', async () => {
    const router = { ping: builder.handler(vi.fn()) }
    const loader = async () => ({ default: router })
    const applied = builder.lazy(loader)

    expect(applied).toBeInstanceOf(LazyModule.Lazy)
    expect(applied['~orpc'].meta).toEqual(builder['~orpc'].meta)
    expect(applied['~orpc'].metaPlugins).toEqual(builder['~orpc'].metaPlugins)

    const unlazied = await applied['~orpc'].loader()
    expect(unlazied.default).toBe(augmentRouterSpy.mock.results[0]?.value)
    expect(augmentRouterSpy).toHaveBeenCalledOnce()
    expect(augmentRouterSpy).toHaveBeenCalledWith(router, {
      ...builder['~orpc'],
      middlewares: builder['~orpc'].orderedMiddlewares.map((m: any) => m.middleware),
    })
  })
})
