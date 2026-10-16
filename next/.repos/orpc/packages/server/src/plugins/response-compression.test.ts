import supertest from 'supertest'
import { RPCHandler } from '../adapters/fetch'
import { RPCHandler as NodeRPCHandler } from '../adapters/node'
import { os } from '../builder'
import { ResponseCompressionHandlerPlugin } from './response-compression'

async function decompressStream(stream: ReadableStream, encoding: 'gzip' | 'deflate' | 'deflate-raw'): Promise<string> {
  const decompressed = stream.pipeThrough(new DecompressionStream(encoding))
  return new Response(decompressed).text()
}

describe('responseCompressionHandlerPlugin', () => {
  describe('unmatched', () => {
    it('returns unmatched results without modifying them', async () => {
      const handler = new RPCHandler({}, {
        plugins: [
          new ResponseCompressionHandlerPlugin(),
        ],
      })

      const result = await handler.handle(new Request('https://example.com/unmatched', {
        headers: {
          'accept-encoding': 'gzip',
        },
      }))

      expect(result).toEqual({ matched: false })
    })
  })

  describe('accept-encoding / encodings', () => {
    it('does not compress when the client does not accept compression', async () => {
      const largeText = 'x'.repeat(2000)
      const handler = new RPCHandler(os.handler(() => largeText), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
      await expect(response!.json()).resolves.toEqual({ json: largeText })
    })

    it('prefers the first configured encoding the client accepts', async () => {
      const handler = new RPCHandler(os.handler(() => 'x'.repeat(2000)), {
        plugins: [
          new ResponseCompressionHandlerPlugin({
            encodings: ['deflate', 'gzip'],
            threshold: 100,
          }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip, deflate',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('deflate')
    })

    it('ignores q-value parameters when matching a coding', async () => {
      const largeText = 'x'.repeat(2000)
      const handler = new RPCHandler(os.handler(() => largeText), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ encodings: ['gzip'], threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip;q=0.8, identity;q=0.5',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
      await expect(
        decompressStream(response!.body!, 'gzip'),
      ).resolves.toBe(JSON.stringify({ json: largeText }))
    })

    it.each([
      ['only unsupported codings', 'br, zstd', null],
      ['empty list elements', ' , gzip , ', 'gzip'],
      ['a wildcard beside an explicitly rejected coding', 'gzip;q=0, *', 'deflate'],
    ])('negotiates accept-encoding with %s', async (_case, acceptEncoding, expected) => {
      const handler = new RPCHandler(os.handler(() => 'x'.repeat(2000)), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': acceptEncoding,
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe(expected)
    })
  })

  describe('content-encoding header', () => {
    it('does not compress when content-encoding is already set', async () => {
      const handler = new RPCHandler(os.handler(() => 'x'.repeat(2000)), {
        plugins: [
          {
            name: 'set-content-encoding',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        headers: {
                          ...result.response.headers,
                          'content-encoding': 'br',
                        },
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('br')
    })
  })

  describe('cache-control header', () => {
    it('does not compress when cache-control includes no-transform', async () => {
      const largeText = 'x'.repeat(2000)
      const handler = new RPCHandler(os.handler(() => largeText), {
        plugins: [
          {
            name: 'set-cache-control',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        headers: {
                          ...result.response.headers,
                          'cache-control': 'public, no-transform',
                        },
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
      await expect(response!.json()).resolves.toEqual({ json: largeText })
    })
  })

  describe('vary', () => {
    it.each([
      ['adds accept-encoding when absent', undefined, 'accept-encoding'],
      ['keeps an existing accept-encoding once', 'accept-encoding', 'accept-encoding'],
      ['appends to other fields', 'origin', 'origin, accept-encoding'],
      ['matches case insensitively', 'Accept-Encoding', 'Accept-Encoding'],
      ['leaves the wildcard alone', '*', '*'],
    ])('%s', async (_label, vary, expected) => {
      const largeText = 'x'.repeat(2000)
      const handler = new RPCHandler(os.handler(() => largeText), {
        plugins: [
          {
            name: 'set-vary',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        headers: { ...result.response.headers, ...vary === undefined ? {} : { vary } },
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(response!.headers.get('content-encoding')).toBe('gzip')
      expect(response!.headers.get('vary')).toBe(expected)
    })
  })

  describe('validators', () => {
    function createHandler(extraHeaders: Record<string, string>) {
      return new RPCHandler(os.handler(() => 'x'.repeat(2000)), {
        plugins: [
          {
            name: 'set-validators',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        headers: { ...result.response.headers, ...extraHeaders },
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })
    }

    function createRequest(acceptEncoding: string) {
      return new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': acceptEncoding,
        },
        body: JSON.stringify({ json: null }),
      })
    }

    it.each([
      ['weakens a strong etag', '"abc"', 'W/"abc"'],
      ['keeps a weak etag', 'W/"abc"', 'W/"abc"'],
      ['adds no etag when there is none', undefined, null],
    ])('%s and drops accept-ranges on a compressed response', async (_label, etag, expected) => {
      const { response } = await createHandler({ ...etag === undefined ? {} : { etag }, 'accept-ranges': 'bytes' }).handle(createRequest('gzip'))

      expect(response!.headers.get('content-encoding')).toBe('gzip')
      // A strong tag shared with the identity bytes would let If-Range splice them into compressed ones
      expect(response!.headers.get('etag')).toBe(expected)
      expect(response!.headers.has('accept-ranges')).toBe(false)
    })

    it('keeps validators on a response it does not compress', async () => {
      const { response } = await createHandler({ 'etag': '"abc"', 'accept-ranges': 'bytes' }).handle(createRequest('identity'))

      expect(response!.headers.has('content-encoding')).toBe(false)
      expect(response!.headers.get('etag')).toBe('"abc"')
      expect(response!.headers.get('accept-ranges')).toBe('bytes')
    })
  })

  describe('partial responses', () => {
    it.each([
      ['a 206 status', 206, {}],
      ['a content-range header', 200, { 'content-range': 'bytes 0-1999/4000' }],
    ])('does not compress a response with %s', async (_label, status, extraHeaders) => {
      const largeText = 'x'.repeat(2000)
      const handler = new RPCHandler(os.handler(() => largeText), {
        plugins: [
          {
            name: 'set-partial-response',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        status,
                        headers: { ...result.response.headers, ...extraHeaders },
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      // Compressing would leave content-range describing offsets the client never receives
      expect(response!.headers.has('content-encoding')).toBe(false)
      await expect(response!.json()).resolves.toEqual({ json: largeText })
    })
  })

  it('compresses a response whose content-range header was cleared', async () => {
    const largeText = 'x'.repeat(2000)
    const handler = new RPCHandler(os.handler(() => largeText), {
      plugins: [new ResponseCompressionHandlerPlugin({ threshold: 100 })],
      routingInterceptors: [async ({ next }) => {
        const result = await next()

        return result.matched
          ? { ...result, response: { ...result.response, headers: { ...result.response.headers, 'content-range': [] } } }
          : result
      }],
    })

    const { response } = await handler.handle(new Request('http://localhost', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept-encoding': 'gzip',
      },
      body: JSON.stringify({ json: null }),
    }))

    expect(response!.headers.get('content-encoding')).toBe('gzip')
    expect(response!.headers.has('content-range')).toBe(false)
  })

  describe('json body', () => {
    it.each(
      ['gzip', 'deflate', 'deflate-raw'] as const,
    )('compresses large JSON responses with %s when the client accepts it', async (encoding) => {
      const largeText = 'x'.repeat(2000)
      const handler = new RPCHandler(os.handler(() => largeText), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ encodings: [encoding], threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': encoding,
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe(encoding)
      expect(response!.headers.get('content-type')).toBe('application/json')
      expect(response!.headers.has('content-length')).toBe(false)

      await expect(
        decompressStream(response!.body!, encoding),
      ).resolves.toBe(JSON.stringify({ json: largeText }))
    })

    it('does not compress JSON responses below the configured threshold', async () => {
      const smallText = 'small response'
      const handler = new RPCHandler(os.handler(() => smallText), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 1024 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
      await expect(response!.json()).resolves.toEqual({ json: smallText })
    })
  })

  describe('blob body', () => {
    it('should compress blob body above threshold', async () => {
      const largeBlob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })
      const handler = new RPCHandler(os.handler(() => largeBlob), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.body).toBeInstanceOf(ReadableStream)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
      expect(response!.headers.get('content-type')).toBe('text/plain')
      expect(response!.headers.has('content-length')).toBe(false)
      expect(response!.headers.get('content-disposition')).toContain('blob')

      await expect(
        decompressStream(response!.body!, 'gzip'),
      ).resolves.toEqual(await largeBlob.text())
    })

    it('should not compress blob body below threshold', async () => {
      const smallBlob = new Blob(['small content'], { type: 'text/plain' })
      const handler = new RPCHandler(os.handler(() => smallBlob), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
      await expect(response!.text()).resolves.toBe('small content')
    })

    it('should not compress unsupported content-type blob', async () => {
      const imageBlob = new Blob(['large content'.repeat(100)], { type: 'image/png' })
      const handler = new RPCHandler(os.handler(() => imageBlob), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
    })

    it('should respect existing content-disposition header for compressed blob body', async () => {
      const largeBlob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })
      const handler = new RPCHandler(os.handler(() => largeBlob), {
        plugins: [
          {
            name: 'set-content-disposition',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        headers: {
                          ...result.response.headers,
                          'content-disposition': '__CUSTOM__',
                        },
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
      expect(response!.headers.get('content-disposition')).toBe('__CUSTOM__')
    })

    it('should use file name in content-disposition for File body', async () => {
      const file = new File(['large content'.repeat(100)], 'my-file.txt', { type: 'text/plain' })
      const handler = new RPCHandler(os.handler(() => file), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
      expect(response!.headers.get('content-disposition')).toContain('my-file.txt')
    })

    it('should compress blob body when size is unknown', async () => {
      class NaNSizeBlob extends Blob {
        override get size() {
          return Number.NaN
        }
      }

      const blob = new NaNSizeBlob(['small'], { type: 'text/plain' })
      const handler = new RPCHandler(os.handler(() => blob), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 1000 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
    })

    it('should not compress blob body when size is unknown and content-type is non-compressible', async () => {
      class NaNSizeBlob extends Blob {
        override get size() {
          return Number.NaN
        }
      }

      const blob = new NaNSizeBlob(['small'], { type: 'image/png' })
      const handler = new RPCHandler(os.handler(() => blob), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 1000 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
    })

    it.each([
      ['text/csv; charset=utf-8', 'text/plain', 'gzip'],
      ['text/html; charset=utf-8', '', 'gzip'],
      ['image/png', 'text/plain', null],
      [[], 'text/plain', null],
    ])('uses content-type header %j over blob type %j', async (contentType, blobType, encoding) => {
      const handler = new RPCHandler(os.handler(() => new Blob(['large content'.repeat(100)], { type: blobType })), {
        plugins: [new ResponseCompressionHandlerPlugin({ threshold: 100 })],
        routingInterceptors: [async ({ next }) => {
          const result = await next()

          return result.matched
            ? { ...result, response: { ...result.response, headers: { ...result.response.headers, 'content-type': contentType } } }
            : result
        }],
      })

      const handle = (acceptEncoding: string) => handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': acceptEncoding,
        },
        body: JSON.stringify({ json: null }),
      }))

      const { response } = await handle('gzip')
      const { response: uncompressed } = await handle('identity')

      expect(response!.headers.get('content-encoding')).toBe(encoding)
      // Same content-type the adapter sends when the response is not compressed
      expect(response!.headers.get('content-type')).toBe(uncompressed!.headers.get('content-type'))
    })
  })

  describe('readable stream body', () => {
    it('should compress ReadableStream body above threshold with compressible content-type', async () => {
      const payload = 'large content'.repeat(100)
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(payload))
          controller.close()
        },
      })

      const handler = new RPCHandler(os.handler(() => stream), {
        plugins: [
          {
            name: 'set-stream-headers',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        headers: {
                          ...result.response.headers,
                          'content-type': 'text/plain',
                          'content-length': '200',
                        },
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.body).toBeInstanceOf(ReadableStream)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
      expect(response!.headers.get('content-type')).toBe('text/plain')
      expect(response!.headers.has('content-length')).toBe(false)

      await expect(
        decompressStream(response!.body!, 'gzip'),
      ).resolves.toEqual(payload)
    })

    it('should not compress ReadableStream body below threshold', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('small'))
          controller.close()
        },
      })

      const handler = new RPCHandler(os.handler(() => stream), {
        plugins: [
          {
            name: 'set-stream-headers',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        headers: {
                          ...result.response.headers,
                          'content-type': 'text/plain',
                          'content-length': '50',
                        },
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
    })

    it('should not compress ReadableStream body with non-compressible content-type', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('large content'.repeat(100)))
          controller.close()
        },
      })

      const handler = new RPCHandler(os.handler(() => stream), {
        plugins: [
          {
            name: 'set-stream-headers',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        headers: {
                          ...result.response.headers,
                          'content-type': 'image/png',
                          'content-length': '200',
                        },
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
    })

    it('should compress ReadableStream body when content-length is unknown with compressible content-type', async () => {
      const payload = 'large content'.repeat(100)
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(payload))
          controller.close()
        },
      })

      const handler = new RPCHandler(os.handler(() => stream), {
        plugins: [
          {
            name: 'set-stream-headers',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        headers: {
                          ...result.response.headers,
                          'content-type': 'text/plain',
                        },
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
      expect(response!.headers.has('content-length')).toBe(false)

      await expect(
        decompressStream(response!.body!, 'gzip'),
      ).resolves.toEqual(payload)
    })
  })

  describe('form data body', () => {
    it('should compress FormData body above threshold with blob field', async () => {
      const blob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })
      const handler = new RPCHandler(os.handler(() => ({ file: blob })), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.body).toBeInstanceOf(ReadableStream)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
      expect(response!.headers.get('content-type')).toMatch(/^multipart\/form-data/)
      expect(response!.headers.has('content-length')).toBe(false)
    })

    it('should compress FormData body above threshold with string field', async () => {
      const form = new FormData()
      form.set('value', 'a'.repeat(100))

      const handler = new RPCHandler(os.handler(() => 'ok'), {
        plugins: [
          {
            name: 'set-form-data-body',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        body: form,
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
      expect(response!.headers.get('content-type')).toMatch(/^multipart\/form-data/)
    })

    it('should not compress FormData body below threshold', async () => {
      const blob = new Blob(['x'], { type: 'text/plain' })
      const handler = new RPCHandler(os.handler(() => ({ file: blob })), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 1000 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
    })

    it('should not compress FormData body when non-compressible blob keeps score below threshold', async () => {
      const blob = new Blob(['large content'.repeat(100)], { type: 'image/png' })
      const handler = new RPCHandler(os.handler(() => ({ file: blob })), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 500 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
    })

    it('should compress FormData when compressible data outweighs non-compressible blob', async () => {
      const text = new Blob(['a'.repeat(500)], { type: 'text/plain' })
      const image = new Blob(['x'.repeat(50)], { type: 'image/png' })
      const handler = new RPCHandler(os.handler(() => ({ text, image })), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
      expect(response!.headers.get('content-type')).toMatch(/^multipart\/form-data/)
    })

    it('should not compress FormData when non-compressible blob outweighs compressible data', async () => {
      const text = new Blob(['hi'], { type: 'text/plain' })
      const image = new Blob(['x'.repeat(2000)], { type: 'image/png' })
      const handler = new RPCHandler(os.handler(() => ({ text, image })), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 500 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
    })

    it('should compress FormData when NaN-size compressible blob is present (without non-compressible NaN-size blobs)', async () => {
      class NaNSizeBlob extends Blob {
        override get size() {
          return Number.NaN
        }
      }

      const blob1 = new NaNSizeBlob(['content'], { type: 'text/plain' })
      const blob2 = new Blob(['content'.repeat(100)], { type: 'image/png' })

      const handler = new RPCHandler(os.handler(() => ({ blob1, blob2 })), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 1000 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
    })

    it('should not compress FormData when a NaN-size non-compressible blob is present (even with NaN-size compressible blobs)', async () => {
      class NaNSizeBlob extends Blob {
        override get size() {
          return Number.NaN
        }
      }

      const blob1 = new NaNSizeBlob(['content'.repeat(1)], { type: 'image/png' })
      const blob2 = new NaNSizeBlob(['content'.repeat(100)], { type: 'text/plain' })
      const handler = new RPCHandler(os.handler(() => ({ blob1, blob2 })), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 1000 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
    })
  })

  describe('url search params body', () => {
    it('should compress URLSearchParams body above threshold', async () => {
      const params = new URLSearchParams({ value: 'a'.repeat(100) })
      const handler = new RPCHandler(os.handler(() => 'ok'), {
        plugins: [
          {
            name: 'set-url-search-params-body',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        body: params,
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.body).toBeInstanceOf(ReadableStream)
      expect(response!.headers.get('content-encoding')).toBe('gzip')
      expect(response!.headers.get('content-type')).toBe('application/x-www-form-urlencoded')
      expect(response!.headers.has('content-length')).toBe(false)

      await expect(
        decompressStream(response!.body!, 'gzip'),
      ).resolves.toEqual(`value=${encodeURIComponent('a'.repeat(100))}`)
    })

    it('should not compress URLSearchParams body below threshold', async () => {
      const params = new URLSearchParams({ value: 'hi' })
      const handler = new RPCHandler(os.handler(() => 'ok'), {
        plugins: [
          {
            name: 'set-url-search-params-body',
            init(options) {
              return {
                ...options,
                routingInterceptors: [
                  async ({ next, ...interceptorOptions }) => {
                    const result = await next(interceptorOptions)
                    if (!result.matched) {
                      return result
                    }
                    return {
                      ...result,
                      response: {
                        ...result.response,
                        body: params,
                      },
                    }
                  },
                  ...options.routingInterceptors ?? [],
                ],
              }
            },
          },
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
    })
  })

  describe('async iterator body', () => {
    it('should not compress async iterator body', async () => {
      const handler = new RPCHandler(
        os.handler(async function* () {
          yield 'yield1'
          yield 'yield2'
        }),
        {
          plugins: [
            new ResponseCompressionHandlerPlugin({ threshold: 0 }),
          ],
        },
      )

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
      expect(response!.headers.get('content-type')).toBe('text/event-stream')
    })
  })

  describe('threshold option', () => {
    it('defaults to 1024 bytes', async () => {
      const largeText = 'x'.repeat(2000)
      const handler = new RPCHandler(os.handler(() => largeText), {
        plugins: [
          new ResponseCompressionHandlerPlugin(),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(response!.body!, 'gzip'),
      ).resolves.toBe(JSON.stringify({ json: largeText }))
    })

    it('always compresses when threshold is 0', async () => {
      const smallText = 'a'
      const handler = new RPCHandler(os.handler(() => smallText), {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 0 }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(response!.body!, 'gzip'),
      ).resolves.toBe(JSON.stringify({ json: smallText }))
    })
  })

  describe('isCompressibleContentType option', () => {
    it('compresses a normally non-compressible content-type when the custom check allows it', async () => {
      const binaryBlob = new Blob(['large content'.repeat(100)], { type: 'application/octet-stream' })
      const handler = new RPCHandler(os.handler(() => binaryBlob), {
        plugins: [
          new ResponseCompressionHandlerPlugin({
            threshold: 100,
            isCompressibleContentType: (contentType, interceptorOptions) => {
              expect(interceptorOptions.request).toBeDefined()
              expect(interceptorOptions.context).toEqual({})
              return contentType === 'application/octet-stream'
            },
          }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.get('content-encoding')).toBe('gzip')

      await expect(
        decompressStream(response!.body!, 'gzip'),
      ).resolves.toEqual(await binaryBlob.text())
    })

    it('does not compress a normally compressible content-type when the custom check rejects it', async () => {
      const textBlob = new Blob(['large content'.repeat(100)], { type: 'text/plain' })
      const handler = new RPCHandler(os.handler(() => textBlob), {
        plugins: [
          new ResponseCompressionHandlerPlugin({
            threshold: 100,
            isCompressibleContentType: () => false,
          }),
        ],
      })

      const { matched, response } = await handler.handle(new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip',
        },
        body: JSON.stringify({ json: null }),
      }))

      expect(matched).toBe(true)
      expect(response!.headers.has('content-encoding')).toBe(false)
      await expect(response!.text()).resolves.toBe(await textBlob.text())
    })
  })

  describe('node adapter', () => {
    it('should work with Node.js adapter', async () => {
      const largeText = 'x'.repeat(2000)
      const procedure = os.handler(() => largeText)
      const nodeHandler = new NodeRPCHandler(procedure, {
        plugins: [
          new ResponseCompressionHandlerPlugin({ threshold: 100 }),
        ],
      })

      const server = supertest((req: any, res: any) => {
        nodeHandler.handle(req, res)
      })

      const response = await server.post('/')
        .set('accept-encoding', 'gzip')
        .set('content-type', 'application/json')
        .send({ json: null })

      expect(response.status).toBe(200)
      expect(response.headers['content-encoding']).toBe('gzip')
      // superagent auto-decompresses the body
      expect(response.text).toContain(largeText)
    })
  })
})
