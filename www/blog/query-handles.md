---
title: "Query handles: pass the query, not the input"
description: "Today we're adding query handles to the TanStack React Query integration. Before we get to the API, let's look at the problem they solve: where your queries start, and what a component needs to read one."
date: "2026-11-01"
authors: [{"image":"https://github.com/KATT.png","name":"Alex / KATT 🐱","title":"Creator of tRPC","url":"https://x.com/alexdotjs"}]
---

Today we're adding **query handles** to the TanStack React Query integration. Before we get to the API, let's look at the problem they solve: where your queries start, and what a component needs to read one.

## Fetch-on-render, and its waterfalls

The simplest way to load data is to let each component fetch its own as it renders. This is called fetch-on-render, sometimes fetch-as-you-render:

```tsx twoslash title="post-page.tsx"
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

type Post = { id: string; title: string; authorId: string };
type Comment = { id: string; text: string };

export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }): Post => ({ id: input.id, title: 'Hello', authorId: '1' })),
    comments: t.procedure
      .input(z.object({ postId: z.string(), limit: z.number(), cursor: z.number().nullish() }))
      .query(({ input }) => ({
        items: [] as Comment[],
        nextCursor: (input.cursor ?? 0) + input.limit as number | null,
      })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

// @filename: trpc/server.tsx
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(() => new QueryClient());
export const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient: getQueryClient });
export const HydrateClient = unstable_createHydrateClient(getQueryClient);

// @filename: post.tsx
'use client';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}
// @filename: fetch-on-render.tsx
// ---cut---
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Suspense } from 'react';
import { useTRPC } from './trpc/client';

export function PostPage(props: { id: string }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(
    trpc.post.byId.queryOptions({ id: props.id }),
  );
  return (
    <article>
      <h1>{postQuery.data.title}</h1>
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments postId={props.id} />
      </Suspense>
    </article>
  );
}

function Comments(props: { postId: string }) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    trpc.post.comments.infiniteQueryOptions(
      { postId: props.postId, limit: 20 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    ),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
}
```

It reads well, but `Comments` doesn't exist until `PostPage` has its post. So the comments can't start loading until the post has arrived, even though they only need the `id` that was there all along:

```
post.byId      |-------|
post.comments          |-------|
               0       200     400 ms
```

That's a request waterfall: a request that can't start until another one has finished. Each step costs a full round trip, and on a slow connection a round trip can take hundreds of milliseconds. Every level of nesting can add another one, and they're easy to miss, because each component looks fine on its own.

## Render-as-you-fetch

The fix is to start fetching before you render. A route loader or a server component runs before the page does, so it can start every query at once. The components then read the results:

```tsx
// In a route loader or a server component: start everything up front
void queryClient.prefetchQuery(trpc.post.byId.queryOptions({ id }));
void queryClient.prefetchInfiniteQuery(
  trpc.post.comments.infiniteQueryOptions({ postId: id, limit: 20 }),
);

// ...and in the components, read what was started
const postQuery = useSuspenseQuery(
  trpc.post.byId.queryOptions({ id: props.id }),
);
```

Now both requests go out together, and the page is ready after one round trip:

```
post.byId      |-------|
post.comments  |-------|
               0       200 ms
```

This is render-as-you-fetch, and it's what TanStack Query's prefetching is for.

## The URL is the input

Render-as-you-fetch only works if the loader can tell what the page needs before anything renders, and all it has is the URL. `/posts/42` names the post, and the post's id is all the comments need. So the rule is: every query a page needs should start from the route's params and search params.

- **Path params** name what the page is about.
- **Search params** hold everything else that changes what a query fetches: filters, sort, page. If they live in component state instead, the loader can't see them, so the query starts only after render. The back button doesn't restore the view, and a shared link opens the default one.

And the heuristic that follows from it: **if a page can't fetch something from the URL alone, revisit the procedure, not the page.** Say `/posts/$slug` loads `post.bySlug`, and the comments and the author take the post's id and author id. Both have to wait for the post, on every page that shows them. Let `post.comments` take the slug, and have `post.bySlug` return the post with its author. The server sits next to the database, so the extra lookup costs a query there, not another round trip from the browser. The [docs](/docs/client/tanstack-react-query/handles#url-as-input) show the procedures before and after.

## Pass the query, not the input

So the loader can start everything. But look at what it hands down to the components: the input, `id`. Each component then rebuilds the query from it.

When the loader passes an input, the server and the client both name the procedure and both build its input. Nothing ties the two together:

- **If the inputs drift, the read silently misses.** Prefetch the comments with `limit: 20` and read them with `limit: 10`, or add a `locale` on the server and forget it on the client, and the component quietly fetches again from the browser. Nothing errors, and the waterfall you removed is back.
- **The client can read a different procedure** from the one the server prefetched, and it still type-checks.
- **Nothing shows that a prefetch happened at all.** Reading the component, you can't tell whether its data is already on its way or whether it's about to start a request.

If the loader hands down the query itself instead, all three go away. The server's call becomes the single source of truth: the component reads exactly what the server started, with no procedure and no input to get wrong, and its props say that the data was started for it.

## Query handles

That's what a query handle is: a small, serializable reference to a query you started in a server component, in a route loader, or at the top of a page as it renders. You pass it to a component, and the component reads it with full input and output types:

```tsx twoslash title="page.tsx"
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

type Post = { id: string; title: string; authorId: string };
type Comment = { id: string; text: string };

export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }): Post => ({ id: input.id, title: 'Hello', authorId: '1' })),
    comments: t.procedure
      .input(z.object({ postId: z.string(), limit: z.number(), cursor: z.number().nullish() }))
      .query(({ input }) => ({
        items: [] as Comment[],
        nextCursor: (input.cursor ?? 0) + input.limit as number | null,
      })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

// @filename: trpc/server.tsx
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(() => new QueryClient());
export const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient: getQueryClient });
export const HydrateClient = unstable_createHydrateClient(getQueryClient);

// @filename: post.tsx
'use client';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}
// @filename: page.tsx
// ---cut---
import { Suspense } from 'react';
import { Post } from './post';
import { HydrateClient, trpc } from './trpc/server';

export default async function PostPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  // Start the query, and get a handle for it
  const post = trpc.post.byId.unstable_$prefetch({ id });

  return (
    <HydrateClient>
      <Suspense fallback={<p>Loading…</p>}>
        <Post post={post} />
      </Suspense>
    </HydrateClient>
  );
}
```

```tsx twoslash title="post.tsx"
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

type Post = { id: string; title: string; authorId: string };
type Comment = { id: string; text: string };

export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }): Post => ({ id: input.id, title: 'Hello', authorId: '1' })),
    comments: t.procedure
      .input(z.object({ postId: z.string(), limit: z.number(), cursor: z.number().nullish() }))
      .query(({ input }) => ({
        items: [] as Comment[],
        nextCursor: (input.cursor ?? 0) + input.limit as number | null,
      })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

// @filename: trpc/server.tsx
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(() => new QueryClient());
export const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient: getQueryClient });
export const HydrateClient = unstable_createHydrateClient(getQueryClient);

// @filename: post.tsx
'use client';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}
// @filename: post-display.tsx
// ---cut---
'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from './trpc/client';

type Handle = unstable_inferQueryHandle<TRPC['post']['byId']>;

export function Post(props: { post: Handle }) {
  const trpc = useTRPC();
  // No procedure, no input, fully typed
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  const post = postQuery.data;
  //    ^?
  return <h1>{post.title}</h1>;
}
```

## How handles work

A handle is the query's key and its input: `{ queryKey, input }`. If you waited for the query, it also carries the data. It's plain data, so it crosses from a server component to a client component, or from a loader to a route component, like any other prop.

You get one by starting a query on the proxy from `createTRPCOptionsProxy`, and you read it with `trpc.unstable_$fromHandle(handle)`, which returns exactly what `trpc.post.byId.queryOptions(input)` would. The `$` marks the methods that are tRPC helpers rather than TanStack Query's own API: more on that [below](#why-unstable). That means:

- It works with every TanStack Query hook and `QueryClient` method: `useQuery`, `useSuspenseQuery`, `useSuspenseQueries`, `queryClient.getQueryData`, you name it.
- It takes the same options, like `select`, `staleTime` and `refetchInterval`.
- It uses the same query keys, so handles share cache entries with your existing code, and `invalidateQueries(trpc.post.pathFilter())` works the way it always has.

Every handle also carries its typed input, so a component that gets a handle doesn't need the input as a separate prop:

```tsx twoslash
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

type Post = { id: string; title: string; authorId: string };
type Comment = { id: string; text: string };

export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }): Post => ({ id: input.id, title: 'Hello', authorId: '1' })),
    comments: t.procedure
      .input(z.object({ postId: z.string(), limit: z.number(), cursor: z.number().nullish() }))
      .query(({ input }) => ({
        items: [] as Comment[],
        nextCursor: (input.cursor ?? 0) + input.limit as number | null,
      })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

// @filename: trpc/server.tsx
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(() => new QueryClient());
export const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient: getQueryClient });
export const HydrateClient = unstable_createHydrateClient(getQueryClient);

// @filename: post.tsx
'use client';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}
// @filename: input.tsx
// ---cut---
import { trpc } from './trpc/server';

const post = trpc.post.byId.unstable_$prefetch({ id: '1' });
post.input;
//   ^?
```

### Wait, or don't

There are three ways to start a query, and you choose for each query on the page:

- `trpc.x.unstable_$prefetch(input)` **doesn't wait**. It returns a handle at once, the page renders, and the data streams in behind a `Suspense` boundary. It never throws: if the request fails, the component that reads the handle gets the error.
- `await trpc.x.unstable_$ensure(input)` **waits** until the cache has data for the query. The component renders at once with no `Suspense` boundary, and you can handle errors where you started the query, like calling `notFound()`. The handle carries the data, so the loader can read it, and `useQuery` has it from the first render with `data` typed as defined.
- `await trpc.x.unstable_$fetch(input)` waits too, and also refetches stale data before it resolves, for code that needs the data to be fresh.

Procedures with a `cursor` input get `unstable_$prefetchInfinite`, `unstable_$ensureInfinite` and `unstable_$fetchInfinite` as well.

A page can mix them. Start every query first, then await the ones you need:

```tsx twoslash
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

type Post = { id: string; title: string; authorId: string };
type Comment = { id: string; text: string };

export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }): Post => ({ id: input.id, title: 'Hello', authorId: '1' })),
    comments: t.procedure
      .input(z.object({ postId: z.string(), limit: z.number(), cursor: z.number().nullish() }))
      .query(({ input }) => ({
        items: [] as Comment[],
        nextCursor: (input.cursor ?? 0) + input.limit as number | null,
      })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

// @filename: trpc/server.tsx
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(() => new QueryClient());
export const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient: getQueryClient });
export const HydrateClient = unstable_createHydrateClient(getQueryClient);

// @filename: post.tsx
'use client';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}
// @filename: mixed.tsx
// ---cut---
import { trpc } from './trpc/server';

async function load(id: string) {
  // 1. Start the query you won't wait for
  const comments = trpc.post.comments.unstable_$prefetchInfinite({
    postId: id,
    limit: 20,
  });
  // 2. Then wait for the one you need
  const post = await trpc.post.byId.unstable_$ensure({ id });
  console.log(post.data.title);
  //                 ^?
  return { post, comments };
}
```

With server rendering, a waited-for handle's data reaches the browser twice: in the hydrated cache, and in the handle. That's cheap for a post, but for a big list the loader doesn't need, `unstable_$prefetch` sends it once. The [docs](/docs/client/tanstack-react-query/handles#handles-with-data-size) have measurements.

## Keeping it waterfall-free

Handles don't make a page waterfall-free on their own: the loader still has to know every input up front, which is why [the URL comes first](#the-url-is-the-input). The [docs on waterfalls](/docs/client/tanstack-react-query/handles#waterfalls) go into more detail.

That said, **handles don't replace `queryOptions`**, and we don't think they should. Fetch-on-render still has its place, as long as it doesn't nest. In the Next.js App Router, if every query starts in a server component, every page transition has to wait on the server. A client component that reads `trpc.x.queryOptions(input)` can render from the cache right away and refetch in the background. Use handles where the route knows what it needs up front, and `queryOptions` where the component does. They share the same cache, so you can mix them freely.

## No loader? Start them as the page renders

Plenty of apps don't have server components or route loaders: a single-page app with a plain `<Routes>`, a modal, a dashboard whose filters live in component state. They still know what a page needs at the top of the page. On `useTRPC()`, the same `unstable_$prefetch` you'd call in a loader works during render, and hands you the handles to pass down:

```tsx twoslash title="post-page.tsx"
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

type Post = { id: string; title: string; authorId: string };
type Comment = { id: string; text: string };

export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }): Post => ({ id: input.id, title: 'Hello', authorId: '1' })),
    comments: t.procedure
      .input(z.object({ postId: z.string(), limit: z.number(), cursor: z.number().nullish() }))
      .query(({ input }) => ({
        items: [] as Comment[],
        nextCursor: (input.cursor ?? 0) + input.limit as number | null,
      })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

// @filename: trpc/server.tsx
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(() => new QueryClient());
export const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient: getQueryClient });
export const HydrateClient = unstable_createHydrateClient(getQueryClient);

// @filename: post.tsx
'use client';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}
// @filename: post-page.tsx
// ---cut---
import { Suspense } from 'react';
import { Post } from './post';
import { useTRPC } from './trpc/client';

export function PostPage(props: { id: string }) {
  const trpc = useTRPC();
  const post = trpc.post.byId.unstable_$prefetch({ id: props.id });
  //    ^?
  const comments = trpc.post.comments.unstable_$prefetchInfinite({
    postId: props.id,
    limit: 20,
  });

  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Post post={post} />
    </Suspense>
  );
}
```

`Post` is the exact same component a server component would feed. Every query starts before any component reads one, so they load side by side instead of each waiting for its parent. During render, a query starts only if the cache has no entry for it, the same rule as TanStack Query's `usePrefetchQuery`, so re-renders with the same input start nothing. No wrapper hook, no dependency array: they're plain calls. Stale cached data shows at once, and the component that reads it refreshes it in the background.

It's also the honest way to write a dependent query: start it in the component that has the input. Search your codebase for `unstable_$prefetch` below the top of a page, and you have a list of your waterfalls.

## TanStack Start

With TanStack Start and TanStack Router, loaders return handles as loader data, and the route component passes them down:

```tsx title="routes/posts/$id.tsx"
export const Route = createFileRoute('/posts/$id')({
  loader: async ({ context: { trpc }, params }) => ({
    comments: trpc.post.comments.unstable_$prefetchInfinite({
      postId: params.id,
      limit: 20,
    }),
    post: await trpc.post.byId.unstable_$ensure({ id: params.id }),
  }),
  component: PostPage,
});

function PostPage() {
  const { post, comments } = Route.useLoaderData();
  return (
    <>
      <Post post={post} />
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments comments={comments} />
      </Suspense>
    </>
  );
}
```

The same loader runs on the server for the first page load, and in the browser for every navigation after it. TanStack's SSR query integration takes care of hydration, and since a handle is just a typed key and input, handles also pass TanStack Router's serializability checks, including in `beforeLoad`. The [TanStack Start guide](/docs/client/tanstack-react-query/tanstack-start) walks through the setup.

## React Router

React Router works the same way. In a client-only app, a `clientLoader` starts queries on the tab's `QueryClient` and returns the handles. With server rendering, a root middleware creates a query client and proxy per request, and the `loader` returns `dehydrate(queryClient)` next to its handles, as any TanStack Query loader would:

```tsx title="app/routes/post.tsx"
export async function loader({ params, context }: Route.LoaderArgs) {
  const { queryClient, trpc } = context.get(trpcContext);
  const comments = trpc.post.comments.unstable_$prefetchInfinite({
    postId: params.id,
    limit: 20,
  });
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

Nothing here is tRPC-specific hydration: it's TanStack Query's own `dehydrate` and `HydrationBoundary`. Your query client's `serializeData` and `deserializeData` run your transformer, and since React Router streams promises in loader data, the comments' pending query crosses as a promise: the HTML doesn't wait for it, and the browser doesn't fetch it again, on the first load or on any navigation after it. The [React Router section](/docs/client/tanstack-react-query/handles#react-router) of the docs has the full setup.

## Next.js App Router

### A `HydrateClient` you can nest

Most tRPC apps on the App Router have a `HydrateClient` helper in `trpc/server.tsx` that dehydrates the request's `QueryClient`. It sends every query in the cache each time it renders, so if a layout and a nested server component both render one, the second sends the first one's queries again.

`unstable_createHydrateClient` gives you one that keeps track of what it already sent in the request:

```tsx twoslash title="trpc/server.tsx"
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

type Post = { id: string; title: string; authorId: string };
type Comment = { id: string; text: string };

export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }): Post => ({ id: input.id, title: 'Hello', authorId: '1' })),
    comments: t.procedure
      .input(z.object({ postId: z.string(), limit: z.number(), cursor: z.number().nullish() }))
      .query(({ input }) => ({
        items: [] as Comment[],
        nextCursor: (input.cursor ?? 0) + input.limit as number | null,
      })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

// @filename: trpc/server.tsx
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(() => new QueryClient());
export const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: {}, queryClient: getQueryClient });
export const HydrateClient = unstable_createHydrateClient(getQueryClient);

// @filename: post.tsx
'use client';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: unstable_inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.post));
  return <h1>{postQuery.data.title}</h1>;
}
// @filename: hydrate.tsx
import { getQueryClient } from './trpc/server';
// ---cut---
import { unstable_createHydrateClient } from '@trpc/tanstack-react-query';

export const HydrateClient = unstable_createHydrateClient(getQueryClient);
```

Render one in each server component that starts queries, and each query crosses once. It also sends a query again if the server has newer data for it, and it keeps your query client's `dehydrate` options, like `serializeData` for your transformer.

It's for server components only: `@trpc/tanstack-react-query` now ships a separate build for the `react-server` [export condition](https://nodejs.org/api/packages.html#conditional-exports), which Next.js and other RSC frameworks resolve for server components, and that's the build that can dehydrate.

## Why `unstable_$`? {#why-unstable}

The `$` marks tRPC's own helpers. Everything on the proxy without a `$`, such as `queryOptions`, `queryKey` and `pathFilter`, gives you plain TanStack Query options, keys and filters, with nothing added. The handle methods do more than that, so they carry a `$`, the way Drizzle marks its helpers next to its SQL builders. Each one is still a single TanStack Query call: `unstable_$prefetch` is `prefetchQuery`, `unstable_$ensure` is `ensureQueryData`, `unstable_$fetch` is `fetchQuery`, and `unstable_$fromHandle` is `queryOptions`. The [docs](/docs/client/tanstack-react-query/handles#tanstack-equivalents) list the exact equivalents.

The `unstable_` is because handles are new, and we'd like to hear how they work for you before we commit to the exact API. They're tested and you're safe to use them, but the API may change in a minor release. [Read more about what `unstable_` means](/docs/faq#unstable).

## Try it out

👉 [Read the docs on handles](/docs/client/tanstack-react-query/handles)

There's also a [TanStack Start example](https://github.com/trpc/trpc/tree/main/examples/tanstack-start-sse-chat) built on handles, with a live chat streamed over SSE.

We'd love to hear what you think. Tell us on [GitHub](https://github.com/trpc/trpc/discussions) or in [Discord](https://trpc.io/discord)!
