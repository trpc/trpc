import type { StandardLinkPlugin } from '@orpc/client/standard'
import { createORPCClient } from '@orpc/client'
import { os } from '@orpc/server'
import { openapi } from '../../meta'
import { OpenAPIHandler } from './openapi-handler'
import { OpenAPILink } from './openapi-link'

describe('openapiLink', () => {
  const date = new Date('2024-01-02T03:04:05.000Z')
  const blob = new Blob(['hello'], { type: 'text/plain' })

  const router = {
    get: os
      .meta(openapi({ method: 'GET', path: '/ping/{pong}' }))
      .handler(({ input }) => input),
    post: os.handler(({ input }) => input),
    query: os
      .meta(openapi({ method: 'QUERY', path: '/query' }))
      .handler(({ input }) => input),
  }

  const handler = new OpenAPIHandler(router)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls a GET OpenAPI endpoint through fetch transport', async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const request = new Request(url, init)
      const { matched, response } = await handler.handle(request, {
        prefix: '/api',
      })

      if (!matched || !response) {
        throw new Error('No procedure match')
      }

      return response
    })

    const client = createORPCClient(new OpenAPILink(router, {
      fetch,
      origin: 'http://localhost:3000',
      url: '/api',
    })) as any

    await expect(client.get({
      pong: 'pong',
      a: 1,
      nested: {
        date,
        arr: [3, date],
      },
    })).resolves.toEqual({
      pong: 'pong',
      a: '1',
      nested: {
        date: date.toISOString(),
        arr: ['3', date.toISOString()],
      },
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:3000/api/ping/pong'),
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
      }),
      expect.objectContaining({ context: {} }),
      ['get'],
    )
  })

  it('calls a POST OpenAPI endpoint with JSON payloads', async () => {
    const client = createORPCClient(new OpenAPILink(router, {
      origin: 'http://localhost:3000',
      url: '/api',
      fetch: async (url, init) => {
        const request = new Request(url, init)
        const { matched, response } = await handler.handle(request, {
          prefix: '/api',
        })

        if (!matched || !response) {
          throw new Error('No procedure match')
        }

        return response
      },
    })) as any

    await expect(client.post({
      a: 1,
      b: 2,
      nested: {
        date,
        arr: [3, date],
      },
    })).resolves.toEqual({
      a: 1,
      b: 2,
      nested: {
        date: date.toISOString(),
        arr: [3, date.toISOString()],
      },
    })
  })

  it('calls a QUERY OpenAPI endpoint with body-encoded input', async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const request = new Request(url, init)

      await expect(request.clone().json()).resolves.toEqual({ search: 'earth' })

      const { matched, response } = await handler.handle(request, {
        prefix: '/api',
      })

      if (!matched || !response) {
        throw new Error('No procedure match')
      }

      return response
    })

    const client = createORPCClient(new OpenAPILink(router, {
      fetch,
      origin: 'http://localhost:3000',
      url: '/api',
    })) as any

    await expect(client.query({ search: 'earth' })).resolves.toEqual({ search: 'earth' })

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/query',
      expect.objectContaining({ method: 'QUERY' }),
      expect.objectContaining({ context: {} }),
      ['query'],
    )
  })

  it('calls a POST OpenAPI endpoint with multipart payloads', async () => {
    const client = createORPCClient(new OpenAPILink(router, {
      origin: 'http://localhost:3000',
      url: '/api',
      fetch: async (url, init) => {
        const request = new Request(url, init)
        const { matched, response } = await handler.handle(request, {
          prefix: '/api',
        })

        if (!matched || !response) {
          throw new Error('No procedure match')
        }

        return response
      },
    })) as any

    await expect(client.post({
      a: 1,
      nested: {
        date,
        arr: [3, date],
      },
      blob,
    })).resolves.toEqual({
      a: '1',
      nested: {
        date: date.toISOString(),
        arr: ['3', date.toISOString()],
      },
      blob: expect.any(File),
    })
  })

  it('supports standard link plugins', async () => {
    const plugin: StandardLinkPlugin<any> = {
      name: 'test',
      init() {
        return {
          transportInterceptors: [
            async () => ({
              status: 200,
              headers: {},
              resolveBody: async () => 'intercepted',
            }),
          ],
        }
      },
    }

    const client = createORPCClient(new OpenAPILink(router, {
      plugins: [plugin],
    })) as any

    await expect(client.post('ignored')).resolves.toBe('intercepted')
  })
})
