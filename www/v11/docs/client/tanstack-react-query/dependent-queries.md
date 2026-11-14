---
id: dependent-queries
title: Dependent queries in one request
sidebar_label: Dependent queries
slug: /client/tanstack-react-query/dependent-queries
section: "Client Usage"
parent: "client/tanstack-react-query"
order: 54
---

A page often needs one answer before it can ask the next question.

- The post page has a slug. It needs the **post**.
- The post has an `authorId`. The page needs the **author**.
- The author has an `id`. The page needs the author's **other posts**.

Each query waits for the one before it. That is three round trips, one after another. This is a waterfall, and it makes pages slow.

The trips are what cost. The server's work takes the same time on any connection. The trip there and back does not: on a slow connection it is most of the wait, and this page makes three.

With [handles](/docs/client/tanstack-react-query/handles) and the functions on this page, the same page loads in **one request**.

- **A component says what data it needs, ahead of time.** It says so in a plain function. The data can depend on other data.
- **The page makes one request for all of it.** The server fills in each id as it goes.
- **Nothing blocks the page.** It shows at once, and each part streams in when its data is ready.

An `xxxEntries()` function is a spiritual cousin of a GraphQL query or fragment. It sits next to its component. A page puts several together. All of it loads in one request. But it is plain TypeScript and plain tRPC procedures: there is no schema, no resolver and no build step.

```demo dependent-queries
```

:::tip See it in an app
The [SSE chat example](https://sse.trpc.io/blog) has a blog that loads this way. Open your browser's Network tab and go from post to post: each page is one request, for the post, its author and the author's other posts. Its [source](https://github.com/trpc/trpc/tree/main/examples/tanstack-start-sse-chat/src/routes/blog) is two routes.
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
    moreByAuthor: experimental_dataOf(author, (it) =>
      prefetchInfiniteEntry(trpc.post.list, { authorId: it.id }),
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
      experimental_dataOf(posts).pages.map((page) => page.items),
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
    moreByAuthor: experimental_dataOf(author, (it) =>
      prefetchInfiniteEntry(trpc.post.list, { authorId: it.id }),
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

- **Each part shows when its query has loaded**: the post, then the author, then the list. Give each its own Suspense boundary.
- **The components make no request of their own.** Each query is already on its way when its component asks for it.
- **A finished handle is an ordinary handle.** It reads the cache entry `trpc.author.byId.queryOptions({ id: 'u1' })` would.

Then [turn on one request](#turn-on). Without it, the same code works, with one round trip per step.

## One request {#one-request}

The browser can't ask for the author before it has the post. It doesn't know the id.

It doesn't have to. It can send every call at once, and leave a blank where each id goes:

- "Get the post with this slug."
- "Get the author. Take the `id` from the post's `authorId`."
- "Get the posts. Take the `authorId` from the author's `id`."

The server does the rest.

1. It runs the first call.
2. It fills in the blank of the second call from the first call's result.
3. It runs the second call, and so on.
4. It sends each result back as soon as it is ready.

No result has to travel to the browser and back before the next call can start. The server still does the same work. The page just stops paying for a trip between each step. This is called **pipelining**, and the two options below turn it on.

### Turn it on {#turn-on}

Two options. First on the server, in the options of any HTTP adapter:

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

Then on the client's batch link:

```ts twoslash title='client.ts'
// @include: dq-router
// @filename: client.ts
// ---cut---
import {
  createTRPCClient,
  experimental_pipelining,
  httpBatchStreamLink,
} from '@trpc/client';
import type { AppRouter } from '~/server/router';

export const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: 'http://localhost:3000',
      experimental_pipelining: experimental_pipelining(),
    }),
  ],
});
```

- **You pass it in, so only an app that uses it has its code.** A link without the option is about 0.2 kB bigger than before, gzipped. The option adds about 1.2 kB.
- **Use `httpBatchStreamLink`.** It sends each result when it is ready. `httpBatchLink` works too, but its response waits for the slowest call, so the post arrives with the author.
- **The loader and the components don't change.**
- **It saves round trips where there are any**: in a load that goes over HTTP, such as a loader that runs in the browser. A proxy that [calls the router directly](#fallback), on the server, makes no request.
- **Turn it on the server first.** A server without the option [runs nothing](#not-allowed) of such a request.

### What goes over the wire {#wire}

The post page above makes this request:

```
GET /post.bySlug,author.byId,post.list?batch=pipeline
  &input={"0":{"slug":"hello"},"1":{},"2":{"direction":"forward"}}
  &pipe={"1":[{"to":["id"],"from":0,"path":["authorId"]}],
         "2":[{"to":["authorId"],"from":1,"path":["id"]}]}
```

- **`pipe`** lists the blanks: call 1's `id` is `authorId` from call 0's data. With [`methodOverride: 'POST'`](/docs/rpc#overriding-the-default-http-method), it is in the body, beside the inputs.
- **Every call still validates its input** and runs its middleware, as if the browser had sent it.
- **The server only reads what it sends back anyway**: the data of a call in the same request, as the client gets it.
- **Each result is an ordinary cache entry**, under the key of its filled-in input. The client works that input out from the first call's data, as the server did.
- **Only a request with a blank is sent this way**, as `batch=pipeline`. Every other request is sent as it always was, also with the options on.

### What your links see {#links}

Your links see the post's query, and nothing else. The author's query isn't an operation of its own: the server runs it in the post's request, and its result goes to the cache when the post has arrived.

- **No link gets a query with a blank in its input.** A link that shares the requests of identical queries, or one that reads `op.input`, works as before.
- **The post's context says what went with it**: `op.context['~pipeline'].calls` has the path of each. [`loggerLink`](/docs/client/links/loggerLink) shows it when it logs the context.
- **The author's first load isn't logged, and a failure of it doesn't pass through your links.** The query still gets the error. A retry or a later refetch is an ordinary request, which they see.
- **`headers()` gets the queries of the request**, not what the server runs in it.
- **The server that gets the post runs the author's query too**, whatever your links would do with it. If a `splitLink` sends the two procedures to different servers, don't build one entry from the other's data.

### When it isn't one request {#fallback}

The load then fills in the input in the browser, and asks again. It gives the same handles and the same data.

- **The entry it reads needed no request**, because the cache had its data. The entries that read it start at once, together.
- **The entry it reads doesn't go through a batch link with `experimental_pipelining`**: `httpLink` or `wsLink`.
- **The proxy calls the router directly**, as in a server component. There is no request to save.
- **It doesn't fit in the request** of the entry it reads, within `maxURLLength` and `maxItems`.
- **Its input reads more than 64 values.** The server takes no more for one call.
- **The request failed as a whole**, such as on a network error. If a link sends it again, the entry asks by itself.
- **It reads an infinite entry's later pages.** The first page is one request's result, which the server can read: `experimental_dataOf(posts).pages[0]`.
- **The cache had another value** than the server read. The load keeps the cache's, which the handle's input is from, and fetches with it.

An entry that is sent this way always asks the server, also when the cache has its query: its key isn't known until the entry it reads has loaded.

### If the server doesn't allow it {#not-allowed}

A server without `experimental_allowPipelining` runs nothing of such a request. Every query in it fails with this error:

```
The server did not accept a pipelined batch. Set `experimental_allowPipelining: true` on its handler, or remove `experimental_pipelining` from the link
```

- **The server's own answer is the error's `cause`**: a "not found" for the batch's paths. If your error formatter leaves `data.path` out, the queries fail with that answer as it is.
- **A load that waits for one of them rejects**, with `ensureEntry` or `fetchEntry`.
- **A prefetch entry doesn't make the load reject**, and its error shows where the component reads the query.
- **Unless another entry reads its data with `experimental_dataOf(entry)`.** The load waits for it then, and rejects with its error, also with `loadHandlesSettled()`.

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
- **The load waits for the data it reads**, whatever the kind of either entry, because a handle needs its input. To not wait, [use the callback](#without-waiting).
- **If the value can be missing**, such as an optional `coverImageId`, the entry runs with a missing input. That fails its validation, unless the procedure takes a missing one. [Reshape the procedure](/docs/client/tanstack-react-query/handles#reshape-procedures) to take what is always there.

## A query for every item {#entry-per-item}

A list often needs a query for every row: the author of every post. Without help, that is one round trip for the list, and one more for the rows.

`experimental_entryPerItem(list, (item) => entry)` loads an entry for every item of a list in another entry's data. With [one request](#one-request), the server runs it for every item it finds.

```demo dependent-queries start=list
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
- **The list can be a list of lists**, as above: the items of every page of an infinite entry.
- **The entry is a query entry.** An infinite entry for every item isn't supported.
- **With [one request](#one-request), it is one call**, which the server runs once for every item it found. Every run validates its input, and has its own result or error.
- **`maxBatchSize` counts every run.** A request's calls and the items they run for can't be more than it together. If they are, the server refuses the call, and each item asks by itself.
- **One list at a time.** The server runs a call for the items of one list. The items of a list inside a list load in a second request. The pages of an infinite entry are the exception: their items load with the first page.

For a fetch or ensure entry, `data` has a list with every item's data.

### When the list is fetched again {#later-fetches}

The list's handle knows what its items load. So the options that `fromHandle(trpc, handles.posts)` gives load the items' queries with every fetch of the list: the next page, or a refetch after an invalidation.

```
POST /post.list,author.byId?batch=pipeline

{
  "0": { "cursor": 10, "direction": "forward" },
  "1": {},
  "pipe": { "1": [{ "to": ["id"], "from": 0, "path": ["items", null, "authorId"], "each": true }] }
}
```

- **The component doesn't change.** `fetchNextPage()` of the query above makes this request, and each new row finds its author in the cache.
- **It is shown as a POST**, which it is with [`methodOverride: 'POST'`](/docs/rpc#overriding-the-default-http-method). As a GET, the same is in the URL, as in [What goes over the wire](#wire).
- **Read the list through its handle.** A query from `trpc.post.list.infiniteQueryOptions()` fetches the list alone.
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
- **Build the entries from values that stay the same from render to render**: props, the URL. They are compared by value, as query keys are: the procedure, the input and the options. Options that are functions aren't compared. An input that is new on every render, such as `new Date()`, starts the queries on every render.
- **It is for a page without a loader.** Entries that a loader has started already get no second request, so the queries that depend on them have no request to go in.
- **It returns the handles at once.** It waits for no data: the component that reads a handle does, in its Suspense boundary.
- **With a link that [pipelines](#turn-on), it is one request**, as from a loader.
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
export declare function HydrateClient(props: {
  children: React.ReactNode;
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
import { trpc } from '~/trpc/server';
import { Author, HydrateClient, Post } from './components';

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
export declare function HydrateClient(props: {
  children: React.ReactNode;
}): React.ReactNode;
// @filename: trpc/query-client.ts
import type { QueryClient } from '@tanstack/react-query';
export declare function getQueryClient(): QueryClient;
// @filename: author-section.tsx
// ---cut---
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { experimental_inferHandles } from '@trpc/tanstack-react-query/unstable-handles';
import { getQueryClient } from '~/trpc/query-client';
import { trpc } from '~/trpc/server';
import { AuthorCard, HydrateClient } from './components';
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

#### How is this like GraphQL? How is it not? {#graphql}

- **Like it**: a component says what data it needs, next to the component. A page puts those together. It all loads in one request.
- **Unlike it**: there is no schema, no resolver, no query language and no build step. An entries function is TypeScript, and each query is a tRPC procedure with its own cache entry.

#### Is it safe to turn on? {#safe}

Such a request does what the browser could do in two. Each call validates its input and runs its middleware, and the server only reads data it sends back in the same response.

- **Set [`maxBatchSize`](/docs/client/links/httpBatchLink#limiting-batch-size).** A call for every item runs a procedure once for every item of a list the server returned. `maxBatchSize` counts every run of a request. Without it, there is no limit.
- **Set the link's `maxItems` to it, or lower.** The calls the server makes count too. A request with more than `maxBatchSize` fails as a whole, the query it belongs to included.
- **A call reads 64 values at most.** Each value is copied for every run of the call, so `maxBatchSize` bounds that work too.
- **A value in a promise or a stream can't be read.** Its type has no such path. Without types, the call gets nothing in its place: its input fails to validate, unless that part is optional or has a default.
- **In a response that doesn't stream**, a call whose data is a stream fails, and the calls that read it don't run.

#### Does it work with mutations and subscriptions? {#mutations}

No. Only queries can be sent this way, and such a batch of mutations is rejected.

#### Can a later page of an infinite list load its authors in the same request? {#later-pages}

Yes, if the component reads the list through its handle. See [When the list is fetched again](#later-fetches).

#### What does `createContext` see? {#create-context}

While `createContext` runs, `info.calls[i].getRawInput()` of a call that reads from another has the input as the client sent it, without the parts the server fills in. The procedure gets the filled-in input.
