// `pnpm bench bundle`'s oRPC client.
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

export const client = createORPCClient(new RPCLink({ url: '/rpc' }));
