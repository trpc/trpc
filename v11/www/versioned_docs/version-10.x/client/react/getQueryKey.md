---
id: getQueryKey
title: getQueryKey
sidebar_label: getQueryKey()
slug: /client/react/getQueryKey
---

We provide a getQueryKey helper that accepts a `router` or `procedure` so that you can easily provide the native function the correct query key.

```tsx
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

// Mutations
function getQueryKey(
  procedure: AnyMutationProcedure,
): TRPCQueryKey;

type QueryType = "query" | "infinite" | "any";
// for useQuery ──┘         │            │
// for useInfiniteQuery ────┘            │
// will match all ───────────────────────┘
```

:::note

The query type `any` will match all queries in the cache only if the `react query` method where it's used uses fuzzy matching. See [TanStack/query#5111 (comment)](https://github.com/TanStack/query/issues/5111#issuecomment-1464864361) for more context.

:::

```tsx
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { trpc } from '~/utils/trpc';

function MyComponent() {
  const queryClient = useQueryClient();

  const posts = trpc.post.list.useQuery();

  // See if a query is fetching
  const postListKey = getQueryKey(trpc.post.list, undefined, 'query');
  const isFetching = useIsFetching(postListKey);

  // Set some query defaults for an entire router
  const postKey = getQueryKey(trpc.post);
  queryClient.setQueryDefaults(postKey, { staleTime: 30 * 60 * 1000 });

  // ...
}
```
