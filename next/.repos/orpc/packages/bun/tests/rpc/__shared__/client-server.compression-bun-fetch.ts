import type { CreateClientServerTest } from './client-server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { RequestCompressionLinkPlugin } from '@orpc/client/plugins'
import { RPCHandler } from '@orpc/server/fetch'
import { RequestCompressionHandlerPlugin, ResponseCompressionHandlerPlugin } from '@orpc/server/plugins'
import { afterAll } from 'bun:test'
import { defaultSerializer } from './client-server'

export const createCompressionBunFetchClientServerTest: CreateClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const handler = new RPCHandler(router, {
    serializer,
    plugins: [
      new RequestCompressionHandlerPlugin(),
      new ResponseCompressionHandlerPlugin({
        // always compress responses for testing
        threshold: 0,
      }),
    ],
  })

  const server = Bun.serve({
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
    server.stop()
  })

  const link = new RPCLink({
    url: '/rpc',
    origin: `http://localhost:${server.port}`,
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
