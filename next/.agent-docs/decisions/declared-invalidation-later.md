# Invalidation declared on mutations is later (human)

- Human, 2026-10-15 (issues review Q4, #5264, #3468, #6715): "B, but maybe this could be a link and/or plug in somehow? Idk. Seems like a later thing".
- Not in v1. Invalidation stays in app code (`queryClient.invalidateQueries(trpc.post.pathFilter())` in `onSuccess`).
- Open: the shape, if it comes. Candidates: a link that reads paths the server sends back (for example in a response header) and invalidates them, or a TanStack plugin that reads `.meta()`.
- (agent) Lean on the shape, if it comes: a `.meta({ invalidates: [...paths] })` read on the server, sent back as a `trpc-invalidate` response header, and an `invalidationLink({ queryClient })` in `@trpcdev/tanstack-query` that invalidates those path filters after the mutation settles. A link keeps servers framework-free and works for every TanStack adapter. Not built, per "Not in v1".
- Human, 2026-10-16 (decision round): "Spike some sort of plug in for this that you can use together with a special link or something (that requires you to pass in the query client to the link I'm guessing)". Still not v1; a spike of a server plugin plus an `invalidationLink({ queryClient })`.
- Lives in: nothing yet.
