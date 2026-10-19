# Live queries and TanStack DB live collections, proposed (agent)

- Human, 2026-10-18, quoting a tRPC collaborator: "One of my wishlist items for tRPC is to have a stronger story around Local First and Sync Engines… I wonder if there's anything we can do to pool live queries over a single endpoint and persistent connection. Tanstack DB would be a neat one to provide native support for", then "do some research and spiking and record some proposals".
- (agent, tentative) The recommended picks in [proposal 26](../proposals/26-live-queries-and-sync.md), until the human answers:
  - Q26.1: an experimental `@trpc12/trpc/live` with the protocol, `Live.feed()` over a source interface and a memory source; database sources are guides, as publisher backends are.
  - Q26.2: a contiguous integer version per source, so gaps are visible.
  - Q26.3: mutations return their version in their output, which works on every transport; a header becomes safe once `wsLink` provides `'response'`.
  - Q26.4: `liveCollectionOptions({ getKey, feed })` with `utils.awaitVersion` in a new `@trpc12/experimental-tanstack-db` (experimental by name, as everything hidden in the docs is, [`stability-jsdoc-tags.md`](./stability-jsdoc-tags.md)); `@trpc12/trpc/live`'s values would be `experimental_*`.
  - Q26.5: `wsLink` and HTTP/2 first, plus a pooled feed subscription with a JSON cursor for HTTP/1.1; subscription batching in `httpLink` only if non-live subscriptions hit the cap.
  - Q26.6: shapes are procedure inputs filtered with `ctx` on the server; TanStack DB's on-demand predicates later.
- Why: the spike ([live-queries](../notes/live-queries.md)) found:
  - the protocol rides on `tracked()` with no wire change, and `wsLink` resumes every live query after a drop with changes, not snapshots;
  - every rule of the contract is load-bearing: empty batches move cursors, gaps are read from the log, a feed subscribes after the last publisher id it read, and `awaitVersion` resolves when TanStack DB accepts the commit, not on its receipt;
  - without the version wait, an optimistic row blinks out on a slow feed.
- Lost: a `live` procedure type that is a query and a subscription at once; opaque database positions as versions; pooling without a reconnect per set change.
- Open: awaiting the human's answers to proposal 26. Nothing in `packages/` has changed.
- Lives in: `proposals/26-live-queries-and-sync.md`, `notes/live-queries.md`, `spikes/live-queries/`.
