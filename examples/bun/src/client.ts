import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  loggerLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from './router.ts';

async function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const url = 'http://127.0.0.1:3000/trpc';

  const proxy = createTRPCClient<AppRouter>({
    links: [
      loggerLink(),
      splitLink({
        condition: (op) => isNonJsonSerializable(op.input),
        true: httpLink({
          url,
        }),
        false: httpBatchLink({
          url,
        }),
      }),
    ],
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

  const form = new FormData();
  form.append('foo', 'bar');
  const postFormData = await proxy.formData.mutate(form);
  console.log('formData reponse', postFormData);

  console.log('👌 should be a clean exit if everything is working right');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
