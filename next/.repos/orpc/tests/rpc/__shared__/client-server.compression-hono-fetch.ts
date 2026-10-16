import type { AddressInfo } from 'node:net'
import type { CreateClientServerTest } from './client-server'
import { serve } from '@hono/node-server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { RequestCompressionLinkPlugin } from '@orpc/client/plugins'
import { RPCHandler } from '@orpc/server/fetch'
import { RequestCompressionHandlerPlugin, ResponseCompressionHandlerPlugin } from '@orpc/server/plugins'
import { defaultSerializer } from './client-server'

export const createCompressionHonoFetchClientServerTest: CreateClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const handler = new RPCHandler(router, {
    serializer,
    plugins: [
      new RequestCompressionHandlerPlugin(),
      new ResponseCompressionHandlerPlugin({
        // always compress for testing
        threshold: 0,
      }),
    ],
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
    plugins: [
      new RequestCompressionLinkPlugin({
        // for testing purpose, we set threshold to 0 to ensure compression is always applied
        threshold: 0,
      }),
      // fetch already automatically decompresses response
      // new ResponseCompressionLinkPlugin(),
    ],
  })

  return createORPCClient(link)
}
