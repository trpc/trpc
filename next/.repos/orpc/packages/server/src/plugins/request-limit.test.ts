import zlib from 'node:zlib'
import supertest from 'supertest'
import { RPCHandler } from '../adapters/fetch'
import { RPCHandler as NodeRPCHandler } from '../adapters/node'
import { os } from '../builder'
import { RequestCompressionHandlerPlugin } from './request-compression'
import { RequestLimitHandlerPlugin } from './request-limit'

describe('requestLimitHandlerPlugin', () => {
  const size22Json = { json: { foo: 'bar' } }
  const procedureHandler = vi.fn(() => 'ping')
  const procedure = os.handler(procedureHandler)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores requests without a body', async () => {
    const handler = new RPCHandler(
      {
        ping: procedure,
      },
      {
        allowMethods: ['GET'], // this test sends a GET request
        plugins: [new RequestLimitHandlerPlugin({ maxBodySize: 22 })],
      },
    )

    const { matched, response } = await handler.handle(new Request('https://example.com/ping?data=%7B%7D'))

    expect(matched).toBe(true)
    await expect(response!.text()).resolves.toContain('ping')
    expect(response!.status).toBe(200)
  })

  it('allows bodies within the limit', async () => {
    const handler = new RPCHandler(
      {
        ping: procedure,
      },
      {
        plugins: [new RequestLimitHandlerPlugin({ maxBodySize: 22 })],
      },
    )

    const { matched, response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(size22Json),
    }))

    expect(matched).toBe(true)
    await expect(response!.text()).resolves.toContain('ping')
    expect(response!.status).toBe(200)
  })

  it('rejects when content-length exceeds the limit', async () => {
    const handler = new RPCHandler(
      {
        ping: procedure,
      },
      {
        plugins: [new RequestLimitHandlerPlugin({ maxBodySize: 21 })],
      },
    )

    const { matched, response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'content-length': '22',
      },
      body: JSON.stringify({}),
    }))

    expect(matched).toBe(true)
    await expect(response!.text()).resolves.toContain('PAYLOAD_TOO_LARGE')
    expect(response!.status).toBe(413)
    expect(procedureHandler).not.toHaveBeenCalled()
  })

  it('rejects when the streamed body exceeds the limit', async () => {
    const handler = new RPCHandler(
      {
        ping: procedure,
      },
      {
        plugins: [new RequestLimitHandlerPlugin({ maxBodySize: 21 })],
      },
    )

    const { matched, response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(size22Json),
    }))

    expect(matched).toBe(true)
    await expect(response!.text()).resolves.toContain('PAYLOAD_TOO_LARGE')
    expect(response!.status).toBe(413)
    expect(procedureHandler).not.toHaveBeenCalled()
  })

  it('does not limit when resolveBody returns a non-ReadableStream', async () => {
    const handler = new RPCHandler(procedure, {
      plugins: [
        new RequestLimitHandlerPlugin({ maxBodySize: 1 }),
        {
          name: 'test-plugin',
          init(options) {
            return {
              ...options,
              routingInterceptors: [
                async ({ next, ...interceptorOptions }) => {
                  return next({
                    ...interceptorOptions,
                    request: {
                      ...interceptorOptions.request,
                      async resolveBody() {
                        return { json: '__MOCKED__' }
                      },
                    },
                  })
                },
                ...options.routingInterceptors ?? [],
              ],
            }
          },
        },
      ],
    })

    const { response } = await handler.handle(new Request('http://localhost', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(response?.status).toBe(200)
    expect(procedureHandler).toHaveBeenCalledWith(expect.any(Object), '__MOCKED__')
  })

  it('works with the Node.js adapter', async () => {
    const nodeHandler = new NodeRPCHandler(
      {
        ping: procedure,
      },
      {
        plugins: [new RequestLimitHandlerPlugin({ maxBodySize: 21 })],
      },
    )

    const server = supertest((req: any, res: any) => {
      nodeHandler.handle(req, res)
    })

    const response = await server.post('/ping')
      .set('content-type', 'application/json')
      .send(size22Json)

    expect(response.status).toBe(413)
    expect(response.text).toContain('PAYLOAD_TOO_LARGE')
    expect(procedureHandler).not.toHaveBeenCalled()
  })

  describe('with RequestCompressionHandlerPlugin', () => {
    it('applies the limit after decompression', async () => {
      // Highly compressible: small on the wire, large after decompression.
      const payload = JSON.stringify({ json: 'a'.repeat(10_000) })
      const compressed = zlib.gzipSync(payload)
      const maxBodySize = 5_000

      expect(compressed.byteLength).toBeLessThan(maxBodySize)
      expect(payload.length).toBeGreaterThan(maxBodySize)

      const handler = new RPCHandler(
        {
          ping: procedure,
        },
        {
          plugins: [
            new RequestLimitHandlerPlugin({ maxBodySize }),
            new RequestCompressionHandlerPlugin(),
          ],
        },
      )

      const { matched, response } = await handler.handle(new Request('https://example.com/ping', {
        method: 'POST',
        headers: {
          'content-encoding': 'gzip',
          'content-type': 'application/json',
        },
        body: compressed,
      }))

      expect(matched).toBe(true)
      await expect(response!.text()).resolves.toContain('PAYLOAD_TOO_LARGE')
      expect(response!.status).toBe(413)
      expect(procedureHandler).not.toHaveBeenCalled()
    })

    it('allows decompressed bodies within the limit', async () => {
      const payload = JSON.stringify(size22Json)
      const compressed = zlib.gzipSync(payload)

      const handler = new RPCHandler(
        {
          ping: procedure,
        },
        {
          plugins: [
            new RequestLimitHandlerPlugin({ maxBodySize: 1024 }),
            new RequestCompressionHandlerPlugin(),
          ],
        },
      )

      const { matched, response } = await handler.handle(new Request('https://example.com/ping', {
        method: 'POST',
        headers: {
          'content-encoding': 'gzip',
          'content-type': 'application/json',
        },
        body: compressed,
      }))

      expect(matched).toBe(true)
      await expect(response!.text()).resolves.toContain('ping')
      expect(response!.status).toBe(200)
    })
  })
})
