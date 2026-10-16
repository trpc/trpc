import type { CreateClientServerTest } from './client-server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import { RequestCompressionLinkPlugin, ResponseCompressionLinkPlugin } from '@orpc/client/plugins'
import { RPCHandler } from '@orpc/server/message-port'
import { RequestCompressionHandlerPlugin, ResponseCompressionHandlerPlugin } from '@orpc/server/plugins'
import { defaultSerializer } from './client-server'

export const createCompressionMessagePortTransferClientServerTest: CreateClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const { port1, port2 } = new MessageChannel()

  const handler = new RPCHandler(router, {
    encodePeerMessage: { prefix: '__PREFIX__' },
    decodePeerMessage: { prefix: '__PREFIX__' },
    serializer,
    plugins: [
      new RequestCompressionHandlerPlugin(),
      new ResponseCompressionHandlerPlugin({
        // always compress for testing
        threshold: 0,
      }),
    ],
  })

  handler.upgrade(port2, { context, prefix: '/rpc' })

  const link = new RPCLink({
    port: port1,
    url: '/rpc',
    encodePeerMessage: { prefix: '__PREFIX__' },
    decodePeerMessage: { prefix: '__PREFIX__' },
    serializer,
    experimental_transfer: [],
    plugins: [
      new RequestCompressionLinkPlugin({
        // for testing purpose, we set threshold to 0 to ensure compression is always applied
        threshold: 0,
      }),
      new ResponseCompressionLinkPlugin({
        encodings: ['deflate'],
      }),
    ],
  })

  port1.start()
  port2.start()

  return createORPCClient(link)
}
