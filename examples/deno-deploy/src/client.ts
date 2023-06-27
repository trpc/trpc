import { createTRPCProxyClient, httpBatchLink, loggerLink } from '@trpc/client';
import { delay } from 'std/async/delay.ts';
import type { AppRouter } from './router.ts';

const sleep = (ms = 100) => delay(ms);

async function main() {
  const url = 'http://127.0.0.1:8000/trpc';

  const proxy = createTRPCProxyClient<AppRouter>({
    links: [loggerLink(), httpBatchLink({ url })],
  });

  await sleep();

  // parallel queries
  await Promise.all([
    //
    proxy.hello.query(),
    proxy.hello.query('client'),
  ]);
  await sleep();

  const postCreate = await proxy.post.createPost.mutate({
    title: 'hello client',
  });
  console.log('created post', postCreate.title);
  await sleep();

  const postList = await proxy.post.listPosts.query();
  console.log('has posts', postList, 'first:', postList[0].title);
  await sleep();

  console.log('👌 should be a clean exit if everything is working right');
}

main();
