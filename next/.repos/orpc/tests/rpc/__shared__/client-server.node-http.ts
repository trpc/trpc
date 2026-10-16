import type { AddressInfo } from 'node:net'
import type { CreateClientServerTest } from './client-server'
import * as http from 'node:http'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { RPCHandler } from '@orpc/server/node'
import { defaultSerializer } from './client-server'

export const createNodeHttpClientServerTest: CreateClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const handler = new RPCHandler(router, {
    serializer,
    allowMethods: ['GET', 'POST'], // the client below sends GET requests (POST as fallback)
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

  const link = new RPCLink({
    url: '/rpc',
    method: 'GET', // node-http use GET while hono-fetch use POST for better coverage
    origin: `http://localhost:${addressInfo.port}`,
    serializer,
    fetch(url, init) {
      return fetch(url, init)
    },
  })

  return createORPCClient(link)
}
