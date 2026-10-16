# Internal logic is written in Effect (human)

- Alex, 2026-10-15 (decisions round 3, Q2): "all logic we write should use Effect except some public facing apis".
- Internals (control flow, concurrency, streams, resources, retries, timeouts, errors) are Effect: `Effect`, `Stream`, `Queue`, `Deferred`, `Scope`, `Fiber`. Not hand-rolled promise chains, `setTimeout` loops or callback bookkeeping.
- Public APIs can stay Promise- and callback-shaped where users expect them (`client.x.query()`, `for await`, `createContext`, TanStack's `mutationFn`), converting at the edge.
- Why: one model for interruption, cleanup and typed failures, and the parts compose with users' Effect code and layers.
- Lost: zero-dependency, framework-free internals.
- Open: existing promise-based internals (for example the file-bytes wait in `serializer/stream.ts`, `httpLink`'s batching) move over as they're touched.
- (agent) Moved in round 3: the file-bytes wait in `serializer/stream.ts` (a `Deferred` per byte stream and per target, waits as fibers instead of promise chains) and `httpLink`'s batching (`Queue`s instead of a hand-rolled async queue, each batch an `Effect` run as a fiber, scheduling with `Effect.sleep(0)`) and SSE reconnect loop (`Stream` plus `Effect.sleep` backoff, no `setTimeout`). The rest still moves as it's touched, e.g. `socketLink` and `DeferredDecoder`.
