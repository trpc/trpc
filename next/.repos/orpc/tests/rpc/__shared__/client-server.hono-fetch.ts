import type { AddressInfo } from 'node:net'
import type { CreateClientServerTest } from './client-server'
import { serve } from '@hono/node-server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { RPCHandler } from '@orpc/server/fetch'
import { defaultSerializer } from './client-server'

export const createHonoFetchClientServerTest: CreateClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const handler = new RPCHandler(router, {
    serializer,
  })

  const server = serve({
    fetch: async (request: Request) => {
      const { response } = await handler.handle(request, {
        context,
        prefix: '/rpc',
      })

      return response ?? new Response('Not Found', { status: 404 })
    },
    port: 0,
  })

  afterAll(() => {
    server.close()
  })

  const addressInfo = server.address() as AddressInfo

  const link = new RPCLink({
    url: '/rpc',
    origin: `http://localhost:${addressInfo.port}`,
    serializer,
    fetch(url, init) {
      return fetch(url, init)
    },
  })

  return createORPCClient(link)
}
