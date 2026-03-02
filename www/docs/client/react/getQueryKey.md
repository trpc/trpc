---
id: getQueryKey
title: getQueryKey
sidebar_label: getQueryKey()
slug: /client/react/getQueryKey
---

We provide a getQueryKey helper that accepts a `router` or `procedure` so that you can easily provide the native function the correct query key.

```tsx twoslash
// @errors: 2304 2391 1005

// Queries
function getQueryKey(
  procedure: AnyQueryProcedure,
  input?: DeepPartial<TInput>,
  type?: QueryType; /** @default 'any' */
): TRPCQueryKey;

// Routers
function getQueryKey(
  router: AnyRouter,
): TRPCQueryKey;

type QueryType = "query" | "infinite" | "any";
// for useQuery ──┘         │            │
// for useInfiniteQuery ────┘            │
// will match all ───────────────────────┘
```

:::note

The query type `any` will match all queries in the cache only if the `react query` method where it's used uses fuzzy matching. See [TanStack/query#5111 (comment)](https://github.com/TanStack/query/issues/5111#issuecomment-1464864361) for more context.

:::

```tsx twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  post: t.router({
    list: t.procedure.query(() => {
      return [
        { id: '1', title: 'everlong' },
        { id: '2', title: 'After Dark' },
      ];
    }),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';
export const trpc = createTRPCReact<AppRouter>();

// @filename: component.tsx
// ---cut---
import React from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { trpc } from './utils/trpc';

function MyComponent() {
  const queryClient = useQueryClient();

  const posts = trpc.post.list.useQuery();

  // See if a query is fetching
  const postListKey = getQueryKey(trpc.post.list, undefined, 'query');
  const isFetching = useIsFetching({ queryKey: postListKey });

  // Set some query defaults for an entire router
  const postKey = getQueryKey(trpc.post);
  queryClient.setQueryDefaults(postKey, { staleTime: 30 * 60 * 1000 });

  // ...
}
```

## Mutations

Similarly to queries, we provide a getMutationKey for mutations. The underlying function is the same as getQueryKey (in fact, you could technically use getQueryKey for mutations as well), the only difference is in semantics.

```tsx twoslash
// @errors: 2391 2304

function getMutationKey(procedure: AnyMutationProcedure): TRPCMutationKey;
```
