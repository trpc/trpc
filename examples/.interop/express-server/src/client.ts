import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import { tap } from '@trpc/server/observable';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import type { AppRouter } from './server';

// polyfill
const globalAny = global as any;
globalAny.AbortController = AbortController;
globalAny.fetch = fetch as any;

const sleep = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const url = `http://localhost:2021/trpc`;

  const client = createTRPCClient<AppRouter>({
    links: [
      () =>
        ({ op, next }) => {
          console.log('->', op.type, op.path, op.input);

          return next(op).pipe(
            tap({
              next(result) {
                console.log('<-', op.type, op.path, op.input, ':', result);
              },
            }),
          );
        },
      httpBatchLink({ url }),
    ],
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
  try {
    await client.query('admin.secret');
  } catch (cause) {
    // will fail
  }
  await sleep();
  const authedClient = createTRPCClient<AppRouter>({
    links: [
      loggerLink(),
      httpBatchLink({
        url,
        headers: () => ({
          authorization: 'secret',
        }),
      }),
    ],
  });

  await authedClient.query('admin.secret');

  const msgs = await client.query('messages.list');
  console.log('msgs', msgs);

  console.log('👌 should be a clean exit if everything is working right');
}

main();
