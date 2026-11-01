---
id: handles
title: Prefetching with handles
sidebar_label: Prefetching with handles
slug: /client/tanstack-react-query/handles
section: "Client Usage"
parent: "client/tanstack-react-query"
order: 53
---

A **handle** is a small, serializable reference to a query you started in a server component, a route loader, or at the top of a page as it renders. You pass it to a component, and the component reads it with full input and output types, without naming the procedure or repeating its input.

:::info
We have prefixed the handle APIs with `unstable_` as they're new, but you're safe to use them! [Read more](/docs/faq#unstable).
:::

:::note Why the `$`?
Methods with a `$`, such as `unstable_$prefetch` and `unstable_$fromHandle`, are tRPC helpers built on TanStack Query, like Drizzle's `$` helpers next to its SQL builders. Anything without a `$`, such as `queryOptions`, `queryKey` and `pathFilter`, returns plain TanStack Query options, keys or filters. Each `$` method is one TanStack Query call: see [TanStack Query equivalents](#tanstack-equivalents).
:::

```tsx
// Server component, route loader, or render: start the query and get a handle
const post = trpc.post.byId.unstable_$prefetch({ id });

// Component: no procedure, no input, fully typed
const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
```

Handles fix a gap in the usual prefetch pattern, where the server prefetches `trpc.post.byId.queryOptions({ id })` and the client has to repeat the same procedure and input:

- If the inputs differ, the read misses the prefetched data and silently fetches again.
- The client can read a different procedure from the one the server prefetched.
- Nothing shows that a prefetch happened at all.

With handles, the client reads exactly what the server started. They work best when a page can start every query from its URL: see [Start every query from the URL](#url-as-input).

A handle from `unstable_$prefetch` carries the query's key and input, but no data. Handles from `unstable_$ensure` and `unstable_$fetch` also carry the data, so loaders can read it and `useQuery` has it from the first render: see [Handles with data](#handles-with-data). Either way, the cache is filled through TanStack Query's dehydrate and hydrate, exactly as in the [Server Components](/docs/client/tanstack-react-query/server-components) guide or TanStack Start's [SSR query integration](/docs/client/tanstack-react-query/tanstack-start). In a server loader, return `dehydrate(queryClient)` with the handles, as in [React Router](#react-router-ssr).

The components that read handles are the same everywhere: with or without server components, and whether the handle came from a loader or from render.

## Starting a query {#starting-a-query}

You start a query in one of two ways. Choose for each query:

- **Don't wait** with `unstable_$prefetch`. The page renders at once, and the data streams in later.
- **Wait** with `unstable_$ensure`. The page renders once the data is ready.

`unstable_$fetch` is a stricter form of waiting, for code that needs fresh data. See [Waiting for fresh data](#fetch).

### Without waiting: `unstable_$prefetch` {#prefetch}

```tsx
const post = trpc.post.byId.unstable_$prefetch({ id });
```

- It returns a handle at once. The request runs in the background.
- The page doesn't wait. It renders, and the data arrives when the request finishes.
- **You need a `Suspense` boundary.** The component that reads the handle suspends until the data arrives. Wrap it in `<Suspense>` to show a fallback in its place:

  ```tsx
  <Suspense fallback={<p>Loading post…</p>}>
    <Post post={post} />
  </Suspense>
  ```

  Without a boundary of your own, React shows the fallback of the nearest boundary above it, which may cover the whole page.

- It never throws. If the request fails, the component that reads the handle gets the error, and the nearest error boundary shows it.

Use it for data the page can show a placeholder for: slow queries, content below the fold, secondary panels.

### Waiting: `unstable_$ensure` {#ensure}

```tsx
const post = await trpc.post.byId.unstable_$ensure({ id });
```

- It returns a promise. The promise resolves to a handle once the cache has data for the query.
- The handle carries that data as `post.data`, so the loader can use it, and `useQuery` has it from the first render. See [Handles with data](#handles-with-data).
- The page waits for that promise, so the data is ready before anything renders.
- **You don't need a `Suspense` boundary** for this query. The component that reads the handle finds the data in the cache and renders at once.
- It rejects if the request fails, so you can handle the error where you start the query, for example to show a not-found page.
- If the cache already has stale data, it resolves at once and refetches in the background.

Use it for data the page can't render without, or data you need before rendering: the page title, a not-found check, a redirect.

### Waiting for fresh data: `unstable_$fetch` {#fetch}

```tsx
const post = await trpc.post.byId.unstable_$fetch({ id });
```

- It works like `unstable_$ensure`, with one difference: if the cache has stale data, it refetches and waits for the new data.
- Use it when the code that starts the query reads the data and needs it fresh, for example a loader that redirects based on the post.
- In a browser loader, prefer `unstable_$ensure`. With stale data, `unstable_$ensure` renders the page at once and updates it when the refetch lands. `unstable_$fetch` holds up the navigation until the refetch is done.
- In server components, the two behave the same: the request's `QueryClient` starts empty, so both wait for the request.

### Which to use {#which-to-use}

|                        | `unstable_$prefetch`              | `unstable_$ensure`     | `unstable_$fetch`      |
| ---------------------- | --------------------------------- | ---------------------- | ---------------------- |
| Returns                | A handle                          | A promise for a handle | A promise for a handle |
| Handle carries data    | No                                | Yes                    | Yes                    |
| Page waits for data    | No                                | Yes                    | Yes                    |
| With stale data        | Refetches in the background       | Resolves at once       | Waits for the refetch  |
| `Suspense` boundary    | Needed around the reader          | Not needed             | Not needed             |
| When the request fails | An error boundary shows the error | The promise rejects    | The promise rejects    |

### TanStack Query equivalents {#tanstack-equivalents}

Each `$` method makes one TanStack Query call with the procedure's `queryOptions` or `infiniteQueryOptions`, then returns a handle:

| tRPC                                                                                | TanStack Query                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trpc.x.unstable_$prefetch(input, opts)`                                            | `void queryClient.prefetchQuery(trpc.x.queryOptions(input, opts))`                                                                                                       |
| `await trpc.x.unstable_$ensure(input, opts)`                                        | `await queryClient.ensureQueryData({ ...trpc.x.queryOptions(input, opts), revalidateIfStale: true })`                                                                    |
| `await trpc.x.unstable_$fetch(input, opts)`                                         | `await queryClient.fetchQuery(trpc.x.queryOptions(input, opts))`                                                                                                         |
| `unstable_$prefetchInfinite`, `unstable_$ensureInfinite`, `unstable_$fetchInfinite` | `prefetchInfiniteQuery`, `ensureInfiniteQueryData` (with `revalidateIfStale: true`), `fetchInfiniteQuery`                                                                |
| `trpc.x.unstable_$prefetch(input)` on `useTRPC()`, in render                        | [`usePrefetchQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/usePrefetchQuery)`(trpc.x.queryOptions(input))`, as a plain call instead of a hook |
| `trpc.unstable_$fromHandle(handle, opts)`                                           | `trpc.x.queryOptions(handle.input, { initialData: handle.data, ...opts })`, with `x` taken from the handle                                                               |

The `queryClient` is the one the proxy was created with.

### Combining both {#combining-both}

A page can wait for some queries and stream others. Start every query first, then await. If you await before starting the rest, the requests run one after another:

```tsx
// 1. Start the query you won't wait for
const related = trpc.post.related.unstable_$prefetch({ id });
// 2. Then wait for the one you need
const post = await trpc.post.byId.unstable_$ensure({ id });
```

Here the post is ready when the page renders, and the related posts stream in behind their own `Suspense` boundary.

### Options {#start-options}

- `input` is optional when the procedure's input is optional, so `trpc.viewer.unstable_$prefetch()` works.
- `opts` takes `staleTime`, `gcTime`, `retry`, `retryDelay`, `meta`, and `trpc` request options such as `context`.

### Where to start queries {#where-to-start}

| Your app                                       | Start queries in                                 | With                                    |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| Next.js App Router                             | Server components                                | The server proxy from `trpc/server.tsx` |
| TanStack Start, TanStack Router                | Route loaders                                    | The proxy in your router context        |
| React Router                                   | `loader` or `clientLoader`                       | See [React Router](#react-router)       |
| No loaders or server components, such as a SPA | The top of the page, [as it renders](#in-render) | `useTRPC()`                             |

- In server components, the request's `QueryClient` starts empty, so `unstable_$ensure` always waits for the request.
- On `useTRPC()`, `unstable_$prefetch` is safe to call during render: like `usePrefetchQuery`, it starts a query only if the cache has no state for it. See [Without a loader](#in-render).

## Start every query from the URL {#url-as-input}

A loader or server component runs before anything renders, and all it has is the URL: the route's params, its search params, and on the server, the session. If every query a page needs takes its input from those, every request starts the moment the navigation does. No component has to render first to find out what to fetch.

- **Path params** name what the page is about: `/posts/$slug`.
- **Search params** hold everything else that changes what a query fetches: filters, sort, page. Keep them out of component state. A loader can't see component state, so the query would start only after render, the back button wouldn't restore the view, and a shared link would open the default one.

### If the URL isn't enough, reshape the procedure {#reshape-procedures}

If a page can't start a query from the URL alone, revisit the procedure before the page. A procedure that takes an id you only learn from another query's result forces a waterfall on every page that calls it. Two fixes:

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
// ---cut---
async function loader(params: { slug: string }) {
  const post = await trpc.post.bySlug.unstable_$ensure({
    slug: params.slug,
  });
  // Nothing below can start until the post has arrived
  const comments = trpc.post.comments.unstable_$prefetchInfinite({
    postId: post.data.id,
  });
  const author = trpc.author.byId.unstable_$prefetch({
    id: post.data.authorId,
  });
  return { post, comments, author };
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
// ---cut---
async function loader(params: { slug: string }) {
  // Both start from the URL, together
  const comments = trpc.post.comments.unstable_$prefetchInfinite({
    slug: params.slug,
  });
  const post = await trpc.post.bySlug.unstable_$ensure({
    slug: params.slug,
  });
  return { post, comments };
}
```

```
post.bySlug     |-------|
post.comments   |-------|
```

The page is ready after one round trip instead of two, and the loader no longer reads `post.data` to start the other queries.

## Reading a handle {#reading-a-handle}

`trpc.unstable_$fromHandle(handle, opts?)` returns the same options as `trpc.<path>.queryOptions(input, opts)` for the handle's procedure and input. Pass them to any TanStack Query hook or `QueryClient` method:

```tsx
const trpc = useTRPC();
const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
const titleQuery = useQuery(trpc.unstable_$fromHandle(props.post, { select: (post) => post.title }));
const [aQuery, bQuery] = useSuspenseQueries({
  queries: [trpc.unstable_$fromHandle(props.a), trpc.unstable_$fromHandle(props.b)],
});
```

- `opts` takes everything `queryOptions` takes, such as `select`, `staleTime`, `refetchInterval` and `trpc`.
- `unstable_$fromHandle` is available on every router level: `trpc.unstable_$fromHandle` and `trpc.post.unstable_$fromHandle` behave the same.
- Reads use the same query key as `trpc.<path>.queryOptions(input)`, so old and new code share cache entries.
- `handle.queryKey` is the cache entry's key. For a typed `queryClient.getQueryData`, pass `trpc.unstable_$fromHandle(handle).queryKey`. The handle's own key isn't tagged with its data type, so the handle stays serializable everywhere, including TanStack Router's `beforeLoad`.
- `handle.data` is the data an `unstable_$ensure` or `unstable_$fetch` handle was resolved with. See [Handles with data](#handles-with-data).
- `handle.input` is the typed input the query was started with, so a component doesn't need it as a separate prop. Infinite handles leave out `cursor` and `direction`.

### Typing props {#typing-props}

Export your proxy type once, then type props with `unstable_inferQueryHandle`:

```tsx title='trpc/client.tsx'
export type TRPC = TRPCOptionsProxy<AppRouter>;
```

```tsx title='app/posts/[id]/post.tsx'
'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from '~/trpc/client';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}
```

A handle can only come from `unstable_$prefetch`, `unstable_$ensure` or `unstable_$fetch`. A raw input, or an object with the right `queryKey` and `input` written by hand, doesn't type-check. In tests, start a handle against a test `QueryClient` instead: see [Testing components that take handles](#testing). At runtime, `unstable_$fromHandle` also throws a readable error for anything that isn't a handle, and when the handle's `keyPrefix` differs from the reading proxy's.

`unstable_inferQueryHandle` accepts every handle for the procedure, with or without data. To require data, use `unstable_inferQueryHandleWithData`.

## Handles with data {#handles-with-data}

A handle from `unstable_$ensure` or `unstable_$fetch` extends the plain handle with the data it was resolved with:

- `data` is the query's output. A loader can read it straight away, for example to start a [dependent query](#waterfall-in-a-loader) or set the page title.
- `dataUpdatedAt` is when the cache got that data.

`unstable_$fromHandle` passes them on as `initialData` and `initialDataUpdatedAt`, so `useQuery` has the data on its first render and types `data` as defined, without a `Suspense` boundary and without a hydrated cache. When the cache already has an entry for the query, the cache wins: `initialData` only fills an empty entry, as in TanStack Query. A newer refetch or a `setQueryData` is never replaced by the handle's copy.

```tsx twoslash title='app/posts/$slug/post.tsx'
// @jsx: react-jsx
// @include: url-db
// @include: url-after
// @filename: post.tsx
import React from 'react';
import { trpc as serverTRPC } from './after/server';
const useTRPC = () => serverTRPC;
// ---cut---
import { useQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandleWithData } from '@trpc/tanstack-react-query';

export function Post(props: {
  post: unstable_inferQueryHandleWithData<typeof serverTRPC.post.bySlug>;
}) {
  const trpc = useTRPC();
  const postQuery = useQuery(trpc.unstable_$fromHandle(props.post));
  // `data` is defined: no `?.` needed
  return <h1>{postQuery.data.title}</h1>;
}
```

- `unstable_$prefetch` handles carry no data. They're returned before the request finishes, so with `useQuery` the data stays possibly `undefined` until the request lands. Read them with `useSuspenseQuery`, or wait with `unstable_$ensure`.
- `placeholderData` and `initialData` you pass to `unstable_$fromHandle` must match the procedure's output, so they can't widen `data`'s type.
- `data` crosses to the client through your framework's serialization, like `input`: React Server Components, TanStack Router's serializer, or React Router's. Not through your tRPC data transformer. See [Handle inputs](#nextjs-handle-inputs).

### Size {#handles-with-data-size}

With server rendering, the data travels twice: once inside the dehydrated cache and once inside the handle. Measured with a list of posts, the copy adds this much to the payload:

| Data in the query       | Uncompressed | gzip    | Brotli |
| ----------------------- | ------------ | ------- | ------ |
| 20 posts, about 8 KB    | +80–100%     | +3–12%  | +0–9%  |
| 100 posts, about 37 KB  | +80–100%     | +84–94% | +0–9%  |
| 500 posts, about 187 KB | +80–100%     | +92–99% | +0–11% |

The low end is when both copies are encoded the same way, the high end when the framework encodes the handle differently from the dehydrated cache. gzip only finds a copy within 32 KB of the original, so past that it sends both in full. For large data that the page doesn't need in the loader, prefer `unstable_$prefetch`.

## Infinite queries {#infinite-queries}

Procedures with a `cursor` input also have `unstable_$prefetchInfinite`, `unstable_$ensureInfinite` and `unstable_$fetchInfinite`. They load the first page. To load more pages up front, pass `pages` with `getNextPageParam`:

```tsx
const comments = trpc.post.comments.unstable_$prefetchInfinite({ postId: id, limit: 20 });
const firstThree = await trpc.post.comments.unstable_$ensureInfinite(
  { postId: id, limit: 20 },
  { pages: 3, getNextPageParam: (last) => last.nextCursor },
);
```

Functions can't cross to the client, so `getNextPageParam` is required when you read an infinite handle:

```tsx
const commentsQuery = useSuspenseInfiniteQuery(
  trpc.unstable_$fromHandle(props.comments, {
    getNextPageParam: (last) => last.nextCursor,
  }),
);
```

Type the prop with `unstable_inferInfiniteQueryHandle<TRPC['post']['comments']>`.

Handles from `unstable_$ensureInfinite` and `unstable_$fetchInfinite` carry the loaded pages as `data`, with `pages` and `pageParams`, so `useInfiniteQuery` has them on its first render. To require them in a prop, use `unstable_inferInfiniteQueryHandleWithData`.

### Changing the input when you read {#changing-the-input}

:::warning Prefer the URL
If the user can change a list's sort or filter, put it in a [search param](#url-as-input), and the loader starts the new query when it changes. Only change the input in the component when the URL can't hold it.
:::

A handle's read always uses the handle's input. To change part of it in the component, read `handle.input` and build the options yourself:

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
import type { unstable_inferInfiniteQueryHandle } from '@trpc/tanstack-react-query';
import { useState } from 'react';

export function Comments(props: {
  comments: unstable_inferInfiniteQueryHandle<typeof serverTRPC.post.comments>;
}) {
  const trpc = useTRPC();
  const [sort, setSort] = useState(props.comments.input.sort);
  const commentsQuery = useSuspenseInfiniteQuery(
    trpc.post.comments.infiniteQueryOptions(
      { ...props.comments.input, sort },
      { getNextPageParam: (last) => last.nextCursor },
    ),
  );
  return (
    <>
      <button onClick={() => setSort('top')}>Top</button>
      <p>{commentsQuery.data.pages[0]?.items.length} comments</p>
    </>
  );
}
```

- The handle's input still says which procedure and input the loader started, so the first render reads the loader's query.
- The new query starts when the component renders with the new input, so its first page is a waterfall. Wrap `setSort` in `startTransition` to keep showing the old list while it loads.

## Without a loader: in render {#in-render}

Not every app has a route loader or server components to start queries in. A single-page app, or a page whose input lives in component state, can start its queries at the top of the page as it renders, and pass the handles down:

```tsx title='pages/post.tsx'
import { Suspense } from 'react';
import { useTRPC } from '~/trpc/client';
import { Comments } from './comments';
import { Post } from './post';

export function PostPage(props: { id: string }) {
  const trpc = useTRPC();
  const post = trpc.post.byId.unstable_$prefetch({ id: props.id });
  const comments = trpc.post.comments.unstable_$prefetchInfinite({ postId: props.id, limit: 20 });

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

`Post` and `Comments` are the same components a loader or a server component would feed. Both queries start before either of them renders, so they load in parallel instead of one after the other.

- On `useTRPC()`, `unstable_$prefetch` and `unstable_$prefetchInfinite` follow the rule of TanStack Query's [`usePrefetchQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/usePrefetchQuery): they start a query only if the cache has no entry for it, with no data, no error and no request in flight. The cache looks it up by TanStack Query's query hash, which ignores the order of keys in the input, so re-renders with the same input start nothing. When an input changes, the new query starts.
- They're plain calls, not hooks: you can call them conditionally, and React Compiler can memoize them.
- A query with cached data renders it at once. The component that reads the handle refetches it in the background if it's stale, as `useSuspenseQuery` always does.
- To wait for a query, read its handle with `useSuspenseQuery`. On `useTRPC()`, `unstable_$ensure` and `unstable_$fetch` throw, since a render can't wait.
- Start queries high in the tree: in the page, not in the components that read the handles. Starting queries where they're read brings back the waterfall.
- With server rendering, the queries start in the server render too. TanStack Start's [SSR query integration](/docs/client/tanstack-react-query/tanstack-start) streams them to the browser. Elsewhere, such as React Router's framework mode, nothing sends their data to the browser, which fetches them again: start them in a [loader](#react-router) instead.
- Only the proxy from `useTRPC()` behaves this way. A proxy from `createTRPCOptionsProxy` is for loaders and server components, where `unstable_$prefetch` refetches stale data like `queryClient.prefetchQuery`. During render, it would refetch on every render.

## Request waterfalls {#waterfalls}

A request waterfall is a request that can't start until another one has finished. Each level costs a full round trip, and on a slow connection a round trip can take hundreds of milliseconds. Removing waterfalls is usually the most effective thing you can do for a page's loading time.

Handles are built around this. Queries start in loaders and server components, where everything a page needs is known up front, so they start together:

```
1. |-> post.byId
1. |-> post.comments
1. |-> user.byId
```

instead of one after the other, as each component renders and finds out what it needs:

```
1. |-> post.byId
2.   |-> post.comments
3.     |-> user.byId
```

To keep it that way:

- Start queries in loaders and server components, not in render.
- Start every query before awaiting any. See [Combining both](#combining-both).
- Make the URL the input, so the loader can start every query. See [Start every query from the URL](#url-as-input).

### Dependent queries {#dependent-queries}

A query whose input comes from another query's result is a waterfall by construction. Most pages don't need one: put the input in the route, or [reshape the procedure](#reshape-procedures) so the page can start it from the URL. For example, `trpc.viewer.org` instead of `trpc.viewer` and then `trpc.org.byId`.

When the data really can't be reshaped, for example a third-party API you don't control, there are two explicit ways. Both pay the extra round trip.

### In a loader or server component {#waterfall-in-a-loader}

Wait for the first query, then start the second from its data:

```tsx
const viewer = await trpc.viewer.unstable_$ensure();
const org = trpc.org.byId.unstable_$prefetch({ orgId: viewer.data.orgId });
```

The page waits for the first request, and the second starts only after it.

### In a component {#waterfall-in-a-component}

When an input is only known at render time, such as an id from a parent query's result, no loader can start the query. Start it [in render](#in-render) in the component that has the input, and pass the handle to the one that renders it:

```tsx
function PostAuthor(props: { post: Post }) {
  const trpc = useTRPC();
  const author = trpc.user.byId.unstable_$prefetch({ id: props.post.authorId });
  return (
    <Suspense fallback={<AuthorSkeleton />}>
      <AuthorCard author={author} />
    </Suspense>
  );
}
```

- The query starts when the component renders, an extra round trip after its parent's data arrives. Searching for `unstable_$prefetch` in components below the top of a page lists these waterfalls.
- Reading `trpc.user.byId.queryOptions(input)` with `useSuspenseQuery` works too, as it always has.
- In the Next.js App Router, start the dependent query in the server component instead, as in the [loader example](#waterfall-in-a-loader).

## React Router {#react-router}

React Router loads data in one of two places, and handles fit each a little differently. Route components pass handles from `loaderData` to the same client components as everywhere else.

### Client-only apps {#react-router-client}

In [SPA Mode](https://reactrouter.com/how-to/spa) (`ssr: false`) with `clientLoader`, or in [Data Mode](https://reactrouter.com/start/modes#data) with `createBrowserRouter`, loaders run in the browser. Create the tab's `QueryClient` and proxy in a module, so loaders can import them, and provide the same client to your app:

```tsx title='app/trpc.ts'
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

```tsx title='app/routes/post.tsx'
import { trpc } from '~/trpc';
import type { Route } from './+types/post';

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const comments = trpc.post.comments.unstable_$prefetchInfinite({ postId: params.id, limit: 20 });
  const post = await trpc.post.byId.unstable_$ensure({ id: params.id });
  return { comments, post };
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

- There is nothing to hydrate: the loader starts queries in the same `QueryClient` the components read.
- `unstable_$ensure` waits on the first visit only. Coming back shows the cached post at once and refetches it in the background if it's stale.
- Key `Suspense` boundaries by the route's input. React Router renders the next page in a transition, and a transition waits for a boundary that's already showing content instead of showing its fallback. Without the key, navigating from one post to another waits for the comments.

### Server rendering {#react-router-ssr}

In [Framework Mode](https://reactrouter.com/start/modes#framework) with server rendering, `loader` runs on the server, for the first page load and for every navigation after it. Create a query client and proxy per request in a root [middleware](https://reactrouter.com/how-to/middleware). Loaders return `dehydrate(queryClient)` with their handles, and the route component wraps its children in TanStack Query's `HydrationBoundary`, as with any TanStack Query loader:

```tsx title='app/trpc/server.ts'
import type { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
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

```tsx title='app/root.tsx'
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

```tsx title='app/routes/post.tsx'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

export async function loader({ params, context }: Route.LoaderArgs) {
  const { queryClient, trpc } = context.get(trpcContext);
  const comments = trpc.post.comments.unstable_$prefetchInfinite({ postId: params.id, limit: 20 });
  const post = await trpc.post.byId.unstable_$ensure({ id: params.id });
  return { dehydratedState: dehydrate(queryClient), comments, post };
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
- Use `unstable_$prefetch` and `unstable_$fetch` in a `loader`. The request's `QueryClient` starts empty, so `unstable_$ensure` waits like `unstable_$fetch`.

## Next.js App Router {#nextjs-app-router}

This builds on the [Next.js App Router setup](/docs/client/nextjs/app-router-setup). The query client factory and the server proxy in `trpc/server.tsx` stay as they are. Add `export type TRPC = TRPCOptionsProxy<AppRouter>` to `trpc/client.tsx`, and create a `HydrateClient` in `trpc/server.tsx`:

```tsx title='trpc/server.tsx'
import { unstable_createHydrateClient } from '@trpc/tanstack-react-query';

export const getQueryClient = cache(makeQueryClient);
// ... `trpc` proxy as before

export const HydrateClient = unstable_createHydrateClient(getQueryClient);
```

The client components are the same either way: they read the handle with `useSuspenseQuery(trpc.unstable_$fromHandle(...))`, as in [Typing props](#typing-props).

### `HydrateClient` {#hydrate-client}

`HydrateClient` sends the queries the request has started so far to the browser, including pending ones, which stream in as they settle. Render one in each server component that starts queries for client components:

```tsx title='app/posts/[id]/page.tsx'
export default async function PostPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const post = trpc.post.byId.unstable_$prefetch({ id });
  return (
    <HydrateClient>
      <Post post={post} />
      <Suspense fallback={<p>Loading comments…</p>}>
        <CommentsSection id={id} />
      </Suspense>
    </HydrateClient>
  );
}

async function CommentsSection(props: { id: string }) {
  const comments = trpc.post.comments.unstable_$prefetchInfinite({ postId: props.id, limit: 20 });
  return (
    <HydrateClient>
      <Comments comments={comments} />
    </HydrateClient>
  );
}
```

- A query an earlier `HydrateClient` sent in the same request isn't sent again, so nesting them is fine. The outer one renders before `CommentsSection` starts its query, so each sends only its own.
- A query is sent again when the server has newer data for it, for example after `unstable_$fetch` refetched it.
- It keeps your query client's `dehydrate` options: `shouldDehydrateQuery`, `serializeData` and the rest.
- It works only in server components. `@trpc/tanstack-react-query` resolves to its server build through the `react-server` [export condition](https://nodejs.org/api/packages.html#conditional-exports), which Next.js and other RSC bundlers set for server components. Rendered anywhere else, it throws.
- It works for queries started with `queryClient.prefetchQuery(trpc.x.queryOptions(input))` too, not only handles.

### Streaming with `unstable_$prefetch` {#nextjs-prefetch}

The page sends its HTML at once. Each `Suspense` boundary shows its fallback, then the data streams in:

```tsx title='app/posts/[id]/page.tsx'
import { Suspense } from 'react';
import { HydrateClient, trpc } from '~/trpc/server';
import { Comments } from './comments';
import { Post } from './post';

export default async function PostPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const post = trpc.post.byId.unstable_$prefetch({ id });
  const comments = trpc.post.comments.unstable_$prefetchInfinite({ postId: id, limit: 20 });

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

### Waiting with `unstable_$ensure` {#nextjs-ensure}

The page waits for the post before it renders. Use this when the page can't render without the data, or when you need it on the server, for example to call `notFound()`:

```tsx title='app/posts/[id]/page.tsx'
import { TRPCError } from '@trpc/server';
import { notFound } from 'next/navigation';
import { HydrateClient, trpc } from '~/trpc/server';
import { Post } from './post';

export default async function PostPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const post = await trpc.post.byId.unstable_$ensure({ id }).catch((cause) => {
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

- `Post` needs no `Suspense` boundary: the data is in the cache before it renders.
- To use the data on the server, read `post.data`.

To wait for some queries and stream others on the same page, see [Combining both](#combining-both).

### Handle inputs {#nextjs-handle-inputs}

Handle inputs cross to the client inside the handle, through React's own serialization, not your tRPC data transformer. Plain JSON values, `Date`, `Map`, `Set` and `BigInt` work. This isn't new: dehydrated query keys already cross the same way.

## Errors {#errors}

### With `unstable_$prefetch` {#errors-prefetch}

`unstable_$prefetch` never throws. The component that reads the handle gets the error instead, and the nearest error boundary shows it:

- If the query failed before it was dehydrated, it isn't sent. The browser fetches it again and gets a `TRPCClientError`.
- If it was dehydrated while pending and failed later, TanStack Query passes a redacted error to the browser. A handle read then refetches the query once, even with `retry: false`, so error boundaries get a `TRPCClientError` with `data.code`. Deterministic failures cost one extra request.

To log or report these errors in one place, whichever component reads the handle, use the `onError` callback of your `QueryClient`'s [`QueryCache`](https://tanstack.com/query/latest/docs/reference/QueryCache).

### With `unstable_$ensure` {#errors-ensure}

`unstable_$ensure` and `unstable_$fetch` reject where you await them:

- On the server proxy, with a `TRPCError`.
- On a client-backed proxy, such as one in a TanStack Start loader, with a `TRPCClientError`.

## Invalidation and staleness {#invalidation-and-staleness}

Handle reads use normal tRPC query keys, so invalidation doesn't change: `queryClient.invalidateQueries(trpc.post.pathFilter())`, `trpc.post.byId.queryFilter(input)` and `{ queryKey: handle.queryKey }` all match.

`unstable_$fromHandle` keeps TanStack Query's refetch defaults. Hydrated data keeps the server's fetch time, so set a `staleTime` above 0 in your query client, as the setup guides do, or the client refetches right after hydration. To change it for one read, pass `staleTime` to `unstable_$fromHandle`.

## What a handle guarantees {#what-a-handle-guarantees}

- **Types:** only `unstable_$prefetch`, `unstable_$ensure` and `unstable_$fetch` create handles. The key, procedure, input and kind (query or infinite) always agree, and output, `select` and error types flow to the read.
- **Runtime:** `unstable_$fromHandle` checks the handle's shape and `keyPrefix`.
- **Development:** if a handle's query runs during server rendering, its data never reached that `QueryClient`. tRPC logs a warning once per query. The warning is off in production.

Handles aren't signed. A handle names a query the browser could call anyway, and every refetch runs input validation and auth on the server again. Put permission checks in your procedures.

## Testing components that take handles {#testing}

Handles can't be written by hand, so create them in the test the way a loader does: with a proxy over a test `QueryClient`. Seed the cache with fixture data, then `unstable_$ensure` returns a handle without calling the procedure:

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
import { appRouter } from './router';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient });

queryClient.setQueryData(trpc.post.byId.queryKey({ id: '1' }), {
  id: '1',
  title: 'Hello',
});
const post = await trpc.post.byId.unstable_$ensure({ id: '1' });
```

- Render the component under a `QueryClientProvider` and `TRPCProvider` with the same `queryClient`. The component reads the fixture from the cache, and `post.data` holds it too.
- Leave out `setQueryData` to run the real procedure, or use a client with [`localLink`](/docs/client/links/localLink) instead of `router` to test through your links.
- `unstable_$prefetch` gives a handle for a loading state: with a procedure that never resolves, the reader suspends.

## Where handles don't work {#where-handles-dont-work}

- **Server functions and server actions:** they run with a `QueryClient` that never hydrates the page. Return data from them, not handles.
- **URLs and storage:** a handle in the URL or `localStorage` gains nothing over the input itself.
- **Event handlers:** to preload on hover, use `queryClient.prefetchQuery(trpc.x.queryOptions(input))`. In render, use [`unstable_$prefetch` on `useTRPC()`](#in-render).
