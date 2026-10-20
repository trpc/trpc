# Real-time TanStack DB: query collections take changes, and `liveCollectionOptions` syncs from a subscription (human asked)

- Human, 2026-10-19: "on the tanstack db... i feel like it's dumb to have something like that without having a real-time story, can you do some spikes on that and push some examples of real-time on that page... assuming that tanstack db has some good way of dealing with that".
- (agent) TanStack DB has the primitive: a collection's `sync` writes the server's rows in transactions (`begin`, `write`, `commit`, `truncate`, `markReady`), which every real-time adapter it ships (Electric, PowerSync, TrailBase, RxDB) is built on, and live queries over a collection update as those rows change.
- (agent) Two ways are documented ([spike](../notes/tanstack-db-realtime.md)):
  - Changes into a query collection, with no new API: a subscription's events go to `utils.writeUpsert` and `utils.writeDelete`. A direct write wins over a fetch that started before it, per key, so a stale refetch can't undo a change.
  - A collection synced by a subscription alone: `liveCollectionOptions({ subscribe, getKey })` in a new `@trpc12/experimental-tanstack-db` (Q26.4 A of [proposal 26](../proposals/26-live-queries-and-sync.md), its client half only).
- (agent) Its events are `snapshot` (replaces the rows), `upsert` (a whole row) and `delete` (by key), plain or `tracked()`. Writes are idempotent, so a server may resend a change the client has, and a resume may send a snapshot or the changes since `lastEventId`.
- (agent) `utils.awaitEventId(id)` resolves when the event with that `tracked()` id has been applied, or a newer snapshot; a mutation returns the id of the change it published. It rejects after 10 s, as Electric's `awaitTxId` does after 5 s. It resolves when the commit is accepted, because TanStack DB's commit receipt waits on the optimistic transaction that's awaiting it.
- (agent) A failed subscription puts the collection in its `error` status, even after it was ready, so a dead feed is visible.
- Why: the query-collection path is TanStack DB's own (direct writes) and needs nothing from us. The subscription-only path is where hand-written sync configs go wrong (truncate on snapshot, duplicate inserts throwing `DuplicateKeySyncError`, readiness, cleanup, the version wait), so it's a helper.
- Lost:
  - A server half. The `Publisher` can't serve a gapless snapshot then changes: its `subscribe()` stream subscribes on its first pull, after a snapshot read before it, and a snapshot has no publisher position to resume from. The docs' server listens with `node:events` `on()` before reading the snapshot.
  - Batched changes (several rows in one transaction), and resuming across reloads with TanStack DB's sync metadata.
  - Inferring the row type when `getKey` is written before `subscribe`: both are context-sensitive, so TypeScript fixes the row from the first one. The docs write `subscribe` first.
- Open: the server half (Q26.1: a `Publisher` subscription that can take a snapshot after it subscribes, or `@trpc12/trpc/live`); batched changes; on-demand collections (`loadSubset`).
- Lives in: `packages/experimental-tanstack-db/`, `www/docs/integrations/tanstack-query/tanstack-db.md` (Real-time), `spikes/tanstack-db-realtime/`, `tooling/pack/docs.test.ts`.
