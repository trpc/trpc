import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import type { AppRouter } from './router.ts';

async function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const url = 'http://127.0.0.1:3000/trpc';

  const proxy = createTRPCClient<AppRouter>({
    links: [loggerLink(), httpBatchLink({ url })],
  });

  await delay(100);

  // parallel queries
  await Promise.all([proxy.hello.query(), proxy.hello.query('client')]);
  await delay(100);

  const postCreate = await proxy.post.createPost.mutate({
    title: 'hello client',
  });
  console.log('created post', postCreate.title);
  await delay(100);

  const postList = await proxy.post.listPosts.query();
  console.log('has posts', postList, 'first:', postList[0].title);
  await delay(100);

  console.log('👌 should be a clean exit if everything is working right');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
