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
npm install @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query @tanstack/react-router-ssr-query superjson zod
```

## 2. Create a query client factory

Use your tRPC transformer to serialize query data, and set a `staleTime` above 0 so the browser doesn't refetch right after hydration:

```twoslash include start-app
// @jsx: react-jsx
// @target: esnext
// @module: esnext
// @paths: {"~/*": ["./src/*"]}
// @filename: server/context.ts
export async function createContext(opts: { req: Request }) {
  return { req: opts.req };
}

// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { createContext } from '../context';

const t = initTRPC
  .context<Awaited<ReturnType<typeof createContext>>>()
  .create({ transformer: superjson });

export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => ({ id: input.id, title: 'Hello' })),
    comments: t.procedure
      .input(
        z.object({
          postId: z.string(),
          limit: z.number().optional(),
          cursor: z.number().nullish(),
        }),
      )
      .query(() => ({
        items: [] as { id: string; text: string }[],
        nextCursor: null as number | null,
      })),
    list: t.procedure
      .input(z.object({ sort: z.enum(['new', 'top']), page: z.number() }))
      .query(() => [{ id: '1', title: 'Hello' }]),
  }),
});
export type AppRouter = typeof appRouter;
```

```twoslash include start-lib
// @filename: lib/query-client.ts
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

// @filename: lib/trpc.ts
import { createTRPCClient, httpBatchStreamLink } from '@trpc/client';
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import type { AppRouter } from '~/server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;
export const makeTRPCClient = () =>
  createTRPCClient<AppRouter>({
    links: [httpBatchStreamLink({ url: '/api/trpc', transformer: superjson })],
  });

// @filename: routes/__root.tsx
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';
import type { TRPC } from '~/lib/trpc';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  trpc: TRPC;
}>()();
```

```twoslash include start-router
// @filename: router.tsx
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

```twoslash include start-components
// @filename: components/post.tsx
import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from '~/lib/trpc';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: components/comments.tsx
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import type { unstable_inferInfiniteQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from '~/lib/trpc';

export function Comments(props: {
  comments: unstable_inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    trpc.unstable_$fromHandle(props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages</p>;
}
```

```ts twoslash title='src/lib/query-client.ts'
// @include: start-app
// @filename: lib/query-client.ts
// ---cut---
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

```ts twoslash title='src/lib/trpc.ts'
// @include: start-app
// @filename: lib/trpc.ts
// ---cut---
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

The browser's link calls `/api/trpc`. Serve it from a [server route](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) with the [fetch adapter](/docs/server/adapters/fetch):

```ts twoslash title='src/routes/api/trpc.$.ts'
// @include: start-app
// @include: start-lib
// @filename: routeTree.gen.ts
import { Route as rootRouteImport } from './routes/__root';
import { Route as ApiTrpcSplatRouteImport } from './routes/api/trpc.$';

const ApiTrpcSplatRoute = ApiTrpcSplatRouteImport.update({
  id: '/api/trpc/$',
  path: '/api/trpc/$',
  getParentRoute: () => rootRouteImport,
} as any);

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/api/trpc/$': {
      id: '/api/trpc/$';
      path: '/api/trpc/$';
      fullPath: '/api/trpc/$';
      preLoaderRoute: typeof ApiTrpcSplatRouteImport;
      parentRoute: typeof rootRouteImport;
    };
  }
}

export const routeTree = rootRouteImport.addChildren({ ApiTrpcSplatRoute });

import type { createStart } from '@tanstack/react-start';
// @filename: routes/api/trpc.$.ts
// ---cut---
import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from '~/server/context';
import { appRouter } from '~/server/routers/_app';

const handler = ({ request }: { request: Request }) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext,
  });

export const Route = createFileRoute('/api/trpc/$')({
  server: { handlers: { GET: handler, POST: handler } },
});
```

## 4. Put the proxy in the router context

Create one proxy per router with `createTRPCOptionsProxy`, and pass it to loaders through the router context:

```tsx twoslash title='src/router.tsx'
// @include: start-app
// @include: start-lib
// @filename: routeTree.gen.ts
import { Route as rootRouteImport } from './routes/__root';

export const routeTree = rootRouteImport.addChildren({});

import type { getRouter } from './router';
import type { createStart } from '@tanstack/react-start';
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true;
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}
// @filename: router.tsx
// ---cut---
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

```demo starting-queries variants=prefetch,ensure,reader
```

### Without waiting: `unstable_$prefetch` {#loader-prefetch}

The loader returns at once, and the route renders before the data arrives:

```tsx twoslash title='src/routes/posts.$id.comments.tsx'
// @include: start-app
// @include: start-lib
// @include: start-router
// @include: start-components
// @filename: routeTree.gen.ts
import { Route as rootRouteImport } from './routes/__root';
import { Route as PostsIdCommentsRouteImport } from './routes/posts.$id.comments';

const PostsIdCommentsRoute = PostsIdCommentsRouteImport.update({
  id: '/posts/$id/comments',
  path: '/posts/$id/comments',
  getParentRoute: () => rootRouteImport,
} as any);

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/posts/$id/comments': {
      id: '/posts/$id/comments';
      path: '/posts/$id/comments';
      fullPath: '/posts/$id/comments';
      preLoaderRoute: typeof PostsIdCommentsRouteImport;
      parentRoute: typeof rootRouteImport;
    };
  }
}

export const routeTree = rootRouteImport.addChildren({ PostsIdCommentsRoute });

import type { getRouter } from './router';
import type { createStart } from '@tanstack/react-start';
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true;
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}
// @filename: routes/posts.$id.comments.tsx
// ---cut---
import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Comments } from '~/components/comments';

export const Route = createFileRoute('/posts/$id/comments')({
  loader: ({ context: { trpc }, params }) => ({
    comments: trpc.post.comments.unstable_$prefetchInfinite(
      { postId: params.id, limit: 20 },
      { getNextPageParam: (last) => last.nextCursor },
    ),
  }),
  component: CommentsPage,
});

function CommentsPage() {
  const loaderData = Route.useLoaderData();
  return (
    <Suspense fallback={<p>Loading comments…</p>}>
      <Comments comments={loaderData.comments} />
    </Suspense>
  );
}
```

- **Wrap the reader in `Suspense`.** `Comments` suspends until the data arrives. Without your own boundary, the suspension reaches the nearest boundary above it: the route's `pendingComponent`, or a parent route's. That can blank much more of the page than you want.
- The loader never throws for these queries. If a request fails, `Comments` throws, and the route's `errorComponent` (or the router's default) shows the error.
- **Pass `getNextPageParam` to infinite queries.** The loader runs again on client navigations, and if the cached pages are stale, it refetches every page the user loaded. That [needs `getNextPageParam`](/docs/client/tanstack-react-query/handles#infinite-queries) from page two on.

### Waiting: `unstable_$ensure` {#loader-ensure}

The loader waits, so the route renders with the data in place:

```tsx twoslash title='src/routes/posts.$id.tsx'
// @include: start-app
// @include: start-lib
// @include: start-router
// @include: start-components
// @filename: routeTree.gen.ts
import { Route as rootRouteImport } from './routes/__root';
import { Route as PostsIdRouteImport } from './routes/posts.$id';

const PostsIdRoute = PostsIdRouteImport.update({
  id: '/posts/$id',
  path: '/posts/$id',
  getParentRoute: () => rootRouteImport,
} as any);

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/posts/$id': {
      id: '/posts/$id';
      path: '/posts/$id';
      fullPath: '/posts/$id';
      preLoaderRoute: typeof PostsIdRouteImport;
      parentRoute: typeof rootRouteImport;
    };
  }
}

export const routeTree = rootRouteImport.addChildren({ PostsIdRoute });

import type { getRouter } from './router';
import type { createStart } from '@tanstack/react-start';
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true;
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}
// @filename: routes/posts.$id.tsx
// ---cut---
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
  const loaderData = Route.useLoaderData();
  return <Post post={loaderData.post} />;
}
```

- The data is in the cache before the route renders, so `Post` shows the post at once. If the cache loses the post later, `Post` suspends and shows the nearest `Suspense` fallback, or the route's `pendingComponent`: see [When the cache loses the data](/docs/client/tanstack-react-query/handles#cache-loses-data).
- The navigation waits for the loader. On a slow request, the router shows the route's `pendingComponent`, if it has one.
- The loader can act on errors, as here with `notFound()`.
- The handle carries no data. To use the data in the loader, for example for the route's `head`, read it with `await context.queryClient.ensureQueryData(context.trpc.unstable_$fromHandle(post))` and return what you need. See [Using the data in a loader](/docs/client/tanstack-react-query/handles#loader-data).

To wait for some queries and stream others in the same loader, see [Combining both](/docs/client/tanstack-react-query/handles#combining-both): start every query first, then await.

## 6. Read handles in components

Components read handles with `unstable_$fromHandle` from `useTRPC()`. They're the same components you would write for the [Next.js App Router](/docs/client/tanstack-react-query/handles#nextjs-app-router), minus `'use client'`:

```tsx twoslash title='src/components/post.tsx'
// @include: start-app
// @include: start-lib
// @filename: components/post.tsx
// ---cut---
import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from '~/lib/trpc';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}
```

```demo loader-handles
route loader
├─ trpc.post.byId.unstable_$prefetch({ id })        → post handle     → <Post post={post} />
└─ trpc.post.comments.unstable_$prefetchInfinite()  → comments handle → <Comments comments={comments} />
```

## Start every query from the URL {#url-as-input}

A loader only sees the URL, so give it everything a page's queries need: path params for what the page is about, and search params for filters, sort and page. With `validateSearch` and `loaderDeps`, the loader starts the right query on every navigation, before the route renders:

```tsx twoslash title='src/routes/posts.tsx'
// @include: start-app
// @include: start-lib
// @include: start-router
// @filename: routeTree.gen.ts
import { Route as rootRouteImport } from './routes/__root';
import { Route as PostsRouteImport } from './routes/posts';

const PostsRoute = PostsRouteImport.update({
  id: '/posts',
  path: '/posts',
  getParentRoute: () => rootRouteImport,
} as any);

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/posts': {
      id: '/posts';
      path: '/posts';
      fullPath: '/posts';
      preLoaderRoute: typeof PostsRouteImport;
      parentRoute: typeof rootRouteImport;
    };
  }
}

export const routeTree = rootRouteImport.addChildren({ PostsRoute });

import type { getRouter } from './router';
import type { createStart } from '@tanstack/react-start';
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true;
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}
// @filename: routes/posts.tsx
// ---cut---
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { useTRPC } from '../lib/trpc';

export const Route = createFileRoute('/posts')({
  validateSearch: z.object({
    sort: z.enum(['new', 'top']).default('new'),
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

A link to `/posts?sort=top` starts the query for the top posts as the navigation begins. The back button brings back the last sort, and a shared link opens the same view. Keep the sort in `useState` and you lose all three, since the loader can't see component state.

```demo url-input
/posts?sort=top&page=2  →  trpc.post.list.unstable_$prefetch({ sort: 'top', page: 2 })
```

If a query can't take its input from the URL, for example because it needs an id from another query's result, reshape the procedure: see [If the URL isn't enough, reshape the procedure](/docs/client/tanstack-react-query/handles#reshape-procedures).

## Handles in `beforeLoad` {#before-load}

`beforeLoad` can return handles too, for example to start a query in a parent route and read it in child routes. TanStack Router checks that values returned from `beforeLoad` are serializable, and handles pass that check as they are: their query keys and inputs are typed from the procedure.

## Don't return handles from server functions {#server-functions}

A server function runs with its own `QueryClient`, which never reaches the page. Return data from server functions, and start queries in loaders. In development, tRPC warns when it renders a handle whose data never reached the page's `QueryClient`.
