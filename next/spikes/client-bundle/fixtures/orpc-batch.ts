// oRPC with its opt-in batching and retry plugins.
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { BatchLinkPlugin, RetryLinkPlugin } from '@orpc/client/plugins';

export const client = createORPCClient(
  new RPCLink({
    url: '/rpc',
    plugins: [
      new BatchLinkPlugin({ groups: [{ condition: () => true, context: {} }] }),
      new RetryLinkPlugin(),
    ],
  }),
);
