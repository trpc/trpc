# Invalidation declared on mutations is later (human)

- Alex, 2026-10-15 (issues review Q4, #5264, #3468, #6715): "B, but maybe this could be a link and/or plug in somehow? Idk. Seems like a later thing".
- Not in v1. Invalidation stays in app code (`queryClient.invalidateQueries(trpc.post.pathFilter())` in `onSuccess`).
- Open: the shape, if it comes. Candidates: a link that reads paths the server sends back (for example in a response header) and invalidates them, or a TanStack plugin that reads `.meta()`.
- Lives in: nothing yet.
