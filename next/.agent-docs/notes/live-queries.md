# Live queries, sync engines and TanStack DB

2026-10-18. Question ([proposal 26](../proposals/26-live-queries-and-sync.md)): what would a local-first story on top of v12's subscriptions look like? Concretely: a live query (a snapshot, then keyed row changes, each with a version) built on `Publisher` and `tracked()`, a TanStack DB collection fed by it with optimistic writes that don't flicker, and many live queries pooled over one endpoint and one connection.

Code: `next/spikes/live-queries/`; run with `pnpm test` from `next/` (`live.test.ts`, 7 tests, stable over 10 runs). `@tanstack/db` 0.15.0, `effect` 4.0.2, Node 24.21.

```ts
class Todos extends Context.Service<Todos, LiveTable<Todo>>()('Todos') {}
const layer = Layer.effect(Todos)(makeLiveTable({ name: 'todos', getKey })).pipe(
  Layer.provide(LiveCommits.memory({ buffer: 100 })),
);

const router = {
  todo: {
    live: t.procedure.input(TodoFilter).subscription((opts) =>
      Stream.unwrap(
        Effect.map(Todos, (todos) => todos.feed({ lastEventId: opts.lastEventId, where: … })),
      ),
    ),
    add: t.procedure.input(NewTodo).mutation((opts) =>
      Effect.gen(function* () {
        const version = yield* (yield* Todos).mutate((draft) => draft.set(…));
        opts.response.headers.set('trpc-live-version', String(version));
      }),
    ),
  },
};

// client
const todos = createCollection(
  liveCollectionOptions({
    getKey: (todo) => todo.id, // Todo is inferred from the subscription
    feed: (opts) => client.todo.live.subscribe({}, opts),
    onInsert: async (opts) => {
      const call = versionOf(); // { onResponse } that keeps the header
      for (const m of opts.transaction.mutations) await client.todo.add.mutate(m.modified, call);
      await opts.collection.utils.awaitVersion(call.version);
    },
  }),
);
```

## What was built

- **`live.ts` (server).**
  - The protocol: `LiveMessage<Row>` is `{ kind: 'snapshot', rows }` or `{ kind: 'changes', changes }`. Changes are `insert`/`update` with the row, or `delete` with the key: TanStack DB's `write()` shape. Each message is a `tracked()` event whose id is the table version it brings the client to.
  - `makeLiveTable({ name, getKey, rows, history })`: rows, a version, and a log of the last `history` commits. `mutate(draft => …)` applies a commit atomically (a `Semaphore`), publishes `{ version, writes: [{ key, before, after }] }` on the `LiveCommits` publisher's `table:<name>` channel, and returns the version.
  - `feed({ lastEventId, where })`: the logged commits after `lastEventId` when the log still covers it, a snapshot otherwise, then each commit as it is published.
  - `liveFeeds({ todos, todo, … })`: one subscription for many live queries. Its input is `{ subs: { [id]: { feed, input } } }`; its event ids are the JSON cursor `{ [id]: version }`.
- **`collection.ts` (client).**
  - `liveCollectionOptions({ getKey, feed })`: a TanStack DB collection whose sync is a feed. A snapshot is `begin(); truncate(); write(…); commit()`, changes are writes, and the version reached is a `SubscriptionRef`. `utils.awaitVersion(v)` waits on it.
  - `versionOf()`: call options whose `onResponse` keeps the `trpc-live-version` header.
  - `createLivePool(open)`: collections that read through `pool.feed(name, input)` share one `liveFeeds` subscription. Adding or dropping a query reopens it on the next macrotask, with every remaining query's version as `lastEventId`.

## What works

- **The protocol needs no wire change.** The version is the `tracked()` id, so `httpLink` and `wsLink` resume a live query by themselves. In the WebSocket test, two collections share one socket. The server drops it while another client writes, and `wsLink` reconnects once. Both feeds resume with changes: 4 feeds started, 2 snapshots sent. The app wrote no resume code.
- **Types flow from the router.** The row type of `liveCollectionOptions` is inferred from the subscription's output, through `client.todo.live.subscribe`, and through the pooled feed map (`pool.feed('todos', { done: true })` gives a `Todo` collection).
- **The `Publisher` carries commits, and its resume closes the subscribe-then-snapshot race.** A feed reads its snapshot and the last commit's publisher id under the table's lock. It then subscribes with that id as `lastEventId`, so commits published while the first event is being sent are replayed from the publisher's buffer. Commits at or below the feed's cursor are skipped.
- **Dropped commits are read from the log.** Versions are contiguous per table, so a feed that sees version `n + 2` after `n` knows it missed one. In the test, a lossy publisher drops the second of three commits. The feed still emits versions 0, 1, 2 and 3, and records one gap.
- **Shapes.** With `where`, an update that moves a row into the shape is an `insert`, one that moves it out is a `delete`, and commits the shape can't see are an empty `changes` event. The empty event matters: without it, a client awaiting the version of a write it can't see would wait forever.
- **Resume or snapshot.** A `lastEventId` the log covers gets only the commits after it. One the log has passed, or a version the table never had, gets a snapshot.
- **The version handshake keeps optimistic rows on screen.** With the feed slowed by 20 ms, as on a slow network, a handler that awaits its version never shows the row missing between `insert()` and settle. Without the wait, the row blinks out: the mutation's response arrives first, the optimistic state is dropped, and the server's row only arrives later on the feed.
- **Pooling over SSE.** Plain collections over `httpLink` open one SSE request each. Through `createLivePool`:
  - two collections start on one request;
  - a third added later, then removed, reopens the stream twice (3 opens and 3 requests in total, one open at a time);
  - the server sends 3 snapshots, one per query, instead of 5, because the reopened streams resume the earlier queries from the cursor.

## Findings

- **The `Publisher` alone isn't a live-query backend.** Its ids are per publisher (shared across channels) and opaque, and a subscriber can't tell that events were lost. A live query needs its own contiguous version per table and a log to catch up from. The `Publisher` is fan-out between processes; the table, or the database behind it, stays the source of truth.
- **Publisher ids have no "from the start" value.** Without a `lastEventId`, `subscribe()` is live only. A feed opened before any commit passes `'0'`, which means "before the first event" for the memory layer and the Redis and Postgres recipes (they compare ids), but isn't part of the `Publisher` contract.
- **The version can't come back over `wsLink` as a header.** `onResponse` is only called by `httpLink` (`provides: 'response'`). Sockets have no provider yet ([declared-invalidation-later](../decisions/declared-invalidation-later.md), Open), so `versionOf()` reads nothing over `wsLink` and `awaitVersion(null)` resolves at once. Returning the version in the mutation's output works on every transport.
- **TanStack DB's commit receipt can't be awaited by a mutation handler.** In 0.15, `commit()` returns a receipt that settles when in-flight optimistic transactions settle. The handler awaiting a version is one of those transactions, so waiting for the receipt deadlocks. `awaitVersion` resolves when the commit is accepted.
- **Handlers wait; they don't return the version.** TanStack DB 0.15 marks mutation handlers' return values as deprecated ("will be removed in v1.0"), so the handler awaits `opts.collection.utils.awaitVersion(v)`, as Electric's `awaitTxId` does, instead of returning `{ version }`.
- **An in-memory fetch handler doesn't end a quiet SSE body on abort.** Over `createFetchHandler(…).fetch`, aborting a subscription's `signal` leaves the client's iterator waiting until the next event: the request's signal never reaches the response body. Over a real server (`TestServer` on Node), the same abort ends it at once. The spike's in-memory fetch pipes the body through `pipeTo(…, { signal })`, as a network would. Checked with a quiet subscription (`Stream.never` after one event) under both setups.
- **A pooled subscription costs a reconnect per set change, and its cursor grows.** The cursor travels as `Last-Event-ID` (one entry per query), and every change to the set reopens the stream. That's fine for navigation-scale churn, not for per-keystroke churn. One feed's failure ends the pooled stream for every query.
- **Generic pooling belongs below procedures.** `liveFeeds` pools feeds the router lists. Pooling any subscription by path from inside a procedure would go through `createRouterClient`, whose `localLink` runs its own `ManagedRuntime` from the `layer` it's given, so the handler's services (the table) wouldn't be shared unless the same layer instance is passed. This is from reading `server/caller.ts` and `client/links/local.ts`, not run. A transport-level version, like `wsLink`'s multiplexing, would sit in `httpLink` and the handler.
- **Each feed filters every commit.** The table runs `where` over each commit once per open feed: O(feeds × writes) per process. A shipped helper would index shapes, or push filtering to the database (Postgres logical replication, Electric shapes).

## Not built

- TanStack DB's on-demand mode (`loadSubset` predicates as feed input). The query-collection path is already decided ([tanstack-db-collections](../decisions/tanstack-db-collections.md)).
- Persisting the version (TanStack DB's `exportSyncMeta`), so a reload resumes with changes instead of a snapshot.
- Chunked snapshots for large shapes, authorization of shapes from `ctx`, and a Postgres-backed source.
