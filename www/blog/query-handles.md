---
title: "Query handles: pass the query, not the input"
description: "New in the TanStack React Query integration: a loader starts its queries in one call and passes them down, and the components read them without repeating their inputs."
date: "2026-11-01"
authors: [{"image":"https://github.com/KATT.png","name":"Alex / KATT 🐱","title":"Creator of tRPC","url":"https://x.com/alexdotjs"},{"image":"https://github.com/claude.png","name":"Claude","title":"Opus 5.5","url":"https://claude.ai"}]
---

Today we're adding **query handles** to the TanStack React Query integration. First, the problem they solve: where your queries start, and what a component needs to read one.

## Fetch-on-render, and its waterfalls

The simplest way to load data is to let each component fetch its own as it renders. This is called fetch-on-render:

```tsx twoslash title="post-page.tsx"
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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
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
/posts?sort=top&page=2  →  prefetchEntry(trpc.post.list, { sort: 'top', page: 2 })
```

If a page can't start a query from the URL alone, **change the procedure, not the page.** Say `/posts/$slug` loads `post.bySlug`, and the comments and the author need the post's id and author id. Both wait for the post, on every page that shows them. Let `post.comments` take the slug, and have `post.bySlug` return the author too. The server sits next to the database, so the extra lookup costs a query there, not a round trip from the browser. The [docs](/docs/client/tanstack-react-query/handles#url-as-input) show the procedures before and after.

## Pass the query, not the input

So the loader can start everything. But it hands the components the input, `id`, and each component builds the query again from it. The server and the client both name the procedure and both build its input, and nothing ties the two together:

- **If the inputs drift, the read misses, and nothing tells you.** Prefetch the comments with `limit: 20` and read them with `limit: 10`, or add a `locale` on the server and not on the client, and the component fetches again from the browser. Nothing errors, and the waterfall is back.
- **The client can read a different procedure** from the one the server prefetched, and it still type-checks.
- **Nothing shows that a prefetch happened.** Reading the component, you can't tell if its data is on its way or if it's about to start a request.

Pass the query itself, and all three go away. The component reads what the server started, with no procedure or input to get wrong, and its props show that its data is on the way.

## Query handles

A query handle is a small, serializable reference to a query you started in a loader, a server component or an event handler. List the queries a page needs as **entries**, and `loadHandles` starts them and gives you a handle for each:

```tsx twoslash title="loader.ts"
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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
}
// @filename: loader.ts
// ---cut---
import {
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { trpc } from './trpc/server';

export async function loader(id: string) {
  // Start the query, and get a handle for it
  const [handles] = await loadHandles(trpc, {
    post: prefetchEntry(trpc.post.byId, { id }),
  });
  return handles;
}
```

Pass the handle to a component, and read it with `fromHandle`:

```tsx twoslash title="post.tsx"
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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
}
// @filename: post-display.tsx
// ---cut---
'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import {
  fromHandle,
  type inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

type Handle = inferQueryHandle<TRPC['post']['byId']>;

export function Post(props: { post: Handle }) {
  const trpc = useTRPC();
  // No procedure, no input, fully typed
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  const post = postQuery.data;
  //    ^?
  return <h1>{post.title}</h1>;
}
```

Each framework passes the handle down its own way: see [your framework](#in-your-framework).

## How handles work

A handle is the query's key and input: `{ queryKey, input }`. The data stays in the cache. A handle is a plain object, so it crosses from a server component to a client component, or from a loader to a route component, like any other prop.

```demo loader-handles
route loader: loadHandles(trpc, { … })
├─ post: prefetchEntry(trpc.post.byId, { id })              → post handle     → <Post post={post} />
└─ comments: prefetchInfiniteEntry(trpc.post.comments, …)  → comments handle → <Comments comments={comments} />
```

`fromHandle(trpc, handle)` returns what `trpc.post.byId.queryOptions(input)` would. So:

- It works with every TanStack Query hook and `QueryClient` method: `useQuery`, `useSuspenseQuery`, `useSuspenseQueries`, `queryClient.fetchQuery` and the rest. Its `queryKey` is the query's typed key, for `queryClient.getQueryData`.
- It takes the same options, like `select`, `staleTime` and `refetchInterval`.
- It uses the same query keys, so handles share the cache with your code, and `invalidateQueries(trpc.post.pathFilter())` works as before.

A handle also carries its typed input, so the component doesn't need the input as a second prop:

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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
}
// @filename: input.tsx
// ---cut---
import {
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { trpc } from './trpc/server';

const [handles] = await loadHandles(trpc, {
  post: prefetchEntry(trpc.post.byId, { id: '1' }),
});
handles.post.input;
//           ^?
```

### Wait, or don't

There are three kinds of entry, and you choose one for each query on the page:

- `prefetchEntry(trpc.x, input)` **doesn't wait**. The load resolves at once, the page renders, and the data streams in behind a loading state: a `Suspense` fallback, or `useQuery`'s `pending` status. It never makes the load reject: if the request fails, the component that reads the handle gets the error.
- `ensureEntry(trpc.x, input)` **waits** until the cache has data. A component that reads the handle renders the data at once, with no fallback. It still needs a loading state, since the cache [can lose the data](/docs/client/tanstack-react-query/handles#cache-loses-data) later. If the request fails, the load rejects, and you handle the error where you load, for example with `notFound()`.
- `fetchEntry(trpc.x, input)` waits too, and refetches stale data first, for code that needs fresh data.

Procedures with a `cursor` input also get `prefetchInfiniteEntry`, `ensureInfiniteEntry` and `fetchInfiniteEntry`.

Try all three in a browser loader, and the same blog with no loader. The demo runs the real handles API against a tRPC router in the page:

```demo starting-queries
```

A page can mix them in one load. It starts every entry before it waits for any, so the order you list them in doesn't matter, and one line can't make another wait by accident:

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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
}
// @filename: mixed.tsx
// @errors: 2339
// ---cut---
import {
  ensureEntry,
  loadHandles,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { trpc } from './trpc/server';

async function load(id: string) {
  const [handles, data] = await loadHandles(trpc, {
    // Streams in later
    comments: prefetchInfiniteEntry(trpc.post.comments, {
      postId: id,
      limit: 20,
    }),
    // The load waits for this one
    post: ensureEntry(trpc.post.byId, { id }),
  });
  data.post.title;
  //        ^?
  // The comments may have no data yet, so they aren't on `data`
  data.comments;
  return handles;
}
```

`data` has the data of the entries the load waited for, so a loader can set the page title or check for a missing post without reading the cache. Reading a prefetch entry's data is a type error, not a silent `undefined`.

When an entry it waits for fails, the load rejects with a `TRPCEntryError` that names the entry. `isTRPCEntryError` checks which procedure failed, and types the error:

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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
}
// @filename: errors.tsx
declare function notFound(): never;
// ---cut---
import {
  ensureEntry,
  isTRPCEntryError,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import { trpc } from './trpc/server';

async function load(id: string) {
  const [handles] = await loadHandles(trpc, {
    post: ensureEntry(trpc.post.byId, { id }),
  }).catch((error: unknown) => {
    if (isTRPCEntryError(error, trpc.post.byId) && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  });
  return handles;
}
```

To get every entry's error as a value instead, use `loadHandlesSettled`. The [docs on errors](/docs/client/tanstack-react-query/handles#errors) cover both.

## Keep it waterfall-free

Handles don't remove waterfalls on their own: the loader still has to know every input up front, which is why [the URL comes first](#the-url-is-the-input). The demo runs one blog both ways, with every query started in the route loader, and with each component fetching what it shows. Watch the network panel:

```demo waterfalls
```

A query whose input comes from another query's result still waits for it. If you can, [reshape the procedure](#the-url-is-the-input) so the page can start it from the URL. If you can't, read it in the component that has the input, with `trpc.x.queryOptions(input)`, and pay the round trip. The [docs on dependent queries](/docs/client/tanstack-react-query/handles#dependent-queries) show both.

**Handles don't replace `queryOptions`**, and we don't think they should. Fetch-on-render still has its place, as long as it doesn't nest. In the Next.js App Router, if every query starts in a server component, every page change waits on the server. A client component that reads `trpc.x.queryOptions(input)` can render from the cache at once and refetch behind it. Use handles where the route knows what the page needs, and `queryOptions` where only the component does. They share a cache, so mix them freely.

## No loader?

Plenty of apps have no server components or route loaders: a single-page app with plain `<Routes>`, a modal, a dashboard whose filters live in component state. Load handles where your code can wait, not during render: a render can't wait for a load, and every render would start its entries again.

So start a page's queries in the event that leads to it, such as a link's hover or click. `loadHandles` takes `useTRPC()` as well as a server proxy:

```tsx twoslash title="post-link.tsx"
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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
}
// @filename: post-link.tsx
// ---cut---
import {
  loadHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC } from './trpc/client';

export function PostLink(props: { id: string }) {
  const trpc = useTRPC();
  return (
    <a
      href={`/posts/${props.id}`}
      onMouseEnter={() => {
        void loadHandles(trpc, {
          post: prefetchEntry(trpc.post.byId, { id: props.id }),
          comments: prefetchInfiniteEntry(
            trpc.post.comments,
            { postId: props.id, limit: 20 },
            { getNextPageParam: (last) => last.nextCursor },
          ),
        });
      }}
    >
      Read the post
    </a>
  );
}
```

By the time the page renders, its queries are in flight or done. A component that reads `trpc.post.byId.queryOptions({ id })` finds them in the cache, since handles and `queryOptions` share query keys.

## In your framework {#in-your-framework}

<div class="code-tabs" data-tabs="framework">
<div data-tab="Next.js" data-active>

Load the handles in a server component, and render a `HydrateClient` around the client components that read them. The query client [dehydrates pending queries](/docs/client/tanstack-react-query/server-components#3-create-a-query-client-factory), so the ones still loading stream to the browser:

```tsx twoslash title="page.tsx"
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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
}
// @filename: page.tsx
// ---cut---
import {
  loadHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { Comments } from './comments';
import { Post } from './post';
import { HydrateClient, trpc } from './trpc/server';

export default async function PostPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  // Start both queries, and get a handle for each
  const [handles] = await loadHandles(trpc, {
    post: prefetchEntry(trpc.post.byId, { id }),
    comments: prefetchInfiniteEntry(trpc.post.comments, {
      postId: id,
      limit: 20,
    }),
  });

  return (
    <HydrateClient>
      <Suspense fallback={<p>Loading post…</p>}>
        <Post post={handles.post} />
      </Suspense>
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments comments={handles.comments} />
      </Suspense>
    </HydrateClient>
  );
}
```

**A `HydrateClient` you can nest.** Most tRPC apps on the App Router have a `HydrateClient` in `trpc/server.tsx` that dehydrates the request's `QueryClient`. It sends every query in the cache each time it renders, so if a layout and a nested server component both render one, the second sends the first one's queries again. `unstable_createHydrateClient` gives you one that tracks what it sent in the request:

```tsx twoslash title="trpc/server.tsx"
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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{commentsQuery.data.pages.length} pages of comments</p>;
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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
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
import {
  ensureEntry,
  loadHandles,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';

export const Route = createFileRoute('/posts/$id')({
  loader: async ({ context: { trpc }, params }) => {
    const [handles] = await loadHandles(trpc, {
      comments: prefetchInfiniteEntry(
        trpc.post.comments,
        { postId: params.id, limit: 20 },
        { getNextPageParam: (last) => last.nextCursor },
      ),
      post: ensureEntry(trpc.post.byId, { id: params.id }),
    });
    return handles;
  },
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

In a client-only app, a `clientLoader` loads handles on the tab's `QueryClient` and returns them. With server rendering, a root middleware creates a query client and proxy per request, and the `loader` returns `dehydrate(queryClient)` next to its handles, as any TanStack Query loader would:

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
import { fromHandle, type inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
  const trpc = useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return <h1>{postQuery.data.title}</h1>;
}

// @filename: comments.tsx
'use client';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle, type inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from './trpc/client';

export function Comments(props: {
  comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
}) {
  const trpc = useTRPC();
  const commentsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.comments, {
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
import { Suspense } from 'react';
import { Comments } from '../../comments';
import { Post } from '../../post';
import { trpcContext } from '../trpc/server';
import type { Route } from './+types/post';
// ---cut---
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import {
  ensureEntry,
  loadHandles,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';

export async function loader({ params, context }: Route.LoaderArgs) {
  const { queryClient, trpc } = context.get(trpcContext);
  const [handles] = await loadHandles(trpc, {
    comments: prefetchInfiniteEntry(trpc.post.comments, {
      postId: params.id,
      limit: 20,
    }),
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

There's no tRPC-specific hydration here: it's TanStack Query's own `dehydrate` and `HydrationBoundary`. The query client is the [server components guide's](/docs/client/tanstack-react-query/server-components#3-create-a-query-client-factory): it dehydrates pending queries, and its `serializeData` and `deserializeData` run your transformer. React Router streams promises in loader data, so the comments' pending query crosses as a promise: the HTML doesn't wait for it, and the browser doesn't fetch it again, on the first load or after. The [React Router section](/docs/client/tanstack-react-query/handles#react-router) of the docs has the full setup.

</div>
</div>

## Why functions, not methods on `trpc`? {#why-functions}

The methods on `trpc`, such as `queryOptions`, `queryKey` and `pathFilter`, give you plain TanStack Query options, keys and filters. Handles are tRPC helpers built on top of them, so they're functions from their own entry point that take a procedure: `ensureEntry(trpc.post.byId, { id })`. Apps that don't use handles don't load their code.

Each entry is still one TanStack Query call: `prefetchEntry` is `prefetchQuery`, `ensureEntry` is `ensureQueryData`, `fetchEntry` is `fetchQuery`, and `fromHandle` is `queryOptions`. The [docs](/docs/client/tanstack-react-query/handles#tanstack-equivalents) list the exact equivalents.

## Why `unstable-`? {#why-unstable}

The handle APIs come from `@trpc/tanstack-react-query/unstable-handles`. The `unstable-` is there because handles are new, and we'd like to hear how they work for you before we settle the API. They're tested and safe to use, but the API may change in a minor release. [Read what `unstable_` means](/docs/faq#unstable).

## Try it out

👉 [Read the docs on handles](/docs/client/tanstack-react-query/handles)

There's also a [TanStack Start example](https://github.com/trpc/trpc/tree/main/examples/tanstack-start-sse-chat) built on handles, with a live chat streamed over SSE.

Tell us what you think on [GitHub](https://github.com/trpc/trpc/discussions) or in [Discord](https://trpc.io/discord)!
