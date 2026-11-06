---
title: "Query handles: pass the query, not the input"
description: "New in the TanStack React Query integration: a loader starts a query and passes it down, and the component reads it without repeating its input."
date: "2026-11-01"
authors: [{"image":"https://github.com/KATT.png","name":"Alex / KATT 🐱","title":"Creator of tRPC","url":"https://x.com/alexdotjs"},{"image":"https://github.com/claude.png","name":"Claude","title":"Opus 5.5","url":"https://claude.ai"}]
---

Today we're adding **query handles** to the TanStack React Query integration. First, the problem they solve: where your queries start, and what a component needs to read one.

## Fetch-on-render, and its waterfalls

The simplest way to load data is to let each component fetch its own as it renders. This is called fetch-on-render:

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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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

It reads well, but `Comments` doesn't exist until `PostPage` has its post. So the comments wait for the post, though all they need is the `id`, which was there all along:

```demo request-timeline strategy=fetch-on-render
post.byId      |-------|
post.comments          |-----------|
               0       200         500 ms
```

That's a request waterfall: a request that can't start until another one has finished. Each step costs a round trip, and on a slow network a round trip can take hundreds of milliseconds. Each level of nesting can add one, and they're easy to miss, since each component looks fine on its own.

## Render-as-you-fetch

The fix is to start fetching before you render. A route loader or a server component runs before the page, so it can start every query at once. The components then read the results:

```tsx twoslash
// @jsx: react-jsx
// @target: esnext
// @module: esnext
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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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
// @filename: render-as-you-fetch.tsx
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc/client';
import { getQueryClient, trpc } from './trpc/server';

const queryClient = getQueryClient();
declare const id: string;
// ---cut---
// In a route loader or a server component: start everything up front
void queryClient.prefetchQuery(trpc.post.byId.queryOptions({ id }));
void queryClient.prefetchInfiniteQuery(
  trpc.post.comments.infiniteQueryOptions(
    { postId: id, limit: 20 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  ),
);

// ...and in the components, read what was started
function Post(props: { id: string }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(
    trpc.post.byId.queryOptions({ id: props.id }),
  );
  return <h1>{postQuery.data.title}</h1>;
}
```

Now both requests go out together, and the page is ready after one round trip:

```demo request-timeline strategy=render-as-you-fetch
post.byId      |-------|
post.comments  |-----------|
               0       200 300 ms
```

This is render-as-you-fetch, and it's what TanStack Query's prefetching is for.

## The URL is the input

A loader can only start what it can name before anything renders, and all it has is the URL. `/posts/42` names the post, and the post's id is all the comments need. So the rule is: every query a page needs should start from the route's params and search params.

- **Path params** name what the page is about.
- **Search params** hold the rest of what changes a query: filters, sort, page. Keep them in component state and the loader can't see them, so the query starts only after render. The back button loses the view, and a shared link opens the default one.

```demo url-input
/posts?sort=top&page=2  →  trpc.post.list.unstable_$prefetch({ sort: 'top', page: 2 })
```

If a page can't start a query from the URL alone, **change the procedure, not the page.** Say `/posts/$slug` loads `post.bySlug`, and the comments and the author need the post's id and author id. Both wait for the post, on every page that shows them. Let `post.comments` take the slug, and have `post.bySlug` return the author too. The server sits next to the database, so the extra lookup costs a query there, not a round trip from the browser. The [docs](/docs/client/tanstack-react-query/handles#url-as-input) show the procedures before and after.

## Pass the query, not the input

So the loader can start everything. But it hands the components the input, `id`, and each component builds the query again from it. The server and the client both name the procedure and both build its input, and nothing ties the two together:

- **If the inputs drift, the read misses, and nothing tells you.** Prefetch the comments with `limit: 20` and read them with `limit: 10`, or add a `locale` on the server and not on the client, and the component fetches again from the browser. Nothing errors, and the waterfall is back.
- **The client can read a different procedure** from the one the server prefetched, and it still type-checks.
- **Nothing shows that a prefetch happened.** Reading the component, you can't tell if its data is on its way or if it's about to start a request.

Pass the query itself, and all three go away. The component reads what the server started, with no procedure or input to get wrong, and its props show that its data is on the way.

## Query handles

A query handle is a small, serializable reference to a query you started in a loader, in a server component or at the top of a page. Start a query, and you get its handle:

```tsx twoslash title="loader.ts"
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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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
// @filename: loader.ts
// ---cut---
import { trpc } from './trpc/server';

export function loader(id: string) {
  // Start the query, and get a handle for it
  const post = trpc.post.byId.unstable_$prefetch({ id });
  return { post };
}
```

Pass the handle to a component, and read it with `trpc.unstable_$fromHandle`:

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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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

Each framework passes the handle down its own way: see [your framework](#in-your-framework).

## How handles work

A handle is the query's key and input: `{ queryKey, input }`. The data stays in the cache. A handle is a plain object, so it crosses from a server component to a client component, or from a loader to a route component, like any other prop.

```demo loader-handles
route loader
├─ trpc.post.byId.unstable_$prefetch({ id })        → post handle     → <Post post={post} />
└─ trpc.post.comments.unstable_$prefetchInfinite()  → comments handle → <Comments comments={comments} />
```

`trpc.unstable_$fromHandle(handle)` returns what `trpc.post.byId.queryOptions(input)` would. So:

- It works with every TanStack Query hook and `QueryClient` method: `useQuery`, `useSuspenseQuery`, `useSuspenseQueries`, `queryClient.fetchQuery` and the rest. Its `queryKey` is the query's typed key, for `queryClient.getQueryData`.
- It takes the same options, like `select`, `staleTime` and `refetchInterval`.
- It uses the same query keys, so handles share the cache with your code, and `invalidateQueries(trpc.post.pathFilter())` works as before.

The `$` marks tRPC's own helpers, as opposed to TanStack Query's API: more on that [below](#why-unstable).

A handle also carries its typed input, so the component doesn't need the input as a second prop:

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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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

- `trpc.x.unstable_$prefetch(input)` **doesn't wait**. It returns a handle at once, the page renders, and the data streams in behind a loading state: a `Suspense` fallback, or `useQuery`'s `pending` status. It never throws: if the request fails, the component that reads the handle gets the error.
- `await trpc.x.unstable_$ensure(input)` **waits** until the cache has data. A component that reads the handle renders the data at once, with no fallback. It still needs a loading state, since the cache [can lose the data](/docs/client/tanstack-react-query/handles#cache-loses-data) later. You handle errors where you started the query, for example with `notFound()`.
- `await trpc.x.unstable_$fetch(input)` waits too, and refetches stale data first, for code that needs fresh data.

Procedures with a `cursor` input also get `unstable_$prefetchInfinite`, `unstable_$ensureInfinite` and `unstable_$fetchInfinite`.

Try all three in a browser loader, and the same blog with no loader. The demo runs the real handles API against a tRPC router in the page:

```demo starting-queries
```

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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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
  return { post, comments };
}
```

## Keep it waterfall-free

Handles don't remove waterfalls on their own: the loader still has to know every input up front, which is why [the URL comes first](#the-url-is-the-input). The [docs on waterfalls](/docs/client/tanstack-react-query/handles#waterfalls) go further.

**Handles don't replace `queryOptions`**, and we don't think they should. Fetch-on-render still has its place, as long as it doesn't nest. In the Next.js App Router, if every query starts in a server component, every page change waits on the server. A client component that reads `trpc.x.queryOptions(input)` can render from the cache at once and refetch behind it. Use handles where the route knows what the page needs, and `queryOptions` where only the component does. They share a cache, so mix them freely.

## No loader? Start them as the page renders

Plenty of apps have no server components or route loaders: a single-page app with plain `<Routes>`, a modal, a dashboard whose filters live in component state. They still know what a page needs at its top. The `unstable_$prefetch` you'd call in a loader also works on `useTRPC()` during render, and returns the handles to pass down:

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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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

`Post` is the same component a server component would feed. Every query starts before any component reads one, so they load side by side. During render, a query starts only if the cache has no entry for it, as with TanStack Query's `usePrefetchQuery`, so a re-render starts nothing. There's no wrapper hook and no dependency array: they're plain calls. Stale data shows at once, and the component that reads it refreshes it.

The demo runs one blog both ways:

```demo waterfalls variants=top,reader
```

A query that needs another query's result starts in the component that has that result. So a search for `unstable_$prefetch` below the top of a page lists your waterfalls.

## In your framework {#in-your-framework}

<div class="code-tabs" data-tabs="framework">
<div data-tab="Next.js" data-active>

Start the queries in a server component, and render a `HydrateClient` around the client components that read them. The query client [dehydrates pending queries](/docs/client/tanstack-react-query/server-components#3-create-a-query-client-factory), so the ones still loading stream to the browser:

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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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

**A `HydrateClient` you can nest.** Most tRPC apps on the App Router have a `HydrateClient` in `trpc/server.tsx` that dehydrates the request's `QueryClient`. It sends every query in the cache each time it renders, so if a layout and a nested server component both render one, the second sends the first one's queries again. `unstable_createHydrateClient` gives you one that tracks what it sent in the request:

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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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

Render one in each server component that starts queries, and each query crosses once. It sends a query again if the server has newer data for it, and it keeps your query client's `dehydrate` options, like `serializeData` for your transformer.

It works in server components only: `@trpc/tanstack-react-query` now ships a separate build for the `react-server` [export condition](https://nodejs.org/api/packages.html#conditional-exports), which Next.js and other server component frameworks use, and that build is the one that can dehydrate.

</div>
<div data-tab="TanStack Start">

Loaders return handles as loader data, and the route component passes them down:

```tsx twoslash title="routes/posts/$id.tsx"
// @jsx: react-jsx
// @target: esnext
// @module: esnext
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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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
// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import type { unstable_inferInfiniteQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: unstable_inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    trpc.unstable_$fromHandle(props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
}

// @filename: routes/__root.tsx
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';
import type { TRPC } from '../trpc/client';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  trpc: TRPC;
}>()();

// @filename: router.tsx
import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from './server/routers/_app';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: '/api/trpc' })] }),
    queryClient,
  });
  const router = createRouter({ routeTree, context: { queryClient, trpc } });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

// @filename: routeTree.gen.ts
import { Route as rootRouteImport } from './routes/__root';
import { Route as PostsIdRouteImport } from './routes/posts/$id';

const PostsIdRoute = PostsIdRouteImport.update({
  id: '/posts/$id',
  path: '/posts/$id',
  getParentRoute: () => rootRouteImport,
} as any);

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/posts/$id': {
      id: '/posts/$id';
      path: '/posts/$id';
      fullPath: '/posts/$id';
      preLoaderRoute: typeof PostsIdRouteImport;
      parentRoute: typeof rootRouteImport;
    };
  }
}

export const routeTree = rootRouteImport.addChildren({ PostsIdRoute });

import type { getRouter } from './router';
import type { createStart } from '@tanstack/react-start';
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true;
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}

// @filename: routes/posts/$id.tsx
import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Comments } from '../../comments';
import { Post } from '../../post';
// ---cut---
export const Route = createFileRoute('/posts/$id')({
  loader: async ({ context: { trpc }, params }) => ({
    comments: trpc.post.comments.unstable_$prefetchInfinite(
      { postId: params.id, limit: 20 },
      { getNextPageParam: (last) => last.nextCursor },
    ),
    post: await trpc.post.byId.unstable_$ensure({ id: params.id }),
  }),
  component: PostPage,
});

function PostPage() {
  const loaderData = Route.useLoaderData();
  return (
    <>
      <Post post={loaderData.post} />
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments comments={loaderData.comments} />
      </Suspense>
    </>
  );
}
```

The same loader runs on the server for the first page load, and in the browser for each navigation after it. TanStack's SSR query integration (`setupRouterSsrQueryIntegration` in `getRouter`) hydrates the cache. A handle is just a typed key and input, so it passes TanStack Router's serializability checks, in `beforeLoad` too. The [TanStack Start guide](/docs/client/tanstack-react-query/tanstack-start) walks through the setup.

</div>
<div data-tab="React Router">

In a client-only app, a `clientLoader` starts queries on the tab's `QueryClient` and returns the handles. With server rendering, a root middleware creates a query client and proxy per request, and the `loader` returns `dehydrate(queryClient)` next to its handles, as any TanStack Query loader would:

```tsx twoslash title="app/routes/post.tsx"
// @jsx: react-jsx
// @target: esnext
// @module: esnext
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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, unstable_createHydrateClient } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '../server/routers/_app';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        },
      },
    }),
);
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
// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import type { unstable_inferInfiniteQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: unstable_inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    trpc.unstable_$fromHandle(props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
}

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
  export type ComponentProps = Annotations['ComponentProps'];
}

// @filename: app/trpc/server.ts
import type { QueryClient } from '@tanstack/react-query';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createContext } from 'react-router';
import type { AppRouter } from '../../server/routers/_app';

export const trpcContext = createContext<{
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
}>();

// @filename: app/routes/post.tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { Suspense } from 'react';
import { Comments } from '../../comments';
import { Post } from '../../post';
import { trpcContext } from '../trpc/server';
import type { Route } from './+types/post';
// ---cut---
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

There's no tRPC-specific hydration here: it's TanStack Query's own `dehydrate` and `HydrationBoundary`. The query client is the [server components guide's](/docs/client/tanstack-react-query/server-components#3-create-a-query-client-factory): it dehydrates pending queries, and its `serializeData` and `deserializeData` run your transformer. React Router streams promises in loader data, so the comments' pending query crosses as a promise: the HTML doesn't wait for it, and the browser doesn't fetch it again, on the first load or after. The [React Router section](/docs/client/tanstack-react-query/handles#react-router) of the docs has the full setup.

</div>
</div>

## Why `unstable_$`? {#why-unstable}

The `$` marks tRPC's own helpers. Everything on the proxy without a `$`, such as `queryOptions`, `queryKey` and `pathFilter`, gives you plain TanStack Query options, keys and filters. The handle methods do more, so they carry a `$`. Each is still one TanStack Query call: `unstable_$prefetch` is `prefetchQuery`, `unstable_$ensure` is `ensureQueryData`, `unstable_$fetch` is `fetchQuery`, and `unstable_$fromHandle` is `queryOptions`. The [docs](/docs/client/tanstack-react-query/handles#tanstack-equivalents) list the exact equivalents.

The `unstable_` is there because handles are new, and we'd like to hear how they work for you before we settle the API. They're tested and safe to use, but the API may change in a minor release. [Read what `unstable_` means](/docs/faq#unstable).

## Try it out

👉 [Read the docs on handles](/docs/client/tanstack-react-query/handles)

There's also a [TanStack Start example](https://github.com/trpc/trpc/tree/main/examples/tanstack-start-sse-chat) built on handles, with a live chat streamed over SSE.

Tell us what you think on [GitHub](https://github.com/trpc/trpc/discussions) or in [Discord](https://trpc.io/discord)!
