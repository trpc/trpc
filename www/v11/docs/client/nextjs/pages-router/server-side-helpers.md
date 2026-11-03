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

To run queries on the server in `getServerSideProps` or `getStaticProps`, make a query client and pass it to `createTRPCOptionsProxy` from `@trpc/tanstack-react-query`. You start the page's queries with the proxy, then send the query client's cache to the page, with a handle for each query, so the page doesn't have to fetch them again.

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

## Start queries and dehydrate

Start each query the page needs with the proxy, and pass the page the handle it returns:

- `await trpc.post.byId.unstable_$ensure(input)` waits until the result is in the cache, and returns a handle. The page reads the query with `trpc.unstable_$fromHandle(handle)`, without repeating the procedure or its input. It rejects if the query fails, for instance so you can return `notFound`.
- `unstable_$ensureInfinite` does the same for an infinite query, such as `trpc.post.list.unstable_$ensureInfinite(input)`.
- To use the result on the server too, read it from the cache with `queryClient.ensureQueryData(trpc.unstable_$fromHandle(handle))`, which doesn't request it again. Props can't hold a pending query, so use `unstable_$ensure` here, not `unstable_$prefetch`.

See [Prefetching with handles](/docs/client/tanstack-react-query/handles) for the full guide. Then send the cache to the page with `dehydrate`:

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

Each handle method makes one TanStack React Query call with the procedure's `queryOptions`, such as `ensureQueryData` for `unstable_$ensure`, and you can make those calls yourself too. See [TanStack Query equivalents](/docs/client/tanstack-react-query/handles#tanstack-equivalents), and [TanStack's docs](https://tanstack.com/query/v5/docs/framework/react/guides/prefetching) for more.

Coming from `createServerSideHelpers`, `helpers.post.byId.prefetch(input)` and `fetch(input)` are now `await trpc.post.byId.unstable_$ensure(input)`, which rejects where `prefetch` didn't, and `helpers.dehydrate()` is `dehydrate(queryClient)`. If you passed a `transformer` to the helpers, run the dehydrated state through it yourself, as [Using a data transformer](./setup.md#using-a-data-transformer) shows.

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

  const post = await trpc.post.byId.unstable_$ensure({ id });
  return { props: { trpcState: dehydrate(queryClient), post } };
}

export default function PostViewPage(props: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const trpc = useTRPC();
  const postQuery = useQuery(trpc.unstable_$fromHandle(props.post));

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
