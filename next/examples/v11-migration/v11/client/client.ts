import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import { EventSource } from 'eventsource';
import superjson from 'superjson';
import type { AppRouter } from '../server/router.ts';
import { callLogLink, type CallLog } from './links.ts';

export function makeClient(opts: {
  url: string;
  token: string | null;
  log: CallLog[];
}) {
  return createTRPCClient<AppRouter>({
    links: [
      callLogLink(opts.log),
      splitLink({
        condition: (op) => op.type === 'subscription',
        // Node has no global EventSource without --experimental-eventsource.
        true: httpSubscriptionLink({
          url: opts.url,
          transformer: superjson,
          EventSource,
        }),
        false: httpBatchLink({
          url: opts.url,
          transformer: superjson,
          headers: () => (opts.token ? { authorization: opts.token } : {}),
        }),
      }),
    ],
  });
}

/** The realtime screen talks over a WebSocket. */
export function makeWsClient(opts: { url: string; token: string | null }) {
  const wsClient = createWSClient({
    url: opts.url,
    connectionParams: () => (opts.token ? { token: opts.token } : null),
  });
  const client = createTRPCClient<AppRouter>({
    links: [wsLink({ client: wsClient, transformer: superjson })],
  });
  return { client, close: () => wsClient.close() };
}
