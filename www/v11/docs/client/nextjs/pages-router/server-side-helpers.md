---
id: server-side-helpers
title: Server-Side Helpers
sidebar_label: Server-Side Helpers
description: Prefetch or fetch tRPC queries in getServerSideProps and getStaticProps with createTRPCOptionsProxy and a query client, then pass them to the page as trpcState
slug: /client/nextjs/pages-router/server-side-helpers
section: "Client Usage"
parent: "client/nextjs/pages-router/setup"
order: 73
---

To run queries on the server in `getServerSideProps` or `getStaticProps`, make a query client and pass it to `createTRPCOptionsProxy` from `@trpc/tanstack-react-query`. The proxy gives you the same `queryOptions` as `useTRPC()` in a component. You prefetch them into the query client, then send its cache to the page, so the page doesn't have to fetch them again.

:::warning Deprecated
`createServerSideHelpers` from `@trpc/react-query/server` belongs to the [classic React Query integration](/docs/client/react), which only gets bug fixes and will be removed in the next major version of tRPC. Use `createTRPCOptionsProxy` instead, as below.
:::

## Create the proxy

There are two ways to create it, depending on where your router runs.

### 1. Internal router

Use this when your router is in the same Next.js app. The proxy calls your procedures directly, with no HTTP request, as [server-side calls](/docs/server/server-side-calls) do. So pass it a context: build it from `context.req` in `getServerSideProps`, as [SSR](./ssr.md#build-the-context-from-the-request) shows. In `getStaticProps` there's no request, so the context can't need one. The ["inner" and "outer" context](/docs/server/context) pattern helps here.

```ts twoslash
// @module: esnext
// @target: es2017
// @filename: server/context.ts
export declare function createContext(): Promise<{}>;

// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: utils/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: example.ts
// ---cut---
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createContext } from './server/context';
import { appRouter } from './server/routers/_app';
import { makeQueryClient } from './utils/query-client';

export async function getStaticProps() {
  const queryClient = makeQueryClient();
  const trpc = createTRPCOptionsProxy({
    router: appRouter,
    ctx: await createContext(),
    queryClient,
  });
  // ...
}
```

### 2. External router

Use this when your API runs on another server. Pass a tRPC client instead of the router:

```ts twoslash
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: utils/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: example.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from './server/router';
import { makeQueryClient } from './utils/query-client';

export async function getStaticProps() {
  const queryClient = makeQueryClient();
  const trpc = createTRPCOptionsProxy({
    client: createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: 'http://localhost:3000/api/trpc',
        }),
      ],
    }),
    queryClient,
  });
  // ...
}
```

Make the query client and the proxy inside `getServerSideProps` or `getStaticProps`, so each call gets new ones. A query client at module scope would share one user's data with the next.

## Prefetch, fetch and dehydrate

Run the queries with the query client's methods:

- `queryClient.prefetchQuery(trpc.post.byId.queryOptions(input))` puts the result in the cache. It never throws and returns nothing.
- `queryClient.fetchQuery(trpc.post.byId.queryOptions(input))` also caches the result, but returns it, and throws if the query fails.
- `prefetchInfiniteQuery` and `fetchInfiniteQuery` do the same with `trpc.post.list.infiniteQueryOptions(input)`.

Use `prefetchQuery` for data the page shows, and `fetchQuery` when you need the result on the server, for instance to return `notFound`. Then send the cache to the page with `dehydrate`:

```ts twoslash
// @filename: example.ts
import { dehydrate, QueryClient } from '@tanstack/react-query';
declare const queryClient: QueryClient;
// ---cut---
// In getServerSideProps / getStaticProps:
const props = {
  // `_app` reads this key
  trpcState: dehydrate(queryClient),
};
```

These are TanStack React Query's own functions. See [their docs](https://tanstack.com/query/v5/docs/framework/react/guides/prefetching) for more.

:::tip
The proxy can also start a query and return a **handle** to it: `await trpc.post.byId.unstable_$ensure(input)`. Pass the handle to the page in `props`, and the page reads it with `useQuery(trpc.unstable_$fromHandle(props.post))`, so it can't ask for a different input than the server used. See [Prefetching with handles](/docs/client/tanstack-react-query/handles).
:::

Coming from `createServerSideHelpers`, `helpers.post.byId.prefetch(input)` is now `queryClient.prefetchQuery(trpc.post.byId.queryOptions(input))`, `fetch` is `fetchQuery`, and `helpers.dehydrate()` is `dehydrate(queryClient)`. If you passed a `transformer` to the helpers, run the dehydrated state through it yourself, as [Using a data transformer](./setup.md#using-a-data-transformer) shows.

## Next.js example

```tsx twoslash title='pages/posts/[id].tsx'
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query((opts) => ({
        id: opts.input.id,
        title: 'Example Post',
        text: 'Hello world',
      })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: utils/trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: pages/posts/[id].tsx
// ---cut---
import { dehydrate, useQuery } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from 'next';
import { appRouter } from '../../server/routers/_app';
import { makeQueryClient } from '../../utils/query-client';
import { useTRPC } from '../../utils/trpc';

export async function getServerSideProps(
  context: GetServerSidePropsContext<{ id: string }>,
) {
  const id = context.params?.id as string;
  const queryClient = makeQueryClient();
  const trpc = createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient,
  });

  await queryClient.prefetchQuery(trpc.post.byId.queryOptions({ id }));

  return {
    props: {
      trpcState: dehydrate(queryClient),
      id,
    },
  };
}

export default function PostViewPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  const trpc = useTRPC();
  const postQuery = useQuery(trpc.post.byId.queryOptions({ id: props.id }));

  switch (postQuery.status) {
    case 'pending':
      return <p>Loading...</p>;
    case 'error':
      return <p>Error: {postQuery.error.message}</p>;
    case 'success':
      return (
        <article>
          <h1>{postQuery.data.title}</h1>
          <p>{postQuery.data.text}</p>
        </article>
      );
  }
}
```
