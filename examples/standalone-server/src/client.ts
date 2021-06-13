/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTRPCClient } from '@trpc/client';
import AbortController from 'abort-controller';
import { wsLink, createWSClient } from '@trpc/client/links/wsLink';
import fetch from 'node-fetch';
import type { AppRouter } from './server';
import ws from 'ws';

// polyfill fetch & websocket
global.AbortController = AbortController;
global.fetch = fetch as any;
global.WebSocket = ws as any;

async function main() {
  {
    // http calls
    const client = createTRPCClient<AppRouter>({
      url: `http://localhost:2022`,
    });

    const helloResponse = await client.query('hello', {
      name: 'world',
    });

    console.log('helloResponse', helloResponse);

    const createPostRes = await client.mutation('createPost', {
      title: 'hello world',
      text: 'check out tRPC.io',
    });
    console.log('createPostResponse', createPostRes);
  }
  {
    // websocket calls
    const wsClient = createWSClient({ url: `http://localhost:2023` });
    const client = createTRPCClient<AppRouter>({
      links: [wsLink({ client: wsClient })],
    });

    const helloResponse = await client.query('hello', {
      name: 'world',
    });

    console.log('helloResponse', helloResponse);

    const createPostRes = await client.mutation('createPost', {
      title: 'hello world',
      text: 'check out tRPC.io',
    });
    console.log('createPostResponse', createPostRes);
    wsClient.close();
  }
}

main();
