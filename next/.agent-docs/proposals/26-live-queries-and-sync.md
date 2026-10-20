# 26 — Live queries, sync engines and TanStack DB

| Status     | Area                           | Depends on     | oRPC parity rows |
| ---------- | ------------------------------ | -------------- | ---------------- |
| `proposed` | server, client, TanStack, sync | 14, 17, 19, 10 | —                |

## Summary

A tRPC collaborator asked for "a stronger story around Local First and Sync Engines": today it's "have a subscription for updates but sort linking up procedures and state yourself". They asked whether live queries could be pooled "over a single endpoint and persistent connection", with TanStack DB as a native target.

v12 already has the transport half: `tracked()` ids resume subscriptions on SSE and WebSockets, `wsLink` multiplexes every subscription over one socket, and `Publisher` fans events out between processes. What's missing is a contract on top: a live query that sends a snapshot and then keyed row changes, each with a version; a way for a mutation to say which version holds its write; and a TanStack DB collection that speaks both.

**Recommendation:**

- An experimental `@trpc12/trpc/live` with the protocol, `Live.feed()` over a small source interface, and a memory source. Database sources are guides, as publisher backends are.
- `@trpc12/experimental-tanstack-db` with `liveCollectionOptions` and `awaitVersion`.
- Mutations return their version in their output.
- Pooling: `wsLink` and HTTP/2 first, with a pooled feed subscription for HTTP/1.1.

The [live-queries](../notes/live-queries.md) spike backs this: 7 tests over SSE and WebSockets, with TanStack DB 0.15.

## Today

- **v11** has `tracked()` with `lastEventId` merged into the input, `wsLink` (one socket, many subscriptions) and `httpSubscriptionLink` (one `EventSource` per subscription). Snapshot-then-changes semantics, server fan-out and the mutation-to-stream handshake are all userland. There is no TanStack DB integration (#6891).
- **v12 has:**
  - `tracked()` with `lastEventId` in the resolver options; `wsLink` resends subscriptions with it after a reconnect ([subscriptions](../decisions/subscriptions.md)).
  - SSE over fetch: one request per subscription, so HTTP/1.1's 6 connections per origin apply ([fetch-sse](../decisions/fetch-sse.md)).
  - The `Publisher` service, with resume from a buffer, and Redis, Postgres and Durable Object backends as guides ([publisher-backends](../decisions/publisher-backends.md)). One channel per audience ([publisher-tags](../decisions/publisher-tags.md)).
  - TanStack DB query collections from `queryOptions()` as they are ([tanstack-db-collections](../decisions/tanstack-db-collections.md)): refetch-based, no streaming.
  - TanStack Query `liveOptions`/`streamedOptions`, shared per key by `SubscriptionCache` ([tanstack-query-subscriptions](../decisions/tanstack-query-subscriptions.md)): the latest event or all events, not rows.
  - The `onResponse` call option, so a link before `httpLink` can read response headers ([declared-invalidation-later](../decisions/declared-invalidation-later.md)).
- **oRPC** has `experimental_liveOptions` (the latest event into TanStack Query's cache, [`packages/tanstack-query/src/live-query.ts`](https://github.com/middleapi/orpc/blob/v2.0.0-beta.44/packages/tanstack-query/src/live-query.ts)), and no row protocol or TanStack DB adapter.
- **Sync engines** (Electric, Zero, PowerSync, Replicache) each define this contract themselves: shapes or queries, a snapshot, ordered changes, a cursor to resume from, and a way to wait for a write (Electric's `awaitTxId`).

## Goals

- A live query is an ordinary subscription: same procedure, middleware, `ctx`, errors and transports, with no wire change.
- Resume after a drop or a reconnect sends only what changed, on SSE and WebSockets, with no app code.
- Optimistic writes in TanStack DB don't flicker: the optimistic row stays until the server's arrives.
- Row types flow from the router into collections.
- Many live queries can share one connection, including over HTTP/1.1.
- Effect stays the only dependency of `@trpc12/trpc`; databases are the app's.

## Non-goals

- A sync engine: conflict resolution, offline queues and client storage are TanStack DB's, or Electric's and others'.
- Declared invalidation for TanStack Query users. It's later ([declared-invalidation-later](../decisions/declared-invalidation-later.md)); a pooled feed could carry it then.
- TanStack DB query collections. They're decided ([tanstack-db-collections](../decisions/tanstack-db-collections.md)).

## Options

### Q26.1: where the live protocol and its server half live

```ts
import { Live } from '@trpc12/trpc/live';

const router = {
  todo: {
    live: t.procedure.input(TodoFilter).subscription((opts) =>
      Live.feed(Todos, {
        lastEventId: opts.lastEventId,
        where: shapeFor(opts.ctx, opts.input),
      }),
    ),
  },
};
// a source: snapshot at a version, commits since a version, and commits as they happen
createFetchHandler({ router, layer: Todos.memory({ getKey }) });
```

- **A: experimental `@trpc12/trpc/live`** with `LiveMessage`, `Live.feed()` over a source interface, and a memory source; Postgres, Electric and Durable Object sources as guides, as for publisher backends.
  - ✅ The ordering rules live in one place. A feed reads its snapshot and the last publisher id together, subscribes after that id, skips what it has seen, reads a gap from the log, and sends empty batches so cursors move. The spike needed every one of them, and they're where hand-written versions go wrong.
  - ✅ Built on `Publisher` and `tracked()`; no new transport.
  - ❌ A new entry point to keep stable, and a source interface that has to fit Postgres logical replication, Electric and in-memory stores alike.
- **B: a docs recipe** (the spike's `live.ts`, about 300 lines) and the client adapter only.
  - ✅ Nothing to maintain in `@trpc12/trpc`.
  - ❌ Every app copies the ordering rules; client adapters can't rely on servers sending empty batches or snapshots on unknown versions.
- **C: a procedure type**, `t.procedure.live({ getKey, source })`, that is a query (the snapshot, for SSR and loaders) and a subscription (the changes) at once.
  - ✅ One definition gives `queryOptions()`, the collection, and inferred keys.
  - ❌ A fourth procedure type through the protocol, contracts, OpenAPI and every adapter. Better after A has had real use.

### Q26.2: versions

- **A: a contiguous integer per source** (the spike). A gap is visible (`n + 2` after `n`), so dropped commits are read from the log.
- **B: opaque strings with a comparator** (Postgres LSNs, ULIDs, Redis stream ids).
  - ✅ Use the database's own position.
  - ❌ Gaps aren't detectable, so a lost commit is silent until the next snapshot.
- **C: one version space across sources**, so a mutation touching two tables is awaited once.

### Q26.3: how a mutation reports its version

```ts
// A: in the output
add: t.procedure.input(NewTodo).mutation(…) // returns { id, version }
onInsert: async (opts) => {
  const result = await client.todo.add.mutate(input);
  await opts.collection.utils.awaitVersion(result.version);
};

// B: a header, read with onResponse (the spike)
const call = versionOf();
await client.todo.add.mutate(input, call);
await opts.collection.utils.awaitVersion(call.version);
```

- **A: in the output.**
  - ✅ Typed, and works on every transport.
  - ❌ Every live-backed mutation returns `{ version }` beside its data.
- **B: a `trpc-live-version` response header**, read through `onResponse` (the spike).
  - ✅ Outputs stay clean; a middleware can set it.
  - ❌ `httpLink` only: sockets have no `onResponse` provider, and over `wsLink` the version is lost silently, which brings back the flicker.
- **C: B, with `wsLink` providing `'response'`** through a per-frame meta field: the open item in [declared-invalidation-later](../decisions/declared-invalidation-later.md).

### Q26.4: the TanStack DB adapter

```ts
const todos = createCollection(
  liveCollectionOptions({
    getKey: (todo) => todo.id,
    feed: (opts) => client.todo.live.subscribe({ done: false }, opts),
    onInsert: async (opts) => { … await opts.collection.utils.awaitVersion(version); },
  }),
);
```

- **A: `liveCollectionOptions({ getKey, feed })` in a new `@trpc12/experimental-tanstack-db`** (the spike).
  - The feed is any `subscribe` call, so it works with `httpLink`, `wsLink` and a pool.
  - `utils.awaitVersion(v)` resolves when the collection accepts the commit. TanStack DB 0.15's commit receipt waits for the optimistic transaction that's awaiting it, so waiting for the receipt would deadlock.
  - ✅ A separate package for a pre-1.0 dependency ([integration-packages](../decisions/integration-packages.md)).
  - ❌ One more package to version against TanStack DB.
- **B: A, inside `@trpc12/tanstack-query`**, beside the query-collection test it already has.
  - ✅ No new package.
  - ❌ `@tanstack/db` becomes a peer of every TanStack Query user's package.
- **C: a decoration on the options proxy**: `trpc.todo.live.collectionOptions({ input, getKey })`.
  - ✅ No `feed` closure.
  - ❌ Binds the adapter to the options proxy and its client; decided against for query collections.

### Q26.5: pooling live queries over one connection

- **A: nothing new.** `wsLink` already carries every live query on one socket, and resumes them all after a reconnect (the spike: 2 collections, 1 socket, 2 snapshots across a drop). HTTP/2 multiplexes SSE requests over one connection. The docs say so.
- **B: A, plus a pooled feed subscription for HTTP/1.1** (the spike's `liveFeeds` and `createLivePool`). One subscription carries `{ subs: { [id]: { feed, input } } }`. Its ids are a JSON cursor `{ [id]: version }`, so a reconnect, or a reopen with a changed set, resumes every query from its own version.
  - ✅ One SSE request however many collections are open; no server state between requests (the spike: 3 snapshots for 3 queries across 3 opens, instead of 5).
  - ❌ A set change reopens the stream; the cursor grows with the set; one feed's failure ends them all (it needs per-query error events).
- **C: subscription batching in `httpLink` and the handler.** Subscriptions started in the same tick share one SSE response, with per-call event ids and a composite `Last-Event-ID`, for any subscription and not only live ones. Like B, a set change reopens.
- **D: one long-lived stream per client**, with subscribe and unsubscribe as POSTs carrying a connection id.
  - ✅ Truly incremental.
  - ❌ Per-connection server state and sticky routing, which fight serverless and multi-instance deployments; WebSockets already are this.

### Q26.6: shapes and on-demand sync

- **A: shapes are procedure inputs**, turned into `where` on the server with `ctx`. A client only picks among shapes the server allows, as an audience is a channel taken from `ctx` ([publisher-tags](../decisions/publisher-tags.md)). TanStack DB's on-demand mode (`loadSubset` predicates) is later.
- **B: map simple TanStack DB predicates** (`eq` on allow-listed fields) to the feed's input, so on-demand collections load subsets.
  - ✅ Larger tables without loading everything.
  - ❌ The predicate trees are TanStack DB's and still changing; over-fetching is safe (TanStack DB filters again) but under-fetching loses rows silently.

## Recommendation

- **Q26.1:** A, with sources as guides.
- **Q26.2:** A.
- **Q26.3:** A, with C as the follow-up that makes B safe.
- **Q26.4:** A.
- **Q26.5:** B, with C considered once non-live subscriptions hit the connection cap.
- **Q26.6:** A.

Reasons:

- The spike found that every piece of the contract is load-bearing: empty batches, gap reads, the publisher-id handshake, accept-not-receipt. A recipe would have every app rediscover them.
- Returning the version is the only handshake that works on every transport today.
- Pooling over WebSockets is free, and the cursor makes a pooled SSE reopen cheap.

Given up: a procedure type that gives SSR and the collection from one definition (C of Q26.1, later), opaque database positions (Q26.2 B), and incremental pooling without reconnects (Q26.5 D).

> ⚠️ **Parity:** none. oRPC has no row-level live queries or TanStack DB adapter, so all of this is ahead of it.

## Questions

- **Q26.1** Where the live protocol and its server half live: A `@trpc12/trpc/live` (experimental) · B a recipe · C a `live` procedure type
- **Q26.2** Versions: A contiguous integers per source · B opaque strings · C one version space
- **Q26.3** A mutation's version: A in the output · B a response header · C B plus a `wsLink` provider
- **Q26.4** TanStack DB adapter: A `@trpc12/experimental-tanstack-db` · B in `@trpc12/tanstack-query` · C on the options proxy
- **Q26.5** Pooling: A `wsLink`/HTTP/2 only · B plus a pooled feed subscription · C subscription batching in `httpLink` · D a per-client stream
- **Q26.6** Shapes: A procedure inputs, on-demand later · B TanStack DB predicates as input

## Decision

> Human: tick an answer per question (or write your own), add notes, and set **Status** to `accepted`.
> The agent then records it in `../decisions/` and links back here.

- **Q26.1:** [ ] A · [ ] B · [ ] C
- **Q26.2:** [ ] A · [ ] B · [ ] C
- **Q26.3:** [ ] A · [ ] B · [ ] C
- **Q26.4:** [ ] A · [ ] B · [ ] C
- **Q26.5:** [ ] A · [ ] B · [ ] C · [ ] D
- **Q26.6:** [ ] A · [ ] B
- **Notes:**
