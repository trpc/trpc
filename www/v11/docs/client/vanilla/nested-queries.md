---
id: nested-queries
title: Nested queries in one request
sidebar_label: Nested queries in one request
slug: /client/vanilla/nested-queries
section: "Client Usage"
parent: "client/vanilla"
order: 47
---

`experimental_query()` and the functions beside it say what to load, and `experimental_load()` loads it: several queries where one reads another's data, such as a post, its author and more posts from the author's team, as one request. The server fills in each input from the data it has. It is experimental and may change in a minor release.

[See it in the kitchen sink](/kitchen-sink/nested): posts, their authors and the authors' teams in one request, or without pipelining to compare.

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

```twoslash include dq-post-queries
// @filename: post.ts
import {
  experimental_dataOf,
  experimental_query,
  type experimental_QueryProcedures,
} from '@trpc/client';
import type { AppRouter } from '~/server/router';

function postQueries(
  trpc: experimental_QueryProcedures<AppRouter>,
  opts: { slug: string },
) {
  const post = experimental_query(trpc.post.bySlug, { slug: opts.slug });
  const author = experimental_query(trpc.author.byId, {
    id: experimental_dataOf(post).authorId,
  });
  return {
    post,
    author,
    moreFromTeam: experimental_query(trpc.post.list, {
      teamId: experimental_dataOf(author).teamId,
    }),
  };
}
```

## Load nested queries {#without-tanstack-query}

You write down what to load, then load it in one go.

- An **entry** is one query to load. `experimental_query()` builds one.
- A **description** is an object of entries, such as what `postQueries()` below returns.

### 1. Describe what to load {#describe}

Write a plain function that returns the entries, in the file that loads them:

```ts twoslash title='post.ts'
// @include: dq-router
// @filename: post.ts
// ---cut---
import {
  experimental_dataOf,
  experimental_query,
  type experimental_QueryProcedures,
} from '@trpc/client';
import type { AppRouter } from '~/server/router';

function postQueries(
  trpc: experimental_QueryProcedures<AppRouter>,
  opts: { slug: string },
) {
  const post = experimental_query(trpc.post.bySlug, { slug: opts.slug });
  // The author's id is in the post, which hasn't loaded yet
  const author = experimental_query(trpc.author.byId, {
    id: experimental_dataOf(post).authorId,
  });
  return {
    post,
    author,
    // A query can read one that reads another
    moreFromTeam: experimental_query(trpc.post.list, {
      teamId: experimental_dataOf(author).teamId,
    }),
  };
}
```

- **`experimental_query(procedure, input)` builds an entry.** It is a plain value and starts nothing.
- **`experimental_dataOf(post)` stands for the post's data.** It has the data's type but holds no data. It records the part you read, such as `.authorId`, and the load fills it in.
- **Pass it on as it is**, as an input or anywhere inside one. Don't compute with it or branch on it: see [What a stand-in can't do](#pitfalls).
- **`trpc` is a client**, typed as `experimental_QueryProcedures<AppRouter>`.
- **Queries only.** A mutation is a type error. You can't read data that is a promise or a stream.

### 2. Load it {#load}

[Turn on one request](#turn-on). Then, further down the same file, pass the description to `experimental_load()` with a plain [`@trpc/client`](/docs/client/vanilla):

```ts twoslash title='post.ts'
// @include: dq-router
// @include: dq-post-queries
// ---cut---
import {
  createTRPCClient,
  experimental_load,
  experimental_pipelining,
  httpBatchStreamLink,
} from '@trpc/client';

// ...postQueries(), from step 1

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: 'http://localhost:3000',
      experimental_pipelining: experimental_pipelining(),
    }),
  ],
});

const res = experimental_load(client, postQueries(client, { slug: 'hello' }));

const post = await res.post;
const author = await res.author;
//    ^?
```

- **It returns at once**, with a promise for every key.
- **Each promise settles when its own query is done.** A query that fails rejects its own promise. The queries that read it can't run, and reject with its error. The other keys keep their data.
- **A query that ran keeps its own result.** A source can fail while its response is serialized, after the server ran what reads it.
- **A promise you don't read raises no unhandled rejection.**
- **A query that another reads loads too**, even when it isn't in what you pass.
- **Descriptions nest.** `experimental_load(client, { page: postQueries(client, opts), nav: navQueries(client) })` is one request, and `res.page.post` is a promise.
- **`experimental_dataOf(post, (data) => entry)`, with a callback, is an entry built from the data.** The callback runs once, on the stand-in, and returns a query's entry. The load loads it as that entry.
- **A query that can't go in the request asks by itself** once the data it reads is there. See [When it isn't one request](#fallback). The result has the same shape.

The load sends one request, shown in [What goes over the wire](#wire), and the results stream in one at a time:

```ts
// The post arrives: `res.post` resolves
{ slug: 'hello', title: 'Hello', authorId: 'u1', tags: [] }
// The author arrives: `res.author` resolves
{ id: 'u1', name: 'Alex', teamId: 't1' }
// The team's posts arrive: `res.moreFromTeam` resolves
{ items: [], nextCursor: null }
```

### A query for every item {#per-item}

A **query for every item** runs once for each item of a list in another query's data. Build it with `experimental_perItem()`:

```ts twoslash title='posts.ts'
// @include: dq-router
// @filename: posts.ts
import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from '~/server/router';
declare const client: ReturnType<typeof createTRPCClient<AppRouter>>;
// ---cut---
import {
  experimental_dataOf,
  experimental_load,
  experimental_perItem,
  experimental_query,
  experimental_settle,
} from '@trpc/client';

const posts = experimental_query(client.post.list, {});
const res = experimental_load(client, {
  posts,
  authors: experimental_perItem(experimental_dataOf(posts).items, (post) =>
    experimental_query(client.author.byId, { id: post.authorId }),
  ),
});

// Once the list is there: a promise for every item, in its order
const authors = await res.authors;
//    ^?

// Every promise, awaited
const settled = await experimental_settle(res);
//    ^?
```

- **The callback runs once, on a stand-in for an item**, and returns that item's entry. Read the item's values and put them in the input.
- **Each item's promise settles by itself**, even when another item's author is slow.
- **`experimental_settle()` awaits every promise**, and rejects if one does.

The callback can return more than one entry:

```ts twoslash title='rows.ts'
// @include: dq-router
// @filename: rows.ts
import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from '~/server/router';
declare const client: ReturnType<typeof createTRPCClient<AppRouter>>;
declare const isAdmin: boolean;
// ---cut---
import {
  experimental_dataOf,
  experimental_load,
  experimental_perItem,
  experimental_query,
} from '@trpc/client';

const posts = experimental_query(client.post.list, {});
const res = experimental_load(client, {
  posts,
  rows: experimental_perItem(experimental_dataOf(posts).items, (post) => {
    const author = experimental_query(client.author.byId, { id: post.authorId });
    return {
      author,
      // Reads the author: in the same request, once per post
      moreFromTeam: experimental_query(client.post.list, {
        teamId: experimental_dataOf(author).teamId,
      }),
      // A list in the item: a list per post
      tags: experimental_perItem(post.tags, (tag) =>
        experimental_query(client.tag.byIds, { ids: [tag.id] }),
      ),
    };
  }),
  draft: isAdmin ? experimental_query(client.post.bySlug, { slug: 'draft' }) : null,
});

const rows = await res.rows;
//    ^?
```

- **An object gives several queries per item.** They can read each other, and each runs once per item.
- **`experimental_perItem()` nests**, for a list in the item or in an item's query. Its key is then a list per item.
- **`null` skips an entry.** It loads to `null`, at the top or in an item's object.

To read other lists:

- **The items of every list in a list: use `.flatMap()`.** `experimental_dataOf(pages).pages.flatMap((page) => page.items)` is one flat list of every page's items.
- **A list in the data of a query for every item** is one flat list too, of every run's items, in order.
- **A part of every item, in one input: use `.map()`.** `{ ids: experimental_dataOf(posts).items.map((post) => post.authorId) }` is a whole list, so the server takes it only with [`allowWholeValues`](#limit-whole-values). Otherwise the query asks by itself.
- **The `.map()` callback returns the item or a part of it.** A `.map()` inside it, for a list of lists, throws.

### Infinite queries {#infinite}

`experimental_infiniteQuery()` builds an entry for a procedure whose input has a `cursor`. The load fetches the first page. The data has `pages` and `pageParams`, like TanStack Query's infinite queries:

```ts twoslash title='team-posts.ts'
// @include: dq-router
// @filename: team-posts.ts
import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from '~/server/router';
declare const client: ReturnType<typeof createTRPCClient<AppRouter>>;
// ---cut---
import {
  experimental_dataOf,
  experimental_infiniteQuery,
  experimental_load,
  experimental_perItem,
  experimental_query,
} from '@trpc/client';

const posts = experimental_infiniteQuery(
  client.post.list,
  { teamId: 't1' },
  { getNextPageParam: (page) => page.nextCursor },
);
const res = experimental_load(client, {
  posts,
  authors: experimental_perItem(
    experimental_dataOf(posts).pages.flatMap((page) => page.items),
    (post) => experimental_query(client.author.byId, { id: post.authorId }),
  ),
});

const data = await res.posts;
//    ^?
```

- **`pages` holds the first page.** `pageParams` holds its cursor: `initialCursor`, else the input's `cursor`, else `undefined`.
- **`initialCursor` replaces the input's `cursor`.**
- **`getNextPageParam` is for TanStack Query**, which fetches the next pages. `experimental_load()` doesn't.

## What a stand-in can't do {#pitfalls}

`experimental_dataOf()` gives you a stand-in, not the data. Your code runs once, when you build the entries, before the data exists. The server fills in what you read later. So you can read a part of a stand-in and pass it on, but you can't look at it.

| Code | What happens |
| --- | --- |
| `{ id: post.authorId }` | ✅ The load fills in the author's id |
| `posts.items.map((post) => post.id)` | ✅ The load fills in every item's id |
| `` `user-${post.authorId}` ``, `post.views + 1`, `post.views > 0` | Throws: a stand-in has no value to compute with |
| `.filter()`, `.find()`, `.sort()`, `[...post.tags]` | Throws: only `.map()` and `.flatMap()` work |
| `post.published ? a : b` | ❌ Always `a`, with no error: a stand-in is always truthy |
| `post.kind === 'video'`, `!post.authorId` | ❌ Always `false`, with no error |
| `post.authorId ?? 'anon'` | ❌ Never `'anon'`, with no error |
| `{ ...post }`, `Object.keys(post)`, `Array.isArray(post.tags)` | ❌ `{}`, `[]` or `false`, with no error |

The ❌ rows fail without an error, so look out for them. The rest of this section shows what to do instead.

#### Choose a query on the server {#pitfalls-branch}

You can't choose a query by the data. This always loads the stats, also for a draft:

```ts
// ❌ `post.published` is a stand-in, so it is always truthy
experimental_dataOf(post, (post) =>
  post.published
    ? experimental_query(trpc.post.stats, { slug: post.slug })
    : experimental_query(trpc.post.draftNotes, { slug: post.slug }),
);
```

Make the choice in a procedure instead:

```ts
// ✅ The procedure looks at the post and returns the stats or the notes
experimental_query(trpc.post.extras, {
  slug: experimental_dataOf(post).slug,
});
```

#### Items of different kinds {#pitfalls-mixed}

A `.map()` or `experimental_perItem()` callback runs once, on one stand-in for every item. A branch in it picks the same side for all of them:

```ts
// ❌ Reads every item's `imageId`, also a video's, which has none
experimental_dataOf(feed).items.map((item) =>
  item.kind === 'video' ? item.videoId : item.imageId,
);
```

The video's query then gets `undefined` and fails its input validation. Give every item the field you read, such as `mediaId`, in the procedure that returns the items.

#### Skip a query by the data {#pitfalls-skip}

`null` [skips an entry](#per-item), but only by what you know when you build the entries, such as `isAdmin`. An `experimental_dataOf()` callback can't return `null`: it throws. And a branch on a stand-in always picks the query.

Let the procedure take a `null` input and return `null` for it:

```ts
// ✅ `author.byIdOrNull` returns `null` for a post without an author
experimental_query(trpc.author.byIdOrNull, {
  id: experimental_dataOf(post).authorId,
});
```

This also covers a value that is `null` in the data. Without it, the query gets `null` and fails its input validation.

#### Code in a callback runs once {#pitfalls-once}

A callback runs once, when you build the entries: not once per item, and not when the data arrives. So `count++`, `Date.now()` or `console.log()` in it runs once, with no data.

## One request {#one-request}

The browser can't ask for the author before it has the post. It doesn't know the id.

It doesn't have to. It can send every call at once, with a **blank** where each id goes:

- "Get the post with this slug."
- "Get the author. Take the `id` from the post's `authorId`."
- "Get the team's posts. Take the `teamId` from the author."

The server does the rest:

1. It runs the first call.
2. It fills in the blank of the second call from the first call's result.
3. It runs the second call, and so on.
4. It sends each result back as soon as it is ready.

No result has to travel to the browser and back before the next call starts. The server does the same work; the page just stops paying for a round trip between steps. This is **pipelining**.

### Turn it on {#turn-on}

Turn it on in two places. First on the server, in the options of any HTTP adapter:

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

- **Turn it on in the server first.** A server without the option [runs nothing](#not-allowed) of such a request.
- **Only apps that use it bundle its code**, as you pass it in. A link without the option is about 0.2 kB bigger than before, gzipped. The option adds about 1.3 kB.
- **Use `httpBatchStreamLink`.** It sends each result when it is ready.
- **`httpBatchLink` works too**, but its response waits for the slowest call. The promises of one request resolve together; a query that asks by itself resolves later, with its own response. In development, the client warns once.
- **The code that calls `experimental_load()` doesn't change.**
- **It saves round trips only in a load over HTTP.** A link that [doesn't pipeline](#fallback) sends each query as before.
- **`true` sets the default [limits](#limits).** They allow ids, slugs, cursors and [a query for every item](#per-item). To write an object or a list into an input, such as `{ tags: it.tags }`, set [`allowWholeValues`](#limit-whole-values).

### What goes over the wire {#wire}

The post page above sends this request:

```http
GET /post.bySlug,author.byId,post.list?batch=pipeline&input=…&pipe=…
```

Its `input`, decoded, has an input for every call, keyed by index:

```json
{ "0": { "slug": "hello" }, "1": {}, "2": {} }
```

Its `pipe`, decoded, has the blanks of each call that has any:

```json
{
  "1": { "reads": [{ "to": ["id"], "from": 0, "path": ["authorId"] }] },
  "2": { "reads": [{ "to": ["teamId"], "from": 1, "path": ["teamId"] }] }
}
```

Its response, decoded, has a result for every call, by index, like any batch. `httpBatchStreamLink` streams each result as it settles, and `httpBatchLink` sends them as one JSON array:

```json
[
  { "result": { "data": { "slug": "hello", "authorId": "u1" } } },
  { "result": { "data": { "id": "u1", "name": "Alex", "teamId": "t1" } } },
  { "result": { "data": { "items": [], "nextCursor": null } } }
]
```

- **A read fills one blank**: `{ to, from, path }`. Here call 1's `id` is `authorId` from call 0's data.
- **With [`methodOverride: 'POST'`](/docs/rpc#overriding-the-default-http-method)**, `pipe` goes in the body, next to the inputs.
- **A blank is a missing key, never a place in an array.** JSON turns `undefined` in an array into `null`, which a query could take as input. For the same reason, the inputs are an object keyed by index.
- **Every call still validates its input** and runs its middleware, as if the browser had sent it.
- **The server only reads data it sends back anyway**: the data of a call in the same request, as the client gets it.
- **A call runs once everything it reads is ready.** With `httpBatchStreamLink`, each result arrives when it is ready, in any order.
- **Each result is what its query would get on its own**, with its filled-in input. The client works out that input from the data it reads, as the server did.
- **Only a request with a blank, or with a query for every item, goes as `batch=pipeline`.** Every other request goes as before, even with the options on.

#### A call for every item {#wire-each}

The [post list](#per-item) loads the author of every post. It could load each author's team's posts too:

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

Its response has the runs of each call for every item in `items`, keyed by the item's index:

```json
[
  { "result": { "data": { "items": [{ "authorId": "u1" }, { "authorId": "u9" }] } } },
  { "items": {
      "0": { "result": { "data": { "id": "u1", "name": "Alex", "teamId": "t1" } } },
      "1": { "error": { "message": "No author", "code": -32004, "data": { "code": "NOT_FOUND" } } } } },
  { "items": {
      "0": { "result": { "data": { "items": [], "nextCursor": null } } },
      "1": { "error": { "message": "The call this call reads its input from failed", "code": -32012, "data": { "code": "PRECONDITION_FAILED" } },
             "pipeline": "source-failed" } } }
]
```

- **`each: { from, path }` runs a call once for every item** of the list at `path` in call `from`'s data. A read without `from` reads the item.
- **A `null` in the path is a level of lists.** `["pages", null, "items"]` is every item of every page, and `items` then nests one level for each.
- **A call's frame is the items it runs for.** A call that reads a call for every item runs in its frame, once per item. Here call 2 runs for each author, and its run for item 1 reads run 1 of call 1.
- **A call reads calls in its own frame, or in a frame that holds its own**, as call 0's does.
- **Frames of one call nest.** A call for every item of `["pages", null, "items"]` can read a call for every item of `["pages"]` of the same call: each item's run reads the run for its page.
- **A call that reads calls whose frames don't nest is refused**, such as calls for the items of two different lists.
- **Each run has its own `{ result }` or `{ error }`**, and fails by itself. A run that reads a failed run doesn't run.
- **A list that can't run, because the call it is in failed, is an `{ error }`** in place of its items, with a `PRECONDITION_FAILED`.
- **A value that isn't a list has no items**: `{ "items": {} }`.
- **With `httpBatchStreamLink`, each level of `items` and each run is a value of its own**, so each run arrives when it is ready.

The server marks some errors with `"pipeline"`:

- **The mark sits next to `error`, never inside it.** The error has your [error formatter](/docs/server/error-formatting)'s shape, so nothing the formatter puts in `data`, or leaves out of its JSON, changes what the client does.
- **`"pipeline": "not-run"`**: the server refused the call for a [limit](#limits) before any of it ran. The client then asks for it by itself. The error of a run, or of a list inside a call, never has this mark.
- **`"pipeline": "source-failed"`**: the error the server sends in place of a call, run or list that reads a failed one, as for run 1 of call 2 above. The client goes by this mark, not by the `PRECONDITION_FAILED` code. A procedure's own error has no mark, whatever its code or `data`.

### What your links see {#links}

Each query is an operation of its own, and goes through your links. The batch link with `experimental_pipelining` puts the author's query in the post's request, and the server runs it there.

- **Blanks show in `op.input`.** The author's `op.input` is `{ id: undefined }` until the server fills it in. A link that reads `op.input`, such as one that shares the requests of identical queries, sees the blank.
- **Once the query ran, its input is known.** `loggerLink` logs its result with the filled-in input, `{ id: 'u1' }`. [A retry](#retries) of it is an operation like any other, with that input.
- **[`loggerLink`](/docs/client/links/loggerLink) logs every query** on a line of its own, as without pipelining.
- **The post's context lists what went with it**: `op.context['~pipeline'].calls` has the path of each.
- **A failure passes through your links**, so [a link that retries](#retries) retries the query that failed.
- **`headers()` gets the queries of the request**, not what the server runs in it.
- **Each query goes to the link your links pick for it**, by the operation as sent. If a `splitLink` sends the author's query to another link than the post's, it isn't put in the post's request. It goes by itself through its own link, with its input filled in, once the post's data is there.
- **A link that picks by a value the query reads sees the blank.** See [routing by a value](#route-by-value).

A link that doesn't pipeline never sends a blank:

- **The load aborts the operation through `op.signal`** as such a link takes it. It sends the query again with its input filled in, once the post's data is there.
- **A terminating link of your own should stop when `op.signal` aborts**, as the links of `@trpc/client` do.
- **To get the filled-in input sooner**, such as to log it, call `experimental_inputOf(op)`. It resolves once the queries it reads have their data.
- **For a query for every item, `experimental_inputOf(op)` resolves to `undefined`** once the data its runs read is there. The operation stands for one run per item, each with its own input. A run that asks by itself is an operation of its own, with its input.

```ts twoslash title='input-logger-link.ts'
// @include: dq-router
// @filename: input-logger-link.ts
// ---cut---
import { experimental_inputOf, type TRPCLink } from '@trpc/client';
import type { AppRouter } from '~/server/router';

export const inputLoggerLink: TRPCLink<AppRouter> =
  () =>
  ({ op, next }) => {
    experimental_inputOf(op).then(
      (input) => {
        // Aborted as a link that doesn't pipeline took it: the query goes
        // again, filled in, and this link logs that operation
        if (!op.signal?.aborted) {
          console.log(op.path, input);
        }
      },
      // A query it reads failed: it doesn't run
      () => {},
    );
    return next(op);
  };
```

#### Routing by a value of the input {#route-by-value}

Say a `splitLink` sends some authors to another backend, by their id. It can't pick a backend for `{ id: undefined }`. Send the blank to a link that doesn't pipeline. The load aborts it there and sends the query again with its id, which your condition then routes:

```ts twoslash title='client.ts'
// @include: dq-router
// @filename: client.ts
// ---cut---
import {
  createTRPCClient,
  experimental_pipelining,
  httpBatchStreamLink,
  httpLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from '~/server/router';

const idOf = (input: unknown) => (input as { id?: string } | undefined)?.id;

export const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      // A blank until the post's data is there
      condition: (op) =>
        op.path === 'author.byId' && idOf(op.input) === undefined,
      true: httpLink({ url: 'http://localhost:3000' }),
      false: splitLink({
        condition: (op) =>
          op.path === 'author.byId' &&
          idOf(op.input)?.startsWith('eu-') === true,
        true: httpLink({ url: 'http://eu.localhost:3000' }),
        false: httpBatchStreamLink({
          url: 'http://localhost:3000',
          experimental_pipelining: experimental_pipelining(),
        }),
      }),
    }),
  ],
});
```

- **The author then isn't in the post's request.** It waits for the post, as without pipelining. No link can know a route that depends on a value before the server has it.
- **A query for every item routes the same way.** Each run goes by itself, with its own input, to the link its value picks.

### Retries {#retries}

To retry a query that fails by itself, put [`retryLink`](/docs/client/links/retryLink) before the batch link:

```ts twoslash title='client.ts'
// @include: dq-router
// @filename: client.ts
// ---cut---
import {
  createTRPCClient,
  experimental_isPipelineFallback,
  experimental_pipelining,
  httpBatchStreamLink,
  retryLink,
} from '@trpc/client';
import type { AppRouter } from '~/server/router';

export const client = createTRPCClient<AppRouter>({
  links: [
    retryLink({
      retry: (opts) =>
        // An operation that was aborted, such as one the load sends again
        !opts.op.signal?.aborted &&
        // A query that never ran because one it reads failed
        !experimental_isPipelineFallback(opts.error) &&
        opts.error.data?.code === 'INTERNAL_SERVER_ERROR' &&
        opts.attempts < 3,
      retryDelayMs: (attempt) => attempt * 500,
    }),
    httpBatchStreamLink({
      url: 'http://localhost:3000',
      experimental_pipelining: experimental_pipelining(),
    }),
  ],
});
```

If the author's query fails, the next request has the author's query and the team's posts, which read it. The post isn't asked for again:

```http
POST /post.bySlug,author.byId,post.list   ← the author fails; the team's posts can't run
POST /author.byId,post.list               ← its retry, with what reads it
```

- **`retryLink` sees each query**, so `retry` decides for each one, with that query's error and attempts.
- **A retry has the input the first attempt ran with.** The server filled in the author's `id` in the first request. The retry sends `{ id: 'u1' }` as a query of its own, and the queries that read it go in its request.
- **A request that fails as a whole**, such as on a network error, is retried as one request when `retry` returns `true` for the post's error. Its next attempt holds the author's query and the team's posts again. The `retry` above returns `false` for a network error, which has no `data.code`.
- **Without a link that retries, a failure is final.** The query rejects, and so do the queries that read it, with its error. Nothing is sent again.

A query that couldn't run because one it reads failed:

- **Isn't retried itself.** It waits for that query, and goes in the request of its next attempt if that request has every query it reads.
- **If it reads several and a retry sends only some**, it waits for all of them. Once each has its data, it asks by itself with its input filled in; a query for every item asks for each run by itself. If one of them fails for good, it rejects with that query's error. Your links see a fallback error with that error as its `cause`.
- **Rejects once that query's retries give up**, with its error. `retry` is asked about it too, and `experimental_isPipelineFallback(opts.error)` is `true`. Return `false`, or each such query waits `retryDelayMs` for nothing before it rejects.
- **Without pipelining there are no such errors**, so a `retry` without this check works as it always has.

An operation the load aborted:

- **Reaches `retry` too.** When a link that doesn't pipeline takes a query that reads another, the load aborts that operation and sends the query again with its input filled in.
- **`opts.op.signal?.aborted` is `true` for it.** Return `false`, as for any aborted operation.

A query for every item that fails for one item:

- **Comes back as a query of its own for that item**, and the item's queries that read it go in its request. `retryLink` counts the failure in the first request as the first attempt.
- **Is only retried through a link that pipelines.** That link replays the server's error as the item's first attempt, for `retryLink` to count. If a `splitLink` sends the item's query to a link that doesn't pipeline, such as `httpLink`, that link never saw the error. The item rejects with it, `retry` isn't asked, and it doesn't run again.

[See it in the kitchen sink](/kitchen-sink/retries): queries fail on purpose, and a log shows each request and each attempt.

### When it isn't one request {#fallback}

Sometimes a query that reads another's data can't go in that query's request. It then waits for the data, fills in its input in the browser, and asks by itself. Its promise gets the same data. This happens when:

- **The query it reads doesn't go through a batch link with `experimental_pipelining`**, such as `httpLink` or `wsLink`.
- **It doesn't fit in that request**, within `maxURLLength` and `maxItems`.
- **It would go over the link's [limits](#limits)**: it reads more than `maxReadsPerCall` values (16 by default), is more than `maxDepth` calls deep in its chain (3), or would make the request more than `maxRuns` calls (100).
- **The server refused it before it ran**, for one of its [limits](#limits), such as a list whose runs would go over `maxRuns`.
- **It reads an item the list doesn't have**, such as one that went missing between the two reads.

A request that fails as a whole, such as on a network error, isn't one of these cases. The query it reads was in that request and failed too, so there is no data to fill in. Without a link that sends the request again, the query rejects with that error. With a link that [retries](#retries), it goes in the next attempt's request if that request has every query it reads, and otherwise waits for them.

With TanStack Query, some of these work differently: see [When the list is fetched again](/docs/client/tanstack-react-query/nested-queries#later-fetches).

## Limits {#limits}

A call that reads another's data makes the server copy that data into its input. `true` turns pipelining on with limits that keep this small. To set them, pass an object; any you leave out keep their default:

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

The link doesn't ask the server for its limits. It plans with the default `maxReadsPerCall`, `maxDepth` and `maxRuns`, so it never sends a call that a server with the defaults would refuse for its reads, its depth or the number of calls in the request. If you change them on the server, up or down, set the link's to the same or lower, and its `maxItems` to `maxBatchSize` or lower:

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
      maxItems: 50,
      experimental_pipelining: experimental_pipelining({
        maxReadsPerCall: 16,
        maxDepth: 4,
        maxRuns: 100,
      }),
    }),
  ],
});
```

The server refuses a call over a limit with a `BAD_REQUEST` that names the limit and its value:

```
This call is 4 calls deep in a chain, more than `maxDepth` (3) allows
```

- **Only that call fails.** The calls that read its data fail with a `PRECONDITION_FAILED`, as when it fails for any other reason. The rest of the request runs.
- **Except a request with more calls than `maxRuns` allows**, which fails as a whole.
- **A call refused before it runs asks by itself**, as in [the fallback](#fallback), and its query gets the data.
- **A list whose runs would go over `maxRuns` runs for none of its items.** The list loads, and its items' queries ask by themselves.
- **A refused run fails by itself.** Its item's query gets the error, as it would get the procedure's own. The call's other runs can still run.
- **The server checks `maxReadsPerCall` and `maxDepth` before the call runs**, and the others once the data it reads has arrived, before its procedure runs.
- **Matching limits on the link don't prevent the second kind**, as the link can't see that data before it sends the call: a value longer than `maxValueLength`, fills over `maxFillSize`, a whole value without `allowWholeValues`, or a list whose runs go over `maxRuns`.
- **Data still to come can't be read.** With `httpBatchStreamLink`, a call whose data streams, or holds a promise, sends it in parts. A call that reads it gets an `UNSUPPORTED_MEDIA_TYPE`.

#### What a value is {#limit-terms}

- A **value** is one place in an input that the server fills in from another call's data: `{ id: it.authorId }` reads one. A call for every item reads its values again for every run.
- A **run** is one time the server runs a procedure: once for a call, or once for every item for a call that runs in a [frame](#wire-each).
- **Characters of JSON** are a value's length as JSON, as JavaScript counts a string. `"abc"` is 5, with its quotes; `1024` is 4; `null` is 4. Escapes count, so a line break in a string is 2. A character is up to 3 bytes in UTF-8, and an emoji counts as 2.

#### `maxDepth` {#limit-depth}

The longest chain of reads: 3 by default. A query that reads nothing is 1. A call is 1 more than the deepest call it reads, counting the call its list is in. `post.bySlug` → `author.byId` → `post.list`, the post page above, is 3.

- **Why 3:** a page rarely needs more steps, and every step waits for the one before it.
- **Raise it** for a page that really chains more, and set the link's `maxDepth` to the same.
- **Lower it to 2** to allow one step: the author of a post, but not the author's team.

#### `maxReadsPerCall` {#limit-reads}

The most values one call reads: 16 by default.

- **Why 16:** an input usually reads one or two values, such as an id and a cursor.
- **Raise it** for an input built from many parts of other data, and set the link's `maxReadsPerCall` to the same.

#### `maxValueLength` {#limit-value-length}

The longest value a call reads, in characters of JSON: 1,024 by default. The server measures every value before it writes it into an input, including each item's.

- **Why 1,024:** a call normally reads an id, a slug or a cursor, which are much shorter.
- **Raise it** to read longer text, or, with `allowWholeValues`, objects and lists.

#### `allowWholeValues` {#limit-whole-values}

Whether a value can be an object or a list: `false` by default. Without it, a value must be a string, a number, a boolean or `null`. A value that isn't there is left out of the input, as JSON leaves it out.

- **Why off by default:** a whole value is as big as the data it comes from, and it is copied into every input it goes in.
- **Set it** to read an object or a list, such as the post's tags in `{ tags: it.tags }`. A list of ids built with `.map()` needs it too, such as `experimental_dataOf(posts).items.map((post) => post.authorId)`.
- **[A query for every item](#per-item) doesn't need it.** The server runs it for every item of the list, and reads only each item's values, such as `post.authorId`.

#### `maxFillSize` {#limit-fill-size}

The most a request fills in, in characters of JSON: 100,000 by default. It counts every value written into an input. For a call that runs for every item, it counts the whole input of every run instead, keys and all, as each run gets its own copy. A run that would go over it fails by itself.

- **Why 100,000:** the other limits keep a call small. This one keeps the whole request small, as it can have many calls, and a call can run for many items.
- **Raise it** with `maxValueLength` or `allowWholeValues`, if your requests fill in more.

#### `maxRuns` {#limit-runs}

The most times a request runs a procedure: 100 by default. Each call is one run; a call for every item is one run per item, counted when its list is ready.

- **A list whose runs would go over it runs for none of its items**, and their queries ask by themselves.
- **Of two lists that would go over it together**, the one that is ready first runs.
- **In a list of lists, each inner list counts by itself.** The queries of the items of an inner list that goes over get a `BAD_REQUEST`.
- **The lists at one level of a list of lists count together**, even when no call runs for their items, as each item of a level takes a place before anything runs. So a middle level wider than `maxRuns` is refused, even when its leaves would fit.
- **Why 100:** a call for every item runs once per item of a list the server reads, not one the client sends. Without a cap, a short request for a long list could run a procedure many thousands of times.
- **Raise it** for pages that load a query for every item of long lists.
- **`maxBatchSize` caps it too**, if it is lower.
- **A request with more calls than it allows fails as a whole**, with a `BAD_REQUEST`, as one over `maxBatchSize` does. The link adds no call that would go over its own `maxRuns`, 100 by default. Set it to the server's or lower, and the link's `maxItems` to `maxBatchSize` or lower if that is set.

#### How they add up {#limits-together}

At most, a call for every item fills in, for every run, `maxReadsPerCall` values of up to `maxValueLength` each, plus the rest of its input copied into the run. With a `maxBatchSize` of 50 and the defaults, that is 50 × 16 × 1,024 characters: over 800,000. `maxFillSize` keeps what the server fills in to 100,000, whatever the other limits are. It doesn't count the input the client sends with a call that runs once.

`maxRuns` caps how many times a request runs a procedure. [`maxBatchSize`](/docs/client/links/httpBatchLink#limiting-batch-size) caps how many calls it has, and those runs too, if it is lower. The other limits cap how much each run carries.

#### Like a GraphQL query cost limit {#limits-graphql}

A GraphQL server often gives a query a cost, from its depth and the size of its lists, and refuses a query over a budget. These limits are the same idea as separate caps: `maxDepth` limits depth, `maxRuns` caps the runs, and the others cap what each call carries. Each is a plain count, so you don't give every procedure a cost. A call over one is refused by itself, not the whole request, unless the request has more calls than `maxRuns`.

## Good to know {#good-to-know}

- **An input the transformer can't read fails the batch's calls**, as in any batch.
- **Don't change data another call returned.** A call that reads it may see a different value than the response sends.
- **Data and transformers must give the same JSON every time.** The server can write a value more than once, with `httpBatchLink` as with `httpBatchStreamLink`: to check it, to fill it in where a call reads it, and to send it. A `toJSON` or a getter that gives something else each time can send other data than a call read, or fail the response after a call read it.
- **A transformer must read back what it writes**, for a value on its own as for one inside an input, as superjson does. The server writes each value it fills in on its own, and refuses one it can tell doesn't come back. A transformer that writes a value differently on its own than inside an input can give a call another input than the client would send.

## FAQ {#faq}

#### How is this like GraphQL? How is it not? {#graphql}

- **Like it**: you say what a page needs, nested, and it all loads in one request.
- **Unlike it**: there is no schema, no resolver, no query language and no build step. A description is plain TypeScript, and each query is a tRPC procedure.

#### Is it safe to turn on? {#safe}

Such a request does what the browser could do in two. Each call validates its input and runs its middleware, and the server only reads data it sends back in the same response.

- **Set [`maxBatchSize`](/docs/client/links/httpBatchLink#limiting-batch-size).** A call for every item runs once per item of a list the server returned, and `maxBatchSize` counts every run of a request. Without it, [`maxRuns`](#limit-runs) still caps the runs, at 100 by default.
- **Set the link's `maxItems` to it or lower**, and the link's `maxRuns` to the server's if you change it. A request with more calls than either allows fails as a whole, including the query it belongs to.
- **Keep the [limits](#limits) low.** By default a call reads at most 16 values of up to 1,024 characters of JSON, each a string, number, boolean or `null`; a chain of reads is at most 3 calls deep; and a request fills in at most 100,000 characters. A call or run over a limit is refused, and fails by itself.
- **A value in a promise or a stream can't be read.** Its type has no such path. Without types, a call that reads it, or any other part of the data it is in, gets an `UNSUPPORTED_MEDIA_TYPE` before its procedure validates its input.
- **In a response that doesn't stream**, a call whose data is a stream fails, and the calls that read it don't run.

#### What if the link pipelines and the server doesn't? {#not-allowed}

The server runs nothing of the request, and every query in it fails with a `BAD_REQUEST`:

```
Pipelining is not enabled on the server. Set `experimental_allowPipelining: true` on its handler, or remove `experimental_pipelining` from the link
```

A server older than this option reads the request as one call to a procedure named after all its paths. You get "not found" with `httpBatchLink`, or an error that streaming requests must be batched with `httpBatchStreamLink`. Update the server and turn the option on, or remove `experimental_pipelining` from the link.

#### Does it work with mutations and subscriptions? {#mutations}

No. Only queries can go this way. The server rejects such a batch of mutations.

#### What does `createContext` see? {#create-context}

While `createContext` runs, `info.calls[i].getRawInput()` of a call that reads another gives the input as the client sent it, without the parts the server fills in. The procedure gets the filled-in input.
