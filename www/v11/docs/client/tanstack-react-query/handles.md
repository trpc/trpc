---
id: handles
title: Prefetching with handles
sidebar_label: Prefetching with handles
slug: /client/tanstack-react-query/handles
section: "Client Usage"
parent: "client/tanstack-react-query"
order: 53
---

Handles help you avoid request waterfalls. The loader, or server component, **reads the URL once**, starts every query the page needs, and passes each component a reference to its query as a prop.

- A **handle** is a query's key and input. It holds no data.
- The component reads the query from it, fully typed, without naming the procedure or repeating its input.
- The client reads exactly the query the server started. With plain `queryOptions`, an input that differs by a typo misses the prefetch and fetches again, silently.

:::info
The handle APIs are plain functions from `@trpc/tanstack-react-query/unstable-handles`. The `unstable-` in the path means they're new and may change, but you're safe to use them! [Read more](/docs/faq#unstable).
:::

```twoslash include handles-router
// @jsx: react-jsx
// @target: esnext
// @module: esnext
// @paths: {"~/*": ["./src/*", "./src/app/*"]}
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export type Post = { id: string; title: string; authorId: string };

export const appRouter = t.router({
  viewer: t.procedure.query(() => ({ id: 'u1', name: 'Alex' })),
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }): Post => ({ id: input.id, title: 'Hello', authorId: 'u1' })),
    byAuthor: t.procedure
      .input(
        z.object({
          authorId: z.string(),
          cursor: z.number().nullish(),
        }),
      )
      .query(() => ({
        items: [] as Post[],
        nextCursor: null as number | null,
      })),
    comments: t.procedure
      .input(
        z.object({
          postId: z.string(),
          limit: z.number().optional(),
          cursor: z.number().nullish(),
        }),
      )
      .query(() => ({
        items: [] as { id: string; text: string }[],
        nextCursor: null as number | null,
      })),
    addComment: t.procedure
      .input(z.object({ postId: z.string(), text: z.string() }))
      .mutation(({ input }) => ({ id: 'c1', text: input.text })),
  }),
});
export type AppRouter = typeof appRouter;
```

```twoslash include handles-trpc
// @filename: trpc/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30 * 1000 } },
  });
}

// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '~/server/router';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

// @filename: trpc/server.tsx
import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '~/server/router';
import { makeQueryClient } from './query-client';

export const getQueryClient = cache(makeQueryClient);
export const trpc = createTRPCOptionsProxy({
  ctx: {},
  router: appRouter,
  queryClient: getQueryClient,
});
export const HydrateClient = unstable_createHydrateClient(getQueryClient);
```

```twoslash include handles-components
// @filename: components/post.tsx
import { useSuspenseQuery } from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: components/comments.tsx
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages</p>;
}

// @filename: components/more-by-author.tsx
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useTRPC } from '~/trpc/client';

export function MoreByAuthor(props: { authorId: string }) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseInfiniteQuery(
    trpc.post.byAuthor.infiniteQueryOptions(
      { authorId: props.authorId },
      { getNextPageParam: (last) => last.nextCursor },
    ),
  );
  return (
    <ul>
      {postsQuery.data.pages.flatMap((page) =>
        page.items.map((post) => <li key={post.id}>{post.title}</li>),
      )}
    </ul>
  );
}
```

A post page at `/posts/$id` reads `id` from the URL and loads its queries in one call:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: loader.ts
import { trpc } from '~/trpc/server';
declare const id: string;
// ---cut---
import {
  ensureEntry,
  loadHandles,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';

const [handles] = await loadHandles(trpc, {
  // 1. The post: the load waits for it
  post: ensureEntry(trpc.post.byId, { id }),
  // 2. Its comments: start at the same time, and stream in later
  comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
});
```

The page reads the handles:

```tsx twoslash
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @filename: post-page.tsx
import type { inferInfiniteQueryHandle, inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';
// ---cut---
import { useSuspenseQuery } from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { Comments } from '~/components/comments';
import { MoreByAuthor } from '~/components/more-by-author';
import { useTRPC } from '~/trpc/client';

export function PostPage(props: {
  post: inferQueryHandle<TRPC['post']['byId']>;
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));

  return (
    <article>
      <h1>{postQuery.data.title}</h1>
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments comments={props.comments} />
      </Suspense>
      {/* 3. More by the author: needs the post's authorId */}
      <Suspense fallback={<p>Loading more by this author…</p>}>
        <MoreByAuthor authorId={postQuery.data.authorId} />
      </Suspense>
    </article>
  );
}
```

- More by the author needs the post's `authorId`, which isn't in the URL, so it starts once the post has loaded: see [Dependent queries](#dependent-queries).
- The data reaches the browser's cache through TanStack Query's dehydrate and hydrate: see [Next.js](#nextjs-app-router), [TanStack Start](/docs/client/tanstack-react-query/tanstack-start) or [React Router](#react-router).
- Components that read handles are the same whatever loaded the handle.
- Mutations don't change. To refetch a handle's query after one, invalidate `{ queryKey: handle.queryKey, exact: true }`.

## Loading handles {#starting-a-query}

`loadHandles(trpc, entries)` starts every entry, then resolves to `[handles, data]`:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
// @errors: 2339
import { trpc } from '~/trpc/server';
declare const id: string;
// ---cut---
import {
  ensureEntry,
  loadHandles,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';

const [handles, data] = await loadHandles(trpc, {
  // Waits for the post, unless the cache has it
  post: ensureEntry(trpc.post.byId, { id }),
  // Doesn't wait
  comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
});
handles.post;
//      ^?
data.post;
//   ^?
// The comments may have no data yet, so they aren't on `data`
data.comments;
```

- Building an entry starts nothing. The load starts every entry before it waits for any, so their order doesn't matter.
- `handles` has a handle for each entry. Return it from the loader, or pass it on as props.
- Don't call `loadHandles` during render. A component that renders before anything loaded its query reads it with `useSuspenseQuery(trpc.x.queryOptions(input))`.

#### Using the data in a loader {#loader-data}

`data` has the data of the entries the load waited for. Use it for the page title, a redirect or a not-found check. Return `handles`, not `data`, so the data doesn't cross to the browser twice.

#### Waiting for some, streaming others {#combining-both}

List every query in one load, whether the page waits for it or not. They all start together. A second load waits for everything the first one waited for, so use one only for [dependent queries](#dependent-queries).

Each entry chooses whether the page waits for its query:

|                        | `prefetchEntry`                   | `ensureEntry`                                 | `fetchEntry`          |
| ---------------------- | --------------------------------- | --------------------------------------------- | --------------------- |
| Page waits for data    | No                                | Yes                                           | Yes                   |
| In `data`              | No                                | Yes                                           | Yes                   |
| With stale data        | Refetches in the background       | Resolves at once, refetches in the background | Waits for the refetch |
| Reader's first render  | Loading state, or cached data     | The data                                      | The data              |
| When the request fails | The reader gets the error         | The load rejects, unless it had cached data   | The load rejects      |

```demo starting-queries
```

Load handles where the code can wait:

| Your app                       | Where                      | Proxy                                   |
| ------------------------------ | -------------------------- | --------------------------------------- |
| Next.js App Router             | Server components          | The server proxy from `trpc/server.tsx` |
| TanStack Start, TanStack Router | Route loaders             | The proxy in your router context        |
| React Router                   | `loader` or `clientLoader` | See [React Router](#react-router)       |
| A SPA without loaders          | Event handlers, such as a link's hover | `useTRPC()`                 |

#### Conditional queries {#conditional-queries}

Put TanStack Query's `skipToken` in place of an entry to start nothing for it. Here, a post page loads its comments only when the URL opens the comments tab, `/posts/1?tab=comments`:

```tsx twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: routes/post.tsx
import { createRootRouteWithContext, createRoute } from '@tanstack/react-router';
import type { TRPC } from '~/trpc/client';
const rootRoute = createRootRouteWithContext<{ trpc: TRPC }>()();
// ---cut---
import { skipToken } from '@tanstack/react-query';
import {
  ensureEntry,
  loadHandles,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { z } from 'zod';

export const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts/$id',
  validateSearch: z.object({
    tab: z.enum(['post', 'comments']).default('post'),
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ context: { trpc }, params: { id }, deps }) => {
    const [handles] = await loadHandles(trpc, {
      post: ensureEntry(trpc.post.byId, { id }),
      comments:
        deps.tab === 'comments'
          ? prefetchInfiniteEntry(trpc.post.comments, { postId: id })
          : skipToken,
    });
    handles.comments;
    //      ^?
    return handles;
  },
});
```

- Its handle is `undefined`, so render the reader only when there's a handle: `{handles.comments && <Comments comments={handles.comments} />}`.
- It has no key in `handles`, `data` or `loadHandlesSettled`'s results, so the handles still serialize as Next.js props.
- Take the condition from what the loader knows: the URL, as here, the session, or another load's data. See [Start every query from the URL](#url-as-input) and [Dependent queries](#dependent-queries).

#### TanStack Query equivalents {#tanstack-equivalents}

Each entry is one TanStack Query call:

| tRPC                                                                 | TanStack Query                                                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prefetchEntry(trpc.x, input, opts)`                                 | `void queryClient.prefetchQuery(trpc.x.queryOptions(input, opts))`                                                                                                       |
| `ensureEntry(trpc.x, input, opts)`                                   | `await queryClient.ensureQueryData({ ...trpc.x.queryOptions(input, opts), revalidateIfStale: true })`                                                                    |
| `fetchEntry(trpc.x, input, opts)`                                    | `await queryClient.fetchQuery(trpc.x.queryOptions(input, opts))`                                                                                                         |
| `prefetchInfiniteEntry`, `ensureInfiniteEntry`, `fetchInfiniteEntry` | `prefetchInfiniteQuery`, `ensureInfiniteQueryData` (with `revalidateIfStale: true`), `fetchInfiniteQuery`                                                                |
| `fromHandle(trpc, handle, opts)`                                     | `trpc.x.queryOptions(handle.input, opts)`, with `x` taken from the handle                                                                                                |

The `queryClient` is the one the proxy was created with. The entry names follow the TanStack Query method each one calls.

Options:

- `input` is optional when the procedure's is: `prefetchEntry(trpc.viewer)`.
- `opts` takes `staleTime`, `gcTime`, `retry`, `retryDelay`, `meta` and `trpc` request options. They apply to the load's request; readers use the options passed to `fromHandle`.

### `prefetchEntry`: don't wait {#prefetch}

- The page renders at once, and the data streams in.
- The reader shows cached data, or suspends. Give it its own `<Suspense>`, or the nearest boundary above shows its fallback, which may be the whole page.
- It never makes the load reject. The reader gets the error: see [Errors](#errors).
- Use it for slow queries, content below the fold and side panels.

### `ensureEntry`: wait {#ensure}

- The load waits until the cache has data, so the reader renders it at once.
- With cached data, even stale, it resolves at once and refetches in the background.
- It rejects only if the cache had no data and the request fails.
- Use it for data the page can't render without, or needs before rendering.

### `fetchEntry`: wait for fresh data {#fetch}

- Like `ensureEntry`, but with stale data it waits for the refetch.
- Use it when the loader reads the data and needs it fresh, such as for a redirect.
- In a browser loader, prefer `ensureEntry`: a fetch entry holds up the navigation until the refetch is done.
- TanStack Router shows a visited page with its last loader data while the loader reruns. To wait, set `defaultStaleReloadMode`, or a loader's [`staleReloadMode`](https://tanstack.com/router/latest/docs/guide/data-loading#choosing-background-vs-blocking-stale-reloads), to `'blocking'`.
- In server components, ensure and fetch behave the same: the request's `QueryClient` starts empty.

## Start every query from the URL {#url-as-input}

A loader runs before anything renders, and all it has is the URL: params, search params and, on the server, the session. If every input comes from those, every request starts with the navigation.

- **Path params** name the thing: `/posts/$slug`.
- **Search params** hold filters, sort and page. Keep them out of component state: a loader can't see it, the back button doesn't restore it, and a shared link loses it.

```demo url-input
/posts?sort=top&page=2  →  prefetchEntry(trpc.post.list, { sort: 'top', page: 2 })
```

With handles, they all start together. Without, each starts once the component above it renders:

```
With handles      Without
|-> post.byId     |-> post.byId
|-> post.comments   |-> post.comments
|-> post.byAuthor     |-> post.byAuthor
```

```demo waterfalls
```

### If the URL isn't enough, reshape the procedure {#reshape-procedures}

A procedure that takes an id from another query forces a waterfall on every page that calls it. Fix the procedure, not the page:

- **Take what the URL has.** Accept the slug and look up the id on the server.
- **Return the joined data.** Return the post with its author, not an author id.

The server sits next to the database, so the lookup costs a query there, not a round trip from the browser.

```twoslash include url-db
// @filename: db.ts
export type Post = { id: string; slug: string; title: string; authorId: string };
export type Author = { id: string; name: string };
export type Comment = { id: string; text: string };
export declare const db: {
  post: { bySlug(slug: string): Promise<Post> };
  author: { byId(id: string): Promise<Author> };
  comment: {
    list(opts: { postId: string; cursor: number | null }): Promise<{
      items: Comment[];
      nextCursor: number | null;
    }>;
  };
};

// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
export const t = initTRPC.create();
```

```twoslash include url-before
// @filename: before/router.ts
import { z } from 'zod';
import { db } from '../db';
import { t } from '../trpc';

export const appRouter = t.router({
  post: t.router({
    bySlug: t.procedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => db.post.bySlug(input.slug)),
    comments: t.procedure
      .input(z.object({ postId: z.string(), cursor: z.number().nullish() }))
      .query(({ input }) =>
        db.comment.list({ postId: input.postId, cursor: input.cursor ?? null }),
      ),
  }),
  author: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => db.author.byId(input.id)),
  }),
});

// @filename: before/server.ts
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { appRouter } from './router';

export const queryClient = new QueryClient();
export const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient });
```

```twoslash include url-after
// @filename: after/router.ts
import { z } from 'zod';
import { db } from '../db';
import { t } from '../trpc';

export const appRouter = t.router({
  post: t.router({
    bySlug: t.procedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const post = await db.post.bySlug(input.slug);
        return { ...post, author: await db.author.byId(post.authorId) };
      }),
    comments: t.procedure
      .input(z.object({ slug: z.string(), cursor: z.number().nullish() }))
      .query(async ({ input }) => {
        const post = await db.post.bySlug(input.slug);
        return db.comment.list({ postId: post.id, cursor: input.cursor ?? null });
      }),
  }),
});

// @filename: after/server.ts
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { appRouter } from './router';

export const queryClient = new QueryClient();
export const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient });
```

**Before:** the comments and the author need ids that only the post has.

```ts twoslash title='The loader for /posts/$slug'
// @include: url-db
// @include: url-before
// @filename: before-loader.ts
import { trpc } from './before/server';
import { loadHandles, prefetchEntry, ensureEntry, prefetchInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';
// ---cut---
async function loader(params: { slug: string }) {
  const [first, { post }] = await loadHandles(trpc, {
    post: ensureEntry(trpc.post.bySlug, { slug: params.slug }),
  });
  // Nothing below can start until the post has arrived
  const [second] = await loadHandles(trpc, {
    comments: prefetchInfiniteEntry(trpc.post.comments, {
      postId: post.id,
    }),
    author: prefetchEntry(trpc.author.byId, { id: post.authorId }),
  });
  return { ...first, ...second };
}
```

```
post.bySlug     |-------|
post.comments           |-------|
author.byId             |-------|
```

**After:** `post.comments` takes the slug, and `post.bySlug` returns the author:

```ts twoslash title='server/routers/_app.ts'
// @include: url-db
// @filename: after-router.ts
// ---cut---
import { z } from 'zod';
import { db } from './db';
import { t } from './trpc';

export const appRouter = t.router({
  post: t.router({
    bySlug: t.procedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const post = await db.post.bySlug(input.slug);
        return { ...post, author: await db.author.byId(post.authorId) };
      }),
    comments: t.procedure
      .input(
        z.object({ slug: z.string(), cursor: z.number().nullish() }),
      )
      .query(async ({ input }) => {
        const post = await db.post.bySlug(input.slug);
        return db.comment.list({
          postId: post.id,
          cursor: input.cursor ?? null,
        });
      }),
  }),
});
```

```ts twoslash title='The loader for /posts/$slug'
// @include: url-db
// @include: url-after
// @filename: after-loader.ts
import { trpc } from './after/server';
import { loadHandles, ensureEntry, prefetchInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';
// ---cut---
async function loader(params: { slug: string }) {
  // Both start from the URL, together
  const [handles] = await loadHandles(trpc, {
    comments: prefetchInfiniteEntry(trpc.post.comments, {
      slug: params.slug,
    }),
    post: ensureEntry(trpc.post.bySlug, { slug: params.slug }),
  });
  return handles;
}
```

```
post.bySlug     |-------|
post.comments   |-------|
```

## Reading a handle {#reading-a-handle}

`fromHandle(trpc, handle, opts?)` returns `trpc.<path>.queryOptions(handle.input, opts)`, or `infiniteQueryOptions` for an infinite handle. Pass it to any TanStack Query hook:

```tsx twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: reading.tsx
import {
  useQuery,
  useSuspenseQueries,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';
type PostHandle = inferQueryHandle<TRPC['post']['byId']>;
declare const props: { post: PostHandle; a: PostHandle; b: PostHandle };
// ---cut---
const trpc = useTRPC();
const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
const titleQuery = useQuery(fromHandle(trpc, props.post, { select: (post) => post.title }));
const [aQuery, bQuery] = useSuspenseQueries({
  queries: [fromHandle(trpc, props.a), fromHandle(trpc, props.b)],
});
```

- Only `loadHandles` makes handles. A hand-written object doesn't type-check, and `fromHandle` throws on it.
- `handle.input` is the typed input. It leaves out `cursor` and `direction`.
- Reads share cache entries with `trpc.<path>.queryOptions(input)`.
- `handle.queryKey` carries no data type, so the handle stays serializable. For a typed key, use `fromHandle(trpc, handle).queryKey` or `trpc.post.byId.queryKey(handle.input)`.

#### Typing props {#typing-props}

Type props with `inferQueryHandle<TRPC['post']['byId']>`, or `inferInfiniteQueryHandle` for an infinite handle. Export `type TRPC = TRPCOptionsProxy<AppRouter>` from `trpc/client.tsx` once.

#### Reading with `useQuery` {#use-query}

With `useQuery`, no `Suspense` boundary is needed:

- It renders `status: 'pending'` until the data arrives, and `'success'` at once after an ensure or fetch entry.
- With server rendering, read a prefetch entry's handle with `useSuspenseQuery`. Otherwise the server can render the loading state while the browser has the data, a hydration mismatch ([TanStack/query#9399](https://github.com/TanStack/query/issues/9399)).

To change the input in the component, for a search term the URL can't hold, call the procedure and start from the handle's input:

```tsx
const [term, setTerm] = useState(props.comments.input.term);
const commentsQuery = useSuspenseInfiniteQuery(
  trpc.post.comments.infiniteQueryOptions(
    { ...props.comments.input, term: useDeferredValue(term) },
    { getNextPageParam: (last) => last.nextCursor },
  ),
);
```

- While the input matches the handle's, it reads the loader's cache entry.
- Render `<Comments key={postId} … />`, so a new post resets the term.
- For sort and filters, use a [search param](#url-as-input) instead.

## When the cache loses the data {#cache-loses-data}

A handle carries no data, and the cache can lose it even after an ensure entry:

- `resetQueries()` clears it and refetches at once.
- `removeQueries()` and `clear()`, such as on logout, drop it. The reader loads it again when it next renders.
- After `gcTime` unused, TanStack Query drops it.
- `invalidateQueries()` keeps it and refetches in the background, so nothing shows a loading state.

So give every reader a loading state: a `Suspense` boundary, or a `'pending'` case.

## Infinite queries {#infinite-queries}

For procedures with a `cursor` input, use `prefetchInfiniteEntry`, `ensureInfiniteEntry` and `fetchInfiniteEntry`. They load one page, or more with `pages`:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
import { loadHandles, ensureInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';
declare const id: string;
// ---cut---
const [handles, data] = await loadHandles(trpc, {
  comments: ensureInfiniteEntry(
    trpc.post.comments,
    { postId: id, limit: 20 },
    { pages: 3, getNextPageParam: (last) => last.nextCursor },
  ),
});
data.comments.pages;
//            ^?
```

- `pages` applies only when the cache has no pages for the query.
- Functions can't cross to the client, so pass `getNextPageParam` again when you read:

  ```ts
  fromHandle(trpc, props.comments, { getNextPageParam: (last) => last.nextCursor })
  ```

- Also pass it to entries in loaders that run in the browser. Refetching stale pages needs it from page two on.
- Type props with `inferInfiniteQueryHandle`.

## Dependent queries {#dependent-queries}

A query whose input comes from another query's result is a waterfall. Each step costs a round trip. First try to [reshape the procedure](#reshape-procedures). If you can't, there are two ways, and both pay the round trip.

#### In a loader {#waterfall-in-a-loader}

Load the first query, then build the second load from its `data`:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
import { loadHandles, ensureEntry, prefetchInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';
declare const id: string;
// ---cut---
const [first, { post }] = await loadHandles(trpc, {
  post: ensureEntry(trpc.post.byId, { id }),
  comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
});
const [second] = await loadHandles(trpc, {
  moreByAuthor: prefetchInfiniteEntry(trpc.post.byAuthor, {
    authorId: post.authorId,
  }),
});
const handles = { ...first, ...second };
```

#### In a component {#waterfall-in-a-component}

Read it in the component that gets the input, as `MoreByAuthor` does at the top:

```tsx twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: more-by-author.tsx
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useTRPC } from '~/trpc/client';
declare const authorId: string;
function MoreByAuthor() {
const trpc = useTRPC();
// ---cut---
const postsQuery = useSuspenseInfiniteQuery(
  trpc.post.byAuthor.infiniteQueryOptions(
    { authorId },
    { getNextPageParam: (last) => last.nextCursor },
  ),
);
// ---cut-after---
}
```

- In TanStack Router, `beforeLoad` can wait for the first query before the loader runs: see [TanStack Start](/docs/client/tanstack-react-query/tanstack-start#before-load).

## React Router {#react-router}

**Client-only apps** ([SPA Mode](https://reactrouter.com/how-to/spa) or [Data Mode](https://reactrouter.com/start/modes#data)): loaders run in the browser. Create the `QueryClient` and proxy in a module and provide the same client to your app:

```twoslash include rr-types
// @filename: react-router.d.ts
import 'react-router';

declare module 'react-router' {
  interface Register {
    pages: { '/': { params: {} }; '/posts/:id': { params: { id: string } } };
    routeFiles: {
      'root.tsx': { id: 'root'; page: '/' | '/posts/:id' };
      'routes/post.tsx': { id: 'routes/post'; page: '/posts/:id' };
    };
  }
}

// @filename: app/routes/+types/post.ts
import type { GetAnnotations, GetInfo } from 'react-router/internal';

type Module = typeof import('../post');
type Info = GetInfo<{ file: 'routes/post.tsx'; module: Module }>;
type Annotations = GetAnnotations<
  Info & { module: Module; matches: [{ id: 'routes/post'; module: Module }] }
>;

export namespace Route {
  export type LoaderArgs = Annotations['LoaderArgs'];
  export type ClientLoaderArgs = Annotations['ClientLoaderArgs'];
  export type ComponentProps = Annotations['ComponentProps'];
}
```

```twoslash include rr-root-types
// @filename: app/+types/root.ts
import type { GetAnnotations, GetInfo } from 'react-router/internal';

type Module = typeof import('../root');
type Info = GetInfo<{ file: 'root.tsx'; module: Module }>;
type Annotations = GetAnnotations<
  Info & { module: Module; matches: [{ id: 'root'; module: Module }] }
>;

export namespace Route {
  export type MiddlewareFunction = Annotations['MiddlewareFunction'];
}
```

```twoslash include rr-ssr-trpc
// @filename: app/trpc/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30 * 1000 } },
  });
}

// @filename: app/trpc/server.ts
import type { QueryClient } from '@tanstack/react-query';
import {
  createTRPCOptionsProxy,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import { createContext } from 'react-router';
import { appRouter, type AppRouter } from '~/server/router';
import { makeQueryClient } from './query-client';

export const trpcContext = createContext<{
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
}>();

export function createServerTRPC() {
  const queryClient = makeQueryClient();
  const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient });
  return { queryClient, trpc };
}
```

```ts twoslash title='app/trpc.ts'
// @include: handles-router
// @filename: app/trpc.ts
// ---cut---
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '~/server/router';

// Only in a client-only app: with server rendering, every request would share it
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});
export const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc' })],
});
export const trpc = createTRPCOptionsProxy({ client: trpcClient, queryClient });
```

```tsx twoslash title='app/routes/post.tsx'
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @include: rr-types
// @filename: app/trpc.ts
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '~/server/router';

export const queryClient = new QueryClient();
export const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc' })],
});
export const trpc = createTRPCOptionsProxy({ client: trpcClient, queryClient });
// @filename: app/routes/post.tsx
// ---cut---
import { Suspense } from 'react';
import { Comments } from '~/components/comments';
import { Post } from '~/components/post';
import { trpc } from '~/trpc';
import type { Route } from './+types/post';
import { loadHandles, ensureEntry, prefetchInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [handles] = await loadHandles(trpc, {
    comments: prefetchInfiniteEntry(trpc.post.comments, { postId: params.id, limit: 20 }),
    post: ensureEntry(trpc.post.byId, { id: params.id }),
  });
  return handles;
}

export default function PostPage({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <Post post={loaderData.post} />
      <Suspense key={loaderData.post.input.id} fallback={<p>Loading comments…</p>}>
        <Comments comments={loaderData.comments} />
      </Suspense>
    </>
  );
}
```

- Nothing to hydrate: the loader and the components share one `QueryClient`.
- In Data Mode, the same function is a route's `loader`, read with `useLoaderData`.
- Key `Suspense` boundaries by the route's input. Otherwise React Router's transition waits for the comments when moving between posts.

**Server rendering** ([Framework Mode](https://reactrouter.com/start/modes#framework)): create a query client and proxy per request in a root [middleware](https://reactrouter.com/how-to/middleware), return `dehydrate(queryClient)` with the handles, and wrap the page in `HydrationBoundary`:

```ts twoslash title='app/trpc/server.ts'
// @include: handles-router
// @filename: app/trpc/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export const makeQueryClient = () => new QueryClient();
// @filename: app/trpc/server.ts
// ---cut---
import type { QueryClient } from '@tanstack/react-query';
import {
  createTRPCOptionsProxy,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import { createContext } from 'react-router';
import { appRouter, type AppRouter } from '~/server/router';
import { makeQueryClient } from './query-client';

export const trpcContext = createContext<{
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
}>();

export function createServerTRPC() {
  const queryClient = makeQueryClient();
  const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient });
  return { queryClient, trpc };
}
```

```tsx twoslash title='app/root.tsx'
// @include: handles-router
// @include: handles-trpc
// @include: rr-root-types
// @include: rr-ssr-trpc
// @filename: app/root.tsx
// ---cut---
import { QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient } from '@trpc/client';
import { useState } from 'react';
import { Outlet } from 'react-router';
import type { AppRouter } from '~/server/router';
import { TRPCProvider } from '~/trpc/client';
import type { Route } from './+types/root';
import { makeQueryClient } from './trpc/query-client';
import { createServerTRPC, trpcContext } from './trpc/server';

export const middleware: Route.MiddlewareFunction[] = [
  ({ context }) => {
    context.set(trpcContext, createServerTRPC());
  },
];

export default function App() {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() => createTRPCClient<AppRouter>({ links: [/* ... */] }));
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <Outlet />
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

```tsx twoslash title='app/routes/post.tsx'
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @include: rr-types
// @include: rr-ssr-trpc
// @filename: app/routes/post.tsx
// ---cut---
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { loadHandles, ensureEntry, prefetchInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { Comments } from '~/components/comments';
import { Post } from '~/components/post';
import { trpcContext } from '../trpc/server';
import type { Route } from './+types/post';

export async function loader({ params, context }: Route.LoaderArgs) {
  const { queryClient, trpc } = context.get(trpcContext);
  const [handles] = await loadHandles(trpc, {
    comments: prefetchInfiniteEntry(trpc.post.comments, { postId: params.id, limit: 20 }),
    post: ensureEntry(trpc.post.byId, { id: params.id }),
  });
  return { dehydratedState: dehydrate(queryClient), ...handles };
}

export default function PostPage({ loaderData }: Route.ComponentProps) {
  return (
    <HydrationBoundary state={loaderData.dehydratedState}>
      <Post post={loaderData.post} />
      <Suspense key={loaderData.post.input.id} fallback={<p>Loading comments…</p>}>
        <Comments comments={loaderData.comments} />
      </Suspense>
    </HydrationBoundary>
  );
}
```

- `makeQueryClient` is the factory from the [server components guide](/docs/client/tanstack-react-query/server-components#3-create-a-query-client-factory). It dehydrates pending queries, which React Router streams as promises.
- Nested routes share the request's client. A query two loaders start is requested once, but can be sent twice: filter with `shouldDehydrateQuery` if that matters.

## Next.js App Router {#nextjs-app-router}

Start from the [Next.js App Router setup](/docs/client/nextjs/app-router-setup), and replace its `HydrateClient` with one from `unstable_createHydrateClient`:

```tsx twoslash title='trpc/server.tsx'
// @include: handles-router
// @filename: trpc/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export const makeQueryClient = () => new QueryClient();
// @filename: trpc/server.tsx
import { cache } from 'react';
import { makeQueryClient } from './query-client';
export const getQueryClient = cache(makeQueryClient);
// ---cut---
import { unstable_createHydrateClient } from '@trpc/tanstack-react-query';

// ... `getQueryClient` and the `trpc` proxy as before

export const HydrateClient = unstable_createHydrateClient(getQueryClient);
```

#### `HydrateClient` {#hydrate-client}

`HydrateClient` sends the request's queries to the browser, pending ones too. Render one in each server component that loads handles:

```tsx twoslash title='app/posts/[id]/page.tsx'
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @filename: app/posts/[id]/comments.tsx
export { Comments } from '~/components/comments';
// @filename: app/posts/[id]/post.tsx
export { Post } from '~/components/post';
// @filename: app/posts/[id]/page.tsx
// ---cut---
import { Suspense } from 'react';
import { HydrateClient, trpc } from '~/trpc/server';
import { Comments } from './comments';
import { Post } from './post';
import { loadHandles, prefetchEntry, prefetchInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';

export default async function PostPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [{ post }] = await loadHandles(trpc, {
    post: prefetchEntry(trpc.post.byId, { id }),
  });
  return (
    <HydrateClient>
      <Suspense fallback={<p>Loading post…</p>}>
        <Post post={post} />
      </Suspense>
      <Suspense fallback={<p>Loading comments…</p>}>
        <CommentsSection id={id} />
      </Suspense>
    </HydrateClient>
  );
}

async function CommentsSection(props: { id: string }) {
  const [{ comments }] = await loadHandles(trpc, {
    comments: prefetchInfiniteEntry(trpc.post.comments, { postId: props.id, limit: 20 }),
  });
  return (
    <HydrateClient>
      <Comments comments={comments} />
    </HydrateClient>
  );
}
```

- The client components that read handles start with `'use client'`, and are otherwise the ones in [Reading a handle](#reading-a-handle).
- It sends each query once per request, so nesting is fine. A query is sent again only when the server has newer data.
- Give each handle its own `Suspense` boundary, so one slow query doesn't hold back the rest.
- For a 404, use an ensure entry and call `notFound()`: see [Errors](#errors).
- It works only in server components, and for `queryClient.prefetchQuery` too.
- Handle inputs cross through React's serialization, not your transformer. Keep them to JSON values and `Date`s.

## Errors {#errors}

#### With ensure and fetch entries {#errors-ensure}

When an entry the load waits for fails, `loadHandles` rejects with a `TRPCEntryError`. `isTRPCEntryError(error, trpc.post.byId)` checks which procedure failed and types `error.cause`:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: loader.ts
import { trpc } from '~/trpc/server';
declare function notFound(): never;
declare function reportError(error: unknown): void;
// ---cut---
import {
  ensureEntry,
  ensureInfiniteEntry,
  isTRPCEntryError,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';

async function loader(id: string) {
  const [handles] = await loadHandles(trpc, {
    post: ensureEntry(trpc.post.byId, { id }),
    comments: ensureInfiniteEntry(trpc.post.comments, { postId: id }),
  }).catch((error: unknown) => {
    if (isTRPCEntryError(error, trpc.post.byId) && error.code === 'NOT_FOUND') {
      notFound();
    }
    if (isTRPCEntryError(error, trpc.post.comments)) {
      reportError(error.cause);
      //              ^?
    }
    throw error;
  });
  return handles;
}
```

- `error.key` is the entry's key, `error.path` the procedure, `error.code` the tRPC code.
- The load rejects on the first failure, without waiting for the others.

#### Errors as values {#errors-as-values}

`loadHandlesSettled` never rejects for a failed entry. It returns each waited-for entry's result as a value:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: loader.ts
import { trpc } from '~/trpc/server';
declare function notFound(): never;
declare const id: string;
// ---cut---
import {
  ensureEntry,
  loadHandlesSettled,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';

const [handles, results] = await loadHandlesSettled(trpc, {
  post: ensureEntry(trpc.post.byId, { id }),
  comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
});
if (results.post.status === 'error') {
  if (results.post.error.code === 'NOT_FOUND') {
    notFound();
  }
  throw results.post.error;
}
results.post.data.title;
//           ^?
```

#### With prefetch entries {#errors-prefetch}

A prefetch entry never makes the load reject. The reader gets the query's own error: `useQuery` returns `status: 'error'`, and `useSuspenseQuery` throws to the nearest error boundary. To report these in one place, use your `QueryCache`'s [`onError`](https://tanstack.com/query/latest/docs/reference/QueryCache).

## Invalidation {#invalidation-and-staleness}

Handles use normal tRPC query keys. Pass any of these to `invalidateQueries`:

- `{ queryKey: handle.queryKey }`: the handle's own query.
- `trpc.post.pathFilter()`: every query under `post`.
- `trpc.post.byId.queryFilter(input)`, or `infiniteQueryFilter` for an infinite handle.

To update data in place, use `queryClient.setQueryData(trpc.post.byId.queryKey(handle.input), …)`.

Hydrated data keeps the server's fetch time. Set a `staleTime` above 0, as the setup guides do, or the client refetches right after hydration.

## Testing {#testing}

Load handles over a test `QueryClient`, seeded with fixture data:

```tsx twoslash title='post.test.tsx'
// @jsx: react-jsx
// @target: esnext
// @module: esnext
// @filename: router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => ({ id: input.id, title: 'From the database' })),
  }),
});
// @filename: post.test.tsx
// ---cut---
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { loadHandles, prefetchEntry } from '@trpc/tanstack-react-query/unstable-handles';
import { appRouter } from './router';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient });

queryClient.setQueryData(trpc.post.byId.queryKey({ id: '1' }), {
  id: '1',
  title: 'Hello',
});
const [{ post }] = await loadHandles(trpc, {
  post: prefetchEntry(trpc.post.byId, { id: '1' }),
});
```

- Render the component under `QueryClientProvider` and `TRPCProvider` with the same `queryClient`.
- Leave out `setQueryData` to run the real procedure.

## FAQ {#faq}

#### Are handles safe to send to the browser? {#handles-safe}

Yes. A handle names a query the browser could call anyway, and every refetch runs validation and auth on the server again.

#### Where don't handles work? {#where-handles-dont-work}

- **Server functions and server actions:** their `QueryClient` never hydrates the page, so return data instead.
- **Outside hydration:** a reader rendered on the server outside `HydrateClient` or `HydrationBoundary` fetches its query again. In development, tRPC warns once per query.
- **URLs and storage:** a handle there gains nothing over its input.

#### Why functions, not methods on `trpc`? {#why-functions}

Methods on `trpc` return plain TanStack Query options. Handles are helpers on top, and apps that don't use them don't load their code.

#### Why one load call, not one per query? {#why-one-load}

So a loader can't make a waterfall by the order of its lines.
