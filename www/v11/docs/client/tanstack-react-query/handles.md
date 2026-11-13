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

```twoslash include handles-start
// @filename: lib/trpc.ts
export { useTRPC, type TRPC } from '~/trpc/client';
// @filename: routes/__root.tsx
import { createRootRouteWithContext } from '@tanstack/react-router';
import type { TRPC } from '~/trpc/client';
export const Route = createRootRouteWithContext<{ trpc: TRPC }>()();
// @filename: routeTree.gen.ts
import { Route as rootRoute } from './routes/__root';
import { Route as postRoute } from './routes/posts.$id';
declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/posts/$id': {
      id: '/posts/$id';
      path: '/posts/$id';
      fullPath: '/posts/$id';
      preLoaderRoute: typeof postRoute;
      parentRoute: typeof rootRoute;
    };
  }
}
const PostRoute = postRoute.update({
  id: '/posts/$id',
  path: '/posts/$id',
  getParentRoute: () => rootRoute,
} as any);
export const routeTree = rootRoute.addChildren({ PostRoute });
// @filename: router.tsx
// `Route.useLoaderData()` is `any` unless a router is registered
import { createRouter } from '@tanstack/react-router';
import type { TRPC } from '~/trpc/client';
import { routeTree } from './routeTree.gen';
declare const trpc: TRPC;
export const router = createRouter({ routeTree, context: { trpc } });
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

## In short {#gist}

Load the handles where the page starts, and read each one in a component, which never names the procedure or repeats its input:

<div class="code-tabs" data-tabs="framework">
<div data-tab="TanStack Start">

```tsx twoslash title='src/routes/posts.$id.tsx'
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @include: handles-start
// @filename: routes/posts.$id.tsx
// ---cut---
// ---collapse---
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  ensureEntry,
  fromHandle,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC } from '~/lib/trpc';
// ---/collapse---

export const Route = createFileRoute('/posts/$id')({
  loader: async ({ context: { trpc }, params }) => {
    const [handles] = await loadHandles(trpc, {
//                          ^^^^^^^^^^^
      post: ensureEntry(trpc.post.byId, { id: params.id }),
//          ^^^^^^^^^^^
    });
    return handles;
  },
  component: PostPage,
});

function PostPage() {
  const handles = Route.useLoaderData();
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, handles.post));
//                                   ^^^^^^^^^^
  return <h1>{postQuery.data.title}</h1>;
}
```

</div>
<div data-tab="Next.js">

The page, a server component, loads the handles:

```tsx twoslash title='app/posts/[id]/page.tsx'
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @filename: app/posts/[id]/post.tsx
export { Post } from '~/components/post';
// @filename: app/posts/[id]/page.tsx
// ---cut---
// ---collapse---
import { ensureEntry, loadHandles } from '@trpc/tanstack-react-query/unstable-handles';
import { HydrateClient, trpc } from '~/trpc/server';
import { Post } from './post';
// ---/collapse---

export default async function PostPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [handles] = await loadHandles(trpc, {
//                        ^^^^^^^^^^^
    post: ensureEntry(trpc.post.byId, { id }),
//        ^^^^^^^^^^^
  });
  return (
    <HydrateClient>
      <Post post={handles.post} />
    </HydrateClient>
  );
}
```

A client component, in its own file, reads one:

```tsx twoslash title='app/posts/[id]/post.tsx'
// @include: handles-router
// @include: handles-trpc
// @filename: app/posts/[id]/post.tsx
// ---cut---
'use client';

// ---collapse---
import { useSuspenseQuery } from '@tanstack/react-query';
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';
// ---/collapse---

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
//                                  ^^^^^^^^^^^^^^^^
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
//                                   ^^^^^^^^^^
  return <h1>{postQuery.data.title}</h1>;
}
```

</div>
</div>

- The handle carries the procedure and its input, typed.
- The data reaches the browser's cache through TanStack Query's dehydrate and hydrate: see [Frameworks](#frameworks).
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
- In a client component, don't call `loadHandles` during render: each render would start the entries again. Server components can. A client component that renders before anything loaded its query reads it with `useSuspenseQuery(trpc.x.queryOptions(input))`.

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
| TanStack Start, TanStack Router | Route loaders             | The proxy in your router context        |
| Next.js App Router             | Server components          | The server proxy from `trpc/server.tsx` |
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

#### Or keep the procedures, and let the server fill in the id {#or-one-request}

Reshaping changes the procedures to fit one page. The other way is to leave them as they are:

- **The loader names both queries up front.** The author's entry says "take the id from the post".
- **The server fills in the id**, and runs both in one request. With `httpBatchStreamLink`, each result streams back when it is ready.
- **`author.byId` stays `author.byId`.** Any page can use it, and a component can say what it needs by itself.

This is experimental. See [Dependent queries in one request](/docs/client/tanstack-react-query/dependent-queries).

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
- `handle.input` is the typed input. An infinite handle's leaves out `cursor` and `direction`.
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

- `pages` is how many pages the load fetches, also when it refetches stale pages: the cache then keeps only that many. To refetch every page the reader loaded, leave it out.
- Functions can't cross to the client, so pass `getNextPageParam` again when you read:

  ```ts
  fromHandle(trpc, props.comments, { getNextPageParam: (last) => last.nextCursor })
  ```

- Also pass it to entries in loaders that run in the browser. Refetching stale pages needs it from page two on.
- Type props with `inferInfiniteQueryHandle`.

## Dependent queries {#dependent-queries}

A query whose input comes from another query's result is a waterfall. Each step costs a round trip. There are three ways to deal with it.

- **[Reshape the procedure](#reshape-procedures)**, so that it takes what the URL has, or returns the joined data. No extra round trip.
- **Load both in [one request](/docs/client/tanstack-react-query/dependent-queries)**, with `experimental_dataOf()`. The procedures stay as they are, and the server fills in the input. No extra round trip. Experimental.
- **Pay the round trip**, in a loader or in a component, as below.

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

Read it in the component that gets the input:

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

## Frameworks {#frameworks}

Each framework loads the handles where the page starts and passes them to the components that read them. Set tRPC up with the framework's guide first.

<div class="code-tabs" data-tabs="framework">
<div data-tab="TanStack Start">

#### On a page {#tanstack-start}

After the [TanStack Start setup](/docs/client/tanstack-react-query/tanstack-start), the route's loader loads the handles and its component passes them on:

```tsx twoslash title='src/routes/posts.$id.tsx'
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @include: handles-start
// @filename: routes/posts.$id.tsx
// ---cut---
// ---collapse---
import { createFileRoute } from '@tanstack/react-router';
import {
  ensureEntry,
  loadHandles,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { Comments } from '~/components/comments';
import { Post } from '~/components/post';
// ---/collapse---

export const Route = createFileRoute('/posts/$id')({
  loader: async ({ context: { trpc }, params }) => {
    const [handles] = await loadHandles(trpc, {
//                          ^^^^^^^^^^^
      post: ensureEntry(trpc.post.byId, { id: params.id }),
//          ^^^^^^^^^^^
      comments: prefetchInfiniteEntry(trpc.post.comments, { postId: params.id }),
//              ^^^^^^^^^^^^^^^^^^^^^
    });
    return handles;
  },
  component: PostPage,
});

function PostPage() {
  const handles = Route.useLoaderData();
  return (
    <>
      <Post post={handles.post} />
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments comments={handles.comments} />
      </Suspense>
    </>
  );
}
```

</div>
<div data-tab="Next.js">

#### On a page {#nextjs-app-router}

After the [Next.js App Router setup](/docs/client/nextjs/app-router-setup), export `HydrateClient = unstable_createHydrateClient(getQueryClient)` from `trpc/server.tsx`. The page, a server component, loads the handles and passes them to client components:

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
// ---collapse---
import {
  ensureEntry,
  loadHandles,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { HydrateClient, trpc } from '~/trpc/server';
import { Comments } from './comments';
import { Post } from './post';
// ---/collapse---

export default async function PostPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [handles] = await loadHandles(trpc, {
//                        ^^^^^^^^^^^
    post: ensureEntry(trpc.post.byId, { id }),
//        ^^^^^^^^^^^
    comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
//            ^^^^^^^^^^^^^^^^^^^^^
  });
  return (
    <HydrateClient>
      <Post post={handles.post} />
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments comments={handles.comments} />
      </Suspense>
    </HydrateClient>
  );
}
```

```tsx twoslash title='app/posts/[id]/post.tsx'
// @include: handles-router
// @include: handles-trpc
// @filename: app/posts/[id]/post.tsx
// ---cut---
'use client';

// ---collapse---
import { useSuspenseQuery } from '@tanstack/react-query';
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';
// ---/collapse---

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
//                                  ^^^^^^^^^^^^^^^^
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
//                                   ^^^^^^^^^^
  return <h1>{postQuery.data.title}</h1>;
}
```

#### `HydrateClient` {#hydrate-client}

- It sends the request's queries to the browser, pending ones too, which stream in as they settle.
- It sends each query once per request, so a nested server component can load more handles and render its own. A query is sent again only when the server has newer data.
- It works only in server components, and for `queryClient.prefetchQuery` too.
- Handle inputs cross through React's serialization, not your transformer. Keep them to JSON values and `Date`s.
- For a 404, use an ensure entry and call `notFound()`: see [Errors](#errors).

</div>
</div>

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

A prefetch entry never makes the load reject. The reader gets the query's own error: `useQuery` returns `status: 'error'`, and `useSuspenseQuery` throws to the nearest error boundary, unless the cache has data to keep showing. To report these in one place, use your `QueryCache`'s [`onError`](https://tanstack.com/query/latest/docs/reference/QueryCache).

## Invalidation {#invalidation-and-staleness}

Handles use normal tRPC query keys. Pass any of these to `invalidateQueries`:

- `{ queryKey: handle.queryKey, exact: true }`: the handle's own query. Without `exact`, it also matches inputs that extend the handle's.
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

A handle does carry its input to the browser, as hydrated query keys already do. Only use inputs you'd show the client.

#### Where don't handles work? {#where-handles-dont-work}

- **Server functions and server actions:** their `QueryClient` never hydrates the page, so return data instead.
- **Outside hydration:** a reader rendered on the server outside `HydrateClient` or `HydrationBoundary` fetches its query again. In development, tRPC warns once per query.
- **URLs and storage:** a handle there gains nothing over its input.

#### Why functions, not methods on `trpc`? {#why-functions}

Methods on `trpc` return plain TanStack Query options. Handles are helpers on top, and apps that don't use them don't load their code.

#### Why one load call, not one per query? {#why-one-load}

So a loader can't make a waterfall by the order of its lines.
