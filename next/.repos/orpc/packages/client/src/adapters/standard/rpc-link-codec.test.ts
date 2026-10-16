import type { StandardUrl } from '@standard-server/core'
import { MalformedResponseError, ORPCError } from '../../error'
import { RPCSerializer } from '../../rpc-serializer'
import { RPCLinkCodec } from './rpc-link-codec'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('rpcLinkCodec', () => {
  const serializer = new RPCSerializer()
  const serializeSpy = vi.spyOn(serializer, 'serialize')
  const deserializeSpy = vi.spyOn(serializer, 'deserialize')

  it('uses sensible defaults when no options provided', async () => {
    const codec = new RPCLinkCodec({})

    const request = await codec.encodeInput('input', ['ping'], { context: {} })

    expect(request.url).toBe('/ping')
    expect(request.method).toBe('POST')
    expect(request.headers).toEqual({})
    expect(request.body).toBeDefined()
  })

  describe('.encodeInput', () => {
    it('with method=POST (default)', async () => {
      const codec = new RPCLinkCodec({ url: '/api', serializer })
      const signal = AbortSignal.timeout(100)

      const request = await codec.encodeInput('input', ['ping'], { context: {}, signal })

      expect(request).toEqual({
        url: '/api/ping',
        method: 'POST',
        headers: {},
        body: serializeSpy.mock.results[0]!.value,
        signal,
      })
      expect(serializeSpy).toHaveBeenCalledWith('input')
    })

    it('with method=GET serializes input as query param', async () => {
      const codec = new RPCLinkCodec({ url: '/api', method: 'GET', serializer })
      const signal = AbortSignal.timeout(100)

      const request = await codec.encodeInput('input', ['ping'], { context: {}, signal })

      expect(request.method).toBe('GET')
      expect(request.body).toBeUndefined()
      expect(request.url).toContain('/api/ping?data=')
      expect(request.signal).toBe(signal)
    })

    it('with method=GET falls back dataParam to empty string when serializer returns undefined', async () => {
      const codec = new RPCLinkCodec({ url: '/api', method: 'GET', serializer })
      serializeSpy.mockReturnValueOnce(undefined as any)

      const request = await codec.encodeInput(undefined, ['ping'], { context: {} })

      expect(request.method).toBe('GET')
      expect(request.url).toBe('/api/ping?data=')
    })

    it('with method=PUT sends body', async () => {
      const codec = new RPCLinkCodec({ url: '/api', method: 'PUT', serializer })

      const request = await codec.encodeInput({ data: 123 }, ['test'], { context: {} })

      expect(request.method).toBe('PUT')
      expect(request.body).toBe(serializeSpy.mock.results[0]!.value)
      expect(request.url).toBe('/api/test')
    })

    it('falls back to fallbackMethod when GET url exceeds maxUrlLength', async () => {
      const codec = new RPCLinkCodec({
        url: '/api',
        method: 'GET',
        maxUrlLength: 10,
        fallbackMethod: 'PATCH',
        serializer,
      })

      const request = await codec.encodeInput('input', ['ping'], { context: {} })

      expect(request.method).toBe('PATCH')
      expect(request.body).toBe(serializeSpy.mock.results[0]!.value)
      expect(request.url).toBe('/api/ping')
    })

    it('falls back to QUERY with a body when GET url exceeds maxUrlLength', async () => {
      const codec = new RPCLinkCodec({
        url: '/api',
        method: 'GET',
        maxUrlLength: 10,
        fallbackMethod: 'QUERY',
        serializer,
      })

      const request = await codec.encodeInput('input', ['ping'], { context: {} })

      expect(request.method).toBe('QUERY')
      expect(request.body).toBe(serializeSpy.mock.results[0]!.value)
      expect(request.url).toBe('/api/ping')
    })

    it('falls back to POST by default when GET url exceeds maxUrlLength', async () => {
      const codec = new RPCLinkCodec({
        url: '/api',
        method: 'GET',
        maxUrlLength: 10,
        serializer,
      })

      const request = await codec.encodeInput('input', ['ping'], { context: {} })

      expect(request.method).toBe('POST')
      expect(request.body).toBe(serializeSpy.mock.results[0]!.value)
      expect(request.url).toBe('/api/ping')
    })

    it.each([
      ['FormData', () => {
        const f = new FormData()
        f.set('k', 'v')
        return f
      }],
      ['Blob', () => new Blob(['data'])],
      ['ReadableStream', () => new ReadableStream()],
      ['AsyncIteratorObject', () => (async function* () { yield 1 })()],
    ] as const)('falls back to POST when GET with %s', async (_, factory) => {
      const codec = new RPCLinkCodec({ url: '/api', method: 'GET', serializer })
      const value = factory()
      serializeSpy.mockReturnValueOnce(value as any)

      const request = await codec.encodeInput(value, ['test'], { context: {} })

      expect(request.method).toBe('POST')
      expect(request.body).toBe(value)
    })

    it('merges last-event-id header when present', async () => {
      const codec = new RPCLinkCodec({ url: '/api', headers: { 'x-custom': 'value' }, serializer })

      const request = await codec.encodeInput('input', ['ping'], { context: {}, lastEventId: '' })

      expect(request.headers).toEqual({ 'x-custom': 'value', 'last-event-id': '' })
    })

    it('does not merge last-event-id when absent', async () => {
      const codec = new RPCLinkCodec({ url: '/api', headers: { 'x-custom': 'value' }, serializer })

      const request = await codec.encodeInput('input', ['ping'], { context: {} })

      expect(request.headers).toEqual({ 'x-custom': 'value' })
    })

    it('supports fetch Headers', async () => {
      const headers = new Headers()
      headers.append('cookie', 'a=1')
      headers.append('cookie', 'b=2')
      headers.append('set-cookie', 'a1=1')
      headers.append('set-cookie', 'b1=2')

      const codec = new RPCLinkCodec({ url: '/api', headers, serializer })
      const request = await codec.encodeInput('input', ['ping'], { context: {} })

      expect(request.headers).toEqual({
        'cookie': 'a=1; b=2',
        'set-cookie': ['a1=1', 'b1=2'],
      })
    })

    it('supports headers as a function', async () => {
      const headersFn = vi.fn(() => ({ 'x-dynamic': 'yes' }))
      const codec = new RPCLinkCodec({ url: '/api', headers: headersFn, serializer })
      const options = { context: {} }

      await codec.encodeInput('input', ['ping'], options)

      expect(headersFn).toHaveBeenCalledWith(options, ['ping'], 'input')
    })

    it('strips trailing slash from base url', async () => {
      const codec = new RPCLinkCodec({ url: '/prefix/', serializer })

      const request = await codec.encodeInput('input', ['test'], { context: {} })

      expect(request.url).toBe('/prefix/test')
    })

    it('appends data param to existing query string on GET', async () => {
      const codec = new RPCLinkCodec({ url: '/prefix?existing=1', method: 'GET', serializer })

      const request = await codec.encodeInput('input', ['test'], { context: {} })

      expect(request.url).toMatch(/\/prefix\/test\?existing=1&data=/)
    })

    it('preserves hash in url', async () => {
      const codec = new RPCLinkCodec({ url: '/prefix#frag', serializer })

      const request = await codec.encodeInput('input', ['test'], { context: {} })

      expect(request.url).toBe('/prefix/test#frag')
    })

    it('handles nested paths', async () => {
      const codec = new RPCLinkCodec({ url: '/api', serializer })

      const request = await codec.encodeInput('input', ['nested', 'path', 'here'], { context: {} })

      expect(request.url).toBe('/api/nested/path/here')
    })

    it('encodes path segments', async () => {
      const codec = new RPCLinkCodec({ url: '/api', serializer })

      const request = await codec.encodeInput('input', ['with/slash'], { context: {} })

      expect(request.url).toBe('/api/with%2Fslash')
    })

    it('supports url as a function', async () => {
      const urlFn = vi.fn(() => '/dynamic' as StandardUrl)
      const codec = new RPCLinkCodec({ url: urlFn, serializer })
      const options = { context: {} }

      await codec.encodeInput('input', ['ping'], options)

      expect(urlFn).toHaveBeenCalledWith(options, ['ping'], 'input')
    })

    it('supports method as a function', async () => {
      const methodFn = vi.fn(() => 'DELETE' as const)
      const codec = new RPCLinkCodec({ url: '/api', method: methodFn, serializer })
      const options = { context: {} }

      const request = await codec.encodeInput('input', ['ping'], options)

      expect(request.method).toBe('DELETE')
      expect(methodFn).toHaveBeenCalledWith(options, ['ping'], 'input')
    })

    it('supports maxUrlLength as a function', async () => {
      const maxUrlLengthFn = vi.fn(() => 10)
      const codec = new RPCLinkCodec({
        url: '/api',
        method: 'GET',
        maxUrlLength: maxUrlLengthFn,
        fallbackMethod: 'PATCH',
        serializer,
      })

      const request = await codec.encodeInput('input', ['ping'], { context: {} })

      expect(request.method).toBe('PATCH')
      expect(maxUrlLengthFn).toHaveBeenCalledOnce()
    })
  })

  describe('.decodeResponse', () => {
    const codec = new RPCLinkCodec({ url: '/api', serializer })

    it.each([100, 199, 200, 204, 301, 302, 399])('treats status %i as success', async (status) => {
      const serialized = serializer.serialize({ data: 'hello' })

      const result = await codec.decodeResponse({
        status,
        headers: {},
        resolveBody: () => Promise.resolve(serialized),
      })

      expect(result).toEqual({ kind: 'output', output: deserializeSpy.mock.results[0]!.value })
    })

    it.each([400, 401, 403, 404, 500, 599, 600])('treats status %i as error', async (status) => {
      const error = new ORPCError('BAD_REQUEST')
      const serialized = serializer.serialize(error.toJSON())

      const result = await codec.decodeResponse({
        status,
        headers: {},
        resolveBody: () => Promise.resolve(serialized),
      })

      expect(result.kind).toBe('error')
    })

    it('decodes ORPCError JSON from error response', async () => {
      const error = new ORPCError('NOT_FOUND', { message: 'Resource not found', data: { id: '123' } })
      const serialized = serializer.serialize(error.toJSON())

      const result = await codec.decodeResponse({
        status: 404,
        headers: {},
        resolveBody: () => Promise.resolve(serialized),
      })

      expect(result).toEqual({
        kind: 'error',
        error: expect.objectContaining({ code: 'NOT_FOUND', message: 'Resource not found', data: { id: '123' } }),
      })
    })

    it('throws MalformedResponseError on non-ORPCError error responses', async () => {
      const serialized = serializer.serialize({ something: 'unexpected' })

      const error: any = await codec.decodeResponse({
        status: 403,
        headers: { 'x-header': 'value' },
        resolveBody: () => Promise.resolve(serialized),
      }).then(() => null, e => e)

      expect(error).toBeInstanceOf(MalformedResponseError)
      expect(error.message).toBe('Forbidden')
      expect(error.response).toEqual({ status: 403, headers: { 'x-header': 'value' }, body: serialized })
    })

    it('throws MalformedResponseError on invalid RPC response format', async () => {
      const error: any = await codec.decodeResponse({
        status: 200,
        headers: {},
        resolveBody: () => Promise.resolve({ meta: 123 }),
      }).then(() => null, e => e)

      expect(error).toBeInstanceOf(MalformedResponseError)
      expect(error.message).toBe('Invalid RPC response format.')
      expect(error.response).toEqual({ status: 200, headers: {}, body: { meta: 123 } })
      expect(error.cause).toBeInstanceOf(Error)
    })
  })
})
