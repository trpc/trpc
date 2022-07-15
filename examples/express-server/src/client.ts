import {
  createTRPCClient,
  createTRPCClientProxy,
  httpBatchLink,
  loggerLink,
} from '@trpc/client';
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

  const proxy = createTRPCClientProxy(client);

  await sleep();

  // parallel queries
  await Promise.all([
    //
    proxy.hello.query(),
    proxy.hello.query('client'),
  ]);

  const postCreate = await proxy.post.createPost.mutate({
    title: 'hello client',
  });
  console.log('created post', postCreate.title);
  await sleep();

  const postList = await proxy.post.listPosts.query();
  console.log('has posts', postList, 'first:', postList[0].title);
  await sleep();

  try {
    await proxy.admin.secret.query();
  } catch (cause) {
    // will fail
  }
  await sleep();

  const authedClient = createTRPCClient<AppRouter>({
    links: [loggerLink(), httpBatchLink({ url })],
    headers: () => ({
      authorization: 'secret',
    }),
  });
  const authedClientProxy = createTRPCClientProxy(authedClient);

  await authedClientProxy.admin.secret.query();

  const msgs = await proxy.message.listMessages.query();
  console.log('msgs', msgs);

  console.log('👌 should be a clean exit if everything is working right');
}

main();
