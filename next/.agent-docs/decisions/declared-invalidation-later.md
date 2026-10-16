# Invalidation declared on mutations is later (human)

- Human, 2026-10-15 (issues review Q4, #5264, #3468, #6715): "B, but maybe this could be a link and/or plug in somehow? Idk. Seems like a later thing".
- Not in v1. Invalidation stays in app code (`queryClient.invalidateQueries(trpc.post.pathFilter())` in `onSuccess`).
- Open: the shape, if it comes. Candidates: a link that reads paths the server sends back (for example in a response header) and invalidates them, or a TanStack plugin that reads `.meta()`.
- (agent) Lean on the shape, if it comes: a `.meta({ invalidates: [...paths] })` read on the server, sent back as a `trpc-invalidate` response header, and an `invalidationLink({ queryClient })` in `@trpcdev/tanstack-query` that invalidates those path filters after the mutation settles. A link keeps servers framework-free and works for every TanStack adapter. Not built, per "Not in v1".
- Lives in: nothing yet.
