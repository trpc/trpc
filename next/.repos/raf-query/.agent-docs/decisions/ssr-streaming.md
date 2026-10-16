# SSR streaming in core (agent, human asked)

Human: "everything until the very edge where we expose apis for react should be effect native".

- **`QueryCache.dehydrateStream(options): Effect<{ initial, updates }, never, Scope>`**, with `hydrateStream(stream)` as the receiving end. Running it snapshots and subscribes in one synchronous step, so no event falls between them; `updates` is a `Stream` over a `Queue` that ends when the scope closes, after flushing the pending batch. It's a record rather than one Stream because the router needs `initial` synchronously, in its dehydrated state.
- **Batches are handed over within the microtask**: changed entries collect for a microtask (as before), then `Queue.offerUnsafe` + `Queue.flushUnsafe`. Without `flushUnsafe` the queue releases takers on the fiber dispatcher's next tick (`setImmediate` / `setTimeout`), after React may already have streamed the boundaries those entries unblock. `Stream.toReadableStream` runs its fiber with `runFork` (synchronous start) and opens its latch synchronously on `pull`, so a resumed reader enqueues right away. A core test fails without `flushUnsafe`.
- **"Each entry once" is the `sent` option** (`Set<string>` of hashes) on `DehydrateOptions`. `dehydrateStream` uses one internally. React keeps one set per request client (`sent.ts`), so each `HydrationBoundary` skips what earlier ones sent. It's in a module without `"use client"` because the RSC boundary calls it.
- **Redacted errors are `RedactedError`** (`Data.TaggedError`, `hash`, message `Query <hash> failed`). After serialization the browser sees a plain `Error` with those fields.
- Edges kept as they were: the router's client logs a failed read with `Effect.logError`. `Hydrate`'s render-vs-commit split stays in React.
