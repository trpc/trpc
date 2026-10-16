import type { StandardLinkOptions, StandardLinkPlugin, StandardLinkTransportInterceptor } from '../adapters/standard'
import { RPCLink } from '@orpc/client/fetch'
import { toArray } from '@orpc/shared'
import { ResponseCompressionLinkPlugin } from './response-compression'

async function compressAsync(data: string, encoding: 'gzip' | 'deflate' | 'deflate-raw'): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream(encoding))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

beforeEach(() => {
  vi.clearAllMocks()
})

function createLink(options: {
  pluginOptions?: ConstructorParameters<typeof ResponseCompressionLinkPlugin>[0]
  plugins?: StandardLinkPlugin<any>[]
  transportInterceptors?: StandardLinkTransportInterceptor<any>[]
  fetchImpl?: (url: string, init: { body: any, headers: Headers }) => Promise<Response>
} = {}) {
  const fetch = vi.fn(
    options.fetchImpl ?? (async (_url: string, _init: { body: any, headers: Headers }) =>
      new Response(JSON.stringify({ json: 'OK' }), { headers: { 'content-type': 'application/json' } })),
  )

  const link = new RPCLink({
    url: '/rpc',
    origin: 'http://localhost:3000',
    method: () => 'POST',
    plugins: [
      new ResponseCompressionLinkPlugin(options.pluginOptions),
      ...toArray(options.plugins),
    ],
    transportInterceptors: options.transportInterceptors,
    fetch,
  })

  return { link, fetch }
}

describe('responseCompressionLinkPlugin', () => {
  it('sets accept-encoding on the request when not already present', async () => {
    const { link, fetch } = createLink()

    await expect(link.call(['test'], undefined, { context: {} })).resolves.toEqual('OK')

    expect(fetch).toHaveBeenCalledTimes(1)
    const [, init] = fetch.mock.calls[0]!
    expect(init.headers?.get('accept-encoding')).toBe('gzip, deflate')
  })

  it('respects custom encodings option for accept-encoding', async () => {
    const { link, fetch } = createLink({ pluginOptions: { encodings: ['deflate', 'gzip'] } })

    await expect(link.call(['test'], undefined, { context: {} })).resolves.toEqual('OK')

    expect(fetch).toHaveBeenCalledTimes(1)
    const [, init] = fetch.mock.calls[0]!
    expect(init.headers?.get('accept-encoding')).toBe('deflate, gzip')
  })

  it.each(
    ['gzip', 'deflate', 'deflate-raw'] as const,
  )('decompresses response body when content-encoding is %s', async (encoding) => {
    const payload = JSON.stringify({ json: 'OK' })
    const compressed = await compressAsync(payload, encoding)

    const { link } = createLink({
      fetchImpl: async () => new Response(compressed, {
        headers: {
          'content-type': 'application/json',
          'content-encoding': encoding,
        },
      }),
    })

    await expect(link.call(['test'], undefined, { context: {} })).resolves.toEqual('OK')
  })

  it('decompresses response body when multiple content-encodings are applied', async () => {
    const payload = JSON.stringify({ json: 'OK' })
    // Content-Encoding: deflate, gzip means gzip applied last
    const deflatedBytes = await compressAsync(payload, 'deflate')
    const gzippedStream = new Blob([deflatedBytes]).stream().pipeThrough(new CompressionStream('gzip'))
    const multiCompressed = new Uint8Array(await new Response(gzippedStream).arrayBuffer())

    const { link } = createLink({
      fetchImpl: async () => new Response(multiCompressed, {
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'deflate, gzip',
        },
      }),
    })

    await expect(link.call(['test'], undefined, { context: {} })).resolves.toEqual('OK')
  })

  it('decompresses response body when 5 content-encodings are applied', async () => {
    let body: Uint8Array<ArrayBuffer> = await compressAsync(JSON.stringify({ json: 'OK' }), 'gzip')
    for (let i = 1; i < 5; i++) {
      body = new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
    }

    const { link } = createLink({
      fetchImpl: async () => new Response(body, {
        headers: {
          'content-type': 'application/json',
          'content-encoding': Array.from({ length: 5 }).fill('gzip').join(', '),
        },
      }),
    })

    await expect(link.call(['test'], undefined, { context: {} })).resolves.toEqual('OK')
  })

  it('rejects response body when more than 5 content-encodings are applied', async () => {
    const { link } = createLink({
      fetchImpl: async () => new Response('irrelevant', {
        headers: {
          'content-type': 'application/json',
          'content-encoding': Array.from({ length: 6 }).fill('gzip').join(', '),
        },
      }),
    })

    const promise = link.call(['test'], undefined, { context: {} })

    await expect(promise).rejects.toBeInstanceOf(TypeError)
    await expect(promise).rejects.toThrow('Too many content encodings.')
  })

  it('does not decompress when content-encoding is not supported', async () => {
    const payload = JSON.stringify({ json: 'OK' })

    const { link } = createLink({
      fetchImpl: async () => new Response(payload, {
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'br',
        },
      }),
    })

    // Body is not decompressed; JSON parse still works because body was never compressed
    await expect(link.call(['test'], undefined, { context: {} })).resolves.toEqual('OK')
  })

  it('does not decompress when content-encoding is not set', async () => {
    const { link } = createLink()

    await expect(link.call(['test'], undefined, { context: {} })).resolves.toEqual('OK')
  })

  it('does not decompress when any content-encoding in the list is unsupported', async () => {
    const payload = JSON.stringify({ json: 'OK' })
    const compressed = await compressAsync(payload, 'gzip')

    const { link } = createLink({
      fetchImpl: async () => new Response(compressed, {
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip, br',
        },
      }),
    })

    // Partial decode is skipped; body stays compressed → deserialize fails
    await expect(link.call(['test'], undefined, { context: {} })).rejects.toThrow()
  })

  it('should not decompress when resolveBody returns non-ReadableStream', async () => {
    const mockResponsePlugin: StandardLinkPlugin<any> = {
      name: 'mock-non-stream-response',
      after: ['~response-compression'],
      init(options: StandardLinkOptions<any>): StandardLinkOptions<any> {
        return {
          ...options,
          transportInterceptors: [
            ...toArray(options.transportInterceptors),
            async () => ({
              status: 200,
              headers: {
                'content-type': 'application/json',
                'content-encoding': 'gzip',
              },
              async resolveBody() {
                return { json: 'MOCKED' }
              },
            }),
          ],
        }
      },
    }

    const { link } = createLink({
      plugins: [mockResponsePlugin],
    })

    await expect(link.call(['test'], undefined, { context: {} })).resolves.toEqual('MOCKED')
  })
})
