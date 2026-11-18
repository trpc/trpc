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
- **Nothing blocks the page.** It shows at once, and each part streams in when its data is ready.

An `xxxEntries()` function is a spiritual cousin of a GraphQL query or fragment. It sits next to its component. A page puts several together. All of it loads in one request. But it is plain TypeScript and plain tRPC procedures: there is no schema, no resolver and no build step.

```demo nested-queries
```

:::tip See it in an app
The [SSE chat example](https://sse.trpc.io/blog) has a blog that loads this way. Open your browser's Network tab and go from post to post: each page is one request, for the post, its author and more posts from the author's team. Its [source](https://github.com/trpc/trpc/tree/main/examples/tanstack-start-sse-chat/src/routes/blog) is two routes.
:::

:::info
Everything on this page is experimental, and may change in a minor release. The names start with `experimental_` so that you can tell.

Nothing here changes how your app works until you use it. `loadHandles()` behaves as before for entries without `experimental_dataOf()`, and the server and the links behave as before without their options.
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
import { QueryClient } from '@tanstack/react-query';
import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '~/server/router';

// One per request
export const getQueryClient = cache(() => new QueryClient());
export const trpc = createTRPCOptionsProxy({
  ctx: {},
  router: appRouter,
  queryClient: getQueryClient,
});
export const HydrateClient = unstable_createHydrateClient(getQueryClient);
```

```twoslash include dq-post-entries
// @filename: post-page.entries.ts
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
      prefetchInfiniteEntry(trpc.post.list, { teamId: it.teamId }),
    ),
  } satisfies TRPCLoadEntries;
}
```

```twoslash include dq-list-entries
// @filename: post-list.entries.ts
import {
  ensureInfiniteEntry,
  experimental_dataOf,
  experimental_entryPerItem,
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
    authors: experimental_entryPerItem(
      experimental_dataOf(posts).pages.flatMap((page) => page.items),
      (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
    ),
  } satisfies TRPCLoadEntries;
}
```

## In short {#gist}

Three steps: say what the page needs, load it, read it.

#### 1. Say what the page needs {#gist-entries}

An entry names a query. `experimental_dataOf(post, (it) => …)` builds an entry from the post's data, before the post has loaded.

```ts twoslash title='post-page.entries.ts'
// @include: dq-router
// @include: dq-trpc
// @filename: post-page.entries.ts
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
      prefetchInfiniteEntry(trpc.post.list, { teamId: it.teamId }),
    ),
  } satisfies TRPCLoadEntries;
}
```

- **`it` is typed as the post**, so `it.authorId` is checked. It holds no data: it records which part you read.
- **The callback runs once**, before any request. Pass `it.authorId` on as it is. Don't compute with it or branch on it.

#### 2. Load it {#gist-load}

The loader, or server component, starts every query from the URL. A page that has neither loads [from a component](#without-a-loader).

```ts twoslash
// @include: dq-router
// @include: dq-trpc
// @include: dq-post-entries
// @filename: snippet.ts
import { trpc } from '~/trpc/server';
declare const slug: string;
// ---cut---
import { loadHandles } from '@trpc/tanstack-react-query/unstable-handles';
import { postPageEntries } from './post-page.entries';

// Only prefetch entries: this starts the queries and returns
const [handles] = await loadHandles(trpc, postPageEntries(trpc, { slug }));
```

- **It doesn't wait for any data.** The page can render at once.
- **Pass `handles` to the components**, as props.

#### 3. Read it {#gist-read}

The author's handle needs the post's data to be complete. The component that has the post finishes it with `experimental_handleOfItem(handle, data)`.

```tsx twoslash title='author-card.tsx'
// @include: dq-router
// @include: dq-trpc
// @include: dq-post-entries
// @filename: author-card.tsx
// ---cut---
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  experimental_handleOfItem,
  fromHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import type {
  experimental_inferHandles,
  inferInfiniteQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { useTRPC, type TRPC } from '~/trpc/client';
import type { postPageEntries } from './post-page.entries';

export function AuthorCard(props: {
  handles: experimental_inferHandles<typeof postPageEntries>;
}) {
  const trpc = useTRPC();
  const { handles } = props;
  // The author's id is in the post
  const postQuery = useSuspenseQuery(fromHandle(trpc, handles.post));
  const authorQuery = useSuspenseQuery(
    fromHandle(trpc, experimental_handleOfItem(handles.author, postQuery.data)),
  );
  return (
    <address>
      {authorQuery.data.name}
      <Suspense fallback="Loading…">
        <MoreFromTeam
          posts={experimental_handleOfItem(
            handles.moreFromTeam,
            authorQuery.data,
          )}
        />
      </Suspense>
    </address>
  );
}

function MoreFromTeam(props: {
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

- **Each part shows when its query has loaded**: the post, then the author, then the team's posts. Give each its own Suspense boundary.
- **The components make no request of their own.** Each query is already on its way when its component asks for it. Data older than `staleTime` still refetches in the background, as with any query: set a `staleTime` above 0, as [the setup guides do](/docs/client/tanstack-react-query/handles#invalidation-and-staleness).
- **A finished handle is an ordinary handle.** It reads the cache entry `trpc.author.byId.queryOptions({ id: 'u1' })` would.

Then [turn on one request](/docs/client/vanilla/nested-queries#turn-on). Without it, the same code works, with one round trip per step.

## One request {#one-request}

The browser can't ask for the author before it has the post. It doesn't know the id. With pipelining it doesn't have to: it sends every call at once, and the server fills in each one's input from the result before it, then sends each result back when it is ready.

It is a feature of the client and the server, not of TanStack Query, so it has its own page: [Nested queries in one request](/docs/client/vanilla/nested-queries#one-request). There you'll find how to [turn it on](/docs/client/vanilla/nested-queries#turn-on), [what goes over the wire](/docs/client/vanilla/nested-queries#wire), [what your links see](/docs/client/vanilla/nested-queries#links), [when it isn't one request](/docs/client/vanilla/nested-queries#fallback) and its [limits](/docs/client/vanilla/nested-queries#limits).

An entry with a `trpc.context` of its own takes no part: a link may route by that context. It loads in a request of its own, and so does an entry that reads its data.

## The load doesn't wait {#without-waiting}

`experimental_dataOf(entry, (data) => entry)` builds an entry from another entry's data. The load doesn't wait for that data. This is the form [In short](#gist) uses.

- **The handle is unfinished.** The load can't know its input yet. `experimental_handleOfItem(handle, data)` finishes it, in the component that has the data.
- **`fromHandle()` doesn't take an unfinished handle**: it is a type error, and it throws.
- **A query has no cache entry until its key is known.** The author's call is on its way from the start. Its query is created when the post arrives, under the key of its real input. A query never changes its key.
- **The query is there before the component asks.** It is created in the step that gives the cache the post. So the author card finds it loading, and makes no request of its own.
- **A failed entry fails where it is read.** If the post fails, the load still resolves, the author never starts, and the component that reads the post throws the error.
- **A fetch or ensure entry in the callback** is waited for, as always. Its handle is unfinished too.

## When the loader needs the data {#data-of}

Sometimes the loader must have the post before the page renders: to answer with a 404, or to set the title. Then wait for the post with `ensureEntry` or `fetchEntry`, and read its data in another entry's input with `experimental_dataOf(entry)`, without a callback.

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

`experimental_dataOf(entry)` is typed as the entry's data, so the input you build with it is checked:

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
const moreFromTeam = prefetchInfiniteEntry(trpc.post.list, {
  teamId: experimental_dataOf(author).teamId,
});

// A part of every item of a list. With one request, that is a list: the
// server takes it only with `allowWholeValues`, else it loads by itself
const tags = prefetchEntry(trpc.tag.byIds, {
  ids: experimental_dataOf(post).tags.map((tag) => tag.id),
});

// The input is checked against the data's type
prefetchEntry(trpc.author.byId, { id: experimental_dataOf(post).tags });
```

- **Pass it on as it is.** Use it as an input, or anywhere inside one. Don't compute with it or branch on it: `` `${experimental_dataOf(post).slug}-draft` `` throws, and `experimental_dataOf(post).authorId ? a : b` is always `a`.
- **`.map()` is the one array method that works in an input.** `.flatMap()` works only for [a query for every item](#entry-per-item). The callback runs once, on a stand-in for every item, and must return the item or a part of it. With [one request](#one-request), the list it makes is a whole value, which the server takes only with [`allowWholeValues`](/docs/client/vanilla/nested-queries#limit-whole-values). Without it, the query loads in a request of its own once the data is there.
- **Put every entry it reads in the same load.** The order of the entries doesn't matter.
- **The load waits for the data it reads**, whatever the kind of either entry, because a handle needs its input. To not wait, [use the callback](#without-waiting).
- **If the value can be missing**, such as an optional `coverImageId`, the entry runs with a missing input. That fails its validation, unless the procedure takes a missing one. [Reshape the procedure](/docs/client/tanstack-react-query/handles#reshape-procedures) to take what is always there.

## A query for every item {#entry-per-item}

A list often needs a query for every row: the author of every post. Without help, that is one round trip for the list, and one more for the rows.

`experimental_entryPerItem(list, (item) => entry)` loads an entry for every item of a list in another entry's data. With [one request](#one-request), the server runs it for every item it finds.

```demo nested-queries start=list
```

```ts twoslash title='post-list.entries.ts'
// @include: dq-router
// @include: dq-trpc
// @filename: post-list.entries.ts
// ---cut---
import {
  ensureInfiniteEntry,
  experimental_dataOf,
  experimental_entryPerItem,
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
    authors: experimental_entryPerItem(
      experimental_dataOf(posts).pages.flatMap((page) => page.items),
      (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
    ),
  } satisfies TRPCLoadEntries;
}
```

The load gives one handle for it. A row turns it into the handle of its own author with `experimental_handleOfItem(handle, item)`:

```tsx twoslash title='post-list.tsx'
// @include: dq-router
// @include: dq-trpc
// @include: dq-list-entries
// @filename: post-list.tsx
// ---cut---
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  experimental_handleOfItem,
  fromHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import type {
  experimental_inferHandles,
  inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';
import type { postListEntries } from './post-list.entries';

export function PostList(props: {
  handles: experimental_inferHandles<typeof postListEntries>;
}) {
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
            <AuthorName
              author={experimental_handleOfItem(props.handles.authors, post)}
            />
          </li>
        )),
      )}
    </ul>
  );
}

function AuthorName(props: {
  author: inferQueryHandle<TRPC['author']['byId']>;
}) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.author));
  return <small>{authorQuery.data.name}</small>;
}
```

- **The item gives the handle**, so there is no index to keep in step. Passing something that isn't one of the list's items is a type error.
- **It works for an item the load never had**, such as a post on a later page.
- **The load doesn't wait for a list from a prefetch entry.** The items' queries start when the list arrives.
- **Items with the same input share a query**, as two posts by one author do.
- **The items are the list's elements.** For a list from `.map()`, they are the values its callback returned: `experimental_dataOf(post).tags.map((tag) => tag.id)` has an item for every tag's id.
- **For the items of every list in a list, use `.flatMap()`**, as above: the items of every page of an infinite entry. A `.flatMap()` value can only be such a list, not a value in an input: the server can't flatten one into an input. A list of lists without it has the inner lists as its items, as its type says.
- **A `null` in the list is an item like any other.** Its query gets `null`, or `undefined` for a part of it, in its input: a type error, unless the procedure takes that. What isn't a list has no items, also in `.flatMap()`: unlike an array's `.flatMap()`, a callback that returns a value, such as `(post) => post.id`, gives no items. Return a list, or use `.map()`.
- **For nothing to fetch, return an entry with `skipToken`**: `() => prefetchEntry(trpc.author.byId, skipToken)`. Every item then has a disabled entry. `experimental_handleOfItem(handle, item)` gives a handle with `skipped: true`, whose query `useQuery` reads as idle: `'pending'`, unless the cache has data for its key. No call goes to the server, and it takes nothing from `maxBatchSize`.
- **The callback can't skip one item and not another.** It runs once, on a stand-in, so it can't read an item's data to decide. A procedure that takes `null` can answer for an item that has nothing.
- **The entry is a query entry.** An infinite entry for every item isn't supported.
- **With [one request](#one-request), it is one call**, which the server runs once for every item it found. Every run validates its input, and has its own result or error.
- **`maxBatchSize` counts every run.** A request's calls and the items they run for can't be more than it together. If they are, the server runs the call for none of the list's items, and each item asks by itself.
- **A request fills in 100,000 characters of JSON by default.** Each run gets its own copy of what it reads, and of the rest of its input. A run that would go over it fails by itself. See [Limits](/docs/client/vanilla/nested-queries#limits).
- **A list from `.map()` or `.flatMap()` loads in one request too.** The server walks the list as the client does, a level for every `null` in its path, and runs the call for the same items. Of an infinite entry, the request has the first page. If the items are the elements of one list in each page, such as `pages.flatMap((page) => page.items)`, and the item's query reads the item, the items of a later page load with that page, as [below](#later-fetches). Any other list's items load when they are read.
- **With one request, a link mustn't change the list's rows.** The server runs the item's query for the rows as the procedure returned them, and each row reads the result at its place. A link that sorts or filters the rows would give a row another row's result.

For a fetch or ensure entry, `data` has a list with every item's data.

### When the list is fetched again {#later-fetches}

The list's handle knows what its items load. So the options that `fromHandle(trpc, handles.posts)` gives load the items' queries with every fetch of the list: the next page, or a refetch after an invalidation.

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

- **The component doesn't change.** `fetchNextPage()` of the query above makes this request, and each new row finds its author in the cache.
- **It is shown as a POST**, which it is with [`methodOverride: 'POST'`](/docs/rpc#overriding-the-default-http-method). As a GET, the same is in the URL, as in [What goes over the wire](/docs/client/vanilla/nested-queries#wire).
- **Read the list through its handle.** A query from `trpc.post.list.infiniteQueryOptions()` fetches the list alone.
- **Only the item's part of an input is new.** What an item's input reads besides the item, such as the whole list or another entry, stays as it was in the first load. That is the input the items' handles have, so each row still finds its query.
- **Without one request, nothing is added to the list's request.** A row's query loads when the row reads it, in a batch with the other rows'.

## Entries next to components {#groups}

A component can say which queries it needs in a function next to it. A page puts those functions together, as a GraphQL query does with fragments. An object of entries is a group: its handles and data are under its key.

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

```ts twoslash title='post-page.entries.ts'
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
// @filename: post-page.entries.ts
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

- **End an entries function with `satisfies TRPCLoadEntries`.** It checks the entries where you write them, and keeps a [`skipToken`](/docs/client/tanstack-react-query/handles#conditional-queries) a `skipToken`.
- **`experimental_inferHandles<typeof entries>`** is the type of the handles, for a component's props.
- **In Next.js**, keep an entries function out of a `'use client'` file. A server component calls it.
- **A failed entry is named by its keys**: `authorCard.author`.

## Without a loader {#without-a-loader}

Some pages have no loader. The same entries load from a component.

### In a client component {#use-handles}

`experimental_useHandles(trpc, entries)` is `loadHandles()` for a client component. Call it at the top of the page's component.

```tsx twoslash title='post-page.tsx'
// @include: dq-router
// @include: dq-trpc
// @include: dq-post-entries
// @filename: author-card.tsx
import type { experimental_inferHandles } from '@trpc/tanstack-react-query/unstable-handles';
import type { postPageEntries } from './post-page.entries';
export declare function AuthorCard(props: {
  handles: experimental_inferHandles<typeof postPageEntries>;
}): React.ReactNode;
// @filename: post-page.tsx
// ---cut---
'use client';

import { experimental_useHandles } from '@trpc/tanstack-react-query/unstable-handles';
import { Suspense } from 'react';
import { useTRPC } from '~/trpc/client';
import { AuthorCard } from './author-card';
import { postPageEntries } from './post-page.entries';

export function PostPage(props: { slug: string }) {
  const trpc = useTRPC();
  // Starts every query, once, and waits for none
  const handles = experimental_useHandles(
    trpc,
    postPageEntries(trpc, { slug: props.slug }),
  );
  return (
    <Suspense fallback="Loading…">
      <AuthorCard handles={handles} />
    </Suspense>
  );
}
```

- **It starts the entries once, for as long as the component is on the page.** Rendering again starts nothing. A page that a Suspense boundary above it hasn't shown yet keeps its load until 30 seconds after its queries settle.
- **It starts them again when they change**, such as for another slug, and when the component comes back to the page. As in a loader, a prefetch entry whose data is fresh asks for nothing.
- **Build the entries from values that stay the same from render to render**: props, the URL. They are compared by value, as query keys are: the procedure, the input, and the options that say how a query starts, such as `staleTime`. Which function an option is isn't compared. An input that is new on every render, such as `new Date()`, starts the queries on every render.
- **It is for a page without a loader.** Entries that a loader has started already get no second request, so the queries that depend on them have no request to go in.
- **It returns the handles at once.** It waits for no data: the component that reads a handle does, in its Suspense boundary.
- **With a link that [pipelines](/docs/client/vanilla/nested-queries#turn-on), it is one request**, as from a loader.
- **No handle can have another entry's data in its input.** Build such an entry with [`experimental_dataOf(entry, (data) => entry)`](#without-waiting), as above. The form `experimental_dataOf(post).authorId` throws here: its handle would need the post.
- **A [query for every item](#entry-per-item)** needs its list from a prefetch entry.
- **A fetch or ensure entry starts and isn't waited for.** Its error shows where its handle is read.

### In a server component {#server-components}

A server component calls `loadHandles()`, as a loader does. [`HydrateClient`](/docs/client/tanstack-react-query/handles#hydrate-client) sends the queries that exist when it renders. A query that is built from another's data exists only once that data is there.

So wait for the data that the next query needs:

```tsx twoslash title='app/posts/[slug]/page.tsx'
// @include: dq-router
// @include: dq-trpc
// @filename: components.tsx
import type { inferQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { TRPC } from '~/trpc/client';
export declare function Post(props: {
  post: inferQueryHandle<TRPC['post']['bySlug']>;
}): React.ReactNode;
export declare function Author(props: {
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
import { Author, Post } from './components';

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
        <Author author={handles.author} />
      </Suspense>
    </HydrateClient>
  );
}
```

- **The author's query is on its way when `HydrateClient` renders**, so it crosses to the browser and streams in.
- **To not hold the page back, put the load in a server component of its own**, in a Suspense boundary. The rest of the page shows first.
- **There is no request to save.** The proxy calls the router directly, so nothing is pipelined on the server.
- **A load of only prefetch entries waits for nothing**, so the page's `HydrateClient` has the first query only. Then the browser asks for the author by itself. To send it, wait for the post in a server component further down, and render a `HydrateClient` there too:

```tsx twoslash title='app/posts/[slug]/author-section.tsx'
// @include: dq-router
// @include: dq-trpc
// @include: dq-post-entries
// @filename: components.tsx
import type { experimental_inferHandles } from '@trpc/tanstack-react-query/unstable-handles';
import type { postPageEntries } from './post-page.entries';
export declare function AuthorCard(props: {
  handles: experimental_inferHandles<typeof postPageEntries>;
}): React.ReactNode;
// @filename: author-section.tsx
// ---cut---
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { experimental_inferHandles } from '@trpc/tanstack-react-query/unstable-handles';
import { getQueryClient, HydrateClient, trpc } from '~/trpc/server';
import { AuthorCard } from './components';
import type { postPageEntries } from './post-page.entries';

// A server component, rendered in a Suspense boundary
export async function AuthorSection(props: {
  handles: experimental_inferHandles<typeof postPageEntries>;
}) {
  // The author's query is created in the step that the post arrives in
  await getQueryClient().ensureQueryData(
    fromHandle(trpc, props.handles.post),
  );
  return (
    <HydrateClient>
      <AuthorCard handles={props.handles} />
    </HydrateClient>
  );
}
```

## Errors {#errors}

When an entry fails, the entries that read its data can't start. For an entry the load doesn't wait for, see [The load doesn't wait](#without-waiting).

- **`loadHandles()` rejects** with the error of the entry that failed. That is also so for a prefetch entry, if another entry reads its data with `experimental_dataOf(entry)`. A prefetch entry that nothing reads never makes a load reject.
- **`loadHandlesSettled()` has that error in `results`**, for the entry that failed and for the fetch and ensure entries that read it. Those have no handle, so check the results before you return the handles.

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

If the failed entry is a prefetch entry, which has no result, `loadHandlesSettled()` rejects with its error.

## FAQ {#faq}

#### Why not reshape the procedure? {#why-not-reshape}

You can, and it is [often the simplest fix](/docs/client/tanstack-react-query/handles#reshape-procedures): return the post with its author, and the page needs one query.

Use this page's way when you'd rather keep the procedures small.

- **A component owns its data.** The author card asks for an author. Any page can use it, and no procedure has to know about the page.
- **One procedure serves many pages.** `author.byId` stays `author.byId`, with one cache entry per author.
- **Slow parts don't hold back fast ones.** A joined procedure answers when its slowest part is done. Here each part arrives by itself.

#### Can a later page of an infinite list load its authors in the same request? {#later-pages}

Yes, if the component reads the list through its handle, each page has one flat list, and the author's query reads the post. The proxy you pass to `fromHandle` must have the author's procedure too, such as the root `trpc`: with `trpc.post`, the later pages load without their authors. A query that reads nothing of its item, such as a fixed id, loads when a row reads it. See [When the list is fetched again](#later-fetches).

