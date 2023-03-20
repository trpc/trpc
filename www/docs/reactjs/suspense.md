---
id: suspense
title: Suspense (Experimental)
sidebar_label: Suspense (Experimental)
slug: /reactjs/suspense
---

:::info

- `useSuspense` & `useSuspenseInfiniteQuery` are _experimental_ features as its implementation may change as a result of the [`use()` proposal & RSC (React Server Components)](https://github.com/reactjs/rfcs/pull/229)
- Ensure you're on the latest version of React
- When initializing `createTRPCReact` or `createTRPCNext` you have to pass `'ExperimentalSuspense'` as the **third** generic parameter
- If you use suspense with [tRPC's _automatic_ SSR in Next.js](/docs/nextjs/ssr), the full page will crash on the server if a query fails, even if you have an `<ErrorBoundary />`

:::

## Usage

:::tip

`useSuspense` & `useSuspenseInfiniteQuery` both return a `[data, query]`-_tuple_, to make it easy to directly use your data and renaming the variable to something descriptive

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


// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';

export const trpc = createTRPCReact<AppRouter, unknown, 'ExperimentalSuspense'>();

```

### Enabling Suspense

```ts
// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';

export const trpc = createTRPCReact<
  AppRouter,
  unknown,
  'ExperimentalSuspense'
>();
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

### `useInfiniteSuspenseQuery()`

```tsx
// @filename: pages/index.tsx
import React from 'react';
import { trpc } from '../utils/trpc';

function PostView() {
  const [pages, allPostsQuery] = trpc.post.all.useSuspenseInfiniteQuery(
    {},
    {
      getNextPageParam(lastPage) {
        return lastPage.nextCursor;
      },
    },
  );

  const { isFetching, isFetchingNextPage, fetchNextPage, hasNextPage } =
    allPostsQuery;

  return <>{/* ... */}</>;
}
```
