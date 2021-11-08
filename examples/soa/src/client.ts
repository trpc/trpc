/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTRPCClient } from '@trpc/client';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import ws from 'ws';
import type { CombinedServer } from './server-_combined';

// polyfill fetch & websocket
const globalAny = global as any;
globalAny.AbortController = AbortController;
globalAny.fetch = fetch;
globalAny.WebSocket = ws;

async function main() {
  const client = createTRPCClient<CombinedServer>({
    links: [
      (runtime) => {
        const servers = {
          server1: httpBatchLink({ url: 'http://localhost:2031' })(runtime),
          server2: httpBatchLink({ url: 'http://localhost:2032' })(runtime),
        };
        return (ctx) => {
          const { op } = ctx;
          const parts = op.path.split('.');
          // first part of the query should be `server1` or `server2`
          const serverName = parts.shift() as string as keyof typeof servers;

          const path = parts.join('.');
          console.log(`calling ${serverName} on path ${path}`);
          const link = servers[serverName];

          link({
            ...ctx,
            op: {
              ...op,
              path,
            },
          });
        };
      },
    ],
  });

  const server1Response = await client.query('server1.hello');
  const server2Response = await client.query('server2.hello');

  console.log({ server1Response, server2Response });
}

main();
