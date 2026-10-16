import type { StandardHandlerPlugin } from '@orpc/server/standard'
import type { FastifyInstance } from 'fastify'
import { os } from '@orpc/server'
import Fastify from 'fastify'
import request from 'supertest'
import { openapi } from '../../meta'
import { OpenAPIHandler } from './openapi-handler'

describe('openapiHandler', () => {
  let app: FastifyInstance

  beforeEach(() => {
    vi.clearAllMocks()
    app = Fastify()
  })

  afterEach(async () => {
    await app.close()
  })

  it('accepts context and prefix options in handle method', async () => {
    const handler = new OpenAPIHandler({
      ping: os
        .$context<{ userId: string }>()
        .meta(openapi({ method: 'POST', path: '/ping/pong' }))
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

    const res = await request(app.server).post('/api/v1/ping/pong').set('content-type', 'application/json').send({ json: null })

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

    const handler = new OpenAPIHandler({}, { plugins: [plugin] })

    app.all('/*', async (req, reply) => {
      await handler.handle(req, reply)
      return reply
    })

    await app.ready()

    const res = await request(app.server).get('/test')

    expect(res.status).toBe(200)
    expect(res.body).toBe('intercepted')
  })
})
