import {
  HTTPHeaders,
  createTRPCClient,
  createWSClient,
  httpLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import type { AppRouter } from '../server/router';
import './polyfill';

export interface ClientOptions {
  port?: number;
  prefix?: string;
  headers?: HTTPHeaders;
}

export function createClient(
  opts: ClientOptions & {
    headers?: HTTPHeaders;
  } = {},
) {
  const port = opts.port ?? 3000;
  const prefix = opts.prefix ?? '/trpc';
  const host = `127.0.0.1:${port}${prefix}`;
  const wsClient = createWSClient({ url: `ws://${host}` });
  const client = createTRPCClient<AppRouter>({
    links: [
      splitLink({
        condition(op) {
          return op.type === 'subscription';
        },
        true: wsLink({ client: wsClient }),
        false: httpLink({ url: `http://${host}`, headers: opts.headers }),
      }),
    ],
  });

  return { client, wsClient };
}
