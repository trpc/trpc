import type { ErrorMap } from './error'
import * as ClientModule from '@orpc/client'
import z from 'zod'
import { mergeErrorMap, reconcileORPCError } from './error-utils'

const ORPCError = ClientModule.ORPCError
const cloneORPCErrorSpy = vi.spyOn(ClientModule, 'cloneORPCError')

beforeEach(() => {
  vi.clearAllMocks()
})

it('mergeErrorMap', () => {
  const map1 = {
    BASE: { message: 'm1' },
  } satisfies ErrorMap
  const map2 = {
    BASE: { message: 'm2' },
    OVERRIDE: { message: 'm3' },
  } satisfies ErrorMap

  expect(mergeErrorMap(map1, map2)).toEqual({
    BASE: { message: 'm2' },
    OVERRIDE: { message: 'm3' },
  })

  expect(mergeErrorMap(undefined, map1)).toEqual(map1)
  expect(mergeErrorMap(map1, undefined)).toEqual(map1)
  expect(mergeErrorMap(undefined, undefined)).toEqual({})
})

describe('reconcileORPCError', () => {
  describe('no map error matched', () => {
    const map: ErrorMap = { }

    it('should return error itself if error is not defined', async () => {
      const error = new ORPCError('CODE', { message: 'm', data: 'd' })
      expect(await reconcileORPCError(map, error)).toBe(error)
      expect(cloneORPCErrorSpy).toHaveBeenCalledTimes(0)
    })

    it('should return modified error if error is defined', async () => {
      const error = new ORPCError('CODE', { message: 'm', data: 'd' })
      ;(error.defined as any) = true

      const validated = await reconcileORPCError(map, error)
      expect(validated).not.toBe(error)
      expect(cloneORPCErrorSpy).toHaveBeenCalledTimes(1)
      expect(validated).toBe(cloneORPCErrorSpy.mock.results[0]!.value)
      expect(validated.defined).toBe(false)
    })
  })

  describe('code in map but no data schema', () => {
    const map: ErrorMap = { CODE: { message: 'm' } }

    it('return error itself if it is defined', async () => {
      const error = new ORPCError('CODE', { message: 'm', data: 'd' })
      ;(error.defined as any) = true

      const validated = await reconcileORPCError(map, error)
      expect(validated).toBe(error)
      expect(validated.code).toBe('CODE')
      expect(validated.data).toBe('d')
      expect(validated.defined).toBe(true)

      expect(cloneORPCErrorSpy).not.toHaveBeenCalled()
    })

    it('return modified error if it is not defined', async () => {
      const error = new ORPCError('CODE', { message: 'm', data: 'd' })

      const validated = await reconcileORPCError(map, error)
      expect(validated).not.toBe(error)
      expect(cloneORPCErrorSpy).toHaveBeenCalledTimes(1)
      expect(validated).toBe(cloneORPCErrorSpy.mock.results[0]!.value)
      expect(validated.code).toBe('CODE')
      expect(validated.data).toBe('d')
      expect(validated.defined).toBe(true)
    })
  })

  describe('code in map but validation failed', () => {
    const map: ErrorMap = { CODE: { data: z.boolean() } }

    it('return error itself if it is not defined', async () => {
      const error = new ORPCError('CODE', { message: 'm', data: 'invalid' })

      const validated = await reconcileORPCError(map, error)
      expect(validated).toBe(error)
      expect(validated.code).toBe('CODE')
      expect(validated.data).toBe('invalid')
      expect(validated.defined).toBe(false)

      expect(cloneORPCErrorSpy).not.toHaveBeenCalled()
    })

    it('return modified error if it is defined', async () => {
      const error = new ORPCError('CODE', { message: 'm', data: 'invalid' })
      ;(error.defined as any) = true

      const validated = await reconcileORPCError(map, error)
      expect(validated).not.toBe(error)
      expect(cloneORPCErrorSpy).toHaveBeenCalledTimes(1)
      expect(validated).toBe(cloneORPCErrorSpy.mock.results[0]!.value)
      expect(validated.code).toBe('CODE')
      expect(validated.data).toBe('invalid')
      expect(validated.defined).toBe(false)
    })
  })

  describe('code in map and validation success (without transform data)', () => {
    const map: ErrorMap = { CODE: { message: 'm', data: z.number() } }

    it('return error itself if it is defined', async () => {
      const error = new ORPCError('CODE', { message: 'm', data: 1 })
      ;(error.defined as any) = true

      const validated = await reconcileORPCError(map, error)
      expect(validated).toBe(error)
      expect(validated.code).toBe('CODE')
      expect(validated.data).toBe(1)
      expect(validated.defined).toBe(true)

      expect(cloneORPCErrorSpy).not.toHaveBeenCalled()
    })

    it('return modified error if it is not defined', async () => {
      const error = new ORPCError('CODE', { message: 'm', data: 1 })

      const validated = await reconcileORPCError(map, error)
      expect(validated).not.toBe(error)
      expect(cloneORPCErrorSpy).toHaveBeenCalledTimes(1)
      expect(validated).toBe(cloneORPCErrorSpy.mock.results[0]!.value)
      expect(validated.code).toBe('CODE')
      expect(validated.data).toBe(1)
      expect(validated.defined).toBe(true)
    })
  })

  describe('code in map and validation success (with transform data)', () => {
    const map: ErrorMap = { CODE: { message: 'm', data: z.coerce.number() } }

    it('return error cloned itself if it is defined', async () => {
      const error = new ORPCError('CODE', { message: 'm', data: '123' })
      ;(error.defined as any) = true

      const validated = await reconcileORPCError(map, error)
      expect(validated).not.toBe(error)
      expect(cloneORPCErrorSpy).toHaveBeenCalledTimes(1)
      expect(validated).toBe(cloneORPCErrorSpy.mock.results[0]!.value)
      expect(validated.code).toBe('CODE')
      expect(validated.data).toEqual(123)
      expect(validated.defined).toBe(true)
    })

    it('return modified error if it is not defined', async () => {
      const error = new ORPCError('CODE', { message: 'm', data: '123' })

      const validated = await reconcileORPCError(map, error)
      expect(validated).not.toBe(error)
      expect(cloneORPCErrorSpy).toHaveBeenCalledTimes(1)
      expect(validated).toBe(cloneORPCErrorSpy.mock.results[0]!.value)
      expect(validated.code).toBe('CODE')
      expect(validated.data).toEqual(123)
      expect(validated.defined).toBe(true)
    })
  })

  it('does not resolve error codes through Object.prototype', async () => {
    const error = new ORPCError('toString', { message: 'm', data: 'd' })
    ;(error.defined as any) = true

    expect((await reconcileORPCError({}, error)).defined).toBe(false)
  })
})
