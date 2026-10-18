---
title: React without TanStack Query
description: Render-as-you-fetch with use() and Suspense in @trpc12/experimental-react, where cache features are links.
section: Integrations
order: 4
---

Two experimental packages read tRPC in React with `use()` and Suspense, without TanStack Query. Both are experimental as a whole: the package name says so, every export is `@stability experimental`, and the API may change in any release. For a stable React integration, use [TanStack Query](./tanstack-query.md).

| Package                           | Model                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@trpc12/experimental-react`      | Promises: loaders start queries, components read them with `use()`. Features are links, opt-in.                   |
| `@trpc12/experimental-react-atom` | Effect Atoms: query and mutation atoms read with `useAtomSuspense` ([React atoms](./experimental-react-atom.md)). |

This page is `@trpc12/experimental-react`: render-as-you-fetch, after [raf-query](https://github.com/KATT/raf-query). A route loader (or an event handler) calls `.query()`, which starts the request and returns a promise. The component reads that promise with `useQuery()` and `use()`. Components don't start requests.

```tsx
import {
  createReactClient,
  standardLinks,
  useQuery,
  type QueryPromise,
} from '@trpc12/experimental-react';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { Suspense, use } from 'react';
import type { AppRouter } from './server';

export const trpc = createReactClient({
  router: routerType<AppRouter>(),
  links: [...standardLinks({ staleTime: 10_000 }), httpLink({ url: '/trpc' })],
});

// The route's loader starts the request; the navigation doesn't wait for it.
export const loader = (args: { params: { id: string } }) => ({
  post: trpc.post.byId.query({ id: args.params.id }),
});

function Post(props: { post: QueryPromise<{ title: string }> }) {
  const post = use(useQuery(props.post));
  return <h1>{post.title}</h1>;
}

<Suspense fallback={<Spinner />}>
  <Post post={loaderData.post} />
</Suspense>;
```

`useQuery` finds the cache through the promise, so there is no provider.

## Stable promises

Built in, not a link. `use()` needs the same promise across renders, and these are:

- One promise per query (path and input, with object keys sorted) while it loads, so calls in flight share one request.
- The same promise while the data doesn't change. A new one only when it does: a refetch with new data, or `setData`.
- Settled promises carry `status` and `value`, so `use()` renders cached data without suspending.

`useQuery(promise)` returns the query's current promise and re-renders when it changes. `useQueryState(promise)` gives `isFetching`, `isStale`, `error`, `updatedAt` and `refetch()`, for spinners and retry buttons.

## Query links

Without links, the cache does the least: an entry lives while a request is in flight or a mounted `useQuery` reads it. Everything else is a link, opt-in one by one:

| Link                               | Does                                                                                      | In `standardLinks()` |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | -------------------- |
| `cacheLink({ staleTime, gcTime })` | Keeps unread entries `gcTime` (5 minutes); fresh data (`staleTime`, 0) makes no request   | yes                  |
| `structuralSharingLink()`          | Refetched data keeps unchanged parts, and unchanged data keeps its promise (no re-render) | yes                  |
| `refetchOnMountLink()`             | A mount on stale data refetches it, except right after the loader's own request           | yes                  |
| `refetchOnWindowFocusLink()`       | Refetches stale, mounted queries when the page is visible again                           | yes                  |
| `refetchOnReconnectLink()`         | The same when the browser comes back online                                               | yes                  |
| `retryLink()` (core)               | Retries failed queries 3 times                                                            | yes                  |
| `invalidateOnMutationLink()`       | After a mutation, invalidates queries and resolves once the mounted ones have refetched   | yes                  |

`standardLinks()` matches TanStack Query's defaults, plus one: like a router after an action, every mutation invalidates queries (all of them, unless `invalidates` narrows it). Stale data is returned at once and refetched in the background.

Query links are tRPC [links](../client/links.md): they sit in the same `links` array, before the link that sends. Write your own with `withQueryFeature(link, feature)`.

## Cache methods

```ts
await trpc.post.byId.invalidate({ id }); // refetches it if it's on screen
await trpc.invalidate('post'); // every query under post.*
trpc.post.byId.setData({ id }, (prev) => ({ ...prev!, title }));
trpc.post.byId.getData({ id });
await trpc.post.rename.mutate({ id, title }); // mutations and subscriptions are the plain client's
```

## Server rendering

On the server, create one client per request (`isServer` defaults to `typeof window === 'undefined'`; a server's cache never drops entries). After the render, `dehydrate(trpc)` encodes the settled queries with the links' serializer, so `Date`s survive with danSON; `hydrate(trpc, state)` writes them into the browser's client before it renders.

```ts
const state = dehydrate(serverTrpc); // send it with the HTML
hydrate(trpc, state); // in the browser, before hydrateRoot
```
