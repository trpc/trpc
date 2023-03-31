---
id: ssg-helpers
title: SSG Helpers
sidebar_label: SSG Helpers
slug: /nextjs/ssg-helpers
---

`createProxySSGHelpers` provides you with a set of helper functions that you can use to prefetch queries on the server.

Using the helpers makes tRPC call your procedures directly on the server, without an HTTP request, similar to [server-side calls](/docs/server/server-side-calls).
That also means that you don't have the request and response at hand like you usually do. Make sure you're instantiating the SSG helpers with a context without `req` & `res`, which are typically filled via the context creation. We recommend the concept of ["inner" and "outer" context](/docs/server/context) in that scenario.

```ts
import { createProxySSGHelpers } from '@trpc/react-query/ssg';
import { createContext } from 'server/context';

const ssg = createProxySSGHelpers({
  router: appRouter,
  ctx: await createContext(),
  transformer: superjson, // optional - adds superjson serialization
});
```

:::info
For a full example, see our [E2E SSG test example](https://github.com/trpc/trpc/tree/main/examples/.test/ssg)
:::

The returned functions are all wrappers around react-query functions. Please check out [their docs](https://react-query.tanstack.com/overview) to learn more about them.

## Next.js Example

```ts title='pages/posts/[id].tsx'
import { createProxySSGHelpers } from '@trpc/react-query/ssg';
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import { createContext } from 'server/context';
import { appRouter } from 'server/routers/_app';
import superjson from 'superjson';
import { trpc } from 'utils/trpc';

export async function getServerSideProps(
  context: GetServerSidePropsContext<{ id: string }>,
) {
  const ssg = createProxySSGHelpers({
    router: appRouter,
    ctx: await createContext(),
    transformer: superjson,
  });
  const id = context.params?.id as string;

  /*
   * Prefetching the `post.byId` query here.
   * `prefetch` does not return the result and never throws - if you need that behavior, use `fetch` instead.
   */
  await ssg.post.byId.prefetch({ id });

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
  const postQuery = trpc.post.byId.useQuery({ id });

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
