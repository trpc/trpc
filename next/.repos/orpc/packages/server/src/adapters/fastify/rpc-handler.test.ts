import type { FastifyInstance } from 'fastify'
import type { StandardHandlerPlugin } from '../standard'
import Fastify from 'fastify'
import request from 'supertest'
import { os } from '../../builder'
import { RPCHandler } from './rpc-handler'

describe('rpcHandler', () => {
  let app: FastifyInstance

  beforeEach(() => {
    vi.clearAllMocks()
    app = Fastify()
  })

  afterEach(async () => {
    await app.close()
  })

  it('accepts context and prefix options in handle method', async () => {
    const handler = new RPCHandler({
      ping: os
        .$context<{ userId: string }>()
        .handler(({ context }) => context.userId),
    })

    app.all('/*', async (req, reply) => {
      const result = await handler.handle(req, reply, {
        context: { userId: 'u_123' },
        prefix: '/api/v1',
      })

      if (!result.matched) {
        return reply.status(404).send('not matched')
      }

      return reply
    })

    await app.ready()

    const res = await request(app.server).post('/api/v1/ping').set('content-type', 'application/json').send({ json: null })

    expect(res.status).toBe(200)
    expect(res.text).toContain('u_123')

    const mismatchRes = await request(app.server).post('/invalid/ping').set('content-type', 'application/json').send({ json: null })

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

    app.all('/*', async (req, reply) => {
      await handler.handle(req, reply)
      return reply
    })

    await app.ready()

    const res = await request(app.server).get('/test')

    expect(res.status).toBe(200)
    expect(res.body).toBe('intercepted')
  })

  it('treats GET requests as unmatched by default', async () => {
    const handler = new RPCHandler({
      ping: os.handler(() => 'pong'),
    })

    app.all('/*', async (req, reply) => {
      const result = await handler.handle(req, reply)

      if (!result.matched) {
        return reply.status(404).send('not matched')
      }

      return reply
    })

    await app.ready()

    const res = await request(app.server)
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

    app.all('/*', async (req, reply) => {
      await handler.handle(req, reply)
      return reply
    })

    await app.ready()

    const res = await request(app.server)
      .get(`/ping?data=${encodeURIComponent(JSON.stringify({ json: null }))}`)

    expect(res.status).toBe(200)
    expect(res.text).toContain('pong')
  })
})
