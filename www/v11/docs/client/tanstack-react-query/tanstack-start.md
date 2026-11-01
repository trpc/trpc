---
id: tanstack-start
title: Set up with TanStack Start
sidebar_label: TanStack Start
slug: /client/tanstack-react-query/tanstack-start
section: "Client Usage"
parent: "client/tanstack-react-query"
order: 52
---

This guide shows how to use tRPC with [TanStack Start](https://tanstack.com/start): route loaders start queries, and components read them through [handles](/docs/client/tanstack-react-query/handles).

:::info
We have prefixed the handle APIs with `unstable_` as they're new, but you're safe to use them! [Read more](/docs/faq#unstable).
:::

tRPC adds no router integration of its own. Data crosses from the server to the browser through TanStack's [SSR query integration](https://tanstack.com/router/latest/docs/integrations/query), with your tRPC data transformer.

The [SSE chat example](https://github.com/trpc/trpc/tree/main/examples/tanstack-start-sse-chat) is a complete TanStack Start app that uses handles in its loaders.

## 1. Install deps

```sh
npm install @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query @tanstack/react-router-ssr-query superjson
```

## 2. Create a query client factory

Use your tRPC transformer to serialize query data, and set a `staleTime` above 0 so the browser doesn't refetch right after hydration:

```ts title='src/lib/query-client.ts'
import { QueryClient } from '@tanstack/react-query';
import superjson from 'superjson';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30 * 1000 },
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
}
```

## 3. Create an isomorphic tRPC client

During server rendering, call procedures in the same process with `localLink`. In the browser, call them over HTTP:

```ts title='src/lib/trpc.ts'
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import {
  createTRPCClient,
  httpBatchStreamLink,
  localLink,
  type TRPCLink,
} from '@trpc/client';
import {
  createTRPCContext,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import { createContext } from '~/server/context';
import { appRouter, type AppRouter } from '~/server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

const getLinks = createIsomorphicFn()
  .server((): TRPCLink<AppRouter>[] => [
    localLink({
      router: appRouter,
      createContext: () => createContext({ req: getRequest() }),
      transformer: superjson,
    }),
  ])
  .client((): TRPCLink<AppRouter>[] => [
    httpBatchStreamLink({ url: '/api/trpc', transformer: superjson }),
  ]);

export const makeTRPCClient = () =>
  createTRPCClient<AppRouter>({ links: getLinks() });
```

## 4. Put the proxy in the router context

Create one proxy per router with `createTRPCOptionsProxy`, and pass it to loaders through the router context:

```tsx title='src/router.tsx'
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createQueryClient } from '~/lib/query-client';
import { makeTRPCClient, TRPCProvider } from '~/lib/trpc';
import type { AppRouter } from '~/server/routers/_app';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const queryClient = createQueryClient();
  const trpcClient = makeTRPCClient();
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: trpcClient,
    queryClient,
  });

  const router = createRouter({
    routeTree,
    context: { queryClient, trpc },
    defaultPreload: 'intent',
    // Let the query cache decide what's fresh: loaders always run, and fresh data is reused
    defaultPreloadStaleTime: 0,
    Wrap: (props) => (
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    ),
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
```

Type the root route's context with `createRootRouteWithContext<{ queryClient: QueryClient; trpc: TRPC }>()`.

## 5. Start queries in loaders

A loader starts queries and returns their handles as loader data. For each query, choose whether the loader waits for it. [Starting a query](/docs/client/tanstack-react-query/handles#starting-a-query) compares the two. Every input should come from the route's params or search params: see [Start every query from the URL](#url-as-input).

- On the first visit, the loader runs on the server, and the data is sent with the page.
- On later navigations, the loader runs in the browser against the tab's cache. Fresh data is reused; stale data renders at once and refetches.

### Without waiting: `unstable_$prefetch` {#loader-prefetch}

The loader returns at once, and the route renders before the data arrives:

```tsx title='src/routes/posts.$id.comments.tsx'
import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Comments } from '~/components/comments';

export const Route = createFileRoute('/posts/$id/comments')({
  loader: ({ context: { trpc }, params }) => ({
    comments: trpc.post.comments.unstable_$prefetchInfinite({
      postId: params.id,
      limit: 20,
    }),
  }),
  component: CommentsPage,
});

function CommentsPage() {
  const { comments } = Route.useLoaderData();
  return (
    <Suspense fallback={<p>Loading comments…</p>}>
      <Comments comments={comments} />
    </Suspense>
  );
}
```

- **Wrap the reader in `Suspense`.** `Comments` suspends until the data arrives. Without your own boundary, the suspension reaches the nearest boundary above it: the route's `pendingComponent`, or a parent route's. That can blank much more of the page than you want.
- The loader never throws for these queries. If a request fails, `Comments` throws, and the route's `errorComponent` (or the router's default) shows the error.

### Waiting: `unstable_$ensure` {#loader-ensure}

The loader waits, so the route renders with the data in place:

```tsx title='src/routes/posts.$id.tsx'
import { createFileRoute, notFound } from '@tanstack/react-router';
import { isTRPCClientError } from '@trpc/client';
import { Post } from '~/components/post';

export const Route = createFileRoute('/posts/$id')({
  loader: async ({ context: { trpc }, params }) => {
    const post = await trpc.post.byId
      .unstable_$ensure({ id: params.id })
      .catch((cause) => {
        if (isTRPCClientError(cause) && cause.data?.code === 'NOT_FOUND') {
          throw notFound();
        }
        throw cause;
      });
    return { post };
  },
  component: PostPage,
});

function PostPage() {
  const { post } = Route.useLoaderData();
  return <Post post={post} />;
}
```

- **No `Suspense` boundary is needed** for `Post`: the data is in the cache before the route renders.
- The navigation waits for the loader. On a slow request, the router shows the route's `pendingComponent`, if it has one.
- The loader can act on errors, as here with `notFound()`.
- The handle carries the data as `post.data`, so the loader can use it, for example in the route's `head`. See [Handles with data](/docs/client/tanstack-react-query/handles#handles-with-data).

To wait for some queries and stream others in the same loader, see [Combining both](/docs/client/tanstack-react-query/handles#combining-both): start every query first, then await.

## 6. Read handles in components

Components read handles with `unstable_$fromHandle` from `useTRPC()`. They're the same components you would write for the [Next.js App Router](/docs/client/tanstack-react-query/handles#nextjs-app-router), minus `'use client'`:

```tsx title='src/components/post.tsx'
import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from '~/lib/trpc';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}
```

## Start every query from the URL {#url-as-input}

A loader only sees the URL, so give it everything a page's queries need: path params for what the page is about, and search params for filters, sort and page. With `validateSearch` and `loaderDeps`, the loader starts the right query on every navigation, before the route renders:

```twoslash include start-setup
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const appRouter = t.router({
  post: t.router({
    list: t.procedure
      .input(z.object({ sort: z.enum(['newest', 'oldest']), page: z.number() }))
      .query(() => [{ id: '1', title: 'Hello' }]),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: lib/trpc.ts
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

declare module '@tanstack/react-router' {
  interface RouterContext {
    trpc: TRPC;
  }
}

// @filename: tanstack-react-router.d.ts
declare module '@tanstack/react-router' {
  import type { z } from 'zod';

  export interface RouterContext {}
  export function createFileRoute(path: string): <TSearch, TDeps, TLoaderData>(route: {
    validateSearch: z.ZodType<TSearch>;
    loaderDeps: (opts: { search: TSearch }) => TDeps;
    loader: (opts: { context: RouterContext; deps: TDeps }) => TLoaderData;
    component: () => unknown;
  }) => { useLoaderData: () => TLoaderData };
}
```

```tsx twoslash title='src/routes/posts.tsx'
// @include: start-setup
// @filename: routes/posts.tsx
// ---cut---
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { useTRPC } from '../lib/trpc';

export const Route = createFileRoute('/posts')({
  validateSearch: z.object({
    sort: z.enum(['newest', 'oldest']).default('newest'),
    page: z.number().int().positive().default(1),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context: { trpc }, deps }) => ({
    posts: trpc.post.list.unstable_$prefetch(deps),
  }),
  component: PostsPage,
});

function PostsPage() {
  const trpc = useTRPC();
  const loaderData = Route.useLoaderData();
  const postsQuery = useSuspenseQuery(
    trpc.unstable_$fromHandle(loaderData.posts),
  );
  return (
    <ul>
      {postsQuery.data.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

A link to `/posts?sort=oldest` starts the query for the oldest posts as the navigation begins, the back button restores the previous sort, and a shared link opens the same view. Keeping the sort in `useState` would lose all three, since the loader can't see component state.

If a query can't take its input from the URL, for example because it needs an id from another query's result, reshape the procedure: see [If the URL isn't enough, reshape the procedure](/docs/client/tanstack-react-query/handles#reshape-procedures).

## Handles in `beforeLoad` {#before-load}

`beforeLoad` can return handles too, for example to start a query in a parent route and read it in child routes. TanStack Router checks that values returned from `beforeLoad` are serializable, and handles pass that check as they are: their query keys and inputs are typed from the procedure.

## Don't return handles from server functions {#server-functions}

A server function runs with its own `QueryClient`, which never reaches the page. Return data from server functions, and start queries in loaders. In development, tRPC warns when it renders a handle whose data never reached the page's `QueryClient`.
