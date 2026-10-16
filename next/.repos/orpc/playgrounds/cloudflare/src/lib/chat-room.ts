import type { RouterClient } from '@orpc/server'
import type { chatRoomRouter } from '../../worker/dos/chat-room'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'

const link = new RPCLink({
  connect: () => new WebSocket(
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/chat-room`,
  ),
  reconnect: {
    enabled: true,
  },
})

export const chatRoomClient: RouterClient<typeof chatRoomRouter> = createORPCClient(link)
