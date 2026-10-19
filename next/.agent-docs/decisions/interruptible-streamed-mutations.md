# Streamed mutations stop when unobserved or on a signal; long jobs use a subscription (human)

- Human, 2026-10-15 (decisions round 3, Q1): "C".
  - `streamedMutationOptions({ abortWhenUnobserved: true })` aborts the server stream once the last `chunksOptions()` reader goes away, and `data` is the chunks so far.
  - A per-call `signal` stops it explicitly.
  - Docs show the pattern for long jobs: a mutation starts the job and returns its id, a `tracked()` subscription streams progress, and a `cancel` mutation stops it.
- Why: chat-style streams belong to the screen showing them; long jobs outlive a screen and need resuming and many watchers.
- (agent) The signal option is `signal: AbortSignal | (variables) => AbortSignal | undefined`, since TanStack's `mutate()` can't carry one; a function gives each call its own.
- Lost: a stop that follows TanStack's own `reset()`, which TanStack doesn't expose to `mutationFn`.
- (agent) Inside, the call's chunks are a `Stream` run in a scope whose `Effect.abortSignal` goes to the procedure, raced (`Effect.raceFirst`) against an `Effect.callback` that resumes on the per-call `signal` or when the last `chunksOptions()` observer leaves. Winning that race interrupts the stream, so `data` is the chunks so far. `Effect.runPromise` is the `mutationFn` edge ([`effect-internal-patterns.md`](./effect-internal-patterns.md)).
- Spike: [`../notes/interruptible-streamed-mutations.md`](../notes/interruptible-streamed-mutations.md).
- Lives in: `packages/tanstack-query/src/utils.ts`, `docs/integrations/tanstack-query.md` ("Streamed mutations", "Long jobs"); `packages/tanstack-query/src/index.test.ts`.
