import type { AddressInfo } from 'node:net'
import type { CreateBatchClientServerTest } from './client-server'
import { serve } from '@hono/node-server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { BatchLinkPlugin } from '@orpc/client/plugins'
import { BatchResponseCompressionHandlerPlugin } from '@orpc/node'
import { RPCHandler } from '@orpc/server/fetch'
import { BatchHandlerPlugin } from '@orpc/server/plugins'
import { defaultBatchClientServerOptions, defaultBatchGroup } from './client-server'

/**
 * Compressed batches over the fetch adapter, which the plugin serves as readily as the node one
 * because it only needs the runtime to be Node.js.
 */
export const createCompressionHonoFetchBatchClientServerTest: CreateBatchClientServerTest = (
  router,
  {
    context = defaultBatchClientServerOptions.context,
    method = 'GET',
    mode = defaultBatchClientServerOptions.mode,
    serializer = defaultBatchClientServerOptions.serializer,
  } = {},
) => {
  const handler = new RPCHandler(router, {
    serializer,
    allowMethods: ['GET', 'POST', 'QUERY'],
    plugins: [
      new BatchHandlerPlugin(),
      new BatchResponseCompressionHandlerPlugin({
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

  const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
    const response = await fetch(url, init)

    if (response.status === 207) { // every batch response, framed or json, travels compressed here
      expect(response.headers.get('content-encoding')).toBe('gzip')
    }

    return response
  })

  const link = new RPCLink({
    url: '/rpc',
    method, // hono-fetch uses GET by default while node-http uses POST for better coverage
    origin: `http://localhost:${addressInfo.port}`,
    serializer,
    fetch: fetchSpy,
    plugins: [
      new BatchLinkPlugin({ groups: [defaultBatchGroup], mode }),
      // fetch already automatically decompresses response
      // new ResponseCompressionLinkPlugin(),
    ],
  })

  return {
    client: createORPCClient(link),
    fetchSpy,
  }
}
