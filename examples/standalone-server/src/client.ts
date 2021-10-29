/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTRPCClient } from '@trpc/client';
import { httpLink } from '@trpc/client/links/httpLink';
import { splitLink } from '@trpc/client/links/splitLink';
import { createWSClient, wsLink } from '@trpc/client/links/wsLink';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import ws from 'ws';
import { createSafeClient } from './client/utils';
import type { AppRouter } from './server';

// polyfill fetch & websocket
const globalAny = global as any;
globalAny.AbortController = AbortController;
globalAny.fetch = fetch;
globalAny.WebSocket = ws;

async function main() {
  // http calls
  const wsClient = createWSClient({
    url: `ws://localhost:2022`,
  });
  const client = createTRPCClient<AppRouter>({
    links: [
      // call subscriptions through websockets and the rest over http
      splitLink({
        condition(op) {
          return op.type === 'subscription';
        },
        true: wsLink({
          client: wsClient,
        }),
        false: httpLink({
          url: `http://localhost:2022`,
        }),
      }),
    ],
  });

  const safeClient = createSafeClient(client);

  const helloResponse = await safeClient.query('hello', { name: 'world' });
  const helloResponseInvalid = await safeClient.query('hello', {
    name: 123 as any,
  });

  console.log('helloResponse', helloResponse);
  console.log('helloResponseInvalid', helloResponseInvalid);

  const createPostRes = await client.mutation('createPost', {
    title: 'hello world',
    text: 'check out tRPC.io',
  });
  console.log('createPostResponse', createPostRes);

  let count = 0;
  const unsub = client.subscription('randomNumber', null, {
    onNext(data) {
      // ^ note that `data` here is inferred
      console.log('received', data);
      count++;
      if (count > 3) {
        // stop after 3 pulls
        unsub();
      }
    },
    onError(err) {
      console.error('error', err);
    },
    onDone() {
      console.log('done called - closing websocket');
      wsClient.close();
    },
  });
}

main();
