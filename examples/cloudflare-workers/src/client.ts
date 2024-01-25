import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import type { AppRouter } from './router';

const sleep = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const url = 'http://127.0.0.1:8787/trpc';

  const proxy = createTRPCClient<AppRouter>({
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

main().catch(console.error);
