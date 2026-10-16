import { ORPCError } from '@orpc/client'
import { os } from '../../builder'
import { DEFAULT_ERROR_STATUS } from '../../constants'
import { RPCHandlerCodec } from './rpc-handler-codec'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('rpcHandlerCodec', () => {
  const procedure = os.handler(() => 'output')
  const router = {
    ping: procedure,
  }

  const options = {
    context: {},
  } as const

  describe('.resolveProcedure', () => {
    it('returns undefined when no procedure matches', async () => {
      const codec = new RPCHandlerCodec(router)

      const result = await codec.resolveProcedure({
        method: 'POST',
        url: '/missing?data=%7B%7D',
        resolveBody: vi.fn(),
        headers: {},
        signal: undefined,
      } as any, options as any)

      expect(result).toBeUndefined()
    })

    it('decodes GET input using latest data query parameter', async () => {
      const serializer = {
        serialize: vi.fn(),
        deserialize: vi.fn().mockReturnValueOnce('__deserialized__'),
      } as any

      const codec = new RPCHandlerCodec(router, { serializer, allowMethods: ['GET'] })

      const result = await codec.resolveProcedure({
        method: 'GET',
        url: '/ping?data=%7B%22json%22%3A%22first%22%7D&data=%7B%22json%22%3A%22second%22%7D',
        resolveBody: vi.fn(),
        headers: {},
        signal: undefined,
      } as any, options as any)

      expect(result).toBeDefined()
      expect(result!.path).toEqual(['ping'])
      expect(result!.procedure).toBe(procedure)

      const input = await result!.decodeInput()

      expect(input).toBe('__deserialized__')
      expect(serializer.deserialize).toHaveBeenCalledOnce()
      expect(serializer.deserialize).toHaveBeenCalledWith({ json: 'second' })
    })

    it('decodes non-GET input from request body', async () => {
      const serializer = {
        serialize: vi.fn(),
        deserialize: vi.fn().mockReturnValueOnce('__deserialized__'),
      } as any

      const resolveBody = vi.fn().mockResolvedValueOnce({ json: { deep: true } })

      const codec = new RPCHandlerCodec(router, { serializer })

      const result = await codec.resolveProcedure({
        method: 'POST',
        url: '/ping',
        resolveBody,
        headers: {},
        signal: undefined,
      } as any, options as any)

      expect(result).toBeDefined()

      const input = await result!.decodeInput()

      expect(input).toBe('__deserialized__')
      expect(resolveBody).toHaveBeenCalledOnce()
      expect(serializer.deserialize).toHaveBeenCalledOnce()
      expect(serializer.deserialize).toHaveBeenCalledWith({ json: { deep: true } })
    })

    it('resolves QUERY requests when allowMethods includes QUERY and decodes input from the body', async () => {
      const serializer = {
        serialize: vi.fn(),
        deserialize: vi.fn().mockReturnValueOnce('__deserialized__'),
      } as any

      const resolveBody = vi.fn().mockResolvedValueOnce({ json: null })
      const codec = new RPCHandlerCodec(router, { serializer, allowMethods: ['QUERY'] })

      const result = await codec.resolveProcedure({
        method: 'QUERY',
        url: '/ping',
        resolveBody,
        headers: {},
        signal: undefined,
      } as any, options as any)

      expect(result).toBeDefined()

      const input = await result!.decodeInput()

      expect(input).toBe('__deserialized__')
      expect(resolveBody).toHaveBeenCalledOnce()
    })
  })

  describe('.encodeOutput', () => {
    it('serializes output with status 200', () => {
      const serializer = {
        serialize: vi.fn().mockReturnValueOnce('__serialized__'),
        deserialize: vi.fn(),
      } as any

      const codec = new RPCHandlerCodec(router, { serializer })

      const response = codec.encodeOutput('__output__', procedure as any, ['ping'], options as any)

      expect(response).toEqual({
        headers: {},
        status: 200,
        body: '__serialized__',
      })

      expect(serializer.serialize).toHaveBeenCalledOnce()
      expect(serializer.serialize).toHaveBeenCalledWith('__output__')
    })

    it('supports custom outputStatus and passes callback arguments', () => {
      const serializer = {
        serialize: vi.fn().mockReturnValueOnce('__serialized__'),
        deserialize: vi.fn(),
      } as any

      const outputStatus = vi.fn(() => 201)

      const codec = new RPCHandlerCodec(router, {
        serializer,
        outputStatus,
      })

      const response = codec.encodeOutput('__output__', procedure as any, ['ping'], options as any)

      expect(response).toEqual({
        headers: {},
        status: 201,
        body: '__serialized__',
      })

      expect(outputStatus).toHaveBeenCalledTimes(1)
      expect(outputStatus).toHaveBeenCalledWith('__output__', procedure, ['ping'], options)
      expect(serializer.serialize).toHaveBeenCalledOnce()
      expect(serializer.serialize).toHaveBeenCalledWith('__output__')
    })

    it('treats outputStatus undefined or null as fallback to 200', () => {
      const serializer = {
        serialize: vi.fn()
          .mockReturnValueOnce('__serialized_null__')
          .mockReturnValueOnce('__serialized_undefined__'),
        deserialize: vi.fn(),
      } as any

      const outputStatus = vi.fn((output: unknown) => {
        if (output === '__output_null__') {
          return null
        }

        return undefined
      })

      const codec = new RPCHandlerCodec(router, {
        serializer,
        outputStatus,
      })

      const nullStatusResponse = codec.encodeOutput('__output_null__', procedure as any, ['ping'], options as any)
      expect(nullStatusResponse).toEqual({
        headers: {},
        status: 200,
        body: '__serialized_null__',
      })

      const undefinedStatusResponse = codec.encodeOutput('__output_undefined__', procedure as any, ['ping'], options as any)
      expect(undefinedStatusResponse).toEqual({
        headers: {},
        status: 200,
        body: '__serialized_undefined__',
      })

      expect(outputStatus).toHaveBeenCalledTimes(2)
      expect(outputStatus).toHaveBeenNthCalledWith(1, '__output_null__', procedure, ['ping'], options)
      expect(outputStatus).toHaveBeenNthCalledWith(2, '__output_undefined__', procedure, ['ping'], options)
      expect(serializer.serialize).toHaveBeenCalledTimes(2)
    })
  })

  describe('.encodeError', () => {
    it('uses common status codes by default', () => {
      const serializer = {
        serialize: vi.fn().mockReturnValueOnce('__serialized__'),
        deserialize: vi.fn(),
      } as any

      const codec = new RPCHandlerCodec(router, { serializer })
      const error = new ORPCError('BAD_GATEWAY')

      const response = codec.encodeError(error, procedure as any, ['ping'], options as any)

      expect(response).toEqual({
        headers: {},
        status: 502,
        body: '__serialized__',
      })

      expect(serializer.serialize).toHaveBeenCalledOnce()
      expect(serializer.serialize).toHaveBeenCalledWith(error.toJSON())
    })

    it('does not resolve error codes through Object.prototype', async () => {
      const serializer = { serialize: vi.fn(), deserialize: vi.fn() } as any
      const codec = new RPCHandlerCodec(router, { serializer })
      const error = new ORPCError('toString' as any)

      expect((await codec.encodeError(error, procedure as any, ['ping'], options as any)).status).toEqual(DEFAULT_ERROR_STATUS)
    })

    it('custom status with errorStatusCodes option', () => {
      const serializer = {
        serialize: vi.fn()
          .mockReturnValueOnce('__serialized_override__')
          .mockReturnValueOnce('__serialized_fallback__'),
        deserialize: vi.fn(),
      } as any

      const codec = new RPCHandlerCodec(router, {
        serializer,
        errorStatusMap: { BAD_GATEWAY: 599 },
      })

      const overriddenError = new ORPCError('BAD_GATEWAY')
      const overriddenResponse = codec.encodeError(overriddenError, procedure as any, ['ping'], options as any)

      expect(overriddenResponse).toEqual({
        headers: {},
        status: 599,
        body: '__serialized_override__',
      })

      const unknownError = new ORPCError('UNKNOWN_CODE' as any)
      const fallbackResponse = codec.encodeError(unknownError, procedure as any, ['ping'], options as any)

      expect(fallbackResponse).toEqual({
        headers: {},
        status: 500,
        body: '__serialized_fallback__',
      })

      expect(serializer.serialize).toHaveBeenCalledTimes(2)
      expect(serializer.serialize).toHaveBeenNthCalledWith(1, overriddenError.toJSON())
      expect(serializer.serialize).toHaveBeenNthCalledWith(2, unknownError.toJSON())
    })

    it('fallback to DEFAULT_ERROR_STATUS for unknown error', () => {
      const serializer = {
        serialize: vi.fn()
          .mockReturnValueOnce('__serialized_custom__')
          .mockReturnValueOnce('__serialized_fallback__'),
        deserialize: vi.fn(),
      } as any

      const codec = new RPCHandlerCodec(router, {
        serializer,
      })

      const customizedError = new ORPCError('BAD_GATEWAY')
      const customizedResponse = codec.encodeError(customizedError, procedure as any, ['ping'], options as any)

      expect(customizedResponse).toEqual({
        headers: {},
        status: 502,
        body: '__serialized_custom__',
      })

      const fallbackError = new ORPCError('UNKNOWN_ERROR')
      const fallbackResponse = codec.encodeError(fallbackError, procedure as any, ['ping'], options as any)

      expect(fallbackResponse).toEqual({
        headers: {},
        status: DEFAULT_ERROR_STATUS,
        body: '__serialized_fallback__',
      })

      expect(serializer.serialize).toHaveBeenCalledTimes(2)
    })
  })

  describe('options', () => {
    it('pass RPCMatcherOptions to RPCMatcher', async () => {
      const filter = vi.fn(() => false)
      const codec = new RPCHandlerCodec(router, {
        filter,
      })

      const result = await codec.resolveProcedure({
        method: 'POST',
        url: '/missing?data=%7B%7D',
        resolveBody: vi.fn(),
        headers: {},
        signal: undefined,
      } as any, options as any)

      expect(result).toBeUndefined()
      expect(filter).toHaveBeenCalled()
    })
  })
})
