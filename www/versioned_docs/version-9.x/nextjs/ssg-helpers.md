---
id: ssg-helpers
title: SSG Helpers
sidebar_label: SSG Helpers
slug: /ssg-helpers
---

`createSSGHelpers` provides you a set of helper functions that you can use to prefetch queries on the server.

```ts
import { createSSGHelpers } from '@trpc/react/ssg';

const {
  prefetchQuery,
  prefetchInfiniteQuery,
  fetchQuery,
  fetchInfiniteQuery,
  dehydrate,
  queryClient,
} = await createSSGHelpers({
  router: appRouter,
  ctx: createContext,
  transformer: superjson, // optional - adds superjson serialization
});
```

The returned functions are all wrappers around react-query functions. Please check out [their docs](https://tanstack.com/query/v3/docs/react/overview) to learn more about them.

## Next.js Example

```ts title='pages/posts/[id].tsx'
import { createSSGHelpers } from '@trpc/react/ssg';
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import { createContext, prisma } from 'server/context';
import { appRouter } from 'server/routers/_app';
import superjson from 'superjson';
import { trpc } from 'utils/trpc';

export async function getServerSideProps(
  context: GetServerSidePropsContext<{ id: string }>,
) {
  const ssg = createSSGHelpers({
    router: appRouter,
    ctx: await createContext(),
    transformer: superjson,
  });
  const id = context.params?.id as string;

  /*
   * Prefetching the `post.byId` query here.
   * `prefetchQuery` does not return the result - if you need that, use `fetchQuery` instead.
   */
  await ssg.prefetchQuery('post.byId', {
    id,
  });

  // Make sure to return { props: { trpcState: ssg.dehydrate() } }
  return {
    props: {
      trpcState: ssg.dehydrate(),
      id,
    },
  };
}

export default function PostViewPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  const { id } = props;

  // This query will be immediately available as it's prefetched.
  const postQuery = trpc.useQuery(['post.byId', { id }]);

  const { data } = postQuery;

  return (
    <>
      <h1>{data.title}</h1>
      <em>Created {data.createdAt.toLocaleDateString()}</em>

      <p>{data.text}</p>

      <h2>Raw data:</h2>
      <pre>{JSON.stringify(data, null, 4)}</pre>
    </>
  );
}
```
