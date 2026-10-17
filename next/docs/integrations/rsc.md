---
title: React Server Components
description: Prefetch in server components, stream pending queries to the browser, and tag Next's data cache by query key.
section: Integrations
order: 3
---

`createTrpcRsc` from `@trpc12/tanstack-react-query/rsc` gives server components query helpers over the router itself, a per-request query client, and a server `HydrationBoundary`:

```ts
// trpc/server.ts
import 'server-only';
import { createTrpcRsc } from '@trpc12/tanstack-react-query/rsc';

export const { trpc, caller, getQueryClient, prefetch, HydrationBoundary } =
  createTrpcRsc({
    router: appRouter,
    ctx: createContext, // called once per request
  });
```

```tsx
// app/post/[id]/page.tsx
export default async function Page({ params }) {
  prefetch(trpc.post.byId.queryOptions({ input: { id: params.id } }));
  return (
    <HydrationBoundary>
      <Post id={params.id} /> {/* a client component using useSuspenseQuery */}
    </HydrationBoundary>
  );
}
```

- `ctx` and the query client are memoized per request with React's `cache()`.
- `HydrationBoundary` dehydrates the request's queries, pending ones included, so they stream in. The browser's `QueryClient` needs `defaultOptions: hydrationOptions({ client })` ([Hydration](./tanstack-query.md#hydration)). Read a prefetch you don't `await` with `useSuspenseQuery`: with `useQuery`, the server can render the loading state while the browser already has the data, and React reports a hydration mismatch. For a component on `useQuery`, wait for the data instead: `await getQueryClient().query(…)`. If the router declares a [serializer](../server/serializers.md), `createTrpcRsc` requires the same one as `serializer`, so `Date`s and custom types survive.
- `await getQueryClient().query(…)` reads data in the server component itself. `caller` calls the router without the cache.
- A pending query that later fails is redacted in the dehydrated state, unless its error has a `digest`: Next has to see those to detect dynamic rendering. Set `dehydrate.shouldRedactErrors` on your `makeQueryClient` to change that.

## Next.js data cache

`cacheTags(key)` from `@trpc12/tanstack-query` (re-exported by the framework packages) turns a query key into data-cache tags, broad to narrow: `trpc`, each path prefix (`trpc:post`, `trpc:post.byId`), then the path with its input (`trpc:post.byId:{"id":"1"}`, keys sorted). `revalidationTag(key)` is the one tag that covers a key, so revalidating works like `invalidateQueries`:

```ts
import { cacheTag, revalidateTag } from 'next/cache';
import { cacheTags, revalidationTag } from '@trpc12/tanstack-react-query';

async function getPost(id: string) {
  'use cache';
  cacheTag(...cacheTags(trpc.post.byId.queryKey({ input: { id } })));
  return caller.post.byId({ id });
}

// in a Server Action, after a write
revalidateTag(revalidationTag(trpc.post.byId.queryKey({ input: { id } }))); // that post
revalidateTag(revalidationTag(trpc.post.pathKey())); // every post.* call
```

An input whose tag would be longer than Next's 256 characters gets no tag of its own; it revalidates with its path.

The [`examples/next-app`](../../examples/next-app) app puts these together with [Server Actions](./server-actions.md).
