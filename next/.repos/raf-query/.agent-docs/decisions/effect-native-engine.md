# Effect-native engine (agent, human asked)

Human: the core copied TanStack's _code style_ too closely; keep the features, write it with `.repos/effect` patterns.

- **One fiber per background task** (`request`, `gc`, `stale`, `errorShown`) in a `FiberMap` owned by the entry's `Scope`. Forking a task interrupts its previous fiber; removing the entry closes the scope, which interrupts them all. No `setTimeout`, `AbortController` or hand-rolled deferreds.
- **A request's result is a `Deferred`** that outlives restarts (`invalidate` restarts the fiber; awaiters keep waiting). It's completed with the request's full `Exit`, so typed failures stay typed and defects stay defects. Interrupts become `CancelledError` (a `Data.TaggedError`). A removed entry fails new requests with `CancelledError` instead of fetching.
- `queryFn` → `Effect.callback` (`request.ts`): the callback's signal aborts when the fiber is interrupted. Plain values still settle a microtask later, so `isFetching` / `fetchDirection` are observable. A synchronous throw is a defect (not retried); a hydrated promise's rejection is a defect too (`Effect.promise`), since the sender's error type doesn't survive the wire.
- `retry` / `retryDelay` compile to one `Schedule` (`retry.ts`); `Schedule.while` uses `step.attempt` (1 on the first failure).
- `mount` is an `RcRef` (made in the cache's scope) over one `Platform` subscription: acquired by the first mount, released when the last mount's scope closes. `RcRef.get` completes synchronously when `acquire` is sync, so `runSync` works in React's effect.
- **Streams subscribe synchronously** (`listen.ts`: `Stream.unwrap` + scoped `Queue`). `Stream.callback` runs its registration on a forked fiber a scheduler tick later, and `Stream.fromEventListener` attaches lazily too, so both miss events emitted right after the stream starts.
- `Query.State.promise` stays a real Promise (a `thenable.ts` thenable): it's React's `use()` protocol, not an API style.
