# The promise client keeps what changes while a request is in flight (agent)

- (agent) A `@trpc12/experimental-react` request's answer was read before anything that happened while it was on its way, so the store weighs it against what came after:
  - a `setData` or `hydrate` write made meanwhile keeps its data, and the answer is dropped. A first load in flight settles with the write;
  - an invalidation made meanwhile leaves the answer stale. `invalidate()` waits for the request in flight, then sends another for each entry a `useQuery` reads, and resolves when that one settles. An unread entry keeps the answer, stale until its next `.query()`.
- Why: before, the answer overwrote the entry and cleared `invalidated`. An optimistic `setData` made during a background refetch flipped back to the older data, and an invalidation after a mutation joined the request already in flight, so the mutation resolved with data read before it.
- Lost: aborting the request in flight on `invalidate()` and starting over, which would also drop the request a loader shares. Two requests can run back to back instead.
- Open: an answer a write made meanwhile is dropped whole. A link that merges the two (a live query's updates into a refetch) has no hook for it.
- Lives in: `packages/experimental-react/src/store.ts` (`load`, `refresh`, `setData`, `seed`), `packages/experimental-react/src/index.test.ts` ("a write made while a request is in flight…", "an invalidation while a request is in flight…"), `www/v12/docs/integrations/experimental-react.md`.
