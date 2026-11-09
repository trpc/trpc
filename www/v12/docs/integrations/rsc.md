---
title: React Server Components
description: Prefetch in server components, stream pending queries to the browser, and tag Next's data cache by query key.
section: Integrations
parent: integrations/react
order: 1
v11: client/tanstack-react-query/server-components
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

A page ensures its queries with the request's query client and passes their [handles](./tanstack-query/handles.md) to client components, which read them with `$fromHandle()`:

```tsx twoslash
// ---cut-start---
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  createTrpcContext,
  type inferQueryHandle,
} from '@trpc12/tanstack-react-query';
import { createTrpcRsc } from '@trpc12/tanstack-react-query/rsc';
import { appRouter, type AppRouter } from './server.ts';
const rsc = createTrpcRsc({
  router: appRouter,
  ctx: { user: null },
});
const trpc = rsc.trpc;
const HydrationBoundary = rsc.HydrationBoundary;
const [, useTrpc] = createTrpcContext<AppRouter>();
// ---cut-end---
// app/post/[id]/page.tsx
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const post = await trpc.post.byId.$ensure({ input: { id: params.id } });
  return (
    <HydrationBoundary>
      <Post post={post} />
    </HydrationBoundary>
  );
}

// app/post/[id]/post.tsx, a client component ('use client')
function Post(props: { post: inferQueryHandle<typeof trpc.post.byId> }) {
  const trpc = useTrpc();
  const post = useSuspenseQuery(trpc.$fromHandle(props.post));
  return <h1>{post.data.title}</h1>;
}
```

- `ctx` and the query client are memoized per request with React's `cache()`.
- `HydrationBoundary` dehydrates the request's queries, pending ones included, so they stream in. The browser's `QueryClient` needs `defaultOptions: hydrationOptions({ client })` ([Hydration](./tanstack-query/hydration.md)).
- `trpc.post.byId.$prefetch({ input })` returns the handle without waiting, so the page streams and the component suspends until the query arrives. Read it with `useSuspenseQuery`: with `useQuery`, the server can render the loading state while the browser already has the data, and React reports a hydration mismatch. For a component on `useQuery`, `await` `$ensure()`. If the router declares a [transformer](../server/transformers.md), `createTrpcRsc` requires the same one as `transformer`, so `Date`s and custom types survive.
- Infinite queries have no handles yet: `prefetch(trpc.post.list.infiniteOptions(…))` fetches the first page, for `useSuspenseInfiniteQuery` with the same options.
- `await getQueryClient().query(…)` reads data in the server component itself. `caller` calls the router without the cache.
- A pending query that later fails is redacted in the dehydrated state, unless its error has a `digest`: Next has to see those to detect dynamic rendering. Set `dehydrate.shouldRedactErrors` on your `makeQueryClient` to change that.

## Next.js data cache

`cacheTags(key)` turns a query key into data-cache tags, broad to narrow: `trpc`, each path prefix (`trpc:post`, `trpc:post.byId`), then the path with its input (`trpc:post.byId:{"id":"1"}`, keys sorted). `revalidationTag(key)` is the one tag that covers a key, so revalidating works like `invalidateQueries`. Both come from `@trpc12/tanstack-query` and every framework package; in server components and Server Actions, import them from `@trpc12/tanstack-react-query/rsc`, since the package root imports React's client hooks.

Tag a `'use cache'` function (Next's `cacheComponents: true`) that reads through `caller`, then revalidate after a write:

```ts twoslash
// ---cut-start---
import { createTrpcRsc } from '@trpc12/tanstack-react-query/rsc';
import { appRouter } from './server.ts';
const rsc = createTrpcRsc({
  router: appRouter,
  ctx: { user: null },
});
const trpc = rsc.trpc;
const caller = rsc.caller;
declare const id: string;
// ---cut-end---
import { cacheLife, cacheTag, revalidateTag, updateTag } from 'next/cache';
import { cacheTags, revalidationTag } from '@trpc12/tanstack-react-query/rsc';

async function getPost(id: string) {
  'use cache';
  cacheLife('max');
  cacheTag(...cacheTags(trpc.post.byId.queryKey({ input: { id } })));
  return caller.post.byId.query({ id });
}

// in a Server Action, after a write: the refreshed page waits for fresh data
updateTag(revalidationTag(trpc.post.byId.queryKey({ input: { id } }))); // that post
updateTag(revalidationTag(trpc.post.pathKey())); // every post.* call

// in a route handler or webhook: stale-while-revalidate
revalidateTag(revalidationTag(trpc.post.pathKey()), 'max');
```

- Next keys a `'use cache'` result by the function's arguments, not by the request, so one cached result serves every user. Cache calls whose result is the same for everyone, or make what the result depends on (the user's id, say) an argument of the cached function and pass it on in the input, rather than reading it from `ctx`.
- `updateTag` only works in Server Actions. A write that goes through the tRPC route handler doesn't revalidate anything by itself, so cached pages keep the old data until something revalidates their tags.
- An input whose tag would be longer than Next's 256 characters gets no tag of its own; it revalidates with its path.

The [`examples/next-app`](../../../../v12/examples/next-app) guestbook puts these together: [`guestbook.tsx`](../../../../v12/examples/next-app/src/app/guestbook/guestbook.tsx) caches the list under `cacheTags`, and the [Server Action](./server-actions.md) in [`actions.ts`](../../../../v12/examples/next-app/src/app/guestbook/actions.ts) calls `updateTag(revalidationTag(trpc.guestbook.pathKey()))` after signing.
