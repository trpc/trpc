import type { CreateClientServerTest } from './client-server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'
import { RPCHandler } from '@orpc/server/websocket'
import { afterAll } from 'bun:test'
import { defaultSerializer } from './client-server'

export const createBunWebSocketClientServerTest: CreateClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const handler = new RPCHandler(router, {
    serializer,
    encodePeerMessage: { prefix: '__PREFIX__' },
    decodePeerMessage: { prefix: '__PREFIX__' },
  })

  const server = Bun.serve({
    fetch(req, server) {
      if (server.upgrade(req)) {
        return
      }
      return new Response('Upgrade failed', { status: 500 })
    },
    websocket: {
      async message(ws, message) {
        await handler.message(ws, message, {
          context,
          prefix: '/rpc',
        })
      },
      async close(ws) {
        await handler.close(ws)
      },
    },
    port: 0,
  })

  afterAll(() => {
    server.stop(true)
  })

  const link = new RPCLink({
    url: '/rpc',
    connect: () => new WebSocket(`ws://localhost:${server.port}`),
    serializer,
    encodePeerMessage: { prefix: '__PREFIX__' },
    decodePeerMessage: { prefix: '__PREFIX__' },
  })

  return createORPCClient(link)
}
