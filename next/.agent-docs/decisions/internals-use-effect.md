# Internal logic is written in Effect (human)

- Alex, 2026-10-15 (decisions round 3, Q2): "all logic we write should use Effect except some public facing apis".
- Internals (control flow, concurrency, streams, resources, retries, timeouts, errors) are Effect: `Effect`, `Stream`, `Queue`, `Deferred`, `Scope`, `Fiber`. Not hand-rolled promise chains, `setTimeout` loops or callback bookkeeping.
- Public APIs can stay Promise- and callback-shaped where users expect them (`client.x.query()`, `for await`, `createContext`, TanStack's `mutationFn`), converting at the edge.
- Why: one model for interruption, cleanup and typed failures, and the parts compose with users' Effect code and layers.
- Lost: zero-dependency, framework-free internals.
- Open: existing promise-based internals (for example the file-bytes wait in `serializer/stream.ts`, `httpLink`'s batching) move over as they're touched.
