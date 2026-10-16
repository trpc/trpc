import type { AddressInfo } from 'node:net'
import type { CreateBatchClientServerTest } from './client-server'
import * as http from 'node:http'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { BatchLinkPlugin } from '@orpc/client/plugins'
import { BatchResponseCompressionHandlerPlugin } from '@orpc/node'
import { RPCHandler } from '@orpc/server/node'
import { BatchHandlerPlugin } from '@orpc/server/plugins'
import { defaultBatchClientServerOptions, defaultBatchGroup } from './client-server'

/**
 * The same suite as the plain node-http one, with batch responses compressed on the wire.
 * Its streaming test is what proves the compressor flushes: a buffering one would hold every
 * subresponse until the slowest of them resolved, which that test only allows after reading.
 */
export const createCompressionNodeHttpBatchClientServerTest: CreateBatchClientServerTest = (
  router,
  {
    context = defaultBatchClientServerOptions.context,
    method = 'POST',
    mode = defaultBatchClientServerOptions.mode,
    serializer = defaultBatchClientServerOptions.serializer,
  } = {},
) => {
  const handler = new RPCHandler(router, {
    serializer,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'QUERY'],
    plugins: [
      new BatchHandlerPlugin(),
      // always compress for testing
      new BatchResponseCompressionHandlerPlugin({ threshold: 0 }),
    ],
  })

  const server = http.createServer(async (req, res) => {
    await handler.handle(req, res, {
      context,
      prefix: '/rpc',
    })
  })

  server.listen(0)

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
    origin: `http://localhost:${addressInfo.port}`,
    method,
    serializer,
    fetch: fetchSpy,
    // fetch already automatically decompresses the response
    plugins: [new BatchLinkPlugin({ groups: [defaultBatchGroup], mode })],
  })

  return {
    client: createORPCClient(link),
    fetchSpy,
  }
}
