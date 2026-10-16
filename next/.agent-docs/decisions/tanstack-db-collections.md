# TanStack DB uses `queryOptions()` as it is (agent)

- (agent) No `collectionOptions()` helper. A TanStack DB query collection takes `queryKey` and `queryFn`, which `trpc.x.queryOptions()` already returns, plus `select` for list responses that wrap their rows. The test pins that this typechecks and round-trips serializer types (`Date` rows).
- (agent) Mutations stay explicit in the collection's `onInsert`/`onUpdate`/`onDelete`: the app calls the procedure it wants. A helper that maps handlers to procedures would have to guess input shapes.
- Why: issue #6891 asks whether tRPC works with TanStack DB; it does with the existing API, so a docs example is enough, and one less API to keep in step with a pre-1.0 library.
- Lost: a one-call `trpc.post.list.collectionOptions({ getKey })`. Easy to add later if apps repeat the same wiring.
- Lives in: `test/tanstack-query/db.test.ts`, `test/tanstack-query/package.json` (`@tanstack/db`, `@tanstack/query-db-collection`), `docs/tanstack-query.md` (TanStack DB).
