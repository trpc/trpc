import type { router } from '../../worker/routers'
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createRouterUtils } from '@orpc/tanstack-query'
import type { RetryLinkPluginContext } from '@orpc/client/plugins'
import { BatchLinkPlugin, RetryLinkPlugin } from '@orpc/client/plugins'

export interface ClientContext extends RetryLinkPluginContext {}

const link = new RPCLink({
  origin: typeof window !== 'undefined' ? undefined : 'http://localhost:3000',
  url: '/rpc',
  plugins: [
    new BatchLinkPlugin({
      groups: [{
        condition: () => true,
        context: {},
      }],
    }),
    new RetryLinkPlugin(),
  ],
})

export const client: RouterClient<typeof router, ClientContext> = createORPCClient(link)

export const orpc = createRouterUtils(client)
