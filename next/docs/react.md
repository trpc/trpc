# React without TanStack Query

Two experimental packages read tRPC in React with `use()` and Suspense, without TanStack Query. Both are experimental as a whole: the package name says so, every export is `@stability experimental`, and the API may change in any release. For a stable React integration, use [TanStack Query](./tanstack-query.md).

| Package                           | Model                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@trpc12/experimental-react`      | Promises: loaders start queries, components read them with `use()`. Features are links, opt-in. |
| `@trpc12/experimental-react-atom` | [Effect Atoms](https://effect.website): query and mutation atoms read with `useAtomSuspense`.   |

## `@trpc12/experimental-react`

Render-as-you-fetch, after [raf-query](https://github.com/KATT/raf-query): a route loader (or an event handler) calls `.query()`, which starts the request and returns a promise. The component reads that promise with `useQuery()` and `use()`. Components don't start requests.

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
export const loader = ({ params }: { params: { id: string } }) => ({
  post: trpc.post.byId.query({ id: params.id }),
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

### Stable promises

Built in, not a link. `use()` needs the same promise across renders, and these are:

- One promise per query (path and input, with object keys sorted) while it loads, so calls in flight share one request.
- The same promise while the data doesn't change. A new one only when it does: a refetch with new data, or `setData`.
- Settled promises carry `status` and `value`, so `use()` renders cached data without suspending.

`useQuery(promise)` returns the query's current promise and re-renders when it changes. `useQueryState(promise)` gives `isFetching`, `isStale`, `error`, `updatedAt` and `refetch()`, for spinners and retry buttons.

### Links

Without links, the cache does the least: an entry lives while a request is in flight or a mounted `useQuery` reads it. Everything else is a link, opt-in one by one:

| Link                               | Does                                                                                      | In `standardLinks()` |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | -------------------- |
| `cacheLink({ staleTime, gcTime })` | Keeps unread entries `gcTime` (5 minutes); fresh data (`staleTime`, 0) makes no request   | yes                  |
| `structuralSharingLink()`          | Refetched data keeps unchanged parts, and unchanged data keeps its promise (no re-render) | yes                  |
| `refetchOnMountLink()`             | A mount on stale data refetches it, except right after the loader's own request           | yes                  |
| `refetchOnWindowFocusLink()`       | Refetches stale, mounted queries when the page is visible again                           | yes                  |
| `refetchOnReconnectLink()`         | The same when the browser comes back online                                               | yes                  |
| `retryLink()` (core)               | Retries failed queries 3 times                                                            | yes                  |
| `invalidateOnMutationLink()`       | After a mutation, invalidates queries and resolves once the mounted ones have refetched   | no                   |

`standardLinks()` matches TanStack Query's defaults. Stale data is returned at once and refetched in the background.

Query links are tRPC links: they sit in the same `links` array, before the link that sends. Write your own with `withQueryFeature(link, feature)`.

### Cache methods

```ts
await trpc.post.byId.invalidate({ id }); // refetches it if it's on screen
await trpc.invalidate('post'); // every query under post.*
trpc.post.byId.setData({ id }, (prev) => ({ ...prev!, title }));
trpc.post.byId.getData({ id });
await trpc.post.rename.mutate({ id, title }); // mutations and subscriptions are the plain client's
```

### Server rendering

On the server, create one client per request (`isServer` defaults to `typeof window === 'undefined'`; a server's cache never drops entries). After the render, `dehydrate(trpc)` encodes the settled queries with the links' serializer, so `Date`s survive with danSON; `hydrate(trpc, state)` writes them into the browser's client before it renders.

```ts
const state = dehydrate(serverTrpc); // send it with the HTML
hydrate(trpc, state); // in the browser, before hydrateRoot
```

## `@trpc12/experimental-react-atom`

Modeled on Effect's `AtomRpc`. Each query is an atom of its `AsyncResult`, typed with the procedure's errors; the same call returns the same atom.

```tsx
import { useAtomSuspense, useAtomSet } from '@effect/atom-react';
import { createAtomClient } from '@trpc12/experimental-react-atom';

export const trpc = createAtomClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc', serializer: createSerializer() })],
});

function Post(props: { id: string }) {
  const post = useAtomSuspense(
    trpc.post.byId.query({ id: props.id }, { reactivityKeys: ['posts'] }),
  ).value;
  const rename = useAtomSet(trpc.post.rename.mutation());
  return (
    <button
      onClick={() =>
        rename({
          input: { id: props.id, title: 'New' },
          reactivityKeys: ['posts'],
        })
      }
    >
      {post.title}
    </button>
  );
}
```

- `query(input, { reactivityKeys, timeToLive })`: a mutation with the same reactivity keys refetches it. `timeToLive` keeps the result after the last reader; `Infinity` keeps it alive.
- `mutation()`: a function atom, set with `{ input, reactivityKeys }`.
- `subscription(input)`: an atom of the latest event.
- `trpc.client` is the Effect client the atoms call; `trpc.runtime` is their runtime.

Query atoms are serializable. On the server, render with a registry that keeps idle atoms (`AtomRegistry.make({ defaultIdleTTL })`) and call `Hydration.dehydrate(registry)` afterwards; in the browser, wrap the tree in `HydrationBoundary` from `@effect/atom-react`. Results encode with the links' serializer (`serializerSchema(serializer)` is that `Schema`, for your own atoms). Failed results aren't carried; the browser runs those queries again.
