---
title: Query keys and filters
label: Keys and filters
description: How tRPC's query keys are shaped, the filters that invalidate and read them, and `keyPrefix` for two APIs in one `QueryClient`.
section: Integrations
parent: integrations/tanstack-query
order: 8
v11: client/tanstack-react-query/usage
---

A query key starts with the procedure's path as an array, then its input and what made it: `[['post', 'byId'], { input: { id: '1' }, type: 'query' }]`. The `type` is `query`, `infinite`, `streamed` or `live`, or `mutation` for a streamed mutation's chunks. A mutation key is the path alone, `[['post', 'create']]`. Since the path is an array, `[['post']]` partially matches every key under `post`.

You rarely write a key: each helper makes its own, and has a function that returns it.

| Helper                                                    | Key or filter for                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `trpc.pathKey()`, `trpc.post.pathKey()`                   | everything under a path: queries, infinite, streamed and live queries, mutations |
| `trpc.post.pathFilter(filters?)`                          | the same, as filters for `invalidateQueries`, `cancelQueries`, `removeQueries` … |
| `trpc.post.byId.queryKey({ input })`                      | the exact key `queryOptions()` uses, typed for `getQueryData`                    |
| `trpc.post.byId.queryFilter({ input? })`                  | a procedure's queries: every input, or those matching part of one                |
| `trpc.post.list.infiniteKey({ input, initialPageParam })` | the exact key `infiniteOptions()` uses                                           |
| `trpc.post.list.infiniteFilter({ input? })`               | a procedure's infinite queries: every input, or those matching part of one       |
| `trpc.post.create.mutationKey()`, `mutationFilter()`      | a procedure's mutations, for `useIsMutating` and `useMutationState`              |
| `trpc.x.streamedKey()`, `trpc.x.liveKey()`                | a subscription's query-cache forms                                               |

## Invalidate and update

```ts twoslash
// ---cut-start---
import type { QueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { client } from './client.ts';
const trpc = createTrpcQueryUtils({ client });
declare const queryClient: QueryClient;
declare const id: string;
// ---cut-end---
// every post query, whatever its procedure or input
await queryClient.invalidateQueries(trpc.post.pathFilter());
// post.byId for one input
await queryClient.invalidateQueries(
  trpc.post.byId.queryFilter({ input: { id } }),
);
// post.list's infinite queries, every input
await queryClient.invalidateQueries(trpc.post.list.infiniteFilter());

// typed by the key: the procedure's output
const key = trpc.post.byId.queryKey({ input: { id } });
const post = queryClient.getQueryData(key);
//    ^?
queryClient.setQueryData(key, (old) =>
  old ? { ...old, title: 'Renamed' } : old,
);
```

`queryFilter()` covers a procedure's plain queries and `infiniteFilter()` its infinite ones; an `infiniteFilter({ input })` matches by the first page's input (what `input` returns for `initialPageParam`), so a field such as the cursor can be left out. `trpc.post.list.pathFilter()` covers every kind.

## Two APIs, one `QueryClient`

Keys start with the procedure path, so two tRPC APIs with a `post.byId` would share cache entries. Give one a `keyPrefix`:

```ts twoslash
// ---cut-start---
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
const billingClient = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/billing/trpc' })],
});
declare const id: string;
// ---cut-end---
const billing = createTrpcQueryUtils({
  client: billingClient,
  keyPrefix: 'billing',
});
billing.post.byId.queryKey({ input: { id } }); // [['billing', 'post', 'byId'], { input: { id }, type: 'query' }]
billing.pathFilter(); // matches only billing's queries
```

The prefix is the path's first segment, so the other API's root `trpc.pathFilter()` matches billing's queries too, and so would a top-level `billing` router of its own. Filter that API under a path instead, like `trpc.post.pathFilter()`.

Every framework's `createTrpcContext({ keyPrefix: 'billing' })` and `createTrpcRsc({ keyPrefix })` take it too; the server and browser must use the same one.

## Next.js cache tags

`cacheTags(key)` and `revalidationTag(key)` turn a key into Next.js data-cache tags, so a mutation can revalidate exactly what a query key covers ([React Server Components](../rsc.md#nextjs-data-cache)).
