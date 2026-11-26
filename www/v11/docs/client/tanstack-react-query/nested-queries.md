---
id: nested-queries
title: Nested queries in one request
sidebar_label: Nested queries
slug: /client/tanstack-react-query/nested-queries
section: "Client Usage"
parent: "client/tanstack-react-query"
order: 54
---

A page often needs one answer before it can ask the next question.

- The post page has a slug. It needs the **post**.
- The post has an `authorId`. The page needs the **author**.
- The author has a `teamId`. The page needs **more posts from the author's team**.

Each query waits for the one before it: they form a chain. TanStack Query calls these [dependent queries](https://tanstack.com/query/latest/docs/framework/react/guides/dependent-queries). That is three round trips, one after another. This is a waterfall, and it makes pages slow.

The trips are what cost. The server's work takes the same time on any connection. The trip there and back does not: on a slow connection it is most of the wait, and this page makes three.

With [handles](/docs/client/tanstack-react-query/handles) and the functions on this page, the same page loads in **one request**.

- **A component says what data it needs, ahead of time.** It says so in a plain function. The data can depend on other data.
- **The page makes one request for all of it.** The server fills in each id as it goes.
- **Nothing blocks the page.** It shows at once, and each part shows when its data is ready. With `httpBatchStreamLink`, each part's result arrives as soon as the server has it. `httpBatchLink` saves the same round trips, but sends every result in one response, once the last one is done.

An `xxxEntries()` function is a spiritual cousin of a GraphQL query or fragment. It sits next to its component. A page puts several together. All of it loads in one request. But it is plain TypeScript and plain tRPC procedures: there is no schema, no resolver and no build step.

```demo nested-queries
```

:::tip See it in an app
The kitchen sink has a [blog](/kitchen-sink/blog) that loads this way. Open your browser's Network tab and go from post to post: each page is one request, for the post, its author and more posts from the author's team. Its [source](https://github.com/trpc/trpc/tree/main/www/src/routes/kitchen-sink/blog) is two routes.
:::

:::info
Everything on this page is experimental, and may change in a minor release. The names start with `experimental_` so that you can tell.

Nothing changes until you use it. `loadHandles()` works as before for entries without `experimental_dataOf()`, and the server and the links work as before without their options. `experimental_dataOf()` and `experimental_perItem()` come from `@trpc/client`, and this package exports them too.
:::

```twoslash include dq-router
// @jsx: react-jsx
// @target: esnext
// @module: esnext
// @paths: {"~/*": ["./src/*", "./src/app/*"]}
// @filename: server/router.ts
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export type Post = {
  slug: string;
  title: string;
  authorId: string;
  tags: { id: string }[];
};
export type Author = { id: string; name: string; teamId: string };

export const appRouter = t.router({
  post: t.router({
    bySlug: t.procedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }): Post => {
        if (input.slug === 'missing') {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return { slug: input.slug, title: 'Hello', authorId: 'u1', tags: [] };
      }),
    list: t.procedure
      .input(
        z.object({
          teamId: z.string().optional(),
          cursor: z.number().nullish(),
        }),
      )
      .query(({ input }) => {
        const cursor = input.cursor ?? 0;
        return {
          items: [cursor + 1, cursor + 2].map(
            (n): Post => ({
              slug: `post-${n}`,
              title: `Post ${n}`,
              authorId: `u${n % 3}`,
              tags: [],
            }),
          ),
          // Three pages of two posts, at cursors 0, 10 and 20
          nextCursor: cursor < 20 ? cursor + 10 : null,
        };
      }),
  }),
  author: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        ({ input }): Author => ({ id: input.id, name: 'Alex', teamId: 't1' }),
      ),
  }),
  tag: t.router({
    byIds: t.procedure
      .input(z.object({ ids: z.array(z.string()) }))
      .query(({ input }) => input.ids.map((id) => ({ id, name: id }))),
  }),
});
export type AppRouter = typeof appRouter;
```

```twoslash include dq-trpc
// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '~/server/router';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

// @filename: trpc/server.tsx
import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '~/server/router';

// One per request. It sends pending queries to the browser too, as in the
// App Router setup, so they stream in as they settle
export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        dehydrate: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) ||
            query.state.status === 'pending',
        },
      },
    }),
);
export const trpc = createTRPCOptionsProxy({
  ctx: {},
  router: appRouter,
  queryClient: getQueryClient,
});
export const HydrateClient = unstable_createHydrateClient(getQueryClient);
```

```twoslash include dq-post-entries
// @filename: post-page.tsx
import {
  experimental_dataOf,
  prefetchEntry,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPCLoadEntries } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';

export function postPageEntries(trpc: TRPC, opts: { slug: string }) {
  const post = prefetchEntry(trpc.post.bySlug, { slug: opts.slug });
  const author = experimental_dataOf(post, (it) =>
    prefetchEntry(trpc.author.byId, { id: it.authorId }),
  );
  return {
    post,
    author,
    moreFromTeam: experimental_dataOf(author, (it) =>
      prefetchInfiniteEntry(
        trpc.post.list,
        { teamId: it.teamId },
        { getNextPageParam: (last) => last.nextCursor },
      ),
    ),
  } satisfies TRPCLoadEntries;
}
```

```twoslash include dq-list-entries
// @filename: posts-page.tsx
import {
  ensureInfiniteEntry,
  experimental_dataOf,
  experimental_perItem,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPCLoadEntries } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';

export function postListEntries(trpc: TRPC) {
  const posts = ensureInfiniteEntry(
    trpc.post.list,
    {},
    { getNextPageParam: (last) => last.nextCursor },
  );
  return {
    posts,
    authors: experimental_perItem(
      experimental_dataOf(posts).pages.flatMap((page) => page.items),
      (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
    ),
  } satisfies TRPCLoadEntries;
}
```

```twoslash include dq-components
// @filename: components.tsx
'use client';

import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type {
  inferInfiniteQueryHandle,
  inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

export function AuthorCard(props: {
  author: inferQueryHandle<TRPC['author']['byId']>;
}) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.author));
  return <address>{authorQuery.data.name}</address>;
}

export function TeamPosts(props: {
  posts: inferInfiniteQueryHandle<TRPC['post']['list']>;
}) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.posts, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{postsQuery.data.pages[0]?.items.length} more</p>;
}
```

## In short {#gist}

Three steps: say what the page needs, load it, read it.

#### 1. Say what the page needs {#gist-entries}

An **entry** names one query: a procedure and its input. `experimental_dataOf(post, (it) => …)` builds an entry from the post's data before the post has loaded. Write the entries in the page's file, which loads them:

```ts twoslash title='post-page.tsx'
// @include: dq-router
// @include: dq-trpc
// @filename: post-page.tsx
// ---cut---
import {
  experimental_dataOf,
  prefetchEntry,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPCLoadEntries } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';

export function postPageEntries(trpc: TRPC, opts: { slug: string }) {
  const post = prefetchEntry(trpc.post.bySlug, { slug: opts.slug });
  // The author's id is in the post, which hasn't loaded yet
  const author = experimental_dataOf(post, (it) =>
    prefetchEntry(trpc.author.byId, { id: it.authorId }),
  );
  return {
    post,
    author,
    // An entry can be built from one that is built from another
    moreFromTeam: experimental_dataOf(author, (it) =>
      prefetchInfiniteEntry(
        trpc.post.list,
        { teamId: it.teamId },
        { getNextPageParam: (last) => last.nextCursor },
      ),
    ),
  } satisfies TRPCLoadEntries;
}
```

- **`it` is typed as the post**, so TypeScript checks `it.authorId`. It holds no data: it records which field you read.
- **The callback runs once**, before any request. Pass `it.authorId` on as it is. Don't compute with it or branch on it.
- **Give an infinite entry its `getNextPageParam`.** Without it, a refetch of a cached query with two pages fails on the second page.

#### 2. Load it {#gist-load}

The loader, or server component, starts every query from the URL. A page with neither loads [from a component](#without-a-loader).

```ts twoslash title='post-page.tsx'
// @include: dq-router
// @include: dq-trpc
// @include: dq-post-entries
import { trpc } from '~/trpc/server';
declare const slug: string;
// ---cut---
import { loadHandles } from '@trpc/tanstack-react-query/unstable-handles';

// ...postPageEntries(), from step 1

// Only prefetch entries: this starts the queries and returns
const [handles] = await loadHandles(trpc, postPageEntries(trpc, { slug }));
```

- **It waits for no data**, so the page can render at once.
- **Pass the handles to the page's component** as props.

#### 3. Read it {#gist-read}

A [handle](/docs/client/tanstack-react-query/handles) is a query's key and input. Each component takes the handle it reads, typed by its procedure, and knows nothing of the page:

```tsx twoslash title='components.tsx'
// @include: dq-router
// @include: dq-trpc
// @filename: components.tsx
// ---cut---
'use client';

import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type {
  inferInfiniteQueryHandle,
  inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

export function AuthorCard(props: {
  author: inferQueryHandle<TRPC['author']['byId']>;
}) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.author));
  return <address>{authorQuery.data.name}</address>;
}

export function TeamPosts(props: {
  posts: inferInfiniteQueryHandle<TRPC['post']['list']>;
}) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.posts, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return <p>{postsQuery.data.pages[0]?.items.length} more</p>;
}
```

The author's handle is **unfinished**: its input needs the post's data. In the page's file, the component that reads the post finishes it with `experimental_handleOfItem(handle, data)`, and passes it on:

```tsx twoslash title='post-page.tsx'
// @include: dq-router
// @include: dq-trpc
// @include: dq-components
// @include: dq-post-entries
// ---cut---
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  experimental_handleOfItem,
  fromHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import type {
  experimental_inferHandles,
  inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { useTRPC } from '~/trpc/client';
import { AuthorCard, TeamPosts } from './components';

// ...postPageEntries(), from step 1

type PostPageHandles = experimental_inferHandles<typeof postPageEntries>;

export function Post(props: { handles: PostPageHandles }) {
  const trpc = useTRPC();
  const { handles } = props;
  const postQuery = useSuspenseQuery(fromHandle(trpc, handles.post));
  // The author's id is in the post
  const author = experimental_handleOfItem(handles.author, postQuery.data);
  return (
    <article>
      <h1>{postQuery.data.title}</h1>
      <Suspense fallback="Loading…">
        <AuthorCard author={author} />
      </Suspense>
      <Suspense fallback="Loading…">
        <MoreFromTeam author={author} posts={handles.moreFromTeam} />
      </Suspense>
    </article>
  );
}

// The team's id is in the author
function MoreFromTeam(props: {
  author: inferQueryHandle<TRPC['author']['byId']>;
  posts: PostPageHandles['moreFromTeam'];
}) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.author));
  return (
    <TeamPosts
      posts={experimental_handleOfItem(props.posts, authorQuery.data)}
    />
  );
}
```

- **The page finishes each handle where the data is.** `PostPageHandles` stays in the page's file. The components get finished handles.
- **Each part shows when its query loads**: the post, then the author, then the team's posts. Give each its own Suspense boundary. With [one request](#one-request) over `httpBatchLink`, they all arrive at once.
- **The components send no request of their own.** Each query is already on its way when its component asks for it. `AuthorCard` and `MoreFromTeam` read the same author query. As with any query, data older than `staleTime` refetches in the background: set `staleTime` above 0, as [the setup guides do](/docs/client/tanstack-react-query/handles#invalidation-and-staleness).
- **A finished handle is an ordinary handle.** It reads the same cache entry as `trpc.author.byId.queryOptions({ id: 'u1' })`.

Then [turn on one request](/docs/client/vanilla/nested-queries#turn-on). Without it, the same code works, with one round trip per step.

## One request {#one-request}

The browser can't ask for the author before it has the post: it doesn't know the id. With pipelining it doesn't have to. It sends every call at once, and the server fills in each input from the result it reads.

- **Sending the calls together saves the round trips.**
- **When the results arrive depends on the link.** `httpBatchStreamLink` streams each one as it settles, so the post can show before its author. `httpBatchLink` waits for every result and sends them in one JSON response.
- **An entry with its own `trpc.context` takes no part**, since a link may route by that context. It loads in a request of its own, and so does each entry that reads its data.

Pipelining is a feature of the client and the server, not of TanStack Query, so it has its own page: [Nested queries in one request](/docs/client/vanilla/nested-queries#one-request). It covers how to [turn it on](/docs/client/vanilla/nested-queries#turn-on), [what goes over the wire](/docs/client/vanilla/nested-queries#wire), [what your links see](/docs/client/vanilla/nested-queries#links), [when it isn't one request](/docs/client/vanilla/nested-queries#fallback) and its [limits](/docs/client/vanilla/nested-queries#limits).

Your links see each entry's query, as they see each query of `experimental_load()`:

- **An input that reads another entry's data has blanks.** The author's `op.input` is `{ id: undefined }` until the server fills it in. `experimental_inputOf(op)` gives the input filled in. See [What your links see](/docs/client/vanilla/nested-queries#links).
- **Your links pick a link for each query by the operation as it is sent.** If a `splitLink` sends the author's query to another link than the post's, such as another backend's, the query leaves the post's request. It goes alone through its own link, with its input filled in, once the post's data is there.
- **A link that picks by a value the query reads**, such as the author's id, sees the blank. Send the blank to a link that doesn't pipeline, as in [routing by a value](/docs/client/vanilla/nested-queries#route-by-value). The query is then sent again with its id, and a query for every item loads each item alone, through the link for its value.
- **A link that [retries](/docs/client/vanilla/nested-queries#retries) sees each query too.** If the post's request fails as a whole and `retryLink` sends it again, the author's query goes in the retry's request, and the entry uses that result. The author runs once.

## The load doesn't wait {#without-waiting}

`experimental_dataOf(entry, (data) => entry)` builds an entry from another entry's data, and the load doesn't wait for that data. [In short](#gist) uses this form.

- **The handle is unfinished**, as the load can't know its input yet. `experimental_handleOfItem(handle, data)` finishes it, where the data is.
- **`fromHandle()` refuses an unfinished handle**: it is a type error, and it throws.
- **A query has no cache entry until its key is known.** The author's call is on its way from the start. Its query is created when the post arrives, under the key of its real input. A query never changes its key.
- **The query exists before the component asks for it.** It is created in the step that gives the cache the post. So the author card finds it loading, and sends no request of its own.
- **A failed entry fails where it is read.** If the post fails, the load still resolves with the author's unfinished handle, the author never starts, and the component that reads the post throws the error.
- **The load waits for a fetch or ensure entry in the callback**, as always. Its handle is unfinished too. Since that entry needs the post's data, a failed post makes the load reject.

## When the loader needs the data {#data-of}

Sometimes the loader needs the post before the page renders: to answer with a 404, or to set the title. Wait for the post with `ensureEntry` or `fetchEntry`, and read its data in another entry's input with `experimental_dataOf(entry)`, without a callback:

```ts twoslash
// @include: dq-router
// @include: dq-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
declare const slug: string;
// ---cut---
import {
  ensureEntry,
  experimental_dataOf,
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';

const post = ensureEntry(trpc.post.bySlug, { slug });
const [handles] = await loadHandles(trpc, {
  post,
  // The author's id is in the post, which hasn't loaded yet
  author: prefetchEntry(trpc.author.byId, {
    id: experimental_dataOf(post).authorId,
  }),
});
handles.author.input;
//             ^?
```

- **The load waits for the post**, so the author's handle is finished: its input is `{ id: 'u1' }`.
- **It is still [one request](#one-request)** with pipelining. The load doesn't wait for the author.

`experimental_dataOf(entry)` has the type of the entry's data, so TypeScript checks the input you build with it:

```ts twoslash
// @include: dq-router
// @include: dq-trpc
// @filename: snippet.ts
// @errors: 2322
import { trpc } from '~/trpc/server';
declare const slug: string;
// ---cut---
import {
  ensureEntry,
  experimental_dataOf,
  prefetchEntry,
  prefetchInfiniteEntry,
} from '@trpc/tanstack-react-query/unstable-handles';

const post = ensureEntry(trpc.post.bySlug, { slug });
const author = prefetchEntry(trpc.author.byId, {
  id: experimental_dataOf(post).authorId,
});

// An entry can read an entry that reads another
const moreFromTeam = prefetchInfiniteEntry(
  trpc.post.list,
  { teamId: experimental_dataOf(author).teamId },
  { getNextPageParam: (last) => last.nextCursor },
);

// A part of every item of a list. With one request, that is a list: the
// server takes it only with `allowWholeValues`, else it loads by itself
const tags = prefetchEntry(trpc.tag.byIds, {
  ids: experimental_dataOf(post).tags.map((tag) => tag.id),
});

// The input is checked against the data's type
prefetchEntry(trpc.author.byId, { id: experimental_dataOf(post).tags });
```

- **Pass it on as it is.** Use it as an input, or anywhere inside one. Don't compute with it or branch on it: `` `${experimental_dataOf(post).slug}-draft` `` throws, and `experimental_dataOf(post).authorId ? a : b` is always `a`.
- **`.map()` is the one array method that works in an input.** `.flatMap()` works only for [a query for every item](#entry-per-item). The callback runs once, on a stand-in for every item, and must return the item or a part of it.
- **A list from `.map()` is a whole value.** With [one request](#one-request), the server takes it only with [`allowWholeValues`](/docs/client/vanilla/nested-queries#limit-whole-values). Without that, the query loads in a request of its own once the data is there.
- **Put every entry it reads in the same load.** The order of the entries doesn't matter.
- **The load waits for the data an input reads**, whatever the kind of either entry, because a handle needs its input. To not wait, [use the callback](#without-waiting).
- **If the value can be missing**, such as an optional `coverImageId`, the entry runs with a missing input. That fails its validation, unless the procedure takes a missing one. [Reshape the procedure](/docs/client/tanstack-react-query/handles#reshape-procedures) to take what is always there.

## A query for every item {#entry-per-item}

A list often needs a query for every row: the author of every post. Without help, that is one round trip for the list, and one more for the rows.

`experimental_perItem(list, (item) => entry)` builds an **entry per item**: one entry for every item of a list in another entry's data. With [one request](#one-request), the server runs it for every item it finds.

```demo nested-queries start=list
```

```ts twoslash title='posts-page.tsx'
// @include: dq-router
// @include: dq-trpc
// @filename: posts-page.tsx
// ---cut---
import {
  ensureInfiniteEntry,
  experimental_dataOf,
  experimental_perItem,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPCLoadEntries } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';

export function postListEntries(trpc: TRPC) {
  const posts = ensureInfiniteEntry(
    trpc.post.list,
    {},
    { getNextPageParam: (last) => last.nextCursor },
  );
  return {
    posts,
    // The author of every post, of every page
    authors: experimental_perItem(
      experimental_dataOf(posts).pages.flatMap((page) => page.items),
      (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
    ),
  } satisfies TRPCLoadEntries;
}
```

The load gives one handle for the entry per item. In the page's file, each row turns it into its own author's handle with `experimental_handleOfItem(handle, item)`, and passes that to the same `AuthorCard` as in [In short](#gist-read):

```tsx twoslash title='posts-page.tsx'
// @include: dq-router
// @include: dq-trpc
// @include: dq-components
// @include: dq-list-entries
// ---cut---
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import {
  experimental_handleOfItem,
  fromHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { experimental_inferHandles } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC } from '~/trpc/client';
import { AuthorCard } from './components';

// ...postListEntries(), from above

type PostsPageHandles = experimental_inferHandles<typeof postListEntries>;

export function PostList(props: { handles: PostsPageHandles }) {
  const trpc = useTRPC();
  const postsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.handles.posts, {
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return (
    <ul>
      {postsQuery.data.pages.flatMap((page) =>
        page.items.map((post) => (
          <li key={post.slug}>
            {post.title}
            <AuthorCard
              author={experimental_handleOfItem(props.handles.authors, post)}
            />
          </li>
        )),
      )}
    </ul>
  );
}
```

- **The item gives the handle**, so there is no index to keep in step. Passing something that isn't one of the list's items is a type error.
- **It works for an item the load never had**, such as a post on a later page.
- **The load doesn't wait for a list from a prefetch entry.** The items' queries start when the list arrives.
- **Items with the same input share a query**, as two posts by one author do.
- **For a fetch or ensure entry, `data` has a list** with every item's data.

### Which values are items {#per-item-items}

- **The items are the list's elements.** For a list from `.map()`, they are the values its callback returned: `experimental_dataOf(post).tags.map((tag) => tag.id)` has an item for every tag's id.
- **For the items of every list in a list, use `.flatMap()`**, as above with the pages of an infinite entry. A `.flatMap()` value can only be such a list, not a value in an input: the server can't flatten one into an input.
- **Without `.flatMap()`, a list of lists has the inner lists as its items**, as its type says.
- **A `null` in the list is an item like any other.** Its query gets `null` in its input, or `undefined` for a part of it: a type error, unless the procedure takes that.
- **What isn't a list has no items**, in `.flatMap()` too. Unlike an array's `.flatMap()`, a callback that returns a value, such as `(post) => post.id`, gives no items. Return a list, or use `.map()`.

### Skipping, and several queries per item {#per-item-skip}

- **For nothing to fetch, return an entry with `skipToken`**: `() => prefetchEntry(trpc.author.byId, skipToken)`. Every item then has a disabled entry, and `experimental_handleOfItem(handle, item)` gives a handle with `skipped: true`. No call goes to the server, and it takes nothing from `maxBatchSize`.
- **`useQuery` reads a skipped handle's query as idle.** It is `'pending'` only when the cache has nothing for its key. `skipToken` doesn't clear the cache, so the query can show an earlier fetch's data, or its error with `status: 'error'`.
- **The callback can't skip one item and not another.** It runs once, on a stand-in, so it can't read an item's data to decide. A procedure that takes `null` can answer for an item that has nothing.
- **The entry must be a query entry.** An infinite entry per item isn't supported.
- **A callback can return an object of entries**, which loads as a group: an entry per item for each key, and a handle per item for each, read with `experimental_handleOfItem()`. `null` for a key skips it: its handle is `undefined`.
- **Each entry in the object reads only the item and the load's entries.** These load with `experimental_load()` only: an entry per item of a list in an item, an entry in the object that reads another one, and an entry built with `experimental_dataOf(entry, (data) => entry)`.

### With one request {#per-item-one-request}

- **The entry per item is one call**, which the server runs once for every item it found. Every run validates its input, and has its own result or error.
- **`maxBatchSize` counts every run.** A request's calls and the items they run for can't add up to more. If they do, the server runs the call for none of the list's items, and each item asks by itself.
- **A request fills in 100,000 characters of JSON by default.** Each run gets its own copy of what it reads, and of the rest of its input. A run that would go over fails by itself. See [Limits](/docs/client/vanilla/nested-queries#limits).
- **A list from `.map()` or `.flatMap()` loads in one request too.** The server walks the list as the client does, and runs the call for the same items.
- **Of an infinite entry, the request has the first page.** The items of a later page load with that page, as [below](#later-fetches), if the items are the elements of one list in each page, such as `pages.flatMap((page) => page.items)`, and the item's query reads the item. Any other list's items load when they are read.
- **A link mustn't change the list's rows.** The server runs the item's query for the rows as the procedure returned them, and each row reads the result at its place. A link that sorts or filters the rows would give a row another row's result.
- **A link mustn't change any value that another query reads**, in a list or not. If a link changes a post's `authorId` from `u1` to `u2`, the server still runs `author.byId` for `u1`, and the cache can keep that result under the key for `u2`. See [Good to know](/docs/client/vanilla/nested-queries#good-to-know).

### When the list is fetched again {#later-fetches}

The list's handle knows what its items load. So the options that `fromHandle(trpc, handles.posts)` gives load the items' queries with every fetch of the list: the next page, or a refetch after an invalidation. This is the request for the next page:

```http
POST /post.list,author.byId?batch=pipeline
Content-Type: application/json

{
  "0": { "cursor": 10, "direction": "forward" },
  "1": {},
  "pipe": {
    "1": {
      "each": { "from": 0, "path": ["items"] },
      "reads": [{ "to": ["id"], "path": ["authorId"] }]
    }
  }
}
```

- **The component doesn't change.** `fetchNextPage()` on the query above sends this request, and each new row finds its author in the cache.
- **It is shown as a POST**, which it is with [`methodOverride: 'POST'`](/docs/rpc#overriding-the-default-http-method). As a GET, the same is in the URL, as in [What goes over the wire](/docs/client/vanilla/nested-queries#wire).
- **Read the list through its handle.** A query from `trpc.post.list.infiniteQueryOptions()` fetches the list alone.
- **The proxy you pass to `fromHandle` must have the author's procedure**, such as the root `trpc`. With `trpc.post`, the later pages load without their authors.
- **An item's query that reads nothing of its item**, such as a fixed id, loads when a row reads it.
- **Only the item's part of an input is new.** What an item's input reads besides the item, such as the whole list or another entry, stays as it was in the first load. The items' handles have that input, so each row still finds its query.
- **Without one request, nothing is added to the list's request.** A row's query loads when the row reads it, in a batch with the other rows'.
- **If the server refuses the items' call**, such as for one of its [limits](/docs/client/vanilla/nested-queries#limits), the list arrives without the items' data. Then every row's query is fetched as soon as the list arrives, in a batch, whether its row renders or not.
- **The items' call goes through your links**, as the list does. If a `splitLink` sends it to another link than the list's, it leaves the list's request. Through a link that pipelines, every row's query is fetched as soon as the list arrives. Through one that doesn't, a row's query loads when the row reads it.
- **A retry of the list's request carries the items' call.** If the request fails as a whole and a link retries it, the items' call goes in the retry's request.
- **Not with a `trpc.context` of its own.** `fromHandle(trpc, handles.posts, { trpc: { context } })` with a non-empty `context` fetches the list alone, since a link may route by that context. Each row's query loads when the row reads it.

## Entries next to components {#groups}

A component can list the queries it needs in a function in its own file. A page puts those functions together, as a GraphQL query puts fragments together. An object of entries is a **group**: its handles and data are under its key.

```tsx twoslash title='author-card.tsx'
// @include: dq-router
// @include: dq-trpc
// @filename: author-card.tsx
// ---cut---
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  fromHandle,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type {
  experimental_inferHandles,
  TRPCLoadEntries,
} from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

// It takes an author's id, and doesn't care where it comes from
export function authorCardEntries(trpc: TRPC, opts: { authorId: string }) {
  return {
    author: prefetchEntry(trpc.author.byId, { id: opts.authorId }),
  } satisfies TRPCLoadEntries;
}

export function AuthorCard(props: {
  handles: experimental_inferHandles<typeof authorCardEntries>;
}) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.handles.author));
  return <address>{authorQuery.data.name}</address>;
}
```

The post page passes it an id that the server fills in:

```ts twoslash title='post-page.tsx'
// @include: dq-router
// @include: dq-trpc
// @filename: author-card.tsx
import { prefetchEntry } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPCLoadEntries } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';
export function authorCardEntries(trpc: TRPC, opts: { authorId: string }) {
  return {
    author: prefetchEntry(trpc.author.byId, { id: opts.authorId }),
  } satisfies TRPCLoadEntries;
}
// @filename: post-page.tsx
// ---cut---
import {
  ensureEntry,
  experimental_dataOf,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPCLoadEntries } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';
import { authorCardEntries } from './author-card';

export function postPageEntries(trpc: TRPC, opts: { slug: string }) {
  const post = ensureEntry(trpc.post.bySlug, { slug: opts.slug });
  return {
    post,
    authorCard: authorCardEntries(trpc, {
      authorId: experimental_dataOf(post).authorId,
    }),
  } satisfies TRPCLoadEntries;
}
```

- **The component types its handles by its own entries function**, never by the page's.
- **End an entries function with `satisfies TRPCLoadEntries`.** It checks the entries where you write them, and keeps a [`skipToken`](/docs/client/tanstack-react-query/handles#conditional-queries) a `skipToken`.
- **`experimental_inferHandles<typeof entries>`** is the type of the handles.
- **In Next.js**, a server component can't call a function from a `'use client'` module. Move a client component's entries function to a file of its own without `'use client'`, such as `author-card.entries.ts`, and import only its type into the component's file.
- **A failed entry is named by its keys**: `authorCard.author`.

## Without a loader {#without-a-loader}

Some pages have no loader. The same entries load from a component.

### In a client component {#use-handles}

`experimental_useHandles(trpc, entries)` is `loadHandles()` for a client component. Call it at the top of the page's component:

```tsx twoslash title='post-page.tsx'
// @include: dq-router
// @include: dq-trpc
// @include: dq-post-entries
import type { experimental_inferHandles } from '@trpc/tanstack-react-query/unstable-handles';
declare function Post(props: {
  handles: experimental_inferHandles<typeof postPageEntries>;
}): React.ReactNode;
// ---cut---
'use client';

import { experimental_useHandles } from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { useTRPC } from '~/trpc/client';

// ...postPageEntries() and Post, from In short

export function PostPage(props: { slug: string }) {
  const trpc = useTRPC();
  // Starts every query, once, and waits for none
  const handles = experimental_useHandles(
    trpc,
    postPageEntries(trpc, { slug: props.slug }),
  );
  return (
    <Suspense fallback="Loading…">
      <Post handles={handles} />
    </Suspense>
  );
}
```

- **It returns the handles at once**, and waits for no data. The component that reads a handle waits, in its Suspense boundary.
- **It starts the entries once while the component is on the page.** Rendering again starts nothing.
- **It starts them again when they change**, such as for another slug, and when the component comes back to the page. As in a loader, a prefetch entry whose data is fresh asks for nothing.
- **A component that a Suspense boundary above it hasn't shown yet** keeps its load until 30 seconds after its queries settle.
- **Build the entries from values that stay the same between renders**: props, the URL. An input that is new on every render, such as `new Date()`, starts the queries on every render.
- **Entries are compared by value, as query keys are**: the procedure, the input, and the options that say how a query starts, such as `staleTime`. Which function an option holds isn't compared. A function in `trpc.context` is, as a link may route by it: define it outside the component. The order of an object's keys isn't compared, so don't route by it.
- **It is for a page without a loader.** Entries that a loader has already started get no second request, so the queries that depend on them have no request to go in.
- **With a link that [pipelines](/docs/client/vanilla/nested-queries#turn-on), it is one request**, as from a loader.
- **No handle can have another entry's data in its input.** Build such an entry with [`experimental_dataOf(entry, (data) => entry)`](#without-waiting), as above. The form `experimental_dataOf(post).authorId` throws here, as its handle would need the post.
- **A [query for every item](#entry-per-item) needs its list from a prefetch entry.**
- **A fetch or ensure entry starts, and nothing waits for it.** Its error shows where its handle is read.

### In a server component {#server-components}

A server component calls `loadHandles()`, as a loader does. [`HydrateClient`](/docs/client/tanstack-react-query/handles#hydrate-client) sends the queries that exist when it renders. It sends a pending query only if the query client's `shouldDehydrateQuery` allows it, as in the [App Router setup](/docs/client/nextjs/app-router-setup). A query built from another's data exists only once that data is there.

So wait for the data that the next query needs:

```tsx twoslash title='app/posts/[slug]/page.tsx'
// @include: dq-router
// @include: dq-trpc
// @filename: components.tsx
'use client';

import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';
export declare function Post(props: {
  post: inferQueryHandle<TRPC['post']['bySlug']>;
}): React.ReactNode;
export declare function AuthorCard(props: {
  author: inferQueryHandle<TRPC['author']['byId']>;
}): React.ReactNode;
// @filename: page.tsx
// ---cut---
import {
  ensureEntry,
  experimental_dataOf,
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { HydrateClient, trpc } from '~/trpc/server';
import { AuthorCard, Post } from './components';

export default async function PostPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const post = ensureEntry(trpc.post.bySlug, { slug });
  // Waits for the post, and not for the author
  const [handles] = await loadHandles(trpc, {
    post,
    author: prefetchEntry(trpc.author.byId, {
      id: experimental_dataOf(post).authorId,
    }),
  });
  return (
    <HydrateClient>
      <Post post={handles.post} />
      <Suspense fallback="Loading…">
        <AuthorCard author={handles.author} />
      </Suspense>
    </HydrateClient>
  );
}
```

- **The author's query is on its way when `HydrateClient` renders**, so it goes to the browser and streams in.
- **To not hold the page back, put the load in a server component of its own**, in a Suspense boundary. The rest of the page shows first.
- **There is no request to save.** The proxy calls the router directly, so nothing is pipelined on the server.

#### When the load waits for nothing {#server-components-no-wait}

A load of only prefetch entries waits for nothing if no handle needs data: each entry that reads another's data is built with a callback, `experimental_dataOf(post, (data) => …)`. An input that reads data without a callback, as the author's above, makes the load wait for that data, prefetch or not.

When the load waits for nothing, the page's `HydrateClient` has the first query only, and the browser asks for the author by itself. To send the author too, load the post again in a server component further down, with an ensure entry, and render a `HydrateClient` there:

```tsx twoslash title='app/posts/[slug]/author-section.tsx'
// @include: dq-router
// @include: dq-trpc
// @include: dq-components
// @filename: author-section.tsx
// ---cut---
import {
  ensureEntry,
  experimental_dataOf,
  experimental_handleOfItem,
  loadHandles,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import { HydrateClient, trpc } from '~/trpc/server';
import { AuthorCard } from './components';

// A server component, rendered in a Suspense boundary
export async function AuthorSection(props: { slug: string }) {
  // Whatever post the cache has, even stale, or the fetch on its way: the
  // page's load already fetches a stale post again
  const post = ensureEntry(
    trpc.post.bySlug,
    { slug: props.slug },
    { staleTime: Infinity },
  );
  // Waits for the post. The author's query is created from the same data,
  // before the load resolves
  const [handles, data] = await loadHandles(trpc, {
    post,
    author: experimental_dataOf(post, (it) =>
      prefetchEntry(trpc.author.byId, { id: it.authorId }),
    ),
  });
  return (
    <HydrateClient>
      <AuthorCard
        author={experimental_handleOfItem(handles.author, data.post)}
      />
    </HydrateClient>
  );
}
```

- **The author's query is built from the post this load has**, so it exists when `HydrateClient` renders. The server component finishes the author's handle with that same post, `data.post`.
- **Its key matches the post sent with it**, unless another load writes another post under the same key in between.
- **`HydrateClient` sends the post the cache has as it renders.** If a refetch in the meantime brings a post with another `authorId`, the author sent is the earlier post's, and the browser asks for the new one by itself.
- **No request goes out twice.** A post in the cache resolves the load at once. A post on its way, from the page's load, is waited for.
- **Don't wait with `queryClient.ensureQueryData()` instead.** It gives a stale post at once, while the page's load fetches the post again and builds the author's query only from that fetch. `HydrateClient` would render before the author's query exists.

## Errors {#errors}

When an entry fails, the entries that read its data can't start. For an entry the load doesn't wait for, see [The load doesn't wait](#without-waiting).

`loadHandles()` rejects with the failed entry's error when:

- **A fetch or ensure entry fails.**
- **A prefetch entry fails and another entry needs its data**, for its handle or for data the load waits for. That is an entry that reads it in its input with `experimental_dataOf(entry)`, or a fetch or ensure entry in an `experimental_dataOf(entry, (data) => entry)` callback. This holds even if the cache gets data for it while its request runs, such as from `setQueryData()`.
- **An entry that reads no other entry throws while the load starts it**, such as from a `staleTime` function. The load starts no entry after that one.

It doesn't reject when:

- **A prefetch entry that nothing reads fails.** The error shows where its handle is read.
- **A prefetch entry fails and the entries that read it are prefetch entries in a callback, or of `experimental_perItem()`.** Those don't start, and the load resolves with their unfinished handles.

An entry built from another entry's data whose query can't start fails by itself, with a `TRPCEntryError`, such as for an input that no query key can hold. The entries beside it still load.

To get errors as values, use `loadHandlesSettled()`:

```ts twoslash
// @include: dq-router
// @include: dq-trpc
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
declare const slug: string;
declare function notFound(): never;
// ---cut---
import {
  ensureEntry,
  experimental_dataOf,
  loadHandlesSettled,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';

const post = ensureEntry(trpc.post.bySlug, { slug });
const [handles, results] = await loadHandlesSettled(trpc, {
  post,
  author: prefetchEntry(trpc.author.byId, {
    id: experimental_dataOf(post).authorId,
  }),
});
if (results.post.status === 'error') {
  if (results.post.error.code === 'NOT_FOUND') {
    notFound();
  }
  throw results.post.error;
}
```

- **`results` has the error** for the entry that failed, and for each fetch or ensure entry that reads it.
- **A fetch or ensure `experimental_perItem()` over a failed entry** has no list to make items from, so its result is an empty list.
- **An entry whose request failed still has its handle.**
- **An entry has no handle when the load couldn't build it**: its query couldn't start, or it never started because an entry its handle's input reads failed.
- **An entry built with `experimental_dataOf(entry, (data) => entry)` keeps its unfinished handle** if that handle doesn't need the failed entry.
- **Check the results before you return the handles.**

`loadHandlesSettled()` still rejects when:

- **What you pass it isn't a load it can start.** It rejects before any entry starts: a query is a bare `experimental_query()`, a value isn't an entry, an entry was built with a proxy for another `QueryClient`, or an entry reads the data of one that isn't in the load.
- **A prefetch entry fails and another entry needs its data**, as for `loadHandles()` above. A prefetch entry has no result to hold the error.
- **An entry that reads no other entry throws while the load starts it**, whatever its kind, as for `loadHandles()` above.
- **A query is interrupted rather than failing.** If `queryClient.cancelQueries()` cancels the fetch of an ensure entry the cache has no data for, the load rejects with TanStack Query's `CancelledError`, which `isCancelledError()` checks.
- **An error has a `digest`**, such as the one Next.js's `headers()` throws in a static render. It is rethrown as it is.

## FAQ {#faq}

#### Why not reshape the procedure? {#why-not-reshape}

You can, and it is [often the simplest fix](/docs/client/tanstack-react-query/handles#reshape-procedures): return the post with its author, and the page needs one query. Keep the procedures small, and use this page's way, when:

- **A component should own its data.** The author card asks for an author. Any page can use it, and no procedure has to know about the page.
- **One procedure serves many pages.** `author.byId` stays `author.byId`, with one cache entry per author.
- **Slow parts mustn't hold back fast ones.** A joined procedure answers when its slowest part is done. Here each part arrives by itself.

#### Can a later page of an infinite list load its authors in the same request? {#later-pages}

Yes, if:

- the component reads the list through its handle,
- each page has one flat list,
- the author's query reads the post,
- and the proxy you pass to `fromHandle` has the author's procedure, such as the root `trpc`.

See [When the list is fetched again](#later-fetches).
