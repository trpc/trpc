---
id: handles
title: Prefetching with handles
sidebar_label: Prefetching with handles
slug: /client/tanstack-react-query/handles
section: "Client Usage"
parent: "client/tanstack-react-query"
order: 53
---

A **handle** is a small, serializable reference to a query. You usually load it in a server component or a route loader, or build it during render with [`waterfallHandle`](#waterfall-handles). Pass it to a component, and the component reads the query, fully typed, without naming the procedure or repeating its input.

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
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

export function MoreByAuthor(props: {
  posts: inferInfiniteQueryHandle<TRPC['post']['byAuthor']>;
}) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.posts, {
      getNextPageParam: (last) => last.nextCursor,
    }),
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

Take a post page. Its loader, or server component, lists the queries the page needs and loads them in one call:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: loader.ts
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
  // 1. The post: the load waits for it
  post: ensureEntry(trpc.post.byId, { id }),
  // 2. Its comments: start at the same time, and stream in later
  comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
});
data.post.title;
// The comments were only prefetched, not awaited, so they aren't on `data`.
// Read them in the component with `fromHandle(trpc, handles.comments)`.
data.comments;
```

`data` only has the entries the load waited for. The comments may have no data yet, so reading them is a type error, not a silent `undefined`. If the post is missing, the load rejects with an error that names the `post` entry: see [Errors](#errors-ensure).

The page gets the handles as props, and reads them without naming a procedure or repeating an input:

```tsx twoslash
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @filename: post-page.tsx
import type { inferInfiniteQueryHandle, inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';
// ---cut---
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  fromHandle,
  waterfallInfiniteHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
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
  // 3. More by the author: ⚠️ a waterfall
  const moreByAuthor = waterfallInfiniteHandle(trpc.post.byAuthor, {
    authorId: postQuery.data.authorId,
  });

  return (
    <article>
      <h1>{postQuery.data.title}</h1>
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments comments={props.comments} />
      </Suspense>
      <Suspense fallback={<p>Loading more by this author…</p>}>
        <MoreByAuthor posts={moreByAuthor} />
      </Suspense>
    </article>
  );
}
```

Mutations don't change: use `useTRPC()`'s `mutationOptions`. To show a new comment, refresh the comments handle when the mutation succeeds:

```tsx twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: add-comment.tsx
// ---cut---
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

export function AddComment(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const addComment = useMutation(
    trpc.post.addComment.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: props.comments.queryKey }),
    }),
  );
  return (
    <button
      onClick={() =>
        addComment.mutate({ postId: props.comments.input.postId, text: 'Nice!' })
      }
    >
      Add a comment
    </button>
  );
}
```

`{ queryKey: props.comments.queryKey }` refreshes exactly the query the handle names. `trpc.post.comments.queryFilter(…)` would miss it, since the comments are an infinite query: see [Invalidation](#invalidation-and-staleness).

:::warning ⚠️ Waterfall
`post.byAuthor` needs the post's `authorId`, which the page only has once the post has loaded. So its request starts after the post's request has finished, a full round trip later. `waterfallHandle` and `waterfallInfiniteHandle` keep that visible in the code. To remove the wait, let the loader start it from the URL, for example with a procedure that takes the post's id: see [If the URL isn't enough, reshape the procedure](#reshape-procedures).
:::

Handles fix a gap in the usual prefetch pattern: the server prefetches `trpc.post.byId.queryOptions({ id })`, and the client repeats the same procedure and input:

- If the inputs differ, the read misses the prefetched data and silently fetches again.
- The client can read a different procedure from the one the server prefetched.
- Nothing shows that a prefetch happened at all.

With handles, the client reads exactly what the server started. They work best when a page can start every query from its URL: see [Start every query from the URL](#url-as-input).

A handle carries the query's key and input, but no data. The data lives in the cache: see [Handles carry no data](#no-data). The cache fills through TanStack Query's dehydrate and hydrate, as in the [Server Components](/docs/client/tanstack-react-query/server-components) guide or TanStack Start's [SSR query integration](/docs/client/tanstack-react-query/tanstack-start). In a server loader, return `dehydrate(queryClient)` with the handles, as in [React Router](#react-router-ssr).

The components that read handles are the same everywhere: with or without server components, and whether the handle came from a loader or from a component.

## Loading handles {#starting-a-query}

A loader lists its queries as **entries**, and `loadHandles(trpc, entries)` starts them all at once, then returns a handle for each:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
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
```

- Building an entry starts nothing. The load starts every entry before it waits for any, so the order of the entries doesn't matter, and you can't make one wait for another by accident.
- It resolves to `[handles, data]`: a handle for every entry, by its key, and the data of the entries it waited for. Return `handles` from the loader, or pass them to components as props. Reading a prefetch entry's `data` is a type error.
- It rejects as soon as an entry it waits for fails, so you can handle the error where you load, for example to show a not-found page.

Each entry chooses whether the page waits for its query:

- **Don't wait** with `prefetchEntry`. The page renders at once, and the data streams in later.
- **Wait** with `ensureEntry`. The page renders once the data is ready.

`fetchEntry` is a stricter form of waiting, for code that needs fresh data. See [Waiting for fresh data](#fetch).

### Without waiting: `prefetchEntry` {#prefetch}

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
import { loadHandles, prefetchEntry } from '@trpc/tanstack-react-query/unstable-handles';
declare const id: string;
// ---cut---
const [handles] = await loadHandles(trpc, {
  post: prefetchEntry(trpc.post.byId, { id }),
});
```

- The load doesn't wait for it. The request runs in the background.
- If the cache has no data for the query yet, the component that reads the handle renders before the data arrives, so it shows a loading state. If the cache has data, the component shows it while the request runs. With `useSuspenseQuery` and no cached data, it suspends: wrap it in `<Suspense>` to show a fallback in its place. With `useQuery`, it renders with `status: 'pending'`, and with server rendering it can cause a hydration mismatch: see [Reading with `useQuery`](#use-query).

  ```tsx twoslash
  // @include: handles-router
  // @include: handles-trpc
  // @include: handles-components
  // @filename: snippet.tsx
  import { Suspense } from 'react';
  import { Post } from '~/components/post';
  import { trpc } from '~/trpc/server';
  import { loadHandles, prefetchEntry } from '@trpc/tanstack-react-query/unstable-handles';
  declare const id: string;
  const [handles] = await loadHandles(trpc, {
    post: prefetchEntry(trpc.post.byId, { id }),
  });
  // ---cut---
  <Suspense fallback={<p>Loading post…</p>}>
    <Post post={handles.post} />
  </Suspense>
  ```

  Without a boundary of your own, React shows the fallback of the nearest boundary above it, which may cover the whole page.

- It never makes the load reject. If the request fails, the component that reads the handle gets the error, and the nearest error boundary shows it.
- Its data isn't in `data`: the query may not have any yet. Reading `data.post` is a type error.

Use it for data the page can show a placeholder for: slow queries, content below the fold, secondary panels.

### Waiting: `ensureEntry` {#ensure}

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
import { loadHandles, ensureEntry } from '@trpc/tanstack-react-query/unstable-handles';
declare const id: string;
// ---cut---
const [handles, data] = await loadHandles(trpc, {
  post: ensureEntry(trpc.post.byId, { id }),
});
```

- The load waits until the cache has data for the query, so the data is ready before anything renders.
- `data.post` has the data. See [Using the data in a loader](#loader-data).
- The component that reads the handle finds the data in the cache and renders it at once, with `useSuspenseQuery` or `useQuery`. It still needs a loading state for when the cache loses the data: see [When the cache loses the data](#cache-loses-data).
- The load rejects if the request fails.
- If the cache already has stale data, the load resolves at once with it and refetches it in the background.

Use it for data the page can't render without, or data you need before rendering: the page title, a not-found check, a redirect.

### Waiting for fresh data: `fetchEntry` {#fetch}

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
import { loadHandles, fetchEntry } from '@trpc/tanstack-react-query/unstable-handles';
declare const id: string;
// ---cut---
const [handles, data] = await loadHandles(trpc, {
  post: fetchEntry(trpc.post.byId, { id }),
});
```

- It works like `ensureEntry`, with one difference: if the cache has stale data, it refetches and waits for the new data, like `queryClient.fetchQuery`.
- Use it when the loader reads the data and needs it fresh, for example a loader that redirects based on the post.
- In a browser loader, prefer `ensureEntry`. With stale data, an ensure entry renders the page at once and updates it when the refetch lands. A fetch entry holds up the navigation until the refetch is done.
- TanStack Router hides this difference on a page it has visited: by default, it shows the page with its last loader data and reruns the loader in the background. To wait there too, as the demo below does, set the router's `defaultStaleReloadMode`, or a loader's [`staleReloadMode`](https://tanstack.com/router/latest/docs/guide/data-loading#choosing-background-vs-blocking-stale-reloads), to `'blocking'`.
- In server components, the two behave the same: the request's `QueryClient` starts empty, so both wait for the request.

### Which to use {#which-to-use}

|                        | `prefetchEntry`                   | `ensureEntry`                                 | `fetchEntry`          |
| ---------------------- | --------------------------------- | --------------------------------------------- | --------------------- |
| Page waits for data    | No                                | Yes                                           | Yes                   |
| In `data`              | No                                | Yes                                           | Yes                   |
| With stale data        | Refetches in the background       | Resolves at once, refetches in the background | Waits for the refetch |
| Reader's first render  | Loading state, or cached data     | The data                                      | The data              |
| When the request fails | An error boundary shows the error | The load rejects                              | The load rejects      |

```demo starting-queries
```

### TanStack Query equivalents {#tanstack-equivalents}

Each entry is one TanStack Query call with the procedure's `queryOptions` or `infiniteQueryOptions`. The load makes every call, then waits for the ones that aren't prefetches:

| tRPC                                                                 | TanStack Query                                                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prefetchEntry(trpc.x, input, opts)`                                 | `void queryClient.prefetchQuery(trpc.x.queryOptions(input, opts))`                                                                                                       |
| `ensureEntry(trpc.x, input, opts)`                                   | `await queryClient.ensureQueryData({ ...trpc.x.queryOptions(input, opts), revalidateIfStale: true })`                                                                    |
| `fetchEntry(trpc.x, input, opts)`                                    | `await queryClient.fetchQuery(trpc.x.queryOptions(input, opts))`                                                                                                         |
| `prefetchInfiniteEntry`, `ensureInfiniteEntry`, `fetchInfiniteEntry` | `prefetchInfiniteQuery`, `ensureInfiniteQueryData` (with `revalidateIfStale: true`), `fetchInfiniteQuery`                                                                |
| `waterfallHandle(trpc.x, input)` on `useTRPC()`, in render           | [`usePrefetchQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/usePrefetchQuery)`(trpc.x.queryOptions(input))`, as a plain call instead of a hook |
| `waterfallHandle(trpc.x, input)` on other proxies                    | Nothing: the reader's `useQuery(trpc.x.queryOptions(input))` starts the query                                                                                            |
| `fromHandle(trpc, handle, opts)`                                     | `trpc.x.queryOptions(handle.input, opts)`, with `x` taken from the handle                                                                                                |

The `queryClient` is the one the proxy was created with. The entry names follow the TanStack Query method each one calls.

### Waiting for some, streaming others {#combining-both}

A page can wait for some queries and stream others. List them all in one load:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
import { loadHandles, ensureEntry, prefetchInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';
declare const id: string;
// ---cut---
const [handles] = await loadHandles(trpc, {
  comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
  post: ensureEntry(trpc.post.byId, { id }),
});
```

Here the post is ready when the page renders, and the comments stream in behind their own loading state. Both requests start together, whatever order you list them in.

Avoid awaiting one load and then starting another: the second load's requests wait for every entry the first one waited for. Use a second load only when its input comes from the first one's data: see [Dependent queries](#waterfall-in-a-loader).

### Options {#start-options}

- `input` is optional when the procedure's input is optional, so `prefetchEntry(trpc.viewer)` works.
- `opts` takes `staleTime`, `gcTime`, `retry`, `retryDelay`, `meta`, and `trpc` request options such as `context`. They apply to the load's request. Readers use the options you pass to `fromHandle`.

### Where to load handles {#where-to-start}

| Your app                                       | Load handles in                                  | With                                    |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| Next.js App Router                             | Server components                                | The server proxy from `trpc/server.tsx` |
| TanStack Start, TanStack Router                | Route loaders                                    | The proxy in your router context        |
| React Router                                   | `loader` or `clientLoader`                       | See [React Router](#react-router)       |
| No loaders or server components, such as a SPA | The top of the page, [as it renders](#in-render) | `waterfallHandle` on `useTRPC()`        |

- In server components, the request's `QueryClient` starts empty, so an ensure entry always waits for the request.
- `loadHandles` and the entries take any tRPC options proxy: one from `createTRPCOptionsProxy`, or `useTRPC()`. Type a router context with `TRPCOptionsProxy<AppRouter>`.
- Load handles where the code can wait: a loader, a server component, or an event handler, such as preloading a page on hover. Don't call `loadHandles` during render: every render starts its entries again, and a render can't wait for them. In components, build handles with [`waterfallHandle`](#waterfall-handles).
- `loadHandles` takes the root proxy, `trpc`, and one load can take entries from any procedure.

## Start every query from the URL {#url-as-input}

A loader or server component runs before anything renders, and all it has is the URL: the route's params, its search params, and on the server, the session. If every query a page needs takes its input from those, every request starts the moment the navigation does. No component has to render first to find out what to fetch.

- **Path params** name what the page is about: `/posts/$slug`.
- **Search params** hold everything else that changes what a query fetches: filters, sort, page. Keep them out of component state. A loader can't see component state, so the query would start only after render, the back button wouldn't restore the view, and a shared link would open the default one.

```demo url-input
/posts?sort=top&page=2  →  prefetchEntry(trpc.post.list, { sort: 'top', page: 2 })
```

### If the URL isn't enough, reshape the procedure {#reshape-procedures}

If a page can't start a query from the URL alone, change the procedure, not the page. A procedure that takes an id you only learn from another query forces a waterfall on every page that calls it. Two fixes:

- **Take what the URL has.** Accept the slug or route param, and look up the id on the server.
- **Return the joined data.** Return the post with its author, not an author id for the client to look up.

The server sits next to the database, so the extra lookup costs a query there, not another round trip from the browser.

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

**Before:** the page is `/posts/$slug`, but the comments and the author need ids that only the post has:

```ts twoslash title='server/routers/_app.ts'
// @include: url-db
// @filename: before-router.ts
// ---cut---
import { z } from 'zod';
import { db } from './db';
import { t } from './trpc';

export const appRouter = t.router({
  post: t.router({
    bySlug: t.procedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => db.post.bySlug(input.slug)),
    comments: t.procedure
      .input(
        z.object({ postId: z.string(), cursor: z.number().nullish() }),
      )
      .query(({ input }) =>
        db.comment.list({
          postId: input.postId,
          cursor: input.cursor ?? null,
        }),
      ),
  }),
  author: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => db.author.byId(input.id)),
  }),
});
```

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

**After:** `post.comments` takes the slug, and `post.bySlug` returns the post with its author:

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

The page is ready after one round trip instead of two, and the loader no longer reads the post to start the other queries.

## Reading a handle {#reading-a-handle}

`fromHandle(trpc, handle, opts?)` returns the same options as `trpc.<path>.queryOptions(input, opts)` for the handle's procedure and input, or `trpc.<path>.infiniteQueryOptions(input, opts)` for an infinite handle. Pass them to any TanStack Query hook or `QueryClient` method:

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

- `opts` takes everything `queryOptions` takes, such as `select`, `staleTime`, `refetchInterval` and `trpc`.
- `fromHandle` takes any level of the proxy: `fromHandle(trpc, handle)` and `fromHandle(trpc.post, handle)` behave the same.
- Reads use the same query key as `trpc.<path>.queryOptions(input)`, so old and new code share cache entries.
- `handle.queryKey` is the cache entry's key. For a typed `queryClient.getQueryData`, pass `fromHandle(trpc, handle).queryKey`. The handle's own key isn't tagged with its data type, so the handle stays serializable everywhere, including TanStack Router's `beforeLoad`.
- `handle.input` is the typed input the query was started with, so a component doesn't need it as a separate prop. Infinite handles leave out `cursor` and `direction`.

### Typing props {#typing-props}

Export your proxy type once, then type props with `inferQueryHandle`:

```tsx twoslash title='trpc/client.tsx'
// @include: handles-router
// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '~/server/router';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
// ---cut---
export type TRPC = TRPCOptionsProxy<AppRouter>;
```

```tsx twoslash title='app/posts/[id]/post.tsx'
// @include: handles-router
// @include: handles-trpc
// @filename: app/posts/[id]/post.tsx
// ---cut---
'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}
```

A handle can only come from `loadHandles` or `waterfallHandle`. A raw input, an entry, or an object with the right `queryKey` and `input` written by hand, doesn't type-check. In tests, build one with `waterfallHandle`: see [Testing components that take handles](#testing). At runtime, `fromHandle` also throws a readable error for anything that isn't a handle, and when the handle's `keyPrefix` differs from the reading proxy's.

`inferQueryHandle` accepts a handle from any entry or from `waterfallHandle`: they all have the same type.

### Reading with `useQuery` {#use-query}

You don't need `useSuspenseQuery` or a `Suspense` boundary to read a handle. `useQuery` works with every handle, as for any query. Switch on its `status` to show each state:

```tsx twoslash title='app/posts/[id]/post.tsx'
// @include: handles-router
// @include: handles-trpc
// @filename: app/posts/[id]/post.tsx
// ---cut---
'use client';

import { useQuery } from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useQuery(fromHandle(trpc, props.post));
  switch (postQuery.status) {
    case 'pending':
      return <p>Loading post…</p>;
    case 'error':
      return <p>Couldn't load the post: {postQuery.error.message}</p>;
    case 'success':
      return <h1>{postQuery.data.title}</h1>;
  }
}
```

- `useQuery` doesn't suspend. Until the data arrives, it renders with `status: 'pending'`.
- After an ensure or fetch entry, the cache has the data, so the first render has `status: 'success'`.
- With server rendering, read a prefetch entry's handle with `useSuspenseQuery`: with `useQuery`, the server can render the loading state while the browser already has the data, and React reports a hydration mismatch ([TanStack/query#9399](https://github.com/TanStack/query/issues/9399)). For a component on `useQuery`, wait for the data instead, with an ensure entry.

## Handles carry no data {#no-data}

A handle is only the query's key and input, whichever entry made it. The data lives in the cache, so the reader decides how to wait for it:

- `useSuspenseQuery` types `data` as defined. The component suspends until the cache has the data.
- `useQuery` types `data` as possibly `undefined`, as for any query. Switch on `status` to narrow it.

### When the cache loses the data {#cache-loses-data}

Waiting for a query with an ensure or fetch entry puts its data in the cache before the reader renders. The cache can still lose that data later, and the reader then has to load it again:

- `queryClient.resetQueries()` clears the data and refetches the queries on screen at once. A `useSuspenseQuery` reader suspends and shows the nearest `Suspense` fallback. A `useQuery` reader renders with `status: 'pending'`.
- `queryClient.removeQueries()` and `queryClient.clear()`, for example on logout, drop the query from the cache. A reader on screen keeps its data until it renders again. Then it loads the query as above.
- TanStack Query also drops a query no component has used for its `gcTime`. A reader that mounts after that loads it again.
- `queryClient.invalidateQueries()` keeps the data and refetches in the background, so the reader shows no loading state.

So give every reader a loading state, even when the page waited for its data: put a `useSuspenseQuery` reader under a `Suspense` boundary, or handle `'pending'` in a `useQuery` reader. Without a boundary of its own, a reader that suspends shows the fallback of the nearest boundary above it, which may cover the whole page.

The reader loads the query again with a new request. A handle doesn't bring back the data the loader started with.

This is how readers behave with the default options. Some options change it: with `initialData`, `resetQueries()` puts that data back, and with `enabled: false`, a reader that lost its data stays `pending` and starts no request.

### Using the data in a loader {#loader-data}

To use the data where you load it, for example to set the page title or redirect, read it from the load's `data`. It has the data of every ensure and fetch entry, by the entry's key:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
import { loadHandles, ensureEntry, prefetchInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';
declare const id: string;
declare function notFound(): never;
// ---cut---
const [handles, data] = await loadHandles(trpc, {
  comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
  post: ensureEntry(trpc.post.byId, { id }),
});
if (!data.post.title) notFound();
//        ^?
```

- `data` has no key for prefetch entries, since their query may have no data yet.
- The data is the same object the cache holds. Return `handles`, not `data`, so it doesn't cross to the browser twice.
- Don't build other queries' inputs from it. Start them from the URL instead, as in [Start every query from the URL](#url-as-input). Otherwise, see [Dependent queries](#dependent-queries).

## Infinite queries {#infinite-queries}

The post page's comments and more by its author are lists, so they're infinite queries. For procedures with a `cursor` input, use `prefetchInfiniteEntry`, `ensureInfiniteEntry` and `fetchInfiniteEntry`. They load the first page. To load more pages up front, pass `pages` with `getNextPageParam`:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
import { loadHandles, prefetchInfiniteEntry, ensureInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';
declare const id: string;
// ---cut---
const [handles, data] = await loadHandles(trpc, {
  comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id, limit: 20 }),
  firstThree: ensureInfiniteEntry(
    trpc.post.comments,
    { postId: id, limit: 20 },
    { pages: 3, getNextPageParam: (last) => last.nextCursor },
  ),
});
data.firstThree.pages;
//              ^?
```

Functions can't cross to the client, so pass `getNextPageParam` when you read an infinite handle:

```tsx twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: comments.tsx
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';
declare const props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
};
const trpc = useTRPC();
// ---cut---
const commentsQuery = useSuspenseInfiniteQuery(
  fromHandle(trpc, props.comments, {
    getNextPageParam: (last) => last.nextCursor,
  }),
);
```

Type the prop with `inferInfiniteQueryHandle<TRPC['post']['comments']>`.

In the browser, a loader can run again while the cache holds every page the user loaded. If that data is stale, the entry refetches all of those pages, which needs `getNextPageParam` from page two on. Pass the reader's `getNextPageParam` to entries in loaders that run in the browser:

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
import { loadHandles, prefetchInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';
declare const id: string;
// ---cut---
const [handles] = await loadHandles(trpc, {
  comments: prefetchInfiniteEntry(
    trpc.post.comments,
    { postId: id, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor },
  ),
});
```

## Waterfall handles {#waterfall-handles}

A handle from `loadHandles` refers to a query the load already started. When the input is only known during render, such as component state or an id from another query's data, no loader can start the query. `waterfallHandle(trpc.<path>, input)` builds a handle for it during render. The query can only start once that component renders, so it's a request waterfall, and the name keeps that visible.

```tsx twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.tsx
import { useTRPC } from '~/trpc/client';
import { waterfallInfiniteHandle } from '@trpc/tanstack-react-query/unstable-handles';
declare const authorId: string;
const trpc = useTRPC();
// ---cut---
const moreByAuthor = waterfallInfiniteHandle(trpc.post.byAuthor, { authorId });
//    ^?
```

- It starts the query, following the rule of TanStack Query's [`usePrefetchQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/usePrefetchQuery): only if the cache has no entry for it, with no data, no error and no request in flight. The cache looks it up by TanStack Query's query hash, which ignores the order of keys in the input, so re-renders with the same input start nothing. When an input changes, the new query starts.
- It returns the same handle type as an entry, so it goes to the same components.
- It's a plain call, not a hook: you can call it conditionally, and React Compiler can memoize it.
- For infinite queries, use `waterfallInfiniteHandle`.
- Searching for `waterfallHandle` lists the waterfalls in your app.

### Without a loader: in render {#in-render}

Not every app has a route loader or server components to load handles in. A single-page app, or a page whose input lives in component state, can build waterfall handles at the top of the page as it renders, and pass them down:

```tsx twoslash title='pages/post-page.tsx'
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @filename: pages/comments.tsx
export { Comments } from '~/components/comments';
// @filename: pages/post.tsx
export { Post } from '~/components/post';
// @filename: pages/post-page.tsx
// ---cut---
import { Suspense } from 'react';
import { useTRPC } from '~/trpc/client';
import { Comments } from './comments';
import { Post } from './post';
import { waterfallHandle, waterfallInfiniteHandle } from '@trpc/tanstack-react-query/unstable-handles';

export function PostPage(props: { id: string }) {
  const trpc = useTRPC();
  const post = waterfallHandle(trpc.post.byId, { id: props.id });
  const comments = waterfallInfiniteHandle(trpc.post.comments, {
    postId: props.id,
    limit: 20,
  });

  return (
    <>
      <Suspense fallback={<p>Loading post…</p>}>
        <Post post={post} />
      </Suspense>
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments comments={comments} />
      </Suspense>
    </>
  );
}
```

`Post` and `Comments` are the same components a loader or a server component would feed. Both queries start before either of them renders, so they load in parallel instead of one after the other, even if they share one `Suspense` boundary.

- Build handles high in the tree: in the page, not in the components that read them. A handle built below a component that suspends starts only after that component's data arrives.
- A query with cached data renders it at once. The component that reads the handle refetches it in the background if it's stale, as `useQuery` and `useSuspenseQuery` do by default.
- With server rendering, the queries start in the server render too. TanStack Start's [SSR query integration](/docs/client/tanstack-react-query/tanstack-start) streams them to the browser. Elsewhere, such as React Router's framework mode, nothing sends their data to the browser, which fetches them again: load them in a [loader](#react-router) instead.

### Switching input {#switching-input}

:::warning Prefer the URL
If the user can change a list's sort or filter, put it in a [search param](#url-as-input), and the loader starts the new query when it changes. Only switch the input in the component when the URL can't hold it, such as a term the user is typing.
:::

Say the post page's comments can be sorted. To switch the handle the loader passed down to a new input, pass the handle and a function of its input:

```tsx twoslash title='comments.tsx'
// @jsx: react-jsx
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  post: t.router({
    comments: t.procedure
      .input(
        z.object({
          postId: z.string(),
          sort: z.enum(['new', 'top']),
          cursor: z.number().nullish(),
        }),
      )
      .query(() => ({
        items: [] as { id: string; text: string }[],
        nextCursor: null as number | null,
      })),
  }),
});
export const trpc = createTRPCOptionsProxy({
  router: appRouter,
  ctx: {},
  queryClient: new QueryClient(),
});
// @filename: comments.tsx
import React from 'react';
import { trpc as serverTRPC } from './server';
const useTRPC = () => serverTRPC;
// ---cut---
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { waterfallInfiniteHandle, fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useState } from 'react';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<typeof serverTRPC.post.comments>;
}) {
  const trpc = useTRPC();
  // Start from the loader's input, so the first render reads the query it started
  const [sort, setSort] = useState(props.comments.input.sort);
  const comments = waterfallInfiniteHandle(
    trpc.post.comments,
    props.comments,
    (input) => ({ ...input, sort }),
  );
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return (
    <>
      <button onClick={() => setSort('top')}>Top</button>
      <p>{commentsQuery.data.pages[0]?.items.length} comments</p>
    </>
  );
}
```

- While the new input maps to the loader's query, it returns the loader's handle as is, so the first render reads what the loader started. It restarts that query if the cache lost it.
- The handle must come from the same procedure. Switching a `post.draftById` handle with `waterfallHandle(trpc.post.byId, …)` throws, even when their types match.
- When the input changes, the new query starts when the component renders with it, before the reader does. Its first page is still a waterfall. Wrap `setSort` in `startTransition`, or pass `placeholderData: keepPreviousData` to `fromHandle`, to keep showing the old list while it loads.

## Request waterfalls {#waterfalls}

A request waterfall is a request that can't start until another one has finished. Each level costs a full round trip, and on a slow connection a round trip can take hundreds of milliseconds. Removing waterfalls is often the best way to speed up a page.

Handles are built around this. Queries start in loaders and server components, where everything a page needs is known up front, so they start together:

```
1. |-> post.byId
1. |-> post.comments
1. |-> post.moreByAuthor
```

instead of one after the other, as each component renders and finds out what it needs:

```
1. |-> post.byId
2.   |-> post.comments
3.     |-> post.byAuthor
```

The demo runs one blog all three ways. Watch the network panel:

```demo waterfalls
```

To keep it that way:

- Load handles in loaders and server components, not in render.
- List every query in one load. See [Waiting for some, streaming others](#combining-both).
- Make the URL the input, so the loader can start every query. See [Start every query from the URL](#url-as-input).

### Dependent queries {#dependent-queries}

A query whose input comes from another query's result is a waterfall by construction. Most pages don't need one: put the input in the route, or [reshape the procedure](#reshape-procedures) so the page can start it from the URL. For example, `trpc.post.moreByAuthor({ postId })` instead of `trpc.post.byId` and then `trpc.post.byAuthor({ authorId })`.

When the data really can't be reshaped, for example a third-party API you don't control, there are two explicit ways. Both pay the extra round trip.

### In a loader or server component {#waterfall-in-a-loader}

Load the first query, then build the second load's entries from its `data`:

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

The page waits for the post, and more by its author starts only after it.

### In a component {#waterfall-in-a-component}

When an input is only known at render time, such as an id from a parent query's result, build a [waterfall handle](#waterfall-handles) in the component that has the input, and pass it to the one that renders it, as the post page at the top does for more by the author:

```tsx twoslash
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @filename: more-from-author.tsx
import type { Post } from '~/server/router';
// ---cut---
import { waterfallInfiniteHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { MoreByAuthor } from '~/components/more-by-author';
import { useTRPC } from '~/trpc/client';

function MoreFromAuthor(props: { post: Post }) {
  const trpc = useTRPC();
  const moreByAuthor = waterfallInfiniteHandle(trpc.post.byAuthor, {
    authorId: props.post.authorId,
  });
  return (
    <Suspense fallback={<p>Loading more by this author…</p>}>
      <MoreByAuthor posts={moreByAuthor} />
    </Suspense>
  );
}
```

- The query starts when `MoreFromAuthor` renders, an extra round trip after its parent's data arrives.
- Reading `trpc.post.byAuthor.infiniteQueryOptions(input, opts)` with `useSuspenseInfiniteQuery` works too, as it always has.
- In the Next.js App Router, load the dependent query in the server component instead, as in the [loader example](#waterfall-in-a-loader).
- In TanStack Router, `beforeLoad` can wait for the first query before the loader runs. It's an escape hatch, for when the dependent data must be there before the page renders: see [TanStack Start › Handles in `beforeLoad`](/docs/client/tanstack-react-query/tanstack-start#before-load).

## React Router {#react-router}

React Router loads data in one of two places, and handles fit each a little differently. Route components pass handles from `loaderData` to the same client components as everywhere else.

### Client-only apps {#react-router-client}

In [SPA Mode](https://reactrouter.com/how-to/spa) (`ssr: false`) with `clientLoader`, or in [Data Mode](https://reactrouter.com/start/modes#data) with `createBrowserRouter`, loaders run in the browser. Create the tab's `QueryClient` and proxy in a module, so loaders can import them, and provide the same client to your app:

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

In Data Mode, the same function is a route object's `loader`, and the component reads it with `useLoaderData`:

```tsx twoslash title='app/router.tsx'
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
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
// @filename: app/router.tsx
// ---cut---
import { Suspense } from 'react';
import { createBrowserRouter, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Comments } from '~/components/comments';
import { Post } from '~/components/post';
import { trpc } from '~/trpc';
import { loadHandles, ensureEntry, prefetchInfiniteEntry } from '@trpc/tanstack-react-query/unstable-handles';

async function postLoader({ params }: LoaderFunctionArgs) {
  const id = params.id!;
  const [handles] = await loadHandles(trpc, {
    comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id, limit: 20 }),
    post: ensureEntry(trpc.post.byId, { id }),
  });
  return handles;
}

function PostPage() {
  const { comments, post } = useLoaderData<typeof postLoader>();
  return (
    <>
      <Post post={post} />
      <Suspense key={post.input.id} fallback={<p>Loading comments…</p>}>
        <Comments comments={comments} />
      </Suspense>
    </>
  );
}

export const router = createBrowserRouter([
  { path: '/posts/:id', loader: postLoader, Component: PostPage },
]);
```

- There is nothing to hydrate: the loader starts queries in the same `QueryClient` the components read.
- The ensure entry waits on the first visit only. Coming back shows the cached post at once and refetches it in the background if it's stale.
- Key `Suspense` boundaries by the route's input. React Router renders the next page in a transition, and a transition waits for a boundary that's already showing content instead of showing its fallback. Without the key, navigating from one post to another waits for the comments.

### Server rendering {#react-router-ssr}

In [Framework Mode](https://reactrouter.com/start/modes#framework) with server rendering, `loader` runs on the server, for the first page load and for every navigation after it. Create a query client and proxy per request in a root [middleware](https://reactrouter.com/how-to/middleware). Loaders return `dehydrate(queryClient)` with their handles, and the route component wraps its children in TanStack Query's `HydrationBoundary`, as with any TanStack Query loader:

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

- `makeQueryClient` is the query client factory from the [server components guide](/docs/client/tanstack-react-query/server-components#3-create-a-query-client-factory): it dehydrates pending queries and runs your transformer's `serialize` and `deserialize`.
- React Router [streams promises in loader data](https://reactrouter.com/how-to/suspense), so the comments' pending query crosses as a promise inside `dehydratedState`. The page's HTML doesn't wait for it, and the browser doesn't fetch it again.
- `dehydrate(queryClient)` sends everything the request's client holds. Nested routes share it, so a query another loader started can be sent twice. Filter with `dehydrate`'s `shouldDehydrateQuery` if that matters.
- Nested routes share the request's proxy, since the middleware runs once per request. A query that two loaders start is requested once.
- In a `loader`, an ensure entry waits like a fetch entry, since the request's `QueryClient` starts empty. Use a prefetch entry for queries the page can stream.

## Next.js App Router {#nextjs-app-router}

This builds on the [Next.js App Router setup](/docs/client/nextjs/app-router-setup). The query client factory, `getQueryClient` and the server proxy in `trpc/server.tsx` stay as they are. Add `export type TRPC = TRPCOptionsProxy<AppRouter>` to `trpc/client.tsx`, and in `trpc/server.tsx`, replace the setup's `HydrateClient` with one from `unstable_createHydrateClient`:

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

The client components are the same either way: they read the handle with `useSuspenseQuery` or `useQuery`, as in [Typing props](#typing-props).

### `HydrateClient` {#hydrate-client}

`HydrateClient` sends the queries the request has started so far to the browser, including pending ones, which stream in as they settle. Render one in each server component that starts queries for client components:

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

- A query an earlier `HydrateClient` sent in the same request isn't sent again, so nesting them is fine. The outer one renders before `CommentsSection` starts its query, so each sends only its own.
- A query is sent again when the server has newer data for it, for example after a fetch entry refetched it.
- It keeps your query client's `dehydrate` options: `shouldDehydrateQuery`, `serializeData` and the rest.
- It works only in server components. `@trpc/tanstack-react-query` resolves to its server build through the `react-server` [export condition](https://nodejs.org/api/packages.html#conditional-exports), which Next.js and other RSC bundlers set for server components. Rendered anywhere else, it throws.
- It works for queries started with `queryClient.prefetchQuery(trpc.x.queryOptions(input))` too, not only handles.

### Streaming with prefetch entries {#nextjs-prefetch}

The page sends its HTML at once. Each `Suspense` boundary shows its fallback, then the data streams in:

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

export default async function PostPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const [{ post, comments }] = await loadHandles(trpc, {
    post: prefetchEntry(trpc.post.byId, { id }),
    comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id, limit: 20 }),
  });

  return (
    <HydrateClient>
      <Suspense fallback={<p>Loading post…</p>}>
        <Post post={post} />
      </Suspense>
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments comments={comments} />
      </Suspense>
    </HydrateClient>
  );
}
```

- Give each handle its own `Suspense` boundary, so one slow query doesn't hold back the rest.
- If the post doesn't exist, the `Post` component throws, and the nearest `error.tsx` shows the error.

### Waiting with ensure entries {#nextjs-ensure}

The page waits for the post before it renders. Use this when the page can't render without the data, or when you need it on the server, for example to call `notFound()`:

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
import { TRPCError } from '@trpc/server';
import { loadHandles, ensureEntry } from '@trpc/tanstack-react-query/unstable-handles';
import { notFound } from 'next/navigation';
import { HydrateClient, trpc } from '~/trpc/server';
import { Post } from './post';

export default async function PostPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const [{ post }] = await loadHandles(trpc, {
    post: ensureEntry(trpc.post.byId, { id }),
  }).catch((cause) => {
    if (cause instanceof TRPCError && cause.code === 'NOT_FOUND') notFound();
    throw cause;
  });

  return (
    <HydrateClient>
      <Post post={post} />
    </HydrateClient>
  );
}
```

- The data is in the cache before `Post` renders, so it shows the post at once. If the cache loses the post later, `Post` suspends and shows the nearest `loading.tsx` or `Suspense` fallback: see [When the cache loses the data](#cache-loses-data).
- To use the data on the server, read it from the cache: see [Using the data in a loader](#loader-data).

To wait for some queries and stream others on the same page, see [Combining both](#combining-both).

### Handle inputs {#nextjs-handle-inputs}

Handle inputs cross to the client inside the handle, through React's own serialization, not your tRPC data transformer. This isn't new: dehydrated query keys already cross the same way. Keep inputs to plain JSON values and `Date`s. React can send a `Map`, `Set` or `BigInt` too, but TanStack Query hashes query keys with `JSON.stringify`: a `BigInt` input throws, and two different `Map` or `Set` inputs share one cache entry.

## Errors {#errors}

### With ensure and fetch entries {#errors-ensure}

When an ensure or fetch entry fails, `loadHandles` rejects with a `TRPCEntryError` that says which entry it was:

- `error.key`: the entry's key, such as `'post'`.
- `error.path`: the procedure, such as `'post.byId'`.
- `error.code`: the tRPC error code, such as `'NOT_FOUND'`.
- `error.cause`: the request's error. That's a `TRPCError` on the server proxy, and a `TRPCClientError` on a client-backed proxy, such as one in a TanStack Start loader.

`isTRPCEntryError(error, trpc.post.byId)` checks that the failed entry was for that procedure, and types `error.cause` with its errors. In the post page at the top, only the post is awaited, so only the post can make the load reject. If the page waits for the comments too, chain `.catch` to check which one failed, so a missing post gets a 404:

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

- The load rejects as soon as one entry fails, without waiting for the others. If several fail, you get the first to fail.
- Errors that don't come from the request, such as a cancelled query, reject as they are.

### Errors as values {#errors-as-values}

`loadHandlesSettled` takes the same entries, but never rejects because an entry failed. It waits for every fetch and ensure entry to settle, then resolves to `[handles, results]`. Each of those entries has `{ status: 'success', data }` or `{ status: 'error', error }` on `results`, with a `TRPCEntryError`:

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

- It waits for every entry, even after one has failed, so you see all the failures, not just the first.
- `results` has no key for prefetch entries, as `data` hasn't with `loadHandles`.
- `handles` has a handle for every entry, failed or not. A component that reads a failed one gets the error in its error boundary, as with a [prefetch entry](#errors-prefetch).
- A cancelled query still rejects, as with `loadHandles`: the load was called off, so there's no result to give.

### With prefetch entries {#errors-prefetch}

A prefetch entry never makes the load reject. The component that reads the handle gets the error instead, and the nearest error boundary shows it. It gets the query's own error, not a `TRPCEntryError`: the boundary already knows which handle it wraps.

```tsx twoslash
// @include: handles-router
// @include: handles-trpc
// @include: handles-components
// @filename: react-error-boundary.d.ts
declare module 'react-error-boundary' {
  export function ErrorBoundary(props: {
    fallbackRender: (props: { error: unknown }) => React.ReactNode;
    children: React.ReactNode;
  }): React.ReactNode;
}
// @filename: post-comments.tsx
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';
// ---cut---
import { isTRPCClientError } from '@trpc/client';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Comments } from '~/components/comments';
import type { AppRouter } from '~/server/router';

function CommentsError(props: { error: unknown }) {
  if (isTRPCClientError<AppRouter>(props.error)) {
    return <p>Couldn't load the comments ({props.error.data?.code}).</p>;
  }
  throw props.error;
}

export function PostComments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  return (
    <ErrorBoundary fallbackRender={CommentsError}>
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments comments={props.comments} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

In the browser, that's a `TRPCClientError`:

- If the query failed before it was dehydrated, it isn't sent. The browser fetches it again and gets a `TRPCClientError`.
- If it was dehydrated while pending and failed later, TanStack Query passes a redacted error to the browser. A handle read then refetches the query once, even with `retry: false`, so error boundaries get a `TRPCClientError` with `data.code`. A query that always fails costs one extra request.

To log or report these errors in one place, whichever component reads the handle, use the `onError` callback of your `QueryClient`'s [`QueryCache`](https://tanstack.com/query/latest/docs/reference/QueryCache).

## Invalidation and staleness {#invalidation-and-staleness}

Handle reads use normal tRPC query keys, so invalidation doesn't change. Pass any of these to `queryClient.invalidateQueries`:

- `{ queryKey: handle.queryKey }` matches the handle's own query, plain or infinite.
- `trpc.post.pathFilter()` matches every query under `post`, plain and infinite.
- `trpc.post.byId.queryFilter(input)` matches a query handle. An infinite handle's key has `type: 'infinite'`, so `queryFilter` misses it: use `trpc.post.comments.infiniteQueryFilter(input)`.

To update a handle's data in place, build its key from the procedure and `handle.input`: `trpc.post.byId.queryKey(handle.input)`, or `infiniteQueryKey` for an infinite handle. `setQueryData` then checks the data's type. `handle.queryKey` is a plain array, so that the handle serializes, and carries no data type.

```ts twoslash
// @include: handles-router
// @include: handles-trpc
// @filename: snippet.ts
import type { QueryClient } from '@tanstack/react-query';
import type {
  inferInfiniteQueryHandle,
  inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';
declare const trpc: TRPC;
declare const queryClient: QueryClient;
declare const handles: {
  post: inferQueryHandle<TRPC['post']['byId']>;
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
};
// ---cut---
queryClient.setQueryData(trpc.post.byId.queryKey(handles.post.input), (post) =>
  post ? { ...post, title: 'Renamed' } : post,
);
queryClient.setQueryData(
  trpc.post.comments.infiniteQueryKey(handles.comments.input),
  (comments) => comments && { ...comments, pages: comments.pages.slice(0, 1) },
);
```

`fromHandle` keeps TanStack Query's refetch defaults. Hydrated data keeps the server's fetch time, so set a `staleTime` above 0 in your query client, as the setup guides do, or the client refetches right after hydration. To change it for one read, pass `staleTime` to `fromHandle`.

## What a handle guarantees {#what-a-handle-guarantees}

- **Types:** only `loadHandles` and `waterfallHandle` create handles. The key, procedure, input and kind (query or infinite) always agree, and output, `select` and error types flow to the read.
- **Runtime:** `fromHandle` checks the handle's shape and `keyPrefix`.
- **Development:** if a handle's query runs during server rendering, its data never reached that `QueryClient`. tRPC logs a warning once per query. The warning is off in production.

Handles aren't signed. A handle names a query the browser could call anyway, and every refetch runs input validation and auth on the server again. Put permission checks in your procedures.

## Testing components that take handles {#testing}

Handles can't be written by hand, so create them in the test with a proxy over a test `QueryClient`. Seed the cache with fixture data, then build the handle with `waterfallHandle`. The reader finds the fixture without calling the procedure:

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
import { waterfallHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { appRouter } from './router';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient });

queryClient.setQueryData(trpc.post.byId.queryKey({ id: '1' }), {
  id: '1',
  title: 'Hello',
});
const post = waterfallHandle(trpc.post.byId, { id: '1' });
```

- Render the component under a `QueryClientProvider` and `TRPCProvider` with the same `queryClient`. The component reads the fixture from the cache.
- Leave out `setQueryData` to run the real procedure, or use a client with [`localLink`](/docs/client/links/localLink) instead of `router` to test through your links.
- For a loading state, leave out `setQueryData` and use a procedure that never resolves: the reader suspends.

## Where handles don't work {#where-handles-dont-work}

- **Server functions and server actions:** they run with a `QueryClient` that never hydrates the page. Return data from them, not handles.
- **URLs and storage:** a handle in the URL or `localStorage` gains nothing over the input itself.

## FAQ {#faq}

### Why functions instead of methods on `trpc`? {#why-functions}

The methods on `trpc`, such as `queryOptions`, `queryKey` and `pathFilter`, return plain TanStack Query options, keys or filters. Handles are tRPC helpers built on top of them, so they're separate functions from `@trpc/tanstack-react-query/unstable-handles` that take a procedure: `ensureEntry(trpc.post.byId, { id })`. Apps that don't use handles don't load their code. Each entry is one TanStack Query call: see [TanStack Query equivalents](#tanstack-equivalents).

### Why one load call instead of a call per query? {#why-one-load}

So a loader can't create a waterfall by the order of its lines. With a call per query, awaiting the post before starting the comments makes the comments wait for the post, and nothing warns you. A load starts every entry before it waits for any, whatever order you list them in. It also gives you the typed data of the entries it waited for, so a loader can check it without reading the cache. The cost is one load call and one entry, even for a loader that loads a single query.
