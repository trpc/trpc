import { createTrpcQueryUtils } from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';

import type { AppRouter } from './server.ts';

// #region client
/**
 * A browser's client, signed in as `user`. `fetch` is the kitchen sink's
 * network, which sends each request to `server.ts`'s handler in this page;
 * an app leaves it out.
 */
export function createTrpc(opts: {
  readonly fetch: typeof globalThis.fetch;
  readonly user: string;
}) {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      // Subscriptions go over SSE. A dropped one reconnects with the last
      // event's id, here after 3 seconds each time, long enough to send a
      // message it missed.
      httpLink({
        url: '/trpc',
        fetch: opts.fetch,
        headers: { authorization: `Bearer ${opts.user}` },
        reconnect: { delay: () => '3 seconds' },
      }),
    ],
  });
  return { client, trpc: createTrpcQueryUtils({ client }) };
}
// #endregion client
