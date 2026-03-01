---
id: suspense
title: Suspense
sidebar_label: Suspense
slug: /client/react/suspense
---

:::info

- Ensure you're on the latest version of React
- If you use suspense with [tRPC's _automatic_ SSR in Next.js](/docs/client/nextjs/pages-router/ssr), the full page will crash on the server if a query fails, even if you have an `<ErrorBoundary />`

:::

## Usage

:::tip

`useSuspenseQuery` & `useSuspenseInfiniteQuery` both return a `[data, query]`-_tuple_, to make it easy to directly use your data and renaming the variable to something descriptive

:::

```twoslash include server
// @target: esnext

// @filename: server.ts
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const posts = [
  { id: '1', title: 'everlong' },
  { id: '2', title: 'After Dark' },
];

const appRouter = t.router({
  post: t.router({
    all: t.procedure
      .input(
        z.object({
          cursor: z.string().optional(),
        })
      )
      .query(({ input }) => {
        return {
          posts,
          nextCursor: '123' as string | undefined,
        };
      }),
    byId: t.procedure
      .input(
        z.object({
          id: z.string(),
        })
      )
      .query(({ input }) => {
        const post = posts.find(p => p.id === input.id);
        if (!post) {
          throw new TRPCError({
            code: 'NOT_FOUND',
          })
        }
        return post;
     }),
  }),
});

export type AppRouter = typeof appRouter;

export interface PostPage {
  posts: { id: string; title: string }[];
  nextCursor?: string | undefined;
}

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';

export const trpc = createTRPCReact<AppRouter>();

```

### `useSuspenseQuery()`

```tsx twoslash
// @target: esnext
// @include: server
// ---cut---
// @filename: pages/index.tsx
import React from 'react';
import { trpc } from '../utils/trpc';

function PostView() {
  const [post, postQuery] = trpc.post.byId.useSuspenseQuery({ id: '1' });
  //      ^?

  return <>{/* ... */}</>;
}
```

### `useSuspenseInfiniteQuery()`

```tsx twoslash
// @target: esnext
// @include: server
// ---cut---
// @filename: pages/index.tsx
import React from 'react';
import { trpc } from '../utils/trpc';
import type { PostPage } from '../server';

function PostView() {
  const [{ pages }, allPostsQuery] = trpc.post.all.useSuspenseInfiniteQuery(
    {},
    {
      getNextPageParam(lastPage: PostPage) {
        return lastPage.nextCursor;
      },
      initialCursor: '',
    },
  );

  const { isFetching, isFetchingNextPage, fetchNextPage, hasNextPage } =
    allPostsQuery;

  return <>{/* ... */}</>;
}
```

### `useSuspenseQueries()`

Suspense equivalent of [`useQueries()`](./useQueries.md).

```tsx twoslash
// @target: esnext
// @include: server
// ---cut---
// @filename: pages/index.tsx
import React from 'react';
import { trpc } from '../utils/trpc';

const Component = (props: { postIds: string[] }) => {
  const [posts, postQueries] = trpc.useSuspenseQueries((t) =>
    props.postIds.map((id) => t.post.byId({ id })),
  );

  return <>{/* [...] */}</>;
};
```

## Prefetching

The performance of suspense queries can be improved by prefetching the query data before the Suspense component is rendered (this is sometimes called ["render-as-you-fetch"](https://tanstack.com/query/v5/docs/framework/react/guides/suspense#fetch-on-render-vs-render-as-you-fetch)).

:::note

- Prefetching and the render-as-you-fetch model are very dependent on the framework and router you are using. We recommend reading your frameworks router docs along with the [@tanstack/react-query docs](https://tanstack.com/query/v5/docs/react/guides/prefetching) to understand how to implement these patterns.
- If you are using Next.js please look at the docs on [Server-Side Helpers](/docs/client/nextjs/pages-router/server-side-helpers) to implement server-side prefetching.

:::

### Route-level prefetching

```tsx twoslash
// @target: esnext
// @include: server
// ---cut---
// @filename: loader.ts
import { createTRPCQueryUtils } from '@trpc/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { QueryClient } from '@tanstack/react-query';
import type { AppRouter } from './server';

const queryClient = new QueryClient();
const trpcClient = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: 'http://localhost:3000' })] });
const utils = createTRPCQueryUtils({ queryClient, client: trpcClient });

// tanstack router/ react router loader
const loader = async (params: { id: string }) =>
  utils.post.byId.ensureData({ id: params.id });
```

### Component-level prefetching with `usePrefetchQuery`

```tsx twoslash
// @target: esnext
// @include: server
// ---cut---
// @filename: pages/index.tsx
import React, { Suspense } from 'react';
import { trpc } from '../utils/trpc';

function PostView(props: { postId: string }) {
  return <></>;
}

function PostViewPage(props: { postId: string }) {
  trpc.post.byId.usePrefetchQuery({ id: props.postId });

  return (
    <Suspense>
      <PostView postId={props.postId} />
    </Suspense>
  );
}
```

### Component-level prefetching with `usePrefetchInfiniteQuery`

```tsx twoslash
// @target: esnext
// @include: server
// ---cut---
// @filename: pages/index.tsx
import React, { Suspense } from 'react';
import { trpc } from '../utils/trpc';
import type { PostPage } from '../server';

function PostView(props: { postId: string }) {
  return <></>;
}

function PostViewPage(props: { postId: string }) {
  trpc.post.all.usePrefetchInfiniteQuery(
    {},
    {
      getNextPageParam(lastPage: PostPage) {
        return lastPage.nextCursor;
      },
      initialCursor: '',
    },
  );

  return (
    <Suspense>
      <PostView postId={props.postId} />
    </Suspense>
  );
}
```
