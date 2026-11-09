---
title: How should an infinite query get a serializable handle, now that its input is a function?
summary: 'Query handles shipped as `$ensure()` and `$fromHandle()`; infinite queries take `input: (pageParam) => input`, which a handle cannot carry.'
area: tanstack
recommended: C
questions: [Q19.3]
links:
  - kind: decision
    label: tanstack-query-handles
    url: ../decisions/tanstack-query-handles.md
  - kind: decision
    label: tanstack-option-bag
    url: ../decisions/tanstack-option-bag.md
  - kind: docs
    label: Handles
    url: https://v12.trpc.io/v12/docs/integrations/tanstack-query/handles
  - kind: code
    label: v11's handles.ts
    url: ../../../v11/packages/tanstack-react-query/src/unstable-handles/handles.ts
---

# How should an infinite query get a serializable handle, now that its input is a function?

## Why it matters

v12 has query handles: a loader or server component calls `trpc.post.byId.$ensure({ input })` and the component reads `trpc.$fromHandle(handle)`, without naming the query twice ([`tanstack-query-handles.md`](../decisions/tanstack-query-handles.md)). v11 had infinite handles too (`unstable_$ensureInfinite`), built on its `cursor` input convention. v12 dropped that convention: `infiniteOptions()` takes `input: (pageParam) => input` (Q19.3, [`tanstack-option-bag.md`](../decisions/tanstack-option-bag.md)), and a function can't be part of a handle that crosses to the browser or into a loader's data. So infinite lists still name their options in both the loader and the component.

## Options

### A) No infinite handles

Loaders start the first page with `queryClient.infiniteQuery()` and the component builds the same `infiniteOptions()` again.

```tsx twoslash
// ---cut-start---
import { QueryClient, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { db, t } from './server.ts';
const router = t.router({
  post: {
    feed: t.procedure
      .input(z.object({ limit: z.number(), cursor: z.string().optional() }))
      .query(() => ({
        items: db.post.list(),
        nextCursor: undefined as string | undefined,
      })),
  },
});
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
const queryClient = new QueryClient();
const trpc = createTrpcQueryUtils({ client });
// ---cut-end---
const feed = () =>
  trpc.post.feed.infiniteOptions({
    input: (cursor: string | undefined) => ({ limit: 10, cursor }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor,
  });

// the loader
await queryClient.infiniteQuery(feed());
// the component
const posts = useSuspenseInfiniteQuery(feed());
```

- ✅ Nothing new; the options stay the one way to describe an infinite query
- ❌ The loader and the component share a function (or repeat the options), which a server component and a client component can't

### B) The reader passes the input function again

`$ensureInfinite()` takes `infiniteOptions()`'s options; the handle keeps the first page's input and page param, and `$fromHandle()` needs the input function and `getNextPageParam` again.

```tsx twoslash
// ---cut-start---
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { trpcB as trpc } from '../open/tanstack-infinite-handles.ts';
// ---cut-end---
// the loader
const feed = await trpc.post.feed.$ensureInfinite({
  input: (cursor: string | undefined) => ({ limit: 10, cursor }),
  initialPageParam: undefined,
  getNextPageParam: (last) => last.nextCursor,
});
// the component
const posts = useSuspenseInfiniteQuery(
  trpc.$fromHandle(feed, {
    input: (cursor) => ({ limit: 10, cursor }),
    getNextPageParam: (last) => last.nextCursor,
  }),
);
```

- ✅ Keeps Q19.3's input function, whatever shape the procedure's input has
- ❌ The component restates the input, so a handle saves little; a different function than the loader's reads another key and refetches

### C) The handle carries the input without its page param, and names the key the page param goes under

`$ensureInfinite({ input, pageParam: 'cursor' })` takes the input without the page param and the input key it goes under; `$fromHandle()` rebuilds `(pageParam) => ({ ...input, cursor: pageParam })` and needs only `getNextPageParam`, a function. `pages` loads several pages up front, as v11's did.

```tsx twoslash
// ---cut-start---
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { trpcC as trpc } from '../open/tanstack-infinite-handles.ts';
// ---cut-end---
// the loader
const feed = await trpc.post.feed.$ensureInfinite({
  input: { limit: 10 },
  pageParam: 'cursor',
  getNextPageParam: (last) => last.nextCursor,
});
// the component
const posts = useSuspenseInfiniteQuery(
  trpc.$fromHandle(feed, { getNextPageParam: (last) => last.nextCursor }),
);
```

- ✅ The component reads the list without knowing its input, like a query handle
- ✅ Opt-in per call: `infiniteOptions()` keeps its input function
- ❌ Brings back a page-param key in the input for handles, the coupling Q19.3 removed; a procedure whose page param isn't one top-level input key can't have a handle
- ❌ `getNextPageParam` is still passed twice, since it's a function

## Recommendation

**C.** It is v11's behaviour without v11's fixed `cursor` name, and only for handles: a loader-to-component list is the case handles exist for, and B's handle doesn't spare the component the input. The page-param key is checked against the input's type.

## Blocked until answered

- Infinite handles (`$prefetchInfinite()`, `$ensureInfinite()`, `$fetchInfinite()`) and the docs' infinite-list loaders. Query handles shipped without them; the codemod's notes send v11's infinite verbs to `infiniteOptions()`.
