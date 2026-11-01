---
title: "Suspense"
description: ""
section: "Client Usage"
parent: "client/react"
order: 36
---

> [!NOTE] Info
>
> - Ensure you're on the latest version of React
> - If you use suspense with [tRPC's _automatic_ SSR in Next.js](../nextjs/ssr.md), the full page will crash on the server if a query fails, even if you have an `<ErrorBoundary />`

## Usage

> [!TIP]
>
> `useSuspenseQuery` & `useSuspenseInfiniteQuery` both return a `[data, query]`-_tuple_, to make it easy to directly use your data and renaming the variable to something descriptive

### `useSuspenseQuery()`

```tsx
import React from 'react';
import { trpc } from '../utils/trpc';

function PostView() {
  const [post, postQuery] = trpc.post.byId.useSuspenseQuery({ id: '1' });

  return <>{/* ... */}</>;
}
```

### `useSuspenseInfiniteQuery()`

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
