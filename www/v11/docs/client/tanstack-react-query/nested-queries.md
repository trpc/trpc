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
      .query(() => ({
        items: [] as Post[],
        nextCursor: null as number | null,
      })),
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
- **The components make no request of their own.** Each query is already on its way when its component asks for it.
- **A finished handle is an ordinary handle.** It reads the cache entry `trpc.author.byId.queryOptions({ id: 'u1' })` would.

Then [turn on one request](#turn-on). Without it, the same code works, with one round trip per step.

## One request {#one-request}

The browser can't ask for the author before it has the post. It doesn't know the id.

It doesn't have to. It can send every call at once, and leave a blank where each id goes:

- "Get the post with this slug."
- "Get the author. Take the `id` from the post's `authorId`."
- "Get the team's posts. Take the `teamId` from the author."

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

- **You pass it in, so only an app that uses it has its code.** A link without the option is about 0.2 kB bigger than before, gzipped. The option adds about 1.3 kB.
- **Use `httpBatchStreamLink`.** It sends each result when it is ready. `httpBatchLink` works too, but its response waits for the slowest call, so the post arrives with the author.
- **The loader and the components don't change.**
- **It saves round trips where there are any**: in a load that goes over HTTP, such as a loader that runs in the browser. A proxy that [calls the router directly](#fallback), on the server, makes no request.
- **Turn it on the server first.** A server without the option [runs nothing](#not-allowed) of such a request.
- **`true` sets the default [limits](#limits).** They take ids, slugs and cursors. To read objects and lists, such as a list made with `.map()`, set `allowWholeValues`.

### What goes over the wire {#wire}

The post page above makes this request:

```http
GET /post.bySlug,author.byId,post.list?batch=pipeline&input=…&pipe=…
```

Its `input`, decoded, has an input for every call, by index:

```json
{ "0": { "slug": "hello" }, "1": {}, "2": { "direction": "forward" } }
```

Its `pipe`, decoded, has the blanks of every call that has any:

```json
{
  "1": { "reads": [{ "to": ["id"], "from": 0, "path": ["authorId"] }] },
  "2": { "reads": [{ "to": ["teamId"], "from": 1, "path": ["teamId"] }] }
}
```

Its response has a result for every call, by index, as any batch's:

```json
[
  { "result": { "data": { "slug": "hello", "authorId": "u1" } } },
  { "result": { "data": { "id": "u1", "name": "Alex", "teamId": "t1" } } },
  { "result": { "data": { "items": [], "nextCursor": null } } }
]
```

- **A read is a blank**, `{ to, from, path }`: call 1's `id` is `authorId` from call 0's data. With [`methodOverride: 'POST'`](/docs/rpc#overriding-the-default-http-method), `pipe` is in the body, beside the inputs.
- **What can be left out is a key, never a place in an array**, where JSON would make `undefined` a `null`: an input a query can have. The inputs are in an object by index for the same reason.
- **Every call still validates its input** and runs its middleware, as if the browser had sent it.
- **The server only reads what it sends back anyway**: the data of a call in the same request, as the client gets it.
- **A call runs once everything it reads is ready.** With `httpBatchStreamLink`, each result arrives as soon as it is ready, in any order.
- **Each result is an ordinary cache entry**, under the key of its filled-in input. The client works that input out from the first call's data, as the server did.
- **Only a request with a blank is sent this way**, as `batch=pipeline`. Every other request is sent as it always was, also with the options on.

A call can also run once for every item of a list. The [post list](#entry-per-item) loads the author of every post, and could load each author's team's posts too:

```http
GET /post.list,author.byId,post.list?batch=pipeline&input=…&pipe=…
```

Its `pipe`, decoded:

```json
{
  "1": { "each": { "from": 0, "path": ["items"] },
         "reads": [{ "to": ["id"], "path": ["authorId"] }] },
  "2": { "reads": [{ "to": ["teamId"], "from": 1, "path": ["teamId"] }] }
}
```

Its response has the runs of a call for every item in `items`, by the item's index:

```json
[
  { "result": { "data": { "items": [{ "authorId": "u1" }, { "authorId": "u9" }] } } },
  { "items": {
      "0": { "result": { "data": { "id": "u1", "name": "Alex", "teamId": "t1" } } },
      "1": { "error": { "message": "No author", "data": { "code": "NOT_FOUND" } } } } },
  { "items": {
      "0": { "result": { "data": { "items": [], "nextCursor": null } } },
      "1": { "error": { "message": "The call this call reads its input from failed", "data": { "code": "PRECONDITION_FAILED" } } } } }
]
```

- **`each: { from, path }`** runs a call once for every item of the list at `path` in call `from`'s data. A read without `from` reads the item.
- **A `null` in its path is a level of lists**: `["pages", null, "items"]` is every item of every page. `items` then has a level for each.
- **A call runs in a frame**: the items it runs for. A call that reads a call for every item runs in its frame, once for every item: call 2 runs for each author, and its run for item 1 reads run 1. What a call reads is in its frame, or in a frame its own is in, as call 0 is. A call for every item of `["pages", null, "items"]` can read a call for every item of `["pages"]` of the same call: its run for an item reads the run for that item's page. A call that reads calls for the items of two different lists is refused.
- **Each run has its own `{ result }` or `{ error }`**, and fails by itself. A run that reads a failed run doesn't run. A list that can't run, as the call it is in failed, is an `{ error }` in place of its items, with a `PRECONDITION_FAILED`. What isn't a list has no items: `{ "items": {} }`.
- **With `httpBatchStreamLink`, each level of `items` and each run is a value of its own**, so each run arrives as soon as it is ready.

### What your links see {#links}

Your links see the post's query, and nothing else. The author's query isn't an operation of its own: the server runs it in the post's request, and its result goes to the cache when the post has arrived.

- **No link gets a query with a blank in its input.** A link that shares the requests of identical queries, or one that reads `op.input`, works as before.
- **[`loggerLink`](/docs/client/links/loggerLink) names what went with the post**, on both of its lines: `>> query #1 post.bySlug (+ author.byId, post.list)`. It logs the post when its request goes, which is when those are known.
- **The post's context says what went with it too**: `op.context['~pipeline'].calls` has the path of each.
- **The author's first load has no log line of its own, and a failure of it doesn't pass through your links.** The query still gets the error. A retry or a later refetch is an ordinary request, which they see.
- **`headers()` gets the queries of the request**, not what the server runs in it.
- **The server that gets the post runs the author's query too**, whatever your links would do with it. If a `splitLink` sends the two procedures to different servers, don't build one entry from the other's data.

### When it isn't one request {#fallback}

The load then fills in the input in the browser, and asks again. It gives the same handles and the same data.

- **The entry it reads needed no request**, because the cache had its data. The entries that read it start at once, together.
- **The entry it reads doesn't go through a batch link with `experimental_pipelining`**: `httpLink` or `wsLink`.
- **The proxy calls the router directly**, as in a server component. There is no request to save.
- **It doesn't fit in the request** of the entry it reads, within `maxURLLength` and `maxItems`.
- **It would go over the link's [limits](#limits)**: it reads more than `maxReadsPerCall` values, 16 by default, or is more than `maxDepth` calls deep in its chain, 3 by default.
- **The request failed as a whole**, such as on a network error. If a link sends it again, the entry asks by itself.
- **It reads an infinite entry's later pages.** The first page is one request's result, which the server can read: `experimental_dataOf(posts).pages[0]`.
- **The cache had another value** than the server read. The load keeps the cache's, which the handle's input is from, and fetches with it.

An entry that is sent this way always asks the server, also when the cache has its query: its key isn't known until the entry it reads has loaded.

### Limits {#limits}

A call that reads another's data makes the server copy that data into its input. `true` turns pipelining on with limits that keep that small. An object sets them, and any you leave out keep their default:

```ts twoslash title='server.ts'
// @include: dq-router
// @filename: server.ts
// ---cut---
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from '~/server/router';

createHTTPServer({
  router: appRouter,
  maxBatchSize: 50,
  experimental_allowPipelining: {
    maxValueLength: 1024,
    maxReadsPerCall: 16,
    maxFillSize: 100_000,
    maxDepth: 4,
    allowWholeValues: true,
    maxRuns: 100,
  },
}).listen(3000);
```

The link doesn't ask the server for its limits. It keeps to the default `maxReadsPerCall` and `maxDepth`, so it doesn't send a call that a server with the defaults would refuse. If you change them on the server, raised or lowered, set the link's to the same or lower:

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
      experimental_pipelining: experimental_pipelining({
        maxReadsPerCall: 16,
        maxDepth: 4,
      }),
    }),
  ],
});
```

A call that would go over a limit is refused, with a `BAD_REQUEST` that names the limit and its value:

```
This call is 4 calls deep in a chain, more than `maxDepth` (3) allows
```

- **The rest of the request runs**, unless it has more calls than `maxRuns` allows: then it fails as a whole. Only that call fails, and the calls that read its data fail with a `PRECONDITION_FAILED`, as they do when it fails for any other reason.
- **The query of that call gets the error**, as it would get the procedure's own. A run of a call for every item fails by itself, and its item's query gets the error. A list whose runs would go over `maxRuns` runs for none of its items, and they each ask by themselves.
- **A call that goes over `maxReadsPerCall` or `maxDepth` is refused before it runs.** One that goes over the others is refused once the data it reads has arrived, before its procedure runs.
- **Data that is still to come can't be read.** With `httpBatchStreamLink`, a call whose data streams, or holds a promise, sends it in parts. A call that reads it gets an `UNSUPPORTED_MEDIA_TYPE`.

#### What a value is {#limit-terms}

A **value** is one place in an input that the server fills in from another call's data: `{ id: experimental_dataOf(post).authorId }` reads one. A call for every item reads its values again for every run.

A **run** is one time the server runs a procedure: once for a call, and once for every item for a call that runs in a [frame](#wire).

**Characters of JSON** are how long a value is as JSON, as JavaScript counts a string: `"abc"` is 5, with its quotes, `1024` is 4 and `null` is 4. Escapes count, so a line break in a string is 2. A character is up to 3 bytes in UTF-8, and an emoji counts as 2.

#### `maxDepth` {#limit-depth}

The longest chain of reads, 3 by default. A query that reads nothing is 1, and a call is 1 more than the deepest call it reads, the call its list is in too. `post.bySlug` → `author.byId` → `post.list` is 3: the post page above.

- **Why 3:** a page rarely needs more steps than that, and every step waits for the one before it.
- **Raise it** for a page that really chains more, and set the link's `maxDepth` to the same.
- **Lower it to 2** to allow one step: the author of a post, but not the author's team.

#### `maxReadsPerCall` {#limit-reads}

The most values one call reads, 16 by default.

- **Why 16:** an input usually reads one or two values, such as an id and a cursor.
- **Raise it** for an input that is built from many parts of other data, and set the link's `maxReadsPerCall` to the same.

#### `maxValueLength` {#limit-value-length}

The longest value a call reads, in characters of JSON: 1,024 by default. Every value is measured before it is written into an input, the value of each item too.

- **Why 1,024:** what a call reads is normally an id, a slug or a cursor, which are much shorter.
- **Raise it** to read longer text or, with `allowWholeValues`, objects and lists.

#### `allowWholeValues` {#limit-whole-values}

Whether a value can be an object or a list: `false` by default. Without it, a value has to be a string, a number, a boolean or `null`. A value that isn't there is left out of the input, as JSON leaves it out.

- **Why not by default:** a whole value is as big as the data it comes from, and it is copied into every input it goes in.
- **Set it** to read a list made with `.map()`, such as `ids: experimental_dataOf(post).tags.map((tag) => tag.id)`, or a whole result, such as `experimental_dataOf(post).author`. A value that a transformer makes, such as a `Date`, is an object too.
- **Not needed for a list that an entry for every item reads.** The server runs it for every item of the list, and reads only the values of each item, such as `post.authorId`.

#### `maxFillSize` {#limit-fill-size}

The most a request fills in, in characters of JSON: 100,000 by default. It counts every value written into an input. For a call that runs in a frame, for every item, it counts the whole input of every run instead, keys and all, as each run gets its own copy. A run that would go over it fails by itself.

- **Why 100,000:** the other limits keep a call small. This one keeps the whole request small, as it can have many calls, and a call can run for many items.
- **Raise it** with `maxValueLength` or `allowWholeValues`, if a request of yours fills in more.

#### `maxRuns` {#limit-runs}

The most times a request runs a procedure: 100 by default. Each call is a run, and a call that runs in a frame is a run for each item. A list whose runs would go over it runs for none of its items, and they each ask by themselves. In a list of lists, that is each inner list by itself.

- **Why 100:** a call for every item runs a procedure once per item of a list that the server reads, not one that the client sends. Without a cap, a short request for a long list could run a procedure many thousands of times.
- **Raise it** for pages that load an entry for every item of long lists.
- **`maxBatchSize` caps it too**, if it is lower.
- **A request with more calls than it allows** fails as a whole, with a `BAD_REQUEST`, as one over `maxBatchSize` does. Set the link's `maxItems` to it or lower, and to `maxBatchSize` or lower if that is set too.

#### How they add up {#limits-together}

At most, a call for every item fills in, for every run, as many values as `maxReadsPerCall` allows, each as long as `maxValueLength` allows, plus the rest of its input. That is runs × reads × value length, plus the input copied into every run. With a `maxBatchSize` of 50 and the defaults, it is 50 × 16 × 1,024 characters, over 800,000. `maxFillSize` keeps the request to 100,000, whatever the other limits are.

`maxRuns` caps how many times a request runs a procedure, and [`maxBatchSize`](/docs/client/links/httpBatchLink#limiting-batch-size) caps how many calls it has, and those runs too, if it is lower. The other limits cap how much each run carries.

#### Like a GraphQL query cost limit {#limits-graphql}

A GraphQL server often gives a query a cost, from its depth and from how many items its lists can have, and refuses a query over a budget. These limits are the same idea, split into separate caps: `maxDepth` is a depth limit, `maxRuns` caps the runs, and the others cap what each call carries. Each is a plain count, with no cost to give to every procedure. A call over one is refused by itself, not the whole request, unless the request has more calls than `maxRuns`.

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
// server takes it only with `allowWholeValues`
const tags = prefetchEntry(trpc.tag.byIds, {
  ids: experimental_dataOf(post).tags.map((tag) => tag.id),
});

// The input is checked against the data's type
prefetchEntry(trpc.author.byId, { id: experimental_dataOf(post).tags });
```

- **Pass it on as it is.** Use it as an input, or anywhere inside one. Don't compute with it or branch on it: `` `${experimental_dataOf(post).slug}-draft` `` throws, and `experimental_dataOf(post).authorId ? a : b` is always `a`.
- **`.map()` is the one array method that works.** Its callback runs once, on a stand-in for every item, and must return the item or a part of it. With [one request](#one-request), the list it makes is a whole value, which the server takes only with [`allowWholeValues`](#limit-whole-values).
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
- **A `null` in the list is an item like any other**, a `null` in a list of lists too. Its query gets `null`, or `undefined` for a part of it, in its input: a type error, unless the procedure takes that. What isn't a list has no items.
- **For nothing to fetch, return an entry with `skipToken`**: `() => prefetchEntry(trpc.author.byId, skipToken)`. Every item then has a disabled entry. `experimental_handleOfItem(handle, item)` gives a handle with `skipped: true`, whose query `useQuery` reads as idle: `'pending'`, unless the cache has data for its key. No call goes to the server, and it takes nothing from `maxBatchSize`.
- **The callback can't skip one item and not another.** It runs once, on a stand-in, so it can't read an item's data to decide. A procedure that takes `null` can answer for an item that has nothing.
- **The entry is a query entry.** An infinite entry for every item isn't supported.
- **With [one request](#one-request), it is one call**, which the server runs once for every item it found. Every run validates its input, and has its own result or error.
- **`maxBatchSize` counts every run.** A request's calls and the items they run for can't be more than it together. If they are, the server runs the call for none of the list's items, and each item asks by itself.
- **A request fills in 100,000 characters of JSON by default.** Each run gets its own copy of what it reads, and of the rest of its input. A run that would go over it fails by itself. See [Limits](#limits).
- **A list of lists loads in one request too.** The server runs the call for every item of every inner list, as `each` with a `null` in its path. Of an infinite entry, the request has the first page. If each page has one flat list, such as `pages.map((page) => page.items)`, the items of a later page load with that page, as [below](#later-fetches). If a page has a list of lists, they load when they are read.

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
- **It is shown as a POST**, which it is with [`methodOverride: 'POST'`](/docs/rpc#overriding-the-default-http-method). As a GET, the same is in the URL, as in [What goes over the wire](#wire).
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

- **Set [`maxBatchSize`](/docs/client/links/httpBatchLink#limiting-batch-size).** A call for every item runs a procedure once for every item of a list the server returned. `maxBatchSize` counts every run of a request. Without it, [`maxRuns`](#limit-runs) still caps the runs, at 100 by default.
- **Set the link's `maxItems` to it, or lower**, and to `maxRuns` or lower: 100 by default. A request with more calls than either fails as a whole, the query it belongs to included. A list whose runs would go over it runs for none of its items: the list loads, and its items each ask by themselves.
- **Keep the [limits](#limits) low.** By default a call reads 16 values of 1,024 characters of JSON at most, only strings, numbers, booleans and `null`, a chain of reads is 3 calls deep at most, and a request fills in 100,000 characters of JSON. Each value is copied into every input it goes in, so a call or a run that would go over one is refused, and fails by itself.
- **A value in a promise or a stream can't be read.** Its type has no such path. Without types, the call gets nothing in its place: its input fails to validate, unless that part is optional or has a default.
- **In a response that doesn't stream**, a call whose data is a stream fails, and the calls that read it don't run.

#### What if the link pipelines and the server doesn't? {#not-allowed}

The server runs nothing of the request, and every query in it fails with a `BAD_REQUEST`:

```
Pipelining is not enabled on the server. Set `experimental_allowPipelining: true` on its handler, or remove `experimental_pipelining` from the link
```

A server older than this option reads the request as one call to a procedure named after all its paths: "not found" with `httpBatchLink`, or that streaming requests must be batched with `httpBatchStreamLink`. Turn it on, or update the server.

#### Does it work with mutations and subscriptions? {#mutations}

No. Only queries can be sent this way, and such a batch of mutations is rejected.

#### Can a later page of an infinite list load its authors in the same request? {#later-pages}

Yes, if the component reads the list through its handle, and each page has one flat list. See [When the list is fetched again](#later-fetches).

#### What does `createContext` see? {#create-context}

While `createContext` runs, `info.calls[i].getRawInput()` of a call that reads from another has the input as the client sent it, without the parts the server fills in. The procedure gets the filled-in input.
