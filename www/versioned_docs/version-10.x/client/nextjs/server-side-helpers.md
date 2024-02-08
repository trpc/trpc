---
id: server-side-helpers
title: Server-Side Helpers
sidebar_label: Server-Side Helpers
slug: /client/nextjs/server-side-helpers
---

The server-side helpers provides you with a set of helper functions that you can use to prefetch queries on the server. This is useful for SSG, but also for SSR if you opt not to use `ssr: true`.

Prefetching via the server-side helpers allows populating the query cache on the server, which means that these queries do not have to fetch on the client initially.

## There are 2 ways to use the server-side helpers.

### 1. Internal router

This method is used when you have direct access to your tRPC router. e.g. when developing a monolithic Next.js application.

Using the helpers makes tRPC call your procedures directly on the server, without an HTTP request, similar to [server-side calls](/docs/server/server-side-calls).
That also means that you don't have the request and response at hand like you usually do. Make sure you're instantiating the server-side helpers with a context without `req` & `res`, which are typically filled via the context creation. We recommend the concept of ["inner" and "outer" context](/docs/server/context) in that scenario.

```ts
import { createServerSideHelpers } from '@trpc/react-query/server';
import { createContext } from '~/server/context';
import superjson from 'superjson';

const helpers = createServerSideHelpers({
  router: appRouter,
  ctx: await createContext(),
  transformer: superjson, // optional - adds superjson serialization
});
```

### 2. External router

This method is used when you don't have direct access to your tRPC router. e.g. when developing a Next.js application and a standalone API hosted separately.

```ts
import { createTRPCProxyClient } from '@trpc/client';
import { createServerSideHelpers } from '@trpc/react-query/server';
import superjson from 'superjson';

const proxyClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',
    }),
  ],
  transformer: superjson,
});

const helpers = createServerSideHelpers({
  client: proxyClient,
});
```

## Helpers usage

The server-side helpers methods return an object much like the tRPC client, with all of your routers as keys. However, rather than `useQuery` and `useMutation`, you get `prefetch`, `fetch`, `prefetchInfinite`, and `fetchInfinite` functions.

The primary difference between `prefetch` and `fetch` is that `fetch` acts much like a normal function call, returning the result of the query, whereas `prefetch` does not return the result and never throws - if you need that behavior, use `fetch` instead. Instead, `prefetch` will add the query to the cache, which you then dehydrate and send to the client.

```ts
return {
  props: {
    // very important - use `trpcState` as the key
    trpcState: helpers.dehydrate(),
  },
};
```

The rule of thumb is `prefetch` for queries that you know you'll need on the client, and `fetch` for queries that you want to use the result of on the server.

The functions are all wrappers around react-query functions. Please check out [their docs](https://tanstack.com/query/v4/docs/react/overview) to learn more about them in detail.

:::info
For a full example, see our [E2E SSG test example](https://github.com/trpc/trpc/tree/main/examples/.test/ssg)
:::

## Next.js Example

```tsx title='pages/posts/[id].tsx'
import { createServerSideHelpers } from '@trpc/react-query/server';
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import { appRouter } from 'server/routers/_app';
import superjson from 'superjson';
import { trpc } from 'utils/trpc';

export async function getServerSideProps(
  context: GetServerSidePropsContext<{ id: string }>,
) {
  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson,
  });
  const id = context.params?.id as string;

  /*
   * Prefetching the `post.byId` query.
   * `prefetch` does not return the result and never throws - if you need that behavior, use `fetch` instead.
   */
  await helpers.post.byId.prefetch({ id });

  // Make sure to return { props: { trpcState: helpers.dehydrate() } }
  return {
    props: {
      trpcState: helpers.dehydrate(),
      id,
    },
  };
}

export default function PostViewPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  const { id } = props;
  const postQuery = trpc.post.byId.useQuery({ id });
  if (postQuery.status !== 'success') {
    // won't happen since the query has been prefetched
    return <>Loading...</>;
  }
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
