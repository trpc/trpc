import { oc } from '@orpc/contract'
import { z } from 'zod'
import { os } from '../../builder'
import { Lazy } from '../../lazy'
import * as ProcedureUtils from '../../procedure-utils'
import { withHiddenRouterContract } from '../../router-hidden'
import { RPCMatcher } from './rpc-matcher'

const createContractProcedureSpy = vi.spyOn(ProcedureUtils, 'createContractProcedure')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('rpcMatcher', () => {
  const schema1 = z.object({ input: z.string() })
  const schema2 = z.object({ output: z.number() })

  const procedure1 = os.input(schema1).handler(() => 'output')
  const procedure2 = os.output(schema2).handler(() => ({ output: 456 }))
  const procedure3 = os.errors({ BAD_GATEWAY: {} }).handler(() => {})

  const lazyLazyLoader = vi.fn(async () => ({ default: { deep: procedure1 } }))
  const lazyLoader = vi.fn(async () => ({ default: {
    info: procedure3,
    lazy: new Lazy({
      loader: lazyLazyLoader,
      meta: {},
    }),
  } }))

  const router = {
    ping: procedure1,
    nested: {
      echo: procedure2,
    },
    lazy: new Lazy({
      loader: lazyLoader,
      meta: {},
    }),
  }

  it('matches a top-level procedure', async () => {
    const matcher = new RPCMatcher(router)
    const result = await matcher.match('POST', '/ping', undefined)

    expect(result).toBeDefined()
    expect(result!.path).toEqual(['ping'])
    expect(result!.procedure).toBe(procedure1)
    expect(lazyLoader).toHaveBeenCalledTimes(0)
    expect(lazyLazyLoader).toHaveBeenCalledTimes(0)
  })

  it('matches a nested procedure', async () => {
    const matcher = new RPCMatcher(router)
    const result = await matcher.match('POST', '/nested/echo', undefined)

    expect(result).toBeDefined()
    expect(result!.path).toEqual(['nested', 'echo'])
    expect(result!.procedure).toBe(procedure2)
    expect(lazyLoader).toHaveBeenCalledTimes(0)
    expect(lazyLazyLoader).toHaveBeenCalledTimes(0)
  })

  it('returns undefined for non-existent path', async () => {
    const matcher = new RPCMatcher(router)
    const result = await matcher.match('POST', '/nonexistent', undefined)

    expect(result).toBeUndefined()
    expect(lazyLoader).toHaveBeenCalledTimes(0)
    expect(lazyLazyLoader).toHaveBeenCalledTimes(0)
  })

  it('resolves and matches a procedure in a lazy router', async () => {
    const matcher = new RPCMatcher(router)
    const result = await matcher.match('POST', '/lazy/info', undefined)

    expect(result).toBeDefined()
    expect(result!.path).toEqual(['lazy', 'info'])
    expect(result!.procedure).toBe(procedure3)
    expect(lazyLoader).toHaveBeenCalledTimes(1)
    expect(lazyLazyLoader).toHaveBeenCalledTimes(0)

    const result3 = await matcher.match('POST', '/lazy/info', undefined)

    expect(result3).toEqual(result)
    // ensure the lazy loader is not called again
    expect(lazyLoader).toHaveBeenCalledTimes(1)
    expect(lazyLazyLoader).toHaveBeenCalledTimes(0)
  })

  it('resolves and matches a deeply nested procedure in lazy routers', async () => {
    const matcher = new RPCMatcher(router)
    const result = await matcher.match('POST', '/lazy/lazy/deep', undefined)

    expect(result).toBeDefined()
    expect(result!.path).toEqual(['lazy', 'lazy', 'deep'])
    expect(result!.procedure).toBe(procedure1)
    expect(lazyLoader).toHaveBeenCalledTimes(1)
    expect(lazyLazyLoader).toHaveBeenCalledTimes(1)

    const result2 = await matcher.match('POST', '/lazy/lazy/deep', undefined)
    expect(result2).toEqual(result)
    // ensure the lazy loaders are not called again
    expect(lazyLoader).toHaveBeenCalledTimes(1)
    expect(lazyLazyLoader).toHaveBeenCalledTimes(1)
  })

  it('resolves a lazy router that itself is a procedure', async () => {
    const loader = vi.fn(async () => ({ default: procedure2 }))
    const matcher = new RPCMatcher({ ping: new Lazy({ loader, meta: {} }) })

    const result = await matcher.match('POST', '/ping', undefined)

    expect(result).toBeDefined()
    expect(result!.path).toEqual(['ping'])
    expect(result!.procedure).toBe(procedure2)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('does not confuse lazy routers whose keys share a prefix', async () => {
    const lazyLoaderSpy = vi.fn(async () => ({ default: { info: procedure1 } }))
    const lazyFooLoader = vi.fn(async () => ({ default: { bar: procedure2 } }))

    const matcher = new RPCMatcher({
      lazy: new Lazy({ loader: lazyLoaderSpy, meta: {} }),
      lazyfoo: new Lazy({ loader: lazyFooLoader, meta: {} }),
    })

    const result = await matcher.match('POST', '/lazyfoo/bar', undefined)

    expect(result).toBeDefined()
    expect(result!.path).toEqual(['lazyfoo', 'bar'])
    expect(result!.procedure).toBe(procedure2)
    expect(lazyFooLoader).toHaveBeenCalledTimes(1)
    // "/lazy" is not a path segment of "/lazyfoo/bar", so that router stays untouched
    expect(lazyLoaderSpy).toHaveBeenCalledTimes(0)
  })

  it('retries a lazy router whose load fails, synchronously or asynchronously', async () => {
    let attempts = 0
    const loader = vi.fn(() => {
      attempts++
      // the first attempt throws synchronously out of `unlazy`, the second rejects
      if (attempts === 1) {
        throw new Error('sync boom')
      }
      if (attempts === 2) {
        return Promise.reject(new Error('async boom'))
      }
      return Promise.resolve({ default: { info: procedure3 } })
    })

    const matcher = new RPCMatcher({ lazy: new Lazy({ loader: loader as any, meta: {} }) })

    await expect(matcher.match('POST', '/lazy/info', undefined)).rejects.toThrowError('sync boom')
    await expect(matcher.match('POST', '/lazy/info', undefined)).rejects.toThrowError('async boom')

    // a failed load must leave the router pending so a later match can still resolve it
    const result = await matcher.match('POST', '/lazy/info', undefined)

    expect(result).toBeDefined()
    expect(result!.path).toEqual(['lazy', 'info'])
    expect(result!.procedure).toBe(procedure3)
    expect(loader).toHaveBeenCalledTimes(3)
  })

  it('resolves a deep lazy chain for concurrent matches without losing or reloading routers', async () => {
    const leaf = os.handler(() => 'ok')
    const loads: Record<string, number> = {}

    /** `l1` -> `l2` -> `l3`, each lazy, each also exposing a `leaf` procedure beside the next level */
    function lazyLevel(depth: number): Lazy<any> {
      return new Lazy({
        meta: {},
        loader: async () => {
          loads[`l${depth}`] = (loads[`l${depth}`] ?? 0) + 1

          // settle after a different number of microtask turns per level, so they interleave
          for (let i = 0; i < 5 - depth; i++) {
            await Promise.resolve()
          }

          return { default: depth === 3 ? { leaf } : { leaf, [`l${depth + 1}`]: lazyLevel(depth + 1) } }
        },
      })
    }

    const matcher = new RPCMatcher({ l1: lazyLevel(1) })

    const paths = ['/l1/leaf', '/l1/l2/leaf', '/l1/l2/l3/leaf'] as const
    const results = await Promise.all(
      paths.flatMap(path => [
        matcher.match('POST', path, undefined),
        matcher.match('POST', path, undefined),
      ]),
    )

    expect(results.map(result => result?.path.join('/'))).toEqual([
      'l1/leaf',
      'l1/leaf',
      'l1/l2/leaf',
      'l1/l2/leaf',
      'l1/l2/l3/leaf',
      'l1/l2/l3/leaf',
    ])

    // every level is loaded exactly once even though six matches raced for it
    expect(loads).toEqual({ l1: 1, l2: 1, l3: 1 })

    // and the deepest route stays matchable afterwards
    await expect(matcher.match('POST', '/l1/l2/l3/leaf', undefined)).resolves.toBeDefined()
    expect(loads).toEqual({ l1: 1, l2: 1, l3: 1 })
  })

  it('looks up lazy prefixes no deeper than the deepest pending lazy router', async () => {
    const loader = vi.fn(async () => ({ default: { find: os.handler(() => 'ok') } }))
    const matcher = new RPCMatcher({ planet: os.lazy(loader) })
    const pending = (matcher as any).pendingLazyRouters as Map<string, unknown>
    const hasSpy = vi.spyOn(pending, 'has')
    const getSpy = vi.spyOn(pending, 'get')

    await expect(matcher.match('POST', `/${'/'.repeat(16_000)}%25`, undefined)).resolves.toBeUndefined()

    // max pending depth is 1, and there are two passes (raw + normalized)
    expect(hasSpy.mock.calls.length + getSpy.mock.calls.length).toBeLessThanOrEqual(2)
    expect(loader).not.toHaveBeenCalled()
  })

  it('resolves lazy routers nested deeper than any pending one in a single match', async () => {
    const deep = os.handler(() => 'deep')
    const inner = vi.fn(async () => ({ default: { deep } }))
    const outer = vi.fn(async () => ({ default: { lazy: new Lazy({ loader: inner, meta: {} }) } }))
    const matcher = new RPCMatcher({ nested: { lazy: new Lazy({ loader: outer, meta: {} }) } })

    // the inner lazy router (depth 3) only becomes pending once the outer one (depth 2) loads
    const result = await matcher.match('POST', '/nested/lazy/lazy/deep', undefined)

    expect(result).toBeDefined()
    expect(result!.path).toEqual(['nested', 'lazy', 'lazy', 'deep'])
    expect(result!.procedure).toBe(deep)
    expect(outer).toHaveBeenCalledTimes(1)
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it('support filter option', async () => {
    const filter = vi.fn((procedure: any) => procedure === procedure2)
    const matcher = new RPCMatcher(router, { filter })

    await expect(matcher.match('POST', '/ping', undefined)).resolves.toBeUndefined()
    await expect(matcher.match('POST', '/nested/echo', undefined)).resolves.toBeDefined()
  })

  describe('allowMethods', () => {
    it.each([
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ] as const)('matches %s requests by default', async (method) => {
      const matcher = new RPCMatcher(router)

      await expect(matcher.match(method, '/ping', undefined)).resolves.toBeDefined()
    })

    it.each([
      'GET',
      'HEAD',
      'OPTIONS',
      'QUERY',
      'TRACE',
    ] as const)('treats %s requests as unmatched by default', async (method) => {
      const matcher = new RPCMatcher(router)

      await expect(matcher.match(method, '/ping', undefined)).resolves.toBeUndefined()
    })

    it('replaces the default allowlist entirely when a list is provided', async () => {
      const matcher = new RPCMatcher(router, { allowMethods: ['GET', 'QUERY'] })

      await expect(matcher.match('GET', '/ping', undefined)).resolves.toBeDefined()
      await expect(matcher.match('QUERY', '/ping', undefined)).resolves.toBeDefined()
      await expect(matcher.match('POST', '/ping', undefined)).resolves.toBeUndefined()
    })

    it('decides per request with the method, matched procedure, and path', async () => {
      const allowMethods = vi.fn((method: string, _procedure: unknown, path: string[]) => method === 'GET' && path[0] === 'ping')
      const matcher = new RPCMatcher(router, { allowMethods })

      const matched = await matcher.match('GET', '/ping', undefined)
      expect(matched).toBeDefined()
      expect(matched!.path).toEqual(['ping'])
      expect(matched!.procedure).toBe(procedure1)
      expect(allowMethods).toHaveBeenCalledWith('GET', procedure1, ['ping'])

      await expect(matcher.match('GET', '/nested/echo', undefined)).resolves.toBeUndefined()
      expect(allowMethods).toHaveBeenCalledWith('GET', procedure2, ['nested', 'echo'])

      // the function replaces the default allowlist entirely
      await expect(matcher.match('POST', '/ping', undefined)).resolves.toBeUndefined()
      expect(allowMethods).toHaveBeenCalledWith('POST', procedure1, ['ping'])

      expect(allowMethods).toHaveBeenCalledTimes(3)
    })

    it('consults the function with lazily resolved procedures', async () => {
      const allowMethods = vi.fn(() => false)
      const matcher = new RPCMatcher(router, { allowMethods })

      await expect(matcher.match('POST', '/lazy/info', undefined)).resolves.toBeUndefined()
      expect(allowMethods).toHaveBeenCalledOnce()
      expect(allowMethods).toHaveBeenCalledWith('POST', procedure3, ['lazy', 'info'])

      allowMethods.mockReturnValueOnce(true)
      const matched = await matcher.match('POST', '/lazy/info', undefined)
      expect(matched).toBeDefined()
      expect(matched!.procedure).toBe(procedure3)
    })

    it('does not consult the function for unmatched paths', async () => {
      const allowMethods = vi.fn(() => true)
      const matcher = new RPCMatcher(router, { allowMethods })

      await expect(matcher.match('POST', '/missing', undefined)).resolves.toBeUndefined()
      expect(allowMethods).not.toHaveBeenCalled()
    })
  })

  describe('prefix', () => {
    it('handles prefix stripping', async () => {
      const matcher = new RPCMatcher(router)
      const result = await matcher.match('POST', '/api/v1/ping', '/api/v1')

      expect(result).toBeDefined()
      expect(result!.path).toEqual(['ping'])
      expect(result!.procedure).toBe(procedure1)
    })

    it('returns undefined when pathname does not start with prefix', async () => {
      const matcher = new RPCMatcher(router)
      const result = await matcher.match('POST', '/other/ping', '/api/v1')

      expect(result).toBeUndefined()
    })

    it('returns undefined when prefix is not a full path segment', async () => {
      const matcher = new RPCMatcher(router)
      const result = await matcher.match('POST', '/apiping', '/api')

      expect(result).toBeUndefined()
    })

    it('handles prefix stripping with trailing slash', async () => {
      const matcher = new RPCMatcher(router)
      const result = await matcher.match('POST', '/api/ping', '/api/')

      expect(result).toBeDefined()
      expect(result!.path).toEqual(['ping'])
      expect(result!.procedure).toBe(procedure1)
    })

    it('returns undefined when pathname is missing trailing slash while prefix has trailing slash', async () => {
      const matcher = new RPCMatcher(procedure1)
      const result = await matcher.match('POST', '/api', '/api/')

      expect(result).toBeUndefined()
    })

    it('handles prefix that is equal to pathname', async () => {
      const matcher = new RPCMatcher(procedure1)
      const result = await matcher.match('POST', '/api', '/api')

      expect(result).toBeDefined()
      expect(result!.path).toEqual([])
      expect(result!.procedure).toBe(procedure1)
    })

    it('handles prefix with trailing slash that is equal to pathname', async () => {
      const matcher = new RPCMatcher(procedure1)
      const result = await matcher.match('POST', '/api/', '/api/')

      expect(result).toBeDefined()
      expect(result!.path).toEqual([])
      expect(result!.procedure).toBe(procedure1)
    })

    it('strips trailing slash after prefix stripping', async () => {
      const matcher = new RPCMatcher(router)

      await expect(matcher.match('POST', '/api/ping/', '/api/')).resolves.toEqual({ path: ['ping'], procedure: procedure1 })
      await expect(matcher.match('POST', '/api/ping/', '/api')).resolves.toEqual({ path: ['ping'], procedure: procedure1 })
    })
  })

  describe('contract first', () => {
    it('prefer hidden contract', async () => {
      const contract = {
        ping: oc.errors({ NOT_FOUND: {} }),
        nested: {
          echo: oc.input(z.object({ val: z.string() })),
        },
      }

      const matcher = new RPCMatcher(withHiddenRouterContract(router, contract))

      const r1 = await matcher.match('POST', '/ping', undefined)
      expect(r1).toBeDefined()
      expect(r1!.path).toEqual(['ping'])
      expect(createContractProcedureSpy).toHaveBeenCalledTimes(1)
      expect(createContractProcedureSpy).toHaveBeenNthCalledWith(1, router.ping, contract.ping)
      expect(r1!.procedure).not.toBe(procedure1)
      expect(r1!.procedure).toBe(createContractProcedureSpy.mock.results[0]!.value)

      const r2 = await matcher.match('POST', '/nested/echo', undefined)
      expect(r2).toBeDefined()
      expect(r2!.path).toEqual(['nested', 'echo'])
      expect(createContractProcedureSpy).toHaveBeenCalledTimes(2)
      expect(createContractProcedureSpy).toHaveBeenNthCalledWith(2, router.nested.echo, contract.nested.echo)
      expect(r2!.procedure).not.toBe(procedure2)
      expect(r2!.procedure).toBe(createContractProcedureSpy.mock.results[1]!.value)

      const r3 = await matcher.match('POST', '/lazy/info', undefined)
      expect(r3).toBeUndefined() // lazy is not in contract, so no match

      const r4 = await matcher.match('POST', '/api/ping', '/api')
      expect(r4).toBeDefined()
      expect(r4!.path).toEqual(['ping'])
      // no need to call createContractProcedure again for the same procedure
      expect(createContractProcedureSpy).toHaveBeenCalledTimes(2)
      expect(r4!.procedure).not.toBe(router.ping)
      expect(r4!.procedure).toBe(createContractProcedureSpy.mock.results[0]!.value)

      expect(lazyLazyLoader).toHaveBeenCalledTimes(0)
      expect(lazyLoader).toHaveBeenCalledTimes(0)
    })

    it('throws if missing implementation', async () => {
      const contract = {
        missing: oc.output(z.object({})),
      }

      const matcher = new RPCMatcher(withHiddenRouterContract(router, contract))
      await expect(matcher.match('POST', '/missing', undefined)).rejects.toThrowError('[Contract-First] Missing or invalid implementation for procedure at path: "missing"')
    })
  })

  describe('edge cases', () => {
    it('handles trailing slashes in pathname', async () => {
      const matcher = new RPCMatcher(router)
      const result = await matcher.match('POST', '/ping/', undefined)

      expect(result).toBeDefined()
      expect(result!.path).toEqual(['ping'])
      expect(result!.procedure).toBe(procedure1)
    })

    it('handles percent-encoded pathnames', async () => {
      const matcher = new RPCMatcher(router)
      const result = await matcher.match('POST', '/nested/%65cho', undefined) // %65 is 'e'

      expect(result).toBeDefined()
      expect(result!.path).toEqual(['nested', 'echo'])
      expect(result!.procedure).toBe(procedure2)
    })

    it('handles percent-encoded pathnames on a router without lazy routers', async () => {
      const matcher = new RPCMatcher({ nested: { echo: procedure2 } })
      const result = await matcher.match('POST', '/nested/%65cho', undefined)

      expect(result).toBeDefined()
      expect(result!.path).toEqual(['nested', 'echo'])
      expect(result!.procedure).toBe(procedure2)
    })

    it('handles raw characters in pathnames that are stored percent-encoded', async () => {
      const matcher = new RPCMatcher({ 'v1^beta': { 'items:batchGet': procedure1 } })

      // WHATWG URL and Node's req.url keep "^" raw, while procedure paths are stored as "%5E"
      for (const pathname of ['/v1^beta/items:batchGet', '/v1%5Ebeta/items%3AbatchGet', '/v1%5ebeta/items:batchGet'] as const) {
        const result = await matcher.match('POST', pathname, undefined)

        expect(result).toBeDefined()
        expect(result!.path).toEqual(['v1^beta', 'items:batchGet'])
        expect(result!.procedure).toBe(procedure1)
      }

      await expect(matcher.match('POST', '/v1beta/items:batchGet', undefined)).resolves.toBeUndefined()
    })

    it('resolves lazy routers found only after normalizing a raw character in the pathname', async () => {
      const loader = vi.fn(async () => ({ default: { info: procedure3 } }))
      const matcher = new RPCMatcher({ 'lazy^beta': new Lazy({ loader, meta: {} }) })
      const result = await matcher.match('POST', '/lazy^beta/info', undefined)

      expect(result).toBeDefined()
      expect(result!.path).toEqual(['lazy^beta', 'info'])
      expect(result!.procedure).toBe(procedure3)
      expect(loader).toHaveBeenCalledTimes(1)
    })

    it('resolves lazy routers found only after normalizing a percent-encoded pathname', async () => {
      const matcher = new RPCMatcher(router)
      const result = await matcher.match('POST', '/%6Cazy/info', undefined) // %6C is 'l'

      expect(result).toBeDefined()
      expect(result!.path).toEqual(['lazy', 'info'])
      expect(result!.procedure).toBe(procedure3)
      expect(lazyLoader).toHaveBeenCalledTimes(1)
      expect(lazyLazyLoader).toHaveBeenCalledTimes(0)
    })
  })
})
