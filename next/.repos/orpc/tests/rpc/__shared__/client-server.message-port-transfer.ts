import type { CreateClientServerTest } from './client-server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import { RPCHandler } from '@orpc/server/message-port'
import { defaultSerializer } from './client-server'

export const createMessagePortTransferClientServerTest: CreateClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const { port1, port2 } = new MessageChannel()

  const handler = new RPCHandler(router, {
    encodePeerMessage: { prefix: '__PREFIX__' },
    decodePeerMessage: { prefix: '__PREFIX__' },
    serializer,
  })

  handler.upgrade(port2, { context, prefix: '/rpc' })

  const link = new RPCLink({
    port: port1,
    url: '/rpc',
    encodePeerMessage: { prefix: '__PREFIX__' },
    decodePeerMessage: { prefix: '__PREFIX__' },
    serializer,
    experimental_transfer: [],
  })

  port1.start()
  port2.start()

  return createORPCClient(link)
}
