---
title: Handles
description: 'A loader or server component starts a query with `$ensure()` and passes on a serializable handle; the component reads it with `$fromHandle()`, without naming the query again.'
section: Integrations
parent: integrations/tanstack-query
order: 7.5
v11: client/tanstack-react-query/handles
---

A route's loader, or a server component, decides when a page's queries start and whether the page waits for them. `trpc.post.byId.$ensure({ input })` starts a query and returns a handle for it: its key and input, no data and no functions, so it can be a loader's data, a server component's prop to a client component, or `getServerSideProps` props. The component reads the handle with `trpc.$fromHandle(handle)`, the same options `queryOptions()` would make, so it doesn't name the procedure or its input again.

## Make the helpers with a query client

The handle verbs start queries on a `QueryClient`, so they're on helpers made with one:

```ts twoslash
// ---cut-start---
import { QueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-react-query';
import { client } from './client.ts';
// ---cut-end---
export const queryClient = new QueryClient();
export const trpc = createTrpcQueryUtils({ client, queryClient });
```

`queryClient` can also be a function that returns one, such as a server's per-request client; [`createTrpcRsc`](../rsc.md) passes its own. Helpers without one, like `useTrpc()`'s, read handles but don't make them: `$ensure` isn't in their type.

## Ensure in the loader, read in the component

```tsx twoslash
// ---cut-start---
import { QueryClient, useSuspenseQuery } from '@tanstack/react-query';
import {
  createTrpcQueryUtils,
  type inferQueryHandle,
} from '@trpc12/tanstack-react-query';
import { client } from './client.ts';
const queryClient = new QueryClient();
const trpc = createTrpcQueryUtils({ client, queryClient });
// ---cut-end---
// A route's loader (TanStack Router, React Router, …): the page waits for the post
export async function loader(opts: { params: { id: string } }) {
  return {
    post: await trpc.post.byId.$ensure({ input: { id: opts.params.id } }),
  };
}

// Its component
function Post(props: { post: inferQueryHandle<typeof trpc.post.byId> }) {
  const post = useSuspenseQuery(trpc.$fromHandle(props.post));
  return <h1>{post.data.title}</h1>;
  //                ^?
}
```

The component stays subscribed to the query: an invalidation or a `setQueryData` re-renders it with the new data. `inferQueryHandle<typeof trpc.post.byId>` is the handle's type, for a prop; a router's `useLoaderData()` types it already.

## The verbs

Each takes `queryOptions()`'s bag, `input` and `context`, plus the TanStack options a fetch uses (`staleTime`, `gcTime`, `retry`, `retryDelay`, `meta`), and returns the same handle:

- `$ensure()` waits until the cache has data for the query, however old, so the page renders with it. Stale data refetches in the background. It rejects with the procedure's typed error when the fetch fails.
- `$prefetch()` starts the query and returns the handle right away: the page renders, and the component reading it suspends until the data arrives. It never throws: an error surfaces where the handle is read, at the nearest error boundary.
- `$fetch()` is `$ensure()` that also waits for stale data to refetch.

`$fromHandle(handle, opts)` takes `queryOptions()`'s TanStack options too (`select`, `staleTime`, `placeholderData`, …) and `context`, and works with every hook that takes options, with an [error boundary](./error-boundaries.md)'s `query()`, and in every adapter. Every router has it, so `trpc.post.$fromHandle(handle)` reads a handle of any procedure.

```tsx twoslash
// ---cut-start---
import { QueryClient, useSuspenseQuery } from '@tanstack/react-query';
import {
  createTrpcQueryUtils,
  type inferQueryHandle,
} from '@trpc12/tanstack-react-query';
import { client } from './client.ts';
const queryClient = new QueryClient();
const trpc = createTrpcQueryUtils({ client, queryClient });
// ---cut-end---
export function loader() {
  // Not waited for: <Posts> suspends until the list arrives
  return { posts: trpc.post.list.$prefetch({ staleTime: 30_000 }) };
}

function Posts(props: { posts: inferQueryHandle<typeof trpc.post.list> }) {
  const titles = useSuspenseQuery(
    trpc.$fromHandle(props.posts, {
      select: (posts) => posts.map((post) => post.title),
    }),
  );
  return <p>{titles.data.join(', ')}</p>;
  //                ^?
}
```

## Serializable

A handle is `{ queryKey, input }`, and the key carries the input too, so `JSON.stringify` keeps everything `$fromHandle()` needs. A procedure without input has a handle without an `input` key, since Next.js rejects `undefined` in `getServerSideProps` and `getStaticProps` props. An input the [transformer](../../server/transformers.md) keeps (a `Date`, a `Map`) needs a serializer that keeps it too, as React's server components and TanStack Router's loaders do.

The data travels apart from the handle: by [hydration](./hydration.md) from a server, or in the same `QueryClient` for a browser loader.

## Details

- With `keyPrefix`, a handle's key carries the prefix, and helpers with a `keyPrefix` refuse a handle without theirs.
- Infinite queries have no handles yet: their `input` is a function, which a handle can't carry. Start them with `queryClient.infiniteQuery(trpc.post.list.infiniteOptions(…))` and read them with the same options.
- v11's `unstable_$prefetch(input, opts)` and friends are `$prefetch({ input, ...opts })`; the [codemod](../../migrations/from-v11/codemod.md) leaves a note on each.
