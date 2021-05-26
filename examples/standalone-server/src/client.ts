/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTRPCClient } from '@trpc/client';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import type { AppRouter } from './server';

// polyfill fetch
global.AbortController = AbortController;
global.fetch = fetch as any;

async function main() {
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

main();
