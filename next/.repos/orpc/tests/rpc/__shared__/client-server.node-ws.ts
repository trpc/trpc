import type { AddressInfo } from 'node:net'
import type { CreateClientServerTest } from './client-server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'
import { RPCHandler } from '@orpc/server/websocket'
import WebSocket, { WebSocketServer } from 'ws'
import { defaultSerializer } from './client-server'

export const createNodeWsClientServerTest: CreateClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const handler = new RPCHandler(router, {
    serializer,
    encodePeerMessage: { prefix: '__PREFIX__' },
    decodePeerMessage: { prefix: '__PREFIX__' },
  })

  const wss = new WebSocketServer({ port: 0 })

  wss.on('connection', (ws) => {
    handler.upgrade(ws, {
      context,
      prefix: '/rpc',
    })
  })

  afterAll(() => {
    wss.close()
  })

  const addressInfo = wss.address() as AddressInfo

  const link = new RPCLink({
    url: '/rpc',
    connect: () => new WebSocket(`ws://localhost:${addressInfo.port}`),
    serializer,
    encodePeerMessage: { prefix: '__PREFIX__' },
    decodePeerMessage: { prefix: '__PREFIX__' },
  })

  return createORPCClient(link)
}
