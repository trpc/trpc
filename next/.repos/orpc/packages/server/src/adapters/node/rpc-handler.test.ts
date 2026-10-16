import type { IncomingMessage, ServerResponse } from 'node:http'
import type { StandardHandlerPlugin } from '../standard'
import request from 'supertest'
import { os } from '../../builder'
import { RPCHandler } from './rpc-handler'

describe('rpcHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts context and prefix options in handle method', async () => {
    const handler = new RPCHandler({
      ping: os
        .$context<{ userId: string }>()
        .handler(({ context }) => context.userId),
    })

    const res = await request(async (req: IncomingMessage, response: ServerResponse) => {
      await handler.handle(req as any, response as any, {
        context: { userId: 'u_123' },
        prefix: '/api/v1',
      })
    }).post('/api/v1/ping').set('content-type', 'application/json').send({ json: null })

    expect(res.status).toBe(200)
    expect(res.text).toContain('u_123')

    const mismatchRes = await request(async (req: IncomingMessage, response: ServerResponse) => {
      const result = await handler.handle(req as any, response as any, {
        context: { userId: 'u_123' },
        prefix: '/api/v1',
      })

      if (!result.matched) {
        response.statusCode = 404
        response.end('not matched')
      }
    }).post('/invalid/ping').set('content-type', 'application/json').send({ json: null })

    expect(mismatchRes.status).toBe(404)
    expect(mismatchRes.text).toBe('not matched')
  })

  it('supports standard handler plugins', async () => {
    const plugin: StandardHandlerPlugin<any> = {
      name: 'test',
      init(options) {
        return {
          ...options,
          routingInterceptors: [
            async () => ({ matched: true, response: { status: 200, headers: {}, body: 'intercepted' } }),
          ],
        }
      },
    }

    const handler = new RPCHandler({}, { plugins: [plugin] })

    const res = await request(async (req: IncomingMessage, response: ServerResponse) => {
      await handler.handle(req as any, response as any)
    }).get('/test')

    expect(res.status).toBe(200)
    expect(res.body).toBe('intercepted')
  })

  it('treats GET requests as unmatched by default', async () => {
    const handler = new RPCHandler({
      ping: os.handler(() => 'pong'),
    })

    const res = await request(async (req: IncomingMessage, response: ServerResponse) => {
      const result = await handler.handle(req as any, response as any)

      if (!result.matched) {
        response.statusCode = 404
        response.end('not matched')
      }
    })
      .get(`/ping?data=${encodeURIComponent(JSON.stringify({ json: null }))}`)

    expect(res.status).toBe(404)
    expect(res.text).toBe('not matched')
  })

  it('allows GET requests when allowMethods includes GET', async () => {
    const handler = new RPCHandler(
      {
        ping: os.handler(() => 'pong'),
      },
      {
        allowMethods: ['GET'],
      },
    )

    const res = await request(async (req: IncomingMessage, response: ServerResponse) => {
      await handler.handle(req as any, response as any)
    })
      .get(`/ping?data=${encodeURIComponent(JSON.stringify({ json: null }))}`)

    expect(res.status).toBe(200)
    expect(res.text).toContain('pong')
  })
})
