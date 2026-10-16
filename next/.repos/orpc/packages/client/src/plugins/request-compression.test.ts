import type { StandardLinkTransportInterceptor } from '../adapters/standard'
import { RPCLink } from '@orpc/client/fetch'
import { RequestCompressionLinkPlugin } from './request-compression'

beforeEach(() => {
  vi.clearAllMocks()
})

async function decompressStream(stream: ReadableStream, encoding: 'gzip' | 'deflate' | 'deflate-raw'): Promise<string> {
  const decompressed = stream.pipeThrough(new DecompressionStream(encoding))
  const reader = decompressed.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return new TextDecoder().decode(result)
}

function createLink(options: {
  pluginOptions?: ConstructorParameters<typeof RequestCompressionLinkPlugin>[0]
  transportInterceptors?: StandardLinkTransportInterceptor<any>[]
} = {}) {
  const fetch = vi.fn(
    async (_url: string, init: { body: any, headers: Headers }) => new Response(JSON.stringify({ json: 'OK' }), { headers: { 'content-type': 'application/json' } }),
  )

  const link = new RPCLink({
    url: '/rpc',
    origin: 'http://localhost:3000',
    method: () => 'POST',
    plugins: [
      new RequestCompressionLinkPlugin(options.pluginOptions),
    ],
    transportInterceptors: options.transportInterceptors,
    fetch,
  })

  return { link, fetch }
}

describe('requestCompressionLinkPlugin', () => {
  describe('undefined body', () => {
    it('should not compress undefined body', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })

      await expect(link.call(['test'], undefined, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeUndefined()
      expect(init.headers?.get('standard-server')).toBeNull()
      expect(init.headers?.get('content-type')).toBeNull()
      expect(init.headers?.get('content-length')).toBeNull()
      expect(init.headers?.get('content-disposition')).toBeNull()
      expect(init.headers?.get('content-encoding')).toBeNull()
    })
  })

  describe('json body', () => {
    it('should not compress json body below threshold', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })

      await expect(link.call(['test'], { foo: 'bar' }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBe(JSON.stringify({ json: { foo: 'bar' } }))
      expect(init.headers?.get('standard-server')).toBeNull()
      expect(init.headers?.get('content-type')).toBe('application/json')
      expect(init.headers?.get('content-length')).toBeNull()
      expect(init.headers?.get('content-disposition')).toBeNull()
      expect(init.headers?.get('content-encoding')).toBeNull()
    })

    it('should compress json body above threshold', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })
      const largeObject = { foo: 'bar'.repeat(100) }

      await expect(link.call(['test'], largeObject, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!

      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('standard-server')).toBeNull()
      expect(init.headers?.get('content-type')).toBe('application/json')
      expect(init.headers?.get('content-length')).toBeNull()
      expect(init.headers?.get('content-disposition')).toBeNull()
      expect(init.headers?.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(init.body as ReadableStream, 'gzip'),
      ).resolves.toEqual(JSON.stringify({ json: largeObject }))
    })
  })

  describe('blob body', () => {
    it('should not compress blob body below threshold', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })
      const smallBlob = new Blob(['small content'], { type: 'text/plain' })

      await expect(link.call(['test'], smallBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBe(smallBlob)
      expect(init.headers?.get('standard-server')).toBe('file')
      expect(init.headers?.get('content-type')).toBe('text/plain')
      expect(init.headers?.get('content-length')).toBe(smallBlob.size.toString())
      expect(init.headers?.get('content-disposition')).toContain('blob')
      expect(init.headers?.get('content-encoding')).toBeNull()
    })

    it('should compress blob body above threshold', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })
      const largeBlob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })

      await expect(link.call(['test'], largeBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('standard-server')).toBe('file')
      expect(init.headers?.get('content-type')).toBe('text/plain')
      expect(init.headers?.get('content-length')).toBeNull()
      expect(init.headers?.get('content-disposition')).toContain('blob')
      expect(init.headers?.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(init.body as ReadableStream, 'gzip'),
      ).resolves.toEqual(await largeBlob.text())
    })

    it('should not compress unsupported content-type blob', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })
      const imageBlob = new Blob(['large content'.repeat(100)], { type: 'image/png' })

      await expect(link.call(['test'], imageBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBe(imageBlob)
      expect(init.headers?.get('standard-server')).toBe('file')
      expect(init.headers?.get('content-type')).toBe('image/png')
      expect(init.headers?.get('content-length')).toBe(imageBlob.size.toString())
      expect(init.headers?.get('content-disposition')).toContain('blob')
      expect(init.headers?.get('content-encoding')).toBeNull()
    })

    it('should respect existing content-disposition header for compressed blob body', async () => {
      const transportInterceptor = vi.fn<StandardLinkTransportInterceptor<any>>(async ({ next, ...interceptorOptions }) => {
        const request = interceptorOptions.request

        return next({
          ...interceptorOptions,
          request: {
            ...request,
            headers: {
              ...request.headers,
              'content-disposition': '__CUSTOM__',
            },
          },
        })
      })
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 }, transportInterceptors: [transportInterceptor] })
      const largeBlob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })

      await expect(link.call(['test'], largeBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('standard-server')).toBe('file')
      expect(init.headers?.get('content-type')).toBe('text/plain')
      expect(init.headers?.get('content-length')).toBeNull()
      expect(init.headers?.get('content-disposition')).toBe('__CUSTOM__')
      expect(init.headers?.get('content-encoding')).toBe('gzip')
    })

    it('should use file name in content-disposition for File body', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })
      const file = new File(['large content'.repeat(100)], 'my-file.txt', { type: 'text/plain' })

      await expect(link.call(['test'], file, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('standard-server')).toBe('file')
      expect(init.headers?.get('content-type')).toBe('text/plain')
      expect(init.headers?.get('content-length')).toBeNull()
      expect(init.headers?.get('content-disposition')).toContain('my-file.txt')
      expect(init.headers?.get('content-encoding')).toBe('gzip')
    })

    it('should compress blob body when size is unknown', async () => {
      class NaNSizeBlob extends Blob {
        override get size() {
          return Number.NaN
        }
      }

      const { link, fetch } = createLink({ pluginOptions: { threshold: 1000 } })
      const blob = new NaNSizeBlob(['small'], { type: 'text/plain' })

      await expect(link.call(['test'], blob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-encoding')).toBe('gzip')
    })

    it('should not compress blob body when size is unknown and content-type is non-compressible', async () => {
      class NaNSizeBlob extends Blob {
        override get size() {
          return Number.NaN
        }
      }

      const { link, fetch } = createLink({ pluginOptions: { threshold: 1000 } })
      const blob = new NaNSizeBlob(['small'], { type: 'image/png' })

      await expect(link.call(['test'], blob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      // toFetchBody converts NaN-size blobs to streams; plugin must not add content-encoding
      expect(init.headers?.get('content-encoding')).toBeNull()
    })
  })

  describe('readable stream body', () => {
    it('should compress ReadableStream body above threshold with compressible content-type', async () => {
      const transportInterceptor = vi.fn<StandardLinkTransportInterceptor<any>>(async ({ next, ...interceptorOptions }) => {
        const request = interceptorOptions.request

        return next({
          ...interceptorOptions,
          request: {
            ...request,
            headers: {
              ...request.headers,
              'content-type': 'text/plain',
              'content-length': '200',
            },
          },
        })
      })
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 }, transportInterceptors: [transportInterceptor] })
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('large content'.repeat(100)))
          controller.close()
        },
      })

      await expect(link.call(['test'], stream, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('standard-server')).toBe('octet-stream')
      expect(init.headers?.get('content-type')).toBe('text/plain')
      expect(init.headers?.get('content-length')).toBeNull()
      expect(init.headers?.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(init.body as ReadableStream, 'gzip'),
      ).resolves.toEqual('large content'.repeat(100))
    })

    it('should not compress ReadableStream body below threshold', async () => {
      const transportInterceptor = vi.fn<StandardLinkTransportInterceptor<any>>(async ({ next, ...interceptorOptions }) => {
        const request = interceptorOptions.request

        return next({
          ...interceptorOptions,
          request: {
            ...request,
            headers: {
              ...request.headers,
              'content-type': 'text/plain',
              'content-length': '50',
            },
          },
        })
      })
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 }, transportInterceptors: [transportInterceptor] })
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('small'))
          controller.close()
        },
      })

      await expect(link.call(['test'], stream, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-encoding')).toBeNull()
    })

    it('should not compress ReadableStream body with non-compressible content-type', async () => {
      const transportInterceptor = vi.fn<StandardLinkTransportInterceptor<any>>(async ({ next, ...interceptorOptions }) => {
        const request = interceptorOptions.request

        return next({
          ...interceptorOptions,
          request: {
            ...request,
            headers: {
              ...request.headers,
              'content-type': 'image/png',
              'content-length': '200',
            },
          },
        })
      })
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 }, transportInterceptors: [transportInterceptor] })
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('large content'.repeat(100)))
          controller.close()
        },
      })

      await expect(link.call(['test'], stream, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-encoding')).toBeNull()
    })

    it('should compress ReadableStream body when content-length is unknown with compressible content-type', async () => {
      const transportInterceptor = vi.fn<StandardLinkTransportInterceptor<any>>(async ({ next, ...interceptorOptions }) => {
        const request = interceptorOptions.request

        return next({
          ...interceptorOptions,
          request: {
            ...request,
            headers: {
              ...request.headers,
              'content-type': 'text/plain',
            },
          },
        })
      })
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 }, transportInterceptors: [transportInterceptor] })
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('large content'.repeat(100)))
          controller.close()
        },
      })

      await expect(link.call(['test'], stream, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('standard-server')).toBe('octet-stream')
      expect(init.headers?.get('content-type')).toBe('text/plain')
      expect(init.headers?.get('content-length')).toBeNull()
      expect(init.headers?.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(init.body as ReadableStream, 'gzip'),
      ).resolves.toEqual('large content'.repeat(100))
    })
  })

  describe('form data body', () => {
    it('should compress FormData body above threshold with blob field', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })
      const blob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })

      await expect(link.call(['test'], { file: blob }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('standard-server')).toBeNull()
      expect(init.headers?.get('content-type')).toMatch(/^multipart\/form-data/)
      expect(init.headers?.get('content-length')).toBeNull()
      expect(init.headers?.get('content-encoding')).toBe('gzip')
    })

    it('should compress FormData body above threshold with string field', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })
      const value = 'a'.repeat(100)

      await expect(link.call(['test'], { value }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-encoding')).toBe('gzip')
    })

    it('should not compress FormData body below threshold', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 1000 } })
      const blob = new Blob(['x'], { type: 'text/plain' })

      await expect(link.call(['test'], { file: blob }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(FormData)
      expect(init.headers?.get('content-encoding')).toBeNull()
    })

    it('should not compress FormData body when non-compressible blob keeps score below threshold', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 500 } })
      const blob = new Blob(['large content'.repeat(100)], { type: 'image/png' })

      await expect(link.call(['test'], { file: blob }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(FormData)
      expect(init.headers?.get('content-encoding')).toBeNull()
    })

    it('should compress FormData when compressible data outweighs non-compressible blob', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })
      const text = new Blob(['a'.repeat(500)], { type: 'text/plain' }) // compressiable
      const image = new Blob(['x'.repeat(50)], { type: 'image/png' }) // non-compressible

      await expect(link.call(['test'], { text, image }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-type')).toMatch(/^multipart\/form-data/)
      expect(init.headers?.get('content-encoding')).toBe('gzip')
    })

    it('should not compress FormData when non-compressible blob outweighs compressible data', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 500 } })
      const text = new Blob(['hi'], { type: 'text/plain' }) // compressible
      const image = new Blob(['x'.repeat(2000)], { type: 'image/png' }) // non-compressible

      await expect(link.call(['test'], { text, image }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(FormData)
      expect(init.headers?.get('content-encoding')).toBeNull()
    })

    it('should compress FormData when NaN-size compressible blob is present (without non-compressible NaN-size blob)', async () => {
      class NaNSizeBlob extends Blob {
        override get size() {
          return Number.NaN
        }
      }

      const { link, fetch } = createLink({ pluginOptions: { threshold: 1000 } })
      const blob1 = new NaNSizeBlob(['content'], { type: 'text/plain' })
      const blob2 = new Blob(['content'.repeat(100)], { type: 'image/png' })

      await expect(link.call(['test'], { blob1, blob2 }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-encoding')).toBe('gzip')
    })

    it('should not compress FormData when a NaN-size non-compressible blob is present (even with NaN-size compressible blobs)', async () => {
      class NaNSizeBlob extends Blob {
        override get size() {
          return Number.NaN
        }
      }

      const { link, fetch } = createLink({ pluginOptions: { threshold: 1000 } })
      const blob1 = new NaNSizeBlob(['content'.repeat(1)], { type: 'image/png' })
      const blob2 = new NaNSizeBlob(['content'.repeat(100)], { type: 'text/plain' })

      await expect(link.call(['test'], { blob1, blob2 }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(FormData)
      expect(init.headers?.get('content-encoding')).toBeNull()
    })
  })

  describe('url search params body', () => {
    it('should compress URLSearchParams body above threshold', async () => {
      const transportInterceptor = vi.fn<StandardLinkTransportInterceptor<any>>(async ({ next, ...interceptorOptions }) => {
        const request = interceptorOptions.request
        const params = new URLSearchParams({ value: 'a'.repeat(100) })

        return next({
          ...interceptorOptions,
          request: {
            ...request,
            body: params,
          },
        })
      })
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 }, transportInterceptors: [transportInterceptor] })

      await expect(link.call(['test'], { foo: 'bar' }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('standard-server')).toBeNull()
      expect(init.headers?.get('content-type')).toBe('application/x-www-form-urlencoded')
      expect(init.headers?.get('content-length')).toBeNull()
      expect(init.headers?.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(init.body as ReadableStream, 'gzip'),
      ).resolves.toEqual(`value=${encodeURIComponent('a'.repeat(100))}`)
    })

    it('should not compress URLSearchParams body below threshold', async () => {
      const transportInterceptor = vi.fn<StandardLinkTransportInterceptor<any>>(async ({ next, ...interceptorOptions }) => {
        const request = interceptorOptions.request
        const params = new URLSearchParams({ value: 'hi' })

        return next({
          ...interceptorOptions,
          request: {
            ...request,
            body: params,
          },
        })
      })
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 }, transportInterceptors: [transportInterceptor] })

      await expect(link.call(['test'], { foo: 'bar' }, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(URLSearchParams)
      expect(init.headers?.get('content-encoding')).toBeNull()
    })
  })

  describe('async iterator body', () => {
    it('should not compress async iterator body', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 } })

      async function* generator() {
        yield { data: 'a'.repeat(100) }
      }

      await expect(link.call(['test'], generator(), { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.headers?.get('content-encoding')).toBeNull()
    })
  })

  describe('content-encoding header', () => {
    it('should not compress when content-encoding header is set', async () => {
      const transportInterceptor = vi.fn<StandardLinkTransportInterceptor<any>>(async ({ next, ...interceptorOptions }) => {
        const request = interceptorOptions.request

        return next({
          ...interceptorOptions,
          request: {
            ...request,
            headers: {
              ...request.headers,
              'content-encoding': '__CUSTOM__',
            },
          },
        })
      })
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100 }, transportInterceptors: [transportInterceptor] })
      const largeBlob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })

      await expect(link.call(['test'], largeBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBe(largeBlob)
      expect(init.headers?.get('content-encoding')).toBe('__CUSTOM__')
    })
  })

  describe('threshold option', () => {
    it('defaults to 1024 bytes', async () => {
      const { link, fetch } = createLink()
      const largeBlob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })

      await expect(link.call(['test'], largeBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(init.body as ReadableStream, 'gzip'),
      ).resolves.toEqual(await largeBlob.text())
    })

    it('always compresses when threshold is 0', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 0 } })
      const smallBlob = new Blob(['a'], { type: 'text/plain' })

      await expect(link.call(['test'], smallBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(init.body as ReadableStream, 'gzip'),
      ).resolves.toEqual(await smallBlob.text())
    })
  })

  describe('algorithm option', () => {
    it('should use deflate algorithm when specified', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100, encoding: 'deflate' } })
      const largeBlob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })

      await expect(link.call(['test'], largeBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-encoding')).toBe('deflate')

      await expect(
        decompressStream(init.body as ReadableStream, 'deflate'),
      ).resolves.toEqual(await largeBlob.text())
    })

    it('should use deflate-raw algorithm when specified', async () => {
      const { link, fetch } = createLink({ pluginOptions: { threshold: 100, encoding: 'deflate-raw' } })
      const largeBlob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })

      await expect(link.call(['test'], largeBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-encoding')).toBe('deflate-raw')

      await expect(
        decompressStream(init.body as ReadableStream, 'deflate-raw'),
      ).resolves.toEqual(await largeBlob.text())
    })
  })

  describe('isCompressibleContentType option', () => {
    it('compresses a normally non-compressible content-type when the custom check allows it', async () => {
      const { link, fetch } = createLink({
        pluginOptions: {
          threshold: 100,
          isCompressibleContentType: (contentType, interceptorOptions) => {
            expect(interceptorOptions.path).toEqual(['test'])
            expect(interceptorOptions.request).toBeDefined()
            return contentType === 'application/octet-stream'
          },
        },
      })
      const binaryBlob = new Blob(['large content'.repeat(100)], { type: 'application/octet-stream' })

      await expect(link.call(['test'], binaryBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBeInstanceOf(ReadableStream)
      expect(init.headers?.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(init.body as ReadableStream, 'gzip'),
      ).resolves.toEqual(await binaryBlob.text())
    })

    it('does not compress a normally compressible content-type when the custom check rejects it', async () => {
      const { link, fetch } = createLink({
        pluginOptions: {
          threshold: 100,
          isCompressibleContentType: () => false,
        },
      })
      const textBlob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })

      await expect(link.call(['test'], textBlob, { context: {} })).resolves.toEqual('OK')

      expect(fetch).toHaveBeenCalledTimes(1)
      const [, init] = fetch.mock.calls[0]!
      expect(init.body).toBe(textBlob)
      expect(init.headers?.get('content-encoding')).toBeNull()
    })
  })
})
