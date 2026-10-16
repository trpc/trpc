import type { AddressInfo } from 'node:net'
import type { CreateClientServerTest } from './client-server'
import { createServer } from 'node:http'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'
import { experimental_RPCHandler as RPCHandler } from '@orpc/server/crossws'
import crossws from 'crossws/adapters/node'
import { WebSocket as FallbackWebSocket } from 'ws'
import { defaultSerializer } from './client-server'

export const createCrosswsClientServerTest: CreateClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const handler = new RPCHandler(router, {
    serializer,
    encodePeerMessage: { prefix: '__PREFIX__' },
    decodePeerMessage: { prefix: '__PREFIX__' },
  })

  const ws = crossws({
    hooks: {
      message: async (peer, message) => {
        await handler.message(peer, message, {
          context,
          prefix: '/rpc',
        })
      },
      close: async (peer) => {
        await handler.close(peer)
      },
    },
  })

  const server = createServer((req, res) => {
    res.statusCode = 404
    res.end('Not Found')
  }).listen(0)

  server.on('upgrade', (req, socket, head) => {
    if (req.headers.upgrade === 'websocket') {
      ws.handleUpgrade(req, socket, head)
    }
  })

  afterAll(() => {
    server.close()
  })

  const addressInfo = server.address() as AddressInfo

  const link = new RPCLink({
    url: '/rpc',
    connect: () => new (typeof WebSocket !== 'undefined' ? WebSocket : FallbackWebSocket)(`ws://localhost:${addressInfo.port}`),
    serializer,
    encodePeerMessage: { prefix: '__PREFIX__' },
    decodePeerMessage: { prefix: '__PREFIX__' },
  })

  return createORPCClient(link)
}
