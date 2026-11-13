---
id: dependent-queries
title: Dependent queries in one request
sidebar_label: Dependent queries
slug: /client/tanstack-react-query/dependent-queries
section: "Client Usage"
parent: "client/tanstack-react-query"
order: 54
---

A query whose input comes from another query's data is a waterfall: the browser waits for the first before it can ask for the second. With [handles](/docs/client/tanstack-react-query/handles), a loader can describe both in one load, and the server can run both in one request.

- **`experimental_dataOf(entry)`** stands in for the data of another entry, so an entry's input can use it before it has loaded.
- **`experimental_dataOf(entry, (data) => entry)`** does the same [without making the load wait](#without-waiting) for that data.
- **Pipelining** sends such entries in the same batch. The server fills in their inputs between the calls.
- **`experimental_entryPerItem()`** loads a query for every item of a list, such as the author of every post.

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
export type Author = { id: string; name: string };

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
          authorId: z.string().optional(),
          cursor: z.number().nullish(),
        }),
      )
      .query(() => ({
        items: [] as Post[],
        nextCursor: null as number | null,
      })),
  }),
  author: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }): Author => ({ id: input.id, name: 'Alex' })),
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
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { appRouter } from '~/server/router';

export const trpc = createTRPCOptionsProxy({
  ctx: {},
  router: appRouter,
  queryClient: new QueryClient(),
});
```

## In short {#gist}

The post has its author's id. Build the author's entry with `experimental_dataOf(post).authorId`, and load both:

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

- The author's handle is an ordinary handle. Its input is `{ id: 'u1' }`, and it reads the cache entry `trpc.author.byId.queryOptions({ id: 'u1' })` would.
- Without pipelining, the load asks for the post, then for the author: two requests.
- With [pipelining](#one-request), it is one request.

## Reading another entry's data {#data-of}

`experimental_dataOf(entry)` is typed as the entry's data, so the input you build with it is checked. It holds no data: it records which part you read, and the load fills that in once the entry has data.

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
const moreByAuthor = prefetchInfiniteEntry(trpc.post.list, {
  authorId: experimental_dataOf(author).id,
});

// A part of every item of a list
const tags = prefetchEntry(trpc.tag.byIds, {
  ids: experimental_dataOf(post).tags.map((tag) => tag.id),
});

// The input is checked against the data's type
prefetchEntry(trpc.author.byId, { id: experimental_dataOf(post).tags });
```

- **Pass it on as it is.** Use it as an input, or anywhere inside one. Don't compute with it or branch on it: `` `${experimental_dataOf(post).slug}-draft` `` throws, and `experimental_dataOf(post).authorId ? a : b` is always `a`.
- **`.map()` is the one array method that works.** Its callback runs once, on a stand-in for every item, and must return the item or a part of it.
- **Put every entry it reads in the same load.** The order of the entries doesn't matter.
- **The load waits for the data it reads**, whatever the kind of either entry, because a handle needs its input. A prefetch entry that reads a post makes the load wait for the post, not for itself. To not wait, [use the callback form](#without-waiting).
- **If the value can be missing**, such as an optional `coverImageId`, the entry runs with a missing input and fails its validation. [Reshape the procedure](/docs/client/tanstack-react-query/handles#reshape-procedures) to take what is always there.

## Without waiting for the data {#without-waiting}

With a callback, `experimental_dataOf(entry, (data) => entry)` builds an entry that the load doesn't wait for the data for. The callback runs once, on a stand-in for the data, and returns the entry.

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
  const author = experimental_dataOf(post, (it) =>
    prefetchEntry(trpc.author.byId, { id: it.authorId }),
  );
  return {
    post,
    author,
    // An entry can be built from one that is built from another
    moreByAuthor: experimental_dataOf(author, (it) =>
      prefetchInfiniteEntry(trpc.post.list, { authorId: it.id }),
    ),
  } satisfies TRPCLoadEntries;
}
```

With only prefetch entries, `loadHandles()` starts the queries and returns. The author's handle can't have its input yet, so it is unfinished. The component that has the post finishes it with `experimental_handleOfItem(handle, data)`:

```tsx twoslash title='author-card.tsx'
// @include: dq-router
// @include: dq-trpc
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
    moreByAuthor: experimental_dataOf(author, (it) =>
      prefetchInfiniteEntry(trpc.post.list, { authorId: it.id }),
    ),
  } satisfies TRPCLoadEntries;
}
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
        <MoreByAuthor
          posts={experimental_handleOfItem(
            handles.moreByAuthor,
            authorQuery.data,
          )}
        />
      </Suspense>
    </address>
  );
}

function MoreByAuthor(props: {
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

- **Each part shows when its query has loaded**: the post, then the author, then the list, each behind its own Suspense boundary.
- **It is still [one request](#one-request)** with pipelining. Use `httpBatchStreamLink`, which sends each result when it is ready.
- **A query has no cache entry until its key is known.** The author's request is on its way from the start, but its query is created when the post arrives, under the key of its real input. Keys don't change.
- **The query is there before the component asks.** It is created in the step that gives the cache the post, so the author card finds it loading, and makes no request of its own.
- **`fromHandle()` doesn't take an unfinished handle**: it is a type error, and it throws.
- **A failed entry fails where it is read.** If the post fails, the load still resolves, the author never starts, and the error is thrown by the component that reads the post.
- **A fetch or ensure entry in the callback** is waited for, as always. Its handle is unfinished too.
- **`experimental_dataOf(author)` without a callback**, in another entry's input, still makes the load wait for the author.

## One request {#one-request}

Pipelining sends the entries of a load that read each other in one batch. The server runs the first call, copies what the second reads into its input, runs the second, and so on.

Turn it on in two places. On the server, in the options of any HTTP adapter:

```ts twoslash title='server.ts'
// @include: dq-router
// @filename: server.ts
// ---cut---
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from '~/server/router';

createHTTPServer({
  router: appRouter,
  experimental_allowPipelining: true,
}).listen(3000);
```

And on the client's batch link, `httpBatchLink` or `httpBatchStreamLink`:

```ts twoslash title='client.ts'
// @include: dq-router
// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchStreamLink } from '@trpc/client';
import type { AppRouter } from '~/server/router';

export const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: 'http://localhost:3000',
      experimental_pipelining: true,
    }),
  ],
});
```

The loader doesn't change. The load in [In short](#gist) now makes this request:

```
GET /post.bySlug,author.byId?batch=2
  &input={"0":{"slug":"hello"},"1":{}}
  &pipe={"1":[{"to":["id"],"from":0,"path":["authorId"]}]}
```

- **`pipe`** says what the server fills in: call 1's `id` is `authorId` from call 0's data. With [`methodOverride: 'POST'`](/docs/rpc#overriding-the-default-http-method), it is in the body, beside the inputs.
- **Every call still validates its input** and runs its middleware, as if the browser had sent it.
- **The server only reads what it sends back anyway**: the data of a call in the same request, as the client gets it.
- **Each result is an ordinary cache entry**, under the key of its filled-in input. The client works that input out from the first call's data, as the server did.
- **Use `httpBatchStreamLink`.** With `httpBatchLink`, the response waits for the slowest call, so the post arrives with the author.

Only a batch with such a read is a pipelined batch, `batch=2`. Every other batch is sent as it always was, also with the options on.

### When it isn't one request {#fallback}

The load then fills in the input in the browser, and asks again. It gives the same handles and the same data.

- **The entry it reads needed no request**, because the cache had its data. The entries that read it start at once, together.
- **The request doesn't go through a batch link with `experimental_pipelining`**: `httpLink`, `wsLink`, or a `splitLink` that sends the two entries to different links.
- **The proxy calls the router directly**, as in a server component. There is no request to save.
- **The batch was split** by `maxURLLength` or `maxItems`, and the two calls are in different requests.
- **It reads an infinite entry's later pages.** The first page is one request's result, which the server can read: `experimental_dataOf(posts).pages[0]`.
- **The cache had another value** than the server read. The load keeps the cache's, which the handle's input is from, and fetches with it.

A pipelined entry always asks the server, also when the cache has its query: its key isn't known until the entry it reads has loaded.

### If the server doesn't allow it {#not-allowed}

A server without `experimental_allowPipelining` runs nothing of a pipelined batch, and the load rejects:

```
The server did not accept a pipelined batch. Set `experimental_allowPipelining: true` on its handler, or turn off `experimental_pipelining` on the link
```

So turn the option on the server first, then on the link.

## A query for every item {#entry-per-item}

`experimental_entryPerItem(list, (item) => entry)` loads an entry for every item of a list in another entry's data. Its callback runs once, on a stand-in for every item.

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
      experimental_dataOf(posts).pages.map((page) => page.items),
      (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
    ),
  } satisfies TRPCLoadEntries;
}
```

The load gives one handle for it. A row turns it into the handle of its own author with `experimental_handleOfItem(handle, item)`:

```tsx twoslash title='post-list.tsx'
// @include: dq-router
// @include: dq-trpc
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
      experimental_dataOf(posts).pages.map((page) => page.items),
      (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
    ),
  } satisfies TRPCLoadEntries;
}
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
- **The list can be a list of lists**, as above: the items of every page of an infinite entry.
- **The entry is a query entry.** An infinite entry for every item isn't supported.
- **With [pipelining](#one-request), it is one call** in the batch, which the server runs once for every item it found. Every run validates its input, and has its own result or error. `maxBatchSize`, if you set it, also limits the items.

For a fetch or ensure entry, `data` has a list with every item's data.

### When the list is fetched again {#later-fetches}

The list's handle knows what its items load. So the options that `fromHandle(trpc, handles.posts)` gives load the items' queries with every fetch of the list: the next page, or a refetch after an invalidation.

```
POST /post.list,author.byId?batch=2

{
  "0": { "cursor": 10, "direction": "forward" },
  "1": {},
  "pipe": { "1": [{ "to": ["id"], "from": 0, "path": ["items", null, "authorId"], "each": true }] }
}
```

- **The component doesn't change.** `fetchNextPage()` of the query above makes this request, and each new row finds its author in the cache.
- **Read the list through its handle.** A query from `trpc.post.list.infiniteQueryOptions()` fetches the list alone.
- **Without pipelining, nothing is added to the list's request.** A row's query loads when the row reads it, in a batch with the other rows'.

## Entries next to components {#groups}

A component can say which queries it needs in a function next to it, and a page can put them together. An object of entries is a group: its handles and data are under its key.

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

## Errors {#errors}

When an entry fails, the entries that read its data can't start. For an entry the load doesn't wait for, see [Without waiting for the data](#without-waiting).

- **`loadHandles()` rejects** with the error of the entry that failed, also when that one is a prefetch entry.
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

#### Is pipelining safe to turn on? {#safe}

A pipelined batch does what the browser could do in two requests. Each call validates its input and runs its middleware, and the server only reads data it sends back in the same response.

A call for every item runs a procedure once for every item of a list the server returned. Set [`maxBatchSize`](/docs/client/links/httpBatchLink#limiting-batch-size) to limit it.

#### Does it work with mutations and subscriptions? {#mutations}

No. Only queries can be pipelined, and a pipelined batch of mutations is rejected.

#### Can a later page of an infinite list load its authors in the same request? {#later-pages}

Yes, if the component reads the list through its handle. See [When the list is fetched again](#later-fetches).

#### What does `createContext` see? {#create-context}

While `createContext` runs, `info.calls[i].getRawInput()` of a call that reads from another has the input as the client sent it, without the parts the server fills in. The procedure gets the filled-in input.
