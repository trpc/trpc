import type { AddressInfo } from 'node:net'
import type { CreateOpenAPIClientServerTest } from './client-server'
import { serve } from '@hono/node-server'
import { createORPCClient } from '@orpc/client'
import { OpenAPIHandler, OpenAPILink } from '@orpc/openapi/fetch'
import { defaultSerializer } from './client-server'

export const createHonoFetchClientServerTest: CreateOpenAPIClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const handler = new OpenAPIHandler(router, {
    serializer,
  })

  const server = serve({
    fetch: async (request: Request) => {
      const { response } = await handler.handle(request, {
        context,
        prefix: '/api',
      })

      return response ?? new Response('Not Found', { status: 404 })
    },
    port: 0,
  })

  afterAll(() => {
    server.close()
  })

  const addressInfo = server.address() as AddressInfo

  const link = new OpenAPILink(router as any, {
    url: '/api',
    origin: `http://localhost:${addressInfo.port}`,
    serializer,
    fetch(url, init) {
      return fetch(url, init)
    },
  })

  return createORPCClient(link)
}
