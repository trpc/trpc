# Real-time TanStack DB collections over tRPC subscriptions

2026-10-19. Question: does TanStack DB have a good way to stay up to date from a server, and how do tRPC subscriptions plug into it? Decision: [tanstack-db-live-collections](../decisions/tanstack-db-live-collections.md). Earlier, wider spike: [live-queries](./live-queries.md) (proposal 26).

Code: `next/spikes/tanstack-db-realtime/realtime.test.ts` (5 tests) and `next/packages/experimental-tanstack-db/src/index.test.ts` (8 tests), both over a real HTTP and WebSocket `TestServer`; run with `pnpm test` from `next/`, stable over 8 runs. `@tanstack/db` 0.15.0, `@tanstack/query-db-collection` 1.4.5.

## TanStack DB's primitives

- **Sync transactions.** A collection's `sync({ begin, write, commit, truncate, markReady, markError, metadata })` writes the server's rows; Electric, PowerSync, TrailBase and RxDB collections are all built on it. Its own guide (shipped as `skills/db-core/custom-adapter`) says to subscribe before the initial fetch and buffer.
- **Direct writes into query collections.** `utils.writeUpsert`, `writeDelete` and `writeBatch` write synced rows without a refetch.
- **Waiting for the server.** Handlers must not resolve until the server's change is synced: Electric's `awaitTxId`/`awaitMatch`, or a refetch for query collections.
- **Resume state.** `metadata.collection` persists a cursor with persistence on; in memory otherwise.
- With `rowUpdateMode: 'full'`, an `update` of a missing key inserts it and a `delete` of a missing key does nothing; an `insert` of an existing key with another value throws `DuplicateKeySyncError`.

## Approaches

- **A. Refetch on each change.** A query collection, and `utils.refetch()` per subscription event. Correct by construction; one list request per event (the test: 2 writes, 3 lists).
- **B. Changes into a query collection.** `writeUpsert`/`writeDelete` per event, no new API. `query-db-collection` keeps a direct write over any fetch that started before it, per key (`query.ts`: "A fetch that started before a direct write returns older server data"):
  - a write landing while the first fetch is in flight survives it;
  - a stale refetch keeps the newer change and still applies every other row it read (a row the feed missed arrives).
  - Left: a change between the list's read and the subscription's start shows only with the next refetch, and the subscription's lifecycle is the app's.
- **C. A collection synced by one subscription** (`liveCollectionOptions`, shipped). `snapshot` truncates and inserts, `upsert` and `delete` write; the order is the server's, in one stream.
  - A server that reads its snapshot before subscribing loses a change written in between (the test: `Stream.concat(snapshot, Posts.subscribe('changes'))` with a 30 ms read, post 2 missing). Listening first with `node:events` `on()` loses nothing. An async generator that calls `on()` in its body only listens at its first `next()`, after the snapshot: the test caught that too.
  - Without `awaitEventId`, an optimistic row blinks out: present `[true, false, true]` with a 50 ms feed. With it, never absent.
  - Over `wsLink`, a dropped socket resumes with `lastEventId`; a server with a change log sends only the missed changes (2 feeds, 1 snapshot), and a snapshot once the log is gone.

## Findings

- **The `Publisher` can't serve C's server half without a gap.** Its `subscribe()` stream subscribes on its first pull (`Stream.toPull` doesn't subscribe either: a publish between `toPull` and the first pull was lost), so a resolver can't subscribe, then read the snapshot. A snapshot also has no publisher position to resume from: ids are opaque, and there's no "latest id" read. A `subscribe(channel, { snapshot })` that runs the read after subscribing, with the position as the snapshot's id, would close it; it's proposal 26's Q26.1.
- **Row inference wants `subscribe` before `getKey`.** Both are context-sensitive, so TypeScript fixes the row type from whichever comes first; `getKey` first makes it `object`. `queryCollectionOptions` has the same order (`queryFn` before `getKey`).
- **Failure after ready.** A collection can move from `ready` to `error`, so a dead feed shows as an error instead of silently going stale. TanStack DB's guide keeps a query collection ready on a failed refetch; a feed has no refetch to recover with.

## Not built

- Batched changes (several rows atomically), and resuming across reloads with `metadata.collection`.
- On-demand collections (`loadSubset` predicates as subscription input).
- Pooling many live collections over one HTTP/1.1 connection (proposal 26, Q26.5).
