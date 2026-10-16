# Bundle size

Reference for when bundle size matters more. Measure with `pnpm bundle-size` (see [decisions/bundle-size-measurement.md](./decisions/bundle-size-measurement.md)).

## Current: Effect-native core (#23 onward)

Core exposes only Effect APIs (`QueryCache`, `Query`, `QueryObserver`, `Platform` namespaces); `@raf-query/react`'s `QueryClient` builds the cache with `Layer.buildWithScope` and runs each verb with `Effect.runSync` / `runPromise`. `qc.effect` is the Effect-native cache itself. So every app bundles Effect's runtime plus `Layer`, `Context`, `Scope`, `Schedule` and the rest the engine reaches.

## Numbers (gzip, kB; `tooling/bundle-size` fixtures, Start example's bundler)

| App                             | TanStack Query | raf-query `main` (Effect-native) | Pre-#23 Effect engine | Pre-#23 Promise engine |
| ------------------------------- | -------------: | -------------------------------: | --------------------: | ---------------------: |
| Factory + prefetch + `useQuery` |           9.77 |                            29.26 |                 16.75 |                   5.64 |
| + paged                         |          10.44 |                            29.65 |                 17.15 |                   6.04 |
| + action that invalidates       |          10.60 |                            29.81 |                 17.32 |                   6.21 |
| TanStack Router app             |          12.36 |                            31.44 |                 18.50 |                   7.41 |
| Effect `queryFn` + `Schedule`   |              — |                            29.49 |                 16.93 |                  15.33 |

- **Effect's share of raf-query:** ~21.4 kB on `main`; ~11.2 kB with the pre-#23 Effect engine plus `/effect` subpath; ~0.2 kB with the Promise engine.
- **Full `examples/tanstack-start` client JS:** 185.3 kB on `main`. The TanStack-backed copy is 163.1 kB.
- **Floor:** Effect's fiber runtime alone (`runPromiseExit(succeed(1))`) is ~7 kB gzip. Effect v4 has no lighter `Micro` runtime.

## Why it's big, and what's shakable

Effect v4 shakes per export (`sideEffects` lists only a schema file), and app-side `import { X }` / `import * as X` with static access both shake with Rolldown. What defeats it:

- **Anything reachable from the always-imported path.** Class properties built in a constructor (`qc.effect`) and engine code that runs on every request can't be shaken, whatever they import.
- **`export * as X` in a library build.** Rolldown/tsdown compile it to an `__exportAll` getter object, which keeps every member in `dist/`. Core's `export * as QueryCache` / `Query` / `QueryObserver` / `Platform` are of this shape; apps importing the main entry may keep members they don't use. Check with `pnpm bundle-size --dist` after `pnpm build`.
- **Runtime branches on build-time facts.** `if (router.isServer) setupServer()` keeps the server half's imports; use an export condition instead ([decisions/router-browser-build.md](./decisions/router-browser-build.md)).
- Dynamic access (`X[key]`) and re-exported `export *` keep everything.

## The Promise-engine experiment

Branch **`cursor/promise-engine-reference-16c7`** has a working engine on Promises + `AbortSignal` (retry loop, abortable `sleep` / `whenOnline`, `RetryStrategy` bridging `Schedule`s), with Effect APIs behind a `@raf-query/core/effect` subpath. It's built on the **pre-#23** core (`client.ts`, `query.ts`), so it can't be cherry-picked onto the Effect-native core; treat it as a design reference.

The human rejected it (2026-10-12): the internals were worse than the Effect version.

Trade-offs:

- **Effect engine:** retry, cancellation and online-wait are Effect combinators, which read well and are easy to extend (timeouts, racing, tracing). One factory API: `queryOptions` takes Effects and Schedules. Every app pays the Effect runtime and whatever the engine reaches.
- **Promise engine:** about half of TanStack Query, and Effect costs only apps that import `/effect`. Hand-rolled retry and abort plumbing is more code to get right (abort races, `CancelledError` paths). Two ways to define an Effect query, and Schedule retries in `config.defaults` need an adapter.

Levers that keep the Effect engine:

- Move Effect-only, not-always-used APIs (`Stream`, `Queue`, `Layer` services) behind subpaths, as named exports.
- Avoid constructor-built Effect objects.
- Replace `export * as` namespaces in the main entry with named exports.

Each lever can only get down to the ~7 kB runtime floor plus what the engine itself uses.
