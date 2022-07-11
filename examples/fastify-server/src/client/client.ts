import {
  HTTPHeaders,
  createTRPCClient,
  createTRPCClientProxy,
  createWSClient,
  httpLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../server/router';
import './polyfill';

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
    transformer: superjson,
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

  const proxy = createTRPCClientProxy(client);

  return { client, wsClient, proxy };
}
