# Router core

- `RouterCore.update` gates shared route-tree caching with `process.env.NODE_ENV !== 'development'`. `loadRouteChunk` checks promise ownership outside production so obsolete lazy imports cannot overwrite HMR changes. Preserve both behaviors; validate hot updates while imports are pending.
- Route hooks, lifecycle callbacks, and abort listeners can navigate synchronously. Recheck the internal navigation owner after callbacks and awaits before publishing state/assets. Public loader abort signals belong to shared data generations; self-aborting a loader does not discard its result or error. Preserve loader ownership when transferring work between preload, navigation, cache, and background loads; see [`tests/preload-public-signal-lifetime.test.ts`](tests/preload-public-signal-lifetime.test.ts).
- Reusing loader work/data does not reuse `beforeLoad`: each active preload and subsequent navigation reruns it. Keep its returned context separate from reusable route-context contributions; see [`tests/public-preload-lane-contract.test.ts`](tests/public-preload-lane-contract.test.ts).
- Code emitted into HTML (`?script-string` entries and RawStream factories) executes without module scope. Keep it self-contained; pass dependencies explicitly. Validate emitted strings through the existing execution tests after refactors (`RawStream`, `scroll-restoration-script`, `tsr-script-teardown`).
- Before changing SSR streaming or hydration transport, read [`src/ssr/STREAMING.md`](src/ssr/STREAMING.md). Byte ordering, renderer safe points, and completion handling have framework-specific contracts.
- Backpressure tests are excluded from normal unit runs. For buffering/backpressure changes, run the gated suite below. Its memory case requires exposed GC; bypass Nx cache so a previous run with the gate disabled cannot count as validation.

```sh
RUN_BACKPRESSURE_PERF=1 CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-core:test:unit --outputStyle=stream --skipRemoteCache --skipNxCache -- tests/transformStreamBackpressure.perf.test.ts --pool=forks --execArgv=--expose-gc
```
