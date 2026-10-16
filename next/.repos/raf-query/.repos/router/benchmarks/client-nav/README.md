# Client Navigation Benchmarks

Cross-framework client-side CPU benchmarks for:

- `@tanstack/react-router`
- `@tanstack/solid-router`
- `@tanstack/vue-router`

The benchmarks run in jsdom against production builds of real apps, and are
tracked in CI by CodSpeed (simulation mode).

> **Scope:** these benchmarks cover the client router. The hydration
> scenarios also cover DOM hydration and the Router state-restoration path
> used by Start. Start-specific entry-point initialization, streamed payload
> arrival and client server-function calls are not included. Server request work
> is covered by `benchmarks/ssr`.

## Layout

- `react/`, `solid/`, `vue/` - baseline benchmark (mixed navigation loop) + Vitest config
- `vitest.react.config.ts`, `vitest.solid.config.ts`, `vitest.vue.config.ts` - per-framework aggregate configs that run the baseline first, then scenario projects
- `scenarios/harness.ts` - shared scenario runner (mount, link-click steps, `onRendered` synchronization)
- `scenarios/<scenario>/shared.ts` - framework-agnostic scenario definition (workload data, step sequence, assertions, bench options)
- `scenarios/<scenario>/<framework>/` - isolated scenario apps

Scenario app layout:

```text
scenarios/<scenario>/<framework>/
  vite.config.ts
  speed.bench.ts
  speed.flame.ts
  setup.ts
  project.json
  tsconfig.json
  src/
    main.tsx
    routeTree.gen.ts
    routes/
```

Navigation scenario apps use file-based routing (`@tanstack/router-plugin`) with a
generated `routeTree.gen.ts`, like a regular user app. Each scenario uses one
app per framework instead of sharing routes in the baseline app. This keeps
route-tree size and router options isolated so one scenario cannot shift
another scenario's numbers. The existing baseline apps and bench names stay
stable for CodSpeed continuity.

## Scenario Responsibilities

Each scenario isolates one client-side responsibility so benchmark changes can
be attributed to a specific feature area.

| Scenario                                 | Client-side responsibility                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `react/`, `solid/`, `vue/` baseline apps | Mixed navigation loop: path params, search params, route context, and `useParams`/`useSearch`/`useLoaderData` selector subscriptions.                                                                                                                                                                                                |
| `async-pipeline`                         | The router's async pipeline via counted 0ms timer hops: async loaders (transition-held navigation), async `beforeLoad` context, and parallel nested async loaders. Component-level `Await`/Suspense is excluded: React 19 throttles Suspense reveals by ~300ms wall-clock, which is inherently non-deterministic to benchmark.       |
| `control-flow`                           | Loader-thrown `redirect` (including a 2-hop chain), `notFound()` with `notFoundComponent`, loader errors with `errorComponent`, and boundary reset on recovery navigation.                                                                                                                                                           |
| `head`                                   | `HeadContent` per-navigation work: nested route `head()` evaluation, title/meta/link dedupe across matches, and head tag DOM updates during navigation.                                                                                                                                                                              |
| `history`                                | History push/replace/back/forward traversal, location masking, registered-but-never-blocking `useBlocker`, and `useCanGoBack`/`useLocation` subscriptions.                                                                                                                                                                           |
| `hydration`                              | Initial DOM hydration: execute the SSR payload, restore `beforeLoad` context and loader data, and hydrate 192 ordinary and eight hash-sensitive Links through their follow-up effects in React and Solid.                                                                                                                            |
| `link-churn`                             | Links that depart, stay and mount: 30 `/hub` layout Links stay while 100 `/hub/list` leaf Links leave (alone, or with the layout to `/other`) and remount on return; a search-only change rebuilds updater and `to="."` Links. Unlike `links`, whose root-layout Links never depart.                                                 |
| `links`                                  | Per-navigation cost of ~200 mounted `<Link>`s: link prop building, active-state recompute across `activeOptions` variants, `activeProps` swaps, and `useMatchRoute` probes (the `MatchRoute` component is avoided: vue-router's implementation leaks one subscription per render).                                                   |
| `loaders`                                | Client loader dispatch: always-stale re-runs (`staleTime: 0`), cached revisits (re-run once per lap by the `invalidate` step), `loaderDeps`-keyed caching, `router.invalidate()`, and `useLoaderData` selectors.                                                                                                                     |
| `mount`                                  | Cold start: `createRouter` (route-tree processing) + first render + initial `router.load()` + unmount, with a fresh router per mount.                                                                                                                                                                                                |
| `nested-params`                          | Deep nesting (8 dynamic levels): per-level `params.parse`/`stringify`, `beforeLoad` context accumulation across matches, and per-level `useParams`/`useRouteContext` subscriptions. Param values include characters requiring percent-encoding (as do `route-tree-scale`'s), so segment encode/decode paths run on every navigation. |
| `preload`                                | Intent preloading from hover events, programmatic `router.preloadRoute`, deterministic preload cache behavior (`defaultPreloadStaleTime: 0`), and commit-time cache maintenance.                                                                                                                                                     |
| `rewrites`                               | Composed client-side location rewrites: router `basepath` plus a locale input/output rewrite pair, running on every href build and location parse (the client analog of the SSR `rewrites` scenario).                                                                                                                                |
| `route-tree-scale`                       | Route matching and link-target resolution on a wide (~40 route) tree mixing static, dynamic, prefixed-param, splat, pathless-layout, and route-group paths, with `autoCodeSplitting` enabled so navigations also resolve lazy route chunks.                                                                                          |
| `search-params`                          | `validateSearch` execution, search middlewares (`retainSearchParams`/`stripSearchParams`), functional search updaters, structural sharing, and `useSearch` selector subscriptions.                                                                                                                                                   |

## Conventions

The hydration scenario has the separate lifecycle described below. The other
scenarios follow these navigation/mount conventions:

- Apps are built with `NODE_ENV=production` (`minify: false`) into `dist/app.js`; benches import the built bundle, so production package builds and production JSX output are measured, not dev transforms.
- Scenarios behave like a real user app: navigation happens through `<Link>` clicks dispatched on real anchor elements (unless a scenario specifically measures the imperative API), the router uses the default browser history, and `scrollRestoration` is enabled.
- Each benchmark iteration advances a fixed, circular sequence of steps; every step awaits the router's `onRendered` event, so render work is included and steps cannot overlap. No two consecutive steps may target the same location, and the sequence ends back on the initial route.
- Setup runs one warm-up lap through the sequence and asserts each step's observable output (e.g. `document.title`), so a scenario that silently stops doing its work fails instead of reporting a fast time.
- Determinism: no wall-clock timers (async work is resolved promises or counted `setTimeout(0)` hops), `staleTime`/`gcTime` only ever `0` or effectively-infinite, no `Math.random`/`Date.now` in the measured loop. Scroll restoration uses `getScrollRestorationKey: (location) => location.pathname` so its cache stays bounded (the default random per-entry key grows one cache entry per push navigation). The `mount` scenario opts out of `scrollRestoration` entirely and destroys its history on unmount — both register page-lifetime globals that would leak across its mount/unmount loop.
- Push-only step laps grow jsdom's session-history entry list over a run (jsdom never truncates entries behind the current index). Per-push cost stays O(1) so timings are unaffected; only the `history` scenario needs — and has — a lap that is depth-stationary.
- Calibration: pick per-iteration step counts so a bench's `vitest bench` run stays roughly between 8 and 30 seconds (long enough to average out, short enough for CI).

## Run

Run all benchmarks through Nx so dependency builds are part of the graph:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf --outputStyle=stream --skipRemoteCache
```

Run framework-specific benchmarks (baseline + all scenarios):

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:solid --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:vue --outputStyle=stream --skipRemoteCache
```

Run a single scenario app manually (after building it through Nx):

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-<scenario>-<framework>:build:client --outputStyle=stream --skipRemoteCache
cd benchmarks/client-nav && NODE_ENV=production vitest bench --config ./scenarios/<scenario>/<framework>/vite.config.ts
```

Run framework-specific flame benchmarks (10 second loop, profiled with `@platformatic/flame`, forced to `NODE_ENV=production`):

```bash
# baseline
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:flame:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:flame:solid --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:flame:vue --outputStyle=stream --skipRemoteCache
# scenarios
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-<scenario>-<framework>:test:flame --outputStyle=stream --skipRemoteCache
```

Typecheck benchmark sources (baseline + scenarios):

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:types --outputStyle=stream --skipRemoteCache
```

## Hydration

`scenarios/hydration/{react,solid}` provide the same initial-hydration
workload: 192 ordinary Links, eight hash-sensitive Links, and three matched
routes with three `beforeLoad` contexts and two loader results. The server URL
has no fragment; the client URL has `#details`, matching half of the hash-sensitive Links.

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-hydration-react:test:perf --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-hydration-react:test:unit --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-hydration-react:test:types:client --outputStyle=stream --skipRemoteCache
```

Replace `react` with `solid` to run the other adapter.

The build generates static HTML and its real Router SSR bootstrap scripts once
with `createRequestHandler` and the adapter's streaming renderer. Generation
fully consumes the response and runs outside the CodSpeed action. The measured
worker only reads these artifacts; it does not import a server renderer or start a server.

Each invocation uses a fresh jsdom window and a fresh evaluation of the complete
production client bundle in that window's realm. HTML parsing, bundle evaluation,
and the initial document lifecycle finish in untimed setup. This resets module
state as well as the DOM, avoiding cached hydration promises and cross-realm
payload objects. The bundle and bootstrap scripts are compiled once, so this
measures a fresh application with warm code, not JavaScript download/parse cost.

The timed region executes the serialized payload, creates the router and its
small code-based route tree, calls the public client `hydrate` API, and hydrates
the existing DOM with the framework's native renderer:

- **React:** a separate completion component signals from its post-hydration
  effect, after the same snapshot transition as hash-sensitive Links. The harness
  awaits that signal and two idle React scheduler turns, then checks the expected
  active links. The window's `performance.now()` is frozen, so React's
  scheduler yields only to paint after commits, not after 5 ms of wall time, which CPU
  instrumentation stretches by a runner-dependent factor. Each sample therefore
  uses the same number of scheduler tasks. `Date.now()` is unchanged. A
  60-second watchdog fails a sample that never settles.
- **Solid:** execute the native hydration bootstrap and retain the server's
  component/key hierarchy. Wait for mount, the router's rendered event, active-link
  effects, and two idle turns. DOM identity assertions include every workload
  element so template fallback cannot silently replace server nodes.

Solid bounds settlement to 100 turns. Ending at the hydration call or the
first mount would miss post-hydration Link updates.
Timer turns use `setImmediate`; scrolling is a no-op
because this is CPU simulation rather than browser layout/paint measurement.

Untimed assertions verify restored contexts and every loader row, zero client
`beforeLoad`/loader calls, expected hrefs/active state, original DOM-node identity,
working event handlers, and absence of hydration errors. Root unmount, pending
task cancellation, and window disposal also run outside measurement. Diagnostic
tests count Link renders or reactive evaluations and check they stop before the
measured region ends; counting is disabled in the timed workload.

CodSpeed uses suite `beforeEach`/`afterEach` hooks. Ordinary Vitest instead
installs Tinybench's public Task iteration hooks from its stage-level `setup`.
Using only stage-level setup would let later iterations reuse an already
hydrated document. The hydration unit tests cover fresh-state setup through
both paths.

Each scenario is included in its framework's aggregate build and CodSpeed run.
Land the benchmark independently to establish main's baseline before comparing a
hydration optimization. Regenerate each revision's artifacts with identical
fixture data and dependencies; do not pin an old hydration wire format forever.

## Isolated route-tree construction

`scenarios/route-tree-scale` measures navigation over an existing tree, not
construction. `scenarios/mount` includes construction but also rendering and
loading. To isolate initialization, use the core construction benchmark:

```bash
CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-core:test:unit --outputStyle=stream --skipRemoteCache -- bench tests/route-tree-construction.bench.ts --run --testNamePattern=1000.routes --outputJson /tmp/route-tree-construction.json
```

It covers 100, 1,000, and 10,000 static, dynamic, nested, or mixed routes.
The processing-only case creates fresh route objects in an untimed
`beforeEach`, then measures `processRouteTree` and `route.init`. A separate
case includes route-object creation. Neither case measures first interpolation
or navigation. Remove the name filter to run all sizes. Compare identical
benchmark sources in separate checkouts and repeat fresh processes; a cached
router or repeatedly initialized tree is not a construction baseline.

## Opt-in React Link performance suite

`link-performance/` contains additional client-navigation and SSR workloads for
focused Link work. They are **not included** in the regular client-nav/SSR
aggregate projects or their CodSpeed build dependencies; they only run through
the dedicated `@benchmarks/react-link-performance` targets below. Use `-t` to
narrow a run to specific cases.

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-performance:test:perf:client --outputStyle=stream --skipRemoteCache -- --run
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-performance:test:perf:ssr --outputStyle=stream --skipRemoteCache -- --run

# Select a feature and save the normal Vitest JSON report.
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-performance:test:perf:client --outputStyle=stream --skipRemoteCache -- --run -t "updater|optional|splat" --outputJson /tmp/link-perf.json
```

The cases cover repeated versus unique destination params, updater functions,
relative/inherited values, search middleware chains, param stringification,
optional and splat segments, encoding, masks, basepath/rewrites, and active
props with structured search. These exercise different costs: cache hits and
misses, parameter cloning, callbacks, middleware traversal, URI encoding,
building masked/public locations, active-state comparisons, and prop merging.
Existing preload, mount, and route-tree-scale scenarios remain responsible for
those separate workloads.

- **Client:** 200 persistent measured Links, four control Links, and eight
  completed navigations per timed batch. The existing client harness checks
  hrefs and active state during its untimed warm-up lap. Control navigations
  replace the history entry, keeping history size constant. Post-measurement
  assertions also check that the measured anchors stayed mounted.
- **SSR:** four fresh-router requests per timed batch, each rendering 200
  measured Links through `RouterProvider` and `renderToString`. Router creation,
  `router.load()`, rendering, and history cleanup are included. This isolates
  Router SSR Link work, not Start HTTP handling, dehydration, or streaming.
  HTML assertions run outside the timed batch.
- Both use the same code-based workload definitions and production JSX/library
  builds. The regular Vitest entry points use at least 100 warm-up iterations,
  one second of warm-up time, and five-second measurement windows. The client
  and server bundles assert their resolved `isServer` environment. React and
  React DOM remain external so comparisons can share the same renderer runtime.
  These bundles are Node-hosted (jsdom for client mode), not browser deployments.

Run the gate tests and typecheck separately:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-performance:test:unit --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-performance:test:types --outputStyle=stream --skipRemoteCache
```

For before/after comparisons, use identical benchmark files and dependencies
on both refs, build each ref through its Nx targets, and alternate fresh
Vitest processes. Report the actual refs, per-case means and relative margins
of error; rerun noisy or borderline results with `-t` rather than interpreting
a small difference as a proven speedup. Client and SSR times have different
batch units and should not be compared directly.

### Stable paired comparisons

For regression decisions, prefer the paired runner over a whole-file Vitest
run. It starts a fresh process for every case and repetition, avoiding JIT
feedback from earlier cases. Inside each process, both revisions share the
same production React installation but have separate router/app modules and
router instances. Initialization order alternates between repetitions.
Built snapshots are staged under `node_modules/.cache` so the TypeScript
harness loader does not transpile their emitted JavaScript a second time.

```bash
# Build the baseline using these same benchmark sources in its own checkout.
# --baseline points to that checkout's link-performance/dist directory.
pnpm nx run @benchmarks/react-link-performance:test:perf:stable -- \
  --baseline /path/to/baseline/benchmarks/client-nav/link-performance/dist \
  --outputJson /tmp/paired-links.json

# Narrow a comparison, or increase independent process repetitions.
pnpm nx run @benchmarks/react-link-performance:test:perf:stable -- \
  --baseline /path/to/baseline/benchmarks/client-nav/link-performance/dist \
  --mode ssr -t "middleware|unique-params" --repeats 6 \
  --outputJson /tmp/paired-links-ssr.json
```

The runner requires Node with `process.threadCpuUsage` (Node 24 works).
It fixes V8 random/hash seeds, warms each variant for at least two seconds
and 100 batches, then alternates ABBA/BAAB blocks calibrated to roughly 500 ms.
Both variants do exactly the same number of batches per block. It records
main-thread CPU time, wall time, and whole-process CPU time; GC during
measurement is not disabled or discarded.

The default is four independent process repetitions. Reported 95% intervals
use their paired log-ratios, not the many correlated batches as independent
samples. A faster/slower verdict requires CPU and wall intervals to agree.
Intervals overlapping zero or disagreeing metrics are inconclusive; narrow
intervals entirely inside +/-2% are reported separately.

An A/A calibration uses the current `dist` directory as `--baseline`. Its
intervals should contain zero before trusting similarly sized A/B differences.
Shared-machine contention can still make small changes unresolved. Do not
interpret a point estimate alone, or an inconclusive result, as proof that
a workload is unchanged.
