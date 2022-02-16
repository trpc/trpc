import { createTRPCClient, HTTPHeaders } from '@trpc/client';
import { createWSClient, wsLink } from '@trpc/client/links/wsLink';
import { splitLink } from '@trpc/client/links/splitLink';
import { httpLink } from '@trpc/client/links/httpLink';

import './polyfill';

import type { AppRouter } from '../server/router';

export interface ClientOptions {
  port?: number;
  prefix?: string;
  headers?: HTTPHeaders;
}

export function createClient(opts: ClientOptions = {}) {
  const port = opts.port ?? 3000;
  const prefix = opts.prefix ?? '/trpc';
  const host = `127.0.0.1:${port}${prefix}`;
  const wsClient = createWSClient({ url: `ws://${host}` });
  const client = createTRPCClient<AppRouter>({
    headers: opts.headers,
    links: [
      splitLink({
        condition(op) {
          return op.type === 'subscription';
        },
        true: wsLink({ client: wsClient }),
        false: httpLink({ url: `http://${host}` }),
      }),
    ],
  });

  return { client, wsClient };
}
