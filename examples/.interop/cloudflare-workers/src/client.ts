import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from './router';

// polyfill
global.fetch = fetch as any;

const sleep = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const url = 'http://127.0.0.1:8787';

  const client = createTRPCClient<AppRouter>({
    links: [loggerLink(), httpBatchLink({ url })],
  });
  await sleep();

  // parallel queries
  await Promise.all([
    //
    client.query('hello'),
    client.query('hello', 'client'),
  ]);
  await sleep();

  const postCreate = await client.mutation('post.create', {
    title: 'hello client',
  });
  console.log('created post', postCreate.title);
  await sleep();

  const postList = await client.query('post.list');
  console.log('has posts', postList, 'first:', postList[0].title);
  await sleep();

  console.log('👌 should be a clean exit if everything is working right');
}

main();
