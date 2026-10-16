import * as ContractModule from '@orpc/contract'
import { sleep } from '@orpc/shared'
import { vi } from 'vitest'
import { decorateMiddleware } from './middleware-decorated'

const mergeErrorMapSpy = vi.spyOn(ContractModule, 'mergeErrorMap')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('decorateMiddleware', () => {
  describe('create', () => {
    it('should forward calls to the original middleware', async () => {
      const original = vi.fn().mockResolvedValue({ output: 'result' })
      const decorated = decorateMiddleware(original as any)

      const opts = { context: { a: 1 }, next: vi.fn() }
      const input = { x: 2 }
      const done = vi.fn()
      const result = await decorated(opts as any, input as any, done as any)

      expect(original).toHaveBeenCalledWith(opts, input, done)
      expect(result).toEqual({ output: 'result' })
    })

    it('should preserve error map & name & hidden meta plugins', () => {
      const plugins = [{ name: 'test', init: vi.fn() }]
      const original = Object.assign(vi.fn(), {
        '~orpc': {
          errorMap: { BASE: { message: 'test' } },
          metaPlugins: plugins,
        },
      })
      Object.defineProperty(original, 'name', { value: 'originalName' })

      const decorated = decorateMiddleware(original as any)

      expect(decorated['~orpc']).toEqual(original['~orpc'])
      expect(decorated.name).toBe('originalName')
    })
  })

  describe('.adaptInput', () => {
    it('should map input before calling original middleware', async () => {
      const original = vi.fn().mockResolvedValue({ output: 'result' })
      const decorated = decorateMiddleware(original as any)
      const mapped = decorated.adaptInput((input: string) => ({ x: Number(input) }))

      const opts = { context: { a: 1 }, next: vi.fn() }
      const done = vi.fn()
      const result = await (mapped as any)(opts as any, '123' as any, done)

      expect(original).toHaveBeenCalledWith(opts, { x: 123 }, done)
      expect(result).toEqual({ output: 'result' })
    })

    it('should preserve error map & name & hidden meta plugins', () => {
      const plugins = [{ name: 'test', init: vi.fn() }]
      const original = Object.assign(vi.fn(), {
        '~orpc': { errorMap: { BASE: { message: 'test' } } },
        'metaPlugins': plugins,
      })
      Object.defineProperty(original, 'name', { value: 'originalName' })

      const decorated = decorateMiddleware(original as any)
      const mapped = decorated.adaptInput((input: any) => input)

      expect(mapped['~orpc']).toEqual(original['~orpc'])
      expect(mapped.name).toBe('originalName')
    })

    it('should preserve metadata assigned after decoration', () => {
      const decorated = decorateMiddleware(vi.fn() as any)
      decorated['~orpc'] = { errorMap: { BASE: { message: 'test' } }, metaPlugins: [{ name: 'test', init: vi.fn() }] }

      expect(decorated.adaptInput((input: any) => input)['~orpc']).toBe(decorated['~orpc'])
    })
  })

  describe('.errors', () => {
    it('should merge error maps & preserve name & hidden meta plugins', () => {
      const plugins = [{ name: 'test', init: vi.fn() }]
      const original = Object.assign(vi.fn(), {
        '~orpc': {
          errorMap: { BASE: { message: 'base' } },
          metaPlugins: plugins,
        },
      })
      Object.defineProperty(original, 'name', { value: 'originalName' })

      const decorated = decorateMiddleware(original as any)
      const withErrors = decorated.errors({ NEW: { message: 'new' } })

      expect(mergeErrorMapSpy).toHaveBeenCalledTimes(1)
      expect(mergeErrorMapSpy).toHaveBeenCalledWith(original['~orpc']?.errorMap, { NEW: { message: 'new' } })

      expect(withErrors['~orpc']?.errorMap).toBe(mergeErrorMapSpy.mock.results[0]!.value)
      expect(withErrors['~orpc']?.metaPlugins).toBe(plugins)
      expect(withErrors.name).toBe('originalName')
    })

    it('does not affect the internal behavior', async () => {
      const original = vi.fn().mockResolvedValue({ output: 'result' })
      const decorated = decorateMiddleware(original as any)
      const withErrors = decorated.errors({ NEW: { message: 'new' } })

      const opts = { context: { a: 1 }, next: vi.fn() }
      const input = { x: 2 }
      const done = vi.fn()
      const result = await withErrors(opts as any, input as any, done as any)

      expect(original).toHaveBeenCalledWith(opts, input, done)
      expect(result).toEqual({ output: 'result' })
    })
  })

  describe('.use', () => {
    it('should execution order correctly and merge context', async () => {
      const mid1 = vi.fn().mockImplementation(async ({ next, context }) => {
        return next({ context: { i2: 'override', mid1: true, mid11: true } })
      })

      const mid2 = vi.fn().mockImplementation(async ({ next, context }) => {
        return next({ context: { i3: 'override', mid11: 'override', mid2: true } })
      })

      const combined = decorateMiddleware(mid1 as any).use(mid2 as any)

      const next = vi.fn().mockImplementation(async ({ context }) => ({ output: 'final', context }))
      const done = vi.fn()
      const result = await (combined as any)({ context: { i1: true, i2: true, i3: true }, next }, 'input', done)

      expect(result).toEqual({ output: 'final', context: { i2: 'override', i3: 'override', mid1: true, mid11: 'override', mid2: true } })

      expect(mid1).toHaveBeenCalledTimes(1)
      expect(mid1).toHaveBeenCalledWith(expect.objectContaining({ context: { i1: true, i2: true, i3: true } }), 'input', done)
      expect(mid1).toHaveResolvedWith(result)

      expect(mid2).toHaveBeenCalledTimes(1)
      expect(mid2).toHaveBeenCalledAfter(mid1)
      expect(mid2).toHaveBeenCalledWith(expect.objectContaining({ context: { i1: true, i2: 'override', i3: true, mid1: true, mid11: true } }), 'input', done)
      expect(mid2).toHaveResolvedWith(result)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledAfter(mid2)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ context: { i2: 'override', i3: 'override', mid1: true, mid11: 'override', mid2: true } }))
      expect(next).toHaveResolvedWith(result)

      expect(done).not.toHaveBeenCalled()
    })

    it('can stop early with done', async () => {
      const mid1 = vi.fn().mockImplementation(async ({ next }) => {
        return await next({ context: { mid1: true } })
      })
      const mid2 = vi.fn().mockImplementation(async (opts, input, done) => {
        return done({ output: 'early' })
      })

      const combined = decorateMiddleware(mid1 as any).use(mid2 as any)
      const next = vi.fn().mockImplementation(async ({ context }) => ({ output: 'final', context }))
      const done = vi.fn().mockImplementation(opts => ({ ...opts, context: {} }))

      const result = await (combined as any)({ context: { initial: true }, next }, 'input', done)

      expect(result).toEqual({ output: 'early', context: { mid1: true } })

      expect(done).toHaveBeenCalledTimes(1)
      expect(done).toHaveBeenCalledWith({ output: 'early' })

      expect(mid1).toHaveBeenCalledTimes(1)
      expect(mid1).toHaveBeenCalledWith(expect.objectContaining({ context: { initial: true } }), 'input', done)
      expect(mid1).toHaveResolvedWith(result)

      expect(mid2).toHaveBeenCalledTimes(1)
      expect(mid2).toHaveBeenCalledAfter(mid1)
      expect(mid2).toHaveBeenCalledWith(expect.objectContaining({ context: { initial: true, mid1: true } }), 'input', done)
      expect(mid2).toHaveResolvedWith(done.mock.results[0]!.value)

      expect(next).not.toHaveBeenCalled()
    })

    it('correctly handle multiple next calls', async () => {
      let mid1Result1
      const mid1 = vi.fn()
        .mockImplementationOnce(async ({ next }) => {
          const [result1, result2] = await Promise.all([
            next({ context: { mid1: 1 } }),
            next({ context: { mid1: 2 } }),
          ])

          mid1Result1 = result1
          return result2
        })

      const mid2 = vi.fn()
        .mockImplementationOnce(async ({ next }, input, done) => {
          await sleep(10) // this ensure they can handle in parallel
          return done({ output: 'done' })
        })
        .mockImplementationOnce(async ({ next }, input, done) => next({ context: { mid2: 1 } }))

      const combined = decorateMiddleware(mid1 as any).use(mid2 as any)
      const next = vi.fn().mockImplementation(({ context }) => ({ output: 'ok', context }))
      const done = vi.fn().mockImplementation(opts => ({ ...opts, context: {} }))

      const result = await (combined as any)({ context: { initial: true }, next }, 'input', done)

      expect(result).toEqual({ output: 'ok', context: { mid1: 2, mid2: 1 } })
      expect(mid1Result1).toEqual({ output: 'done', context: { mid1: 1 } })

      expect(done).toHaveBeenCalledTimes(1)
      expect(done).toHaveBeenCalledWith({ output: 'done' })

      expect(mid1).toHaveBeenCalledTimes(1)
      expect(mid1).toHaveBeenCalledWith(expect.objectContaining({ context: { initial: true } }), 'input', done)
      expect(mid1).toHaveResolvedWith(result)

      expect(mid2).toHaveBeenCalledTimes(2)
      expect(mid2).toHaveBeenCalledAfter(mid1)
      expect(mid2).toHaveBeenNthCalledWith(1, expect.objectContaining({ context: { initial: true, mid1: 1 } }), 'input', done)
      expect(mid2).toHaveBeenNthCalledWith(2, expect.objectContaining({ context: { initial: true, mid1: 2 } }), 'input', done)
      expect(mid2).toHaveNthResolvedWith(1, done.mock.results[0]!.value)
      expect(mid2).toHaveNthResolvedWith(2, result)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledAfter(mid2)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ context: { mid1: 2, mid2: 1 } }))
    })

    it('should combine error maps & name & hidden meta plugins', () => {
      const plugins1 = [{ name: 'test', init: vi.fn() }]
      const mid1 = Object.assign(vi.fn(), {
        '~orpc': {
          errorMap: { M1: { message: 'm1' }, CONFLICT: { message: 'm1' } },
          metaPlugins: plugins1,
        },
      })
      Object.defineProperty(mid1, 'name', { value: 'M1' })

      const plugins2 = [{ name: 'test', init: vi.fn() }]
      const mid2 = Object.assign(vi.fn(), {
        '~orpc': {
          errorMap: { M2: { message: 'm2' }, CONFLICT: { message: 'm2' } },
          metaPlugins: plugins2,
        },
      })
      Object.defineProperty(mid2, 'name', { value: 'M2' })

      const decorated1 = decorateMiddleware(mid1 as any)
      const combined = decorated1.use(mid2 as any)

      expect(mergeErrorMapSpy).toHaveBeenCalledTimes(1)
      expect(mergeErrorMapSpy).toHaveBeenCalledWith(mid2['~orpc']?.errorMap, mid1['~orpc']?.errorMap)
      expect(combined['~orpc']?.errorMap).toEqual(mergeErrorMapSpy.mock.results[0]!.value)

      expect(combined.name).toBe('M1 + M2')
      expect(combined['~orpc']?.metaPlugins).toEqual([...plugins1, ...plugins2])
    })

    it('should combine hidden meta plugins assigned after decoration', () => {
      const plugins1 = [{ name: 'test', init: vi.fn() }]
      const plugins2 = [{ name: 'test', init: vi.fn() }]
      const decorated = decorateMiddleware(vi.fn() as any)
      decorated['~orpc'] = { metaPlugins: plugins1 }

      const combined = decorated.use(Object.assign(vi.fn(), { '~orpc': { metaPlugins: plugins2 } }) as any)
      expect(combined['~orpc']?.metaPlugins).toEqual([...plugins1, ...plugins2])
    })
  })
})
