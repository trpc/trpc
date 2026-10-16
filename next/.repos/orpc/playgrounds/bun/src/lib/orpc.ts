import type { router } from '../routers'
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'
import { createRouterUtils } from '@orpc/tanstack-query'
import type { RetryLinkPluginContext } from '@orpc/client/plugins'
import { RetryLinkPlugin } from '@orpc/client/plugins'

export interface ClientContext extends RetryLinkPluginContext {}

const link = new RPCLink({
  connect: info => new WebSocket(`${location.origin}/ws/rpc`),
  plugins: [
    new RetryLinkPlugin(),
  ],
})

export const client: RouterClient<typeof router, ClientContext> = createORPCClient(link)

export const orpc = createRouterUtils(client)
