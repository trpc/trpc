import * as ContractModule from '@orpc/contract'
import { z } from 'zod'
import { Lazy, unlazy } from './lazy'
import { Procedure } from './procedure'
import { withHiddenRouterContract } from './router-hidden'
import { augmentImplementedRouter, augmentRouter, getRouter, unlazyRouter, walkProcedureContractsAsync, walkProcedureContractsSync } from './router-utils'

const oc = ContractModule.oc
const resolveMetaPluginsSpy = vi.spyOn(ContractModule, 'resolveMetaPlugins')
const mergeErrorMapSpy = vi.spyOn(ContractModule, 'mergeErrorMap')

beforeEach(() => {
  vi.clearAllMocks()
})

const schema1 = z.object({ schema1: z.string() })
const schema2 = z.object({ schema2: z.string() })

function callable<T extends object>(value: T): T {
  return Object.assign(() => {}, value)
}

function middlewareEntries(middlewares: readonly unknown[]) {
  return middlewares.map(middleware => ({
    middleware,
    inputSchemasLengthAtUse: 0,
    outputSchemasLengthAtUse: 0,
  }))
}

const procedure1 = new Procedure({
  errorMap: {},
  meta: { p1: true },
  inputSchemas: [schema1],
  outputSchemas: [schema2],
  handler: vi.fn(),
  orderedMiddlewares: [],
  metaPlugins: [{ name: 'test', apply: vi.fn() }],
  disableInputValidation: false,
})

const procedure2 = new Procedure({
  errorMap: {
    ERR: {
      data: schema1,
      status: 400,
    },
  },
  meta: { p2: true },
  inputSchemas: [schema2],
  outputSchemas: [],
  handler: vi.fn(),
  orderedMiddlewares: [{ middleware: vi.fn() as any, inputSchemasLengthAtUse: 0, outputSchemasLengthAtUse: 0 }],
  disableOutputValidation: undefined,
})

/**
 * Router utilities should handle invalid routers/procedures
 * and support function-like routers/procedures.
 */
const router = {
  p1: procedure1,
  p2: procedure2,
  invalid: 'invalid' as any,
  nested: callable({
    p1: callable(procedure1),
    invalid: 'invalid' as any,
  }),
  lazy: new Lazy({
    loader: async () => ({
      default: {
        p1: procedure1,
        nested: callable({ p1: procedure1 }),
        invalid: 'invalid' as any,
      },
    }),
    meta: { lazy: true },
    metaPlugins: [{ name: 'test', apply: vi.fn() }],
  }),
}

async function unlazyDefault<T>(value: T): Promise<T extends Lazy<infer U> ? U : T> {
  return (await unlazy(value)).default
}

describe('augmentRouter', () => {
  function createAugmentOptions() {
    return {
      meta: { base: 'augmentRouter' },
      errorMap: {
        OVERRIDE: {
          data: schema1,
          status: 400,
        },
      },
      metaPlugins: [{ name: 'plugin1', init: vi.fn() }],
      middlewares: [vi.fn()],
      disableOutputValidation: true,
    }
  }

  function expectAugmentedProcedure(
    mergeCallIndex: number,
    resolveCallIndex: number,
    actual: any,
    original: any,
    options: ReturnType<typeof createAugmentOptions>,
  ) {
    const resolved = resolveMetaPluginsSpy.mock.results[resolveCallIndex - 1]?.value

    expect(actual).toBeInstanceOf(Procedure)
    expect(actual).not.toBe(original)
    expect(mergeErrorMapSpy).toHaveBeenNthCalledWith(mergeCallIndex, options.errorMap, original['~orpc'].errorMap)
    expect(resolveMetaPluginsSpy).toHaveBeenNthCalledWith(
      resolveCallIndex,
      options.meta,
      options.metaPlugins,
      original['~orpc'].metaPlugins,
    )
    expect(actual['~orpc']).toEqual({
      disableOutputValidation: true,
      ...original['~orpc'],
      orderedMiddlewares: [
        ...middlewareEntries(options.middlewares),
        ...original['~orpc'].orderedMiddlewares,
      ],
      errorMap: mergeErrorMapSpy.mock.results[mergeCallIndex - 1]?.value,
      meta: resolved?.[0],
      metaPlugins: resolved?.[1],
    })
  }

  function expectAugmentedLazy(
    resolveCallIndex: number,
    actual: any,
    original: any,
    options: ReturnType<typeof createAugmentOptions>,
  ) {
    const resolved = resolveMetaPluginsSpy.mock.results[resolveCallIndex - 1]?.value

    expect(actual).toBeInstanceOf(Lazy)
    expect(actual).not.toBe(original)
    expect(resolveMetaPluginsSpy).toHaveBeenNthCalledWith(
      resolveCallIndex,
      options.meta,
      options.metaPlugins,
      original['~orpc'].metaPlugins,
    )
    expect(actual['~orpc']).toEqual({
      ...original['~orpc'],
      loader: expect.any(Function),
      meta: resolved?.[0],
      metaPlugins: resolved?.[1],
    })
  }

  it('augments every procedure in nested and lazy routers', async () => {
    const options = createAugmentOptions()
    const augmented = augmentRouter(router, options)

    expect(augmented).not.toBe(router)
    expect(augmented.nested).not.toBe(router.nested)
    expect(augmented.invalid).toBe('invalid')
    expect(augmented.nested.invalid).toBe('invalid')

    const routerLazy = await unlazyDefault(router.lazy)
    const augmentedLazy = await unlazyDefault(augmented.lazy)

    expect(augmentedLazy).not.toBe(routerLazy)
    expect(augmentedLazy.invalid).toBe('invalid')

    expect(mergeErrorMapSpy).toHaveBeenCalledTimes(5)
    expect(resolveMetaPluginsSpy).toHaveBeenCalledTimes(6)

    expectAugmentedProcedure(1, 1, augmented.p1, router.p1, options)
    expectAugmentedProcedure(2, 2, augmented.p2, router.p2, options)
    expectAugmentedProcedure(3, 3, augmented.nested.p1, router.nested.p1, options)
    expectAugmentedLazy(4, augmented.lazy, router.lazy, options)
    expectAugmentedProcedure(4, 5, augmentedLazy.p1, routerLazy.p1, options)
    expectAugmentedProcedure(5, 6, augmentedLazy.nested.p1, routerLazy.nested.p1, options)
  })

  it('augments a procedure passed as the root router', () => {
    const options = createAugmentOptions()
    const augmented = augmentRouter(router.p2, options)

    expect(mergeErrorMapSpy).toHaveBeenCalledTimes(1)
    expect(resolveMetaPluginsSpy).toHaveBeenCalledTimes(1)

    expectAugmentedProcedure(1, 1, augmented, router.p2, options)
  })

  it('supports function-like routers passed as the root router', () => {
    const options = createAugmentOptions()
    const functionRouter = callable(router.nested)
    const augmented = augmentRouter(functionRouter, options)

    expect(augmented).not.toBe(functionRouter)
    expect(augmented.invalid).toBe('invalid')

    expect(mergeErrorMapSpy).toHaveBeenCalledTimes(1)
    expect(resolveMetaPluginsSpy).toHaveBeenCalledTimes(1)

    expectAugmentedProcedure(1, 1, augmented.p1, router.nested.p1, options)
  })

  it('returns non-object router values as-is', () => {
    const options = createAugmentOptions()
    const invalid = 'invalid' as any

    expect(augmentRouter(invalid, options)).toBe(invalid)
    expect(mergeErrorMapSpy).not.toHaveBeenCalled()
    expect(resolveMetaPluginsSpy).not.toHaveBeenCalled()
  })
})

describe('augmentImplementedRouter', () => {
  function createImplementedOptions() {
    return {
      middlewares: [vi.fn()],
      disableOutputValidation: true,
    }
  }

  function expectImplementedProcedure(
    actual: any,
    original: any,
    options: ReturnType<typeof createImplementedOptions>,
  ) {
    expect(actual).toBeInstanceOf(Procedure)
    expect(actual).not.toBe(original)
    expect(actual['~orpc']).toEqual({
      disableOutputValidation: true,
      ...original['~orpc'],
      orderedMiddlewares: [
        ...middlewareEntries(options.middlewares),
        ...original['~orpc'].orderedMiddlewares,
      ],
    })
  }

  it('augments every procedure in nested and lazy routers', async () => {
    const options = createImplementedOptions()
    const augmented = augmentImplementedRouter(router, options)

    expect(augmented).not.toBe(router)
    expect(augmented.nested).not.toBe(router.nested)
    expect(augmented.invalid).toBe('invalid')
    expect(augmented.nested.invalid).toBe('invalid')
    expect(augmented.lazy).toBeInstanceOf(Lazy)
    expect(augmented.lazy).not.toBe(router.lazy)

    const routerLazy = await unlazyDefault(router.lazy)
    const augmentedLazy = await unlazyDefault(augmented.lazy)

    expect(augmented.lazy['~orpc']).toEqual({
      ...router.lazy['~orpc'],
      loader: expect.any(Function),
    })

    expect(augmentedLazy).not.toBe(routerLazy)
    expect(augmentedLazy.invalid).toBe('invalid')

    expectImplementedProcedure(augmented.p1, router.p1, options)
    expectImplementedProcedure(augmented.p2, router.p2, options)
    expectImplementedProcedure(augmented.nested.p1, router.nested.p1, options)
    expectImplementedProcedure(augmentedLazy.p1, routerLazy.p1, options)
    expectImplementedProcedure(augmentedLazy.nested.p1, routerLazy.nested.p1, options)

    expect(mergeErrorMapSpy).not.toHaveBeenCalled()
    expect(resolveMetaPluginsSpy).not.toHaveBeenCalled()
  })

  it('augments a procedure passed as the root router', () => {
    const options = createImplementedOptions()
    const augmented = augmentImplementedRouter(router.p1, options)

    expectImplementedProcedure(augmented, router.p1, options)
    expect(mergeErrorMapSpy).not.toHaveBeenCalled()
    expect(resolveMetaPluginsSpy).not.toHaveBeenCalled()
  })

  it('supports function-like routers passed as the root router', () => {
    const options = createImplementedOptions()
    const functionRouter = callable(router.nested)
    const augmented = augmentImplementedRouter(functionRouter, options)

    expect(augmented).not.toBe(functionRouter)
    expect(augmented.invalid).toBe('invalid')

    expectImplementedProcedure(augmented.p1, router.nested.p1, options)
    expect(mergeErrorMapSpy).not.toHaveBeenCalled()
    expect(resolveMetaPluginsSpy).not.toHaveBeenCalled()
  })

  it('returns non-object router values as-is', () => {
    const options = createImplementedOptions()
    const invalid = 'invalid' as any

    expect(augmentImplementedRouter(invalid, options)).toBe(invalid)
  })
})

describe('getRouter', () => {
  it('returns routers and procedures for valid paths', () => {
    expect(getRouter(router, [])).toBe(router)
    expect(getRouter(router, ['p1'])).toBe(router.p1)
    expect(getRouter(router, ['nested'])).toBe(router.nested)
    expect(getRouter(router, ['nested', 'p1'])).toBe(router.nested.p1)

    expect(getRouter(router.p1, [])).toBe(router.p1)
    expect(getRouter(router.lazy, [])).toBe(router.lazy)
    expect(getRouter(router.nested, [])).toBe(router.nested)
  })

  it('returns lazy routers for paths that cross a lazy router', async () => {
    const routerLazy = await unlazyDefault(router.lazy)

    const lazyP1 = getRouter(router, ['lazy', 'p1'])
    expect(lazyP1).toBeInstanceOf(Lazy)
    expect(await unlazyDefault(lazyP1)).toBe(routerLazy.p1)

    const lazyNestedP1 = getRouter(router, ['lazy', 'nested', 'p1'])
    expect(lazyNestedP1).toBeInstanceOf(Lazy)
    expect(await unlazyDefault(lazyNestedP1)).toBe(routerLazy.nested.p1)

    const lazyInvalid = getRouter(router, ['lazy', 'invalid'])
    expect(lazyInvalid).toBeInstanceOf(Lazy)
    expect(await unlazyDefault(lazyInvalid)).toBeUndefined()
  })

  it('returns undefined for invalid paths', () => {
    expect(getRouter(router, ['notExist'])).toBeUndefined()
    expect(getRouter(router, ['p1', '~orpc'])).toBeUndefined()
    expect(getRouter(router, ['invalid'])).toBeUndefined()
    expect(getRouter(router, ['invalid', 'notExists'])).toBeUndefined()
    expect(getRouter('invalid' as any, [])).toBeUndefined()
    expect(getRouter('invalid' as any, ['invalid'])).toBeUndefined()
    expect(getRouter(router, ['__proto__'])).toBeUndefined()
    expect(getRouter(router, ['nested', 'hasOwnProperty'])).toBeUndefined()
  })
})

describe('walkProcedureContractsSync', () => {
  it('walks procedure contracts and returns lazy routers', () => {
    const entries = vi.fn()
    const result = walkProcedureContractsSync(router, entries)

    expect(entries).toHaveBeenCalledTimes(3)
    expect(entries).toHaveBeenNthCalledWith(1, router.p1, ['p1'])
    expect(entries).toHaveBeenNthCalledWith(2, router.p2, ['p2'])
    expect(entries).toHaveBeenNthCalledWith(3, router.nested.p1, ['nested', 'p1'])
    expect(result).toEqual([{ path: ['lazy'], router: router.lazy }])
  })

  it('uses hidden function-like contracts instead of the runtime router', () => {
    const contract = {
      p1: oc.errors({ BAD_GATEWAY: {} }),
      nested: callable({
        p2: callable(oc.errors({ CONFLICT: {} })),
      }),
    }

    const withHiddenContract = withHiddenRouterContract(router, contract)
    const entries = vi.fn()
    const result = walkProcedureContractsSync(withHiddenContract, entries)

    expect(entries).toHaveBeenCalledTimes(2)
    expect(entries).toHaveBeenNthCalledWith(1, contract.p1, ['p1'])
    expect(entries).toHaveBeenNthCalledWith(2, contract.nested.p2, ['nested', 'p2'])
    expect(result).toEqual([])
  })

  it('supports a custom base path', () => {
    const entries = vi.fn()

    walkProcedureContractsSync(router, entries, ['custom'])

    expect(entries).toHaveBeenNthCalledWith(1, router.p1, ['custom', 'p1'])
    expect(entries).toHaveBeenNthCalledWith(2, router.p2, ['custom', 'p2'])
    expect(entries).toHaveBeenNthCalledWith(3, router.nested.p1, ['custom', 'nested', 'p1'])
  })

  it('ignores invalid roots', () => {
    const entries = vi.fn()

    expect(walkProcedureContractsSync('invalid' as any, entries)).toEqual([])
    expect(entries).not.toHaveBeenCalled()
  })
})

describe('walkProcedureContractsAsync', () => {
  it('awaits async callbacks while traversing normal and lazy routers', async () => {
    const events: string[] = []

    await walkProcedureContractsAsync(router, async (contract, path) => {
      events.push(`start:${path.join('.')}`)
      await Promise.resolve()
      events.push(`end:${path.join('.')}`)

      if (path[0] === 'lazy') {
        const lazied = getRouter(router, path)
        expect(lazied).toBeInstanceOf(Lazy)
        expect(contract).toBe(await unlazyDefault(lazied))
      }
      else {
        expect(contract).toBe(getRouter(router, path))
      }
    })

    expect(events).toEqual([
      'start:p1',
      'end:p1',
      'start:p2',
      'end:p2',
      'start:nested.p1',
      'end:nested.p1',
      'start:lazy.p1',
      'end:lazy.p1',
      'start:lazy.nested.p1',
      'end:lazy.nested.p1',
    ])
  })

  it('uses hidden function-like contracts instead of the runtime router', async () => {
    const contract = {
      p1: oc.errors({ BAD_GATEWAY: {} }),
      invalid: 'invalid' as any,
      nested: callable({
        p2: callable(oc.errors({ CONFLICT: {} })),
        invalid: 'invalid' as any,
      }),
    }

    const withHiddenContract = withHiddenRouterContract(router, contract)
    const entries = vi.fn(async () => {})

    await walkProcedureContractsAsync(withHiddenContract, entries)

    expect(entries).toHaveBeenCalledTimes(2)
    expect(entries).toHaveBeenNthCalledWith(1, contract.p1, ['p1'])
    expect(entries).toHaveBeenNthCalledWith(2, contract.nested.p2, ['nested', 'p2'])
  })

  it('supports a custom base path', async () => {
    const entries = vi.fn(async () => {})
    const routerLazy = await unlazyDefault(router.lazy)

    await walkProcedureContractsAsync(router, entries, ['custom'])

    expect(entries).toHaveBeenCalledTimes(5)
    expect(entries).toHaveBeenNthCalledWith(1, router.p1, ['custom', 'p1'])
    expect(entries).toHaveBeenNthCalledWith(2, router.p2, ['custom', 'p2'])
    expect(entries).toHaveBeenNthCalledWith(3, router.nested.p1, ['custom', 'nested', 'p1'])
    expect(entries).toHaveBeenNthCalledWith(4, routerLazy.p1, ['custom', 'lazy', 'p1'])
    expect(entries).toHaveBeenNthCalledWith(5, routerLazy.nested.p1, ['custom', 'lazy', 'nested', 'p1'])
  })
})

describe('unlazyRouter', () => {
  it('unlazies nested lazy routers', async () => {
    const nestedRouter = {
      p1: procedure1,
      p2: new Lazy({
        loader: async () => ({ default: procedure2 }),
        meta: {},
      }),
      nested: new Lazy({
        loader: async () => ({
          default: {
            p1: procedure1,
            p2: new Lazy({
              loader: async () => ({ default: procedure2 }),
              meta: {},
            }),
          },
        }),
        meta: {},
      }),
    }

    const unlazied = await unlazyRouter(nestedRouter)

    expect(unlazied).toEqual({
      p1: procedure1,
      p2: procedure2,
      nested: {
        p1: procedure1,
        p2: procedure2,
      },
    })
  })

  it('returns procedures and non-object values as-is', async () => {
    expect(await unlazyRouter(router.p1)).toBe(router.p1)
    expect(await unlazyRouter('invalid' as any)).toBe('invalid')
  })
})
