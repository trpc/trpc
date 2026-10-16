import type { AddressInfo } from 'node:net'
import type { CreateBatchClientServerTest } from './client-server'
import * as http from 'node:http'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { BatchLinkPlugin } from '@orpc/client/plugins'
import { RPCHandler } from '@orpc/server/node'
import { BatchHandlerPlugin } from '@orpc/server/plugins'
import { defaultBatchClientServerOptions, defaultBatchGroup } from './client-server'

export const createNodeHttpBatchClientServerTest: CreateBatchClientServerTest = (
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
    plugins: [new BatchHandlerPlugin()],
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
  const fetchSpy = vi.fn((url: string, init: RequestInit) => fetch(url, init))

  const link = new RPCLink({
    url: '/rpc',
    origin: `http://localhost:${addressInfo.port}`,
    method,
    serializer,
    fetch: fetchSpy,
    plugins: [new BatchLinkPlugin({ groups: [defaultBatchGroup], mode })],
  })

  return {
    client: createORPCClient(link),
    fetchSpy,
  }
}
