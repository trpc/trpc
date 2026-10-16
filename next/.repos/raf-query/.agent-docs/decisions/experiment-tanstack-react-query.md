# Experiment: `@raf-query/experimental-tanstack-react-query` (human asked)

One experiment folder (`.experimental/tanstack-query/`) giving raf-query's API on TanStack Query, to compare against the own-engine pair. Layout: `package/` (the library), `start/` and `nextjs/` (example apps on ports 3002 / 3003), plus a folder README that explains the experiment and how to promote it. Human picks: keep core/react for now; `@tanstack/react-query` is a regular `dependency` and the only one (no Effect); the cache is TanStack's own `QueryClient`, so TanStack hooks and devtools work on it; same API as the docs minus Effect entry points; private.

- **Experiments live under `.experimental/<topic>/`** (human): each topic has a README and its packages/apps as children. Workspace glob is `.experimental/*/*`. Root scripts that need only experimental libraries or only experimental apps filter by package name (`@raf-query/experimental-*`, `@examples/experimental-*`). Path globs like `./packages/*` (pnpm filters, release-it) don't reach them. Package names keep the `experimental-` prefix so imports say it too. The library `package.json` has no publish-only fields; `exports` point at `src/`.
- Grouped by topic (not by `packages/` vs `examples/`) so a future experiment is one folder with a path to make it real.

Agent decisions:

- **Verbs are free functions** taking the client first — `prefetch(qc, factory, input)`, `ensure`, `ensureData`, `invalidate`, `setData`, `getData` — since the client is TanStack's class. `qc.fetch` became `ensureData` (`fetch` shadows the global). Prefix invalidation is TanStack's own `qc.invalidateQueries({ queryKey })`. TanStack's hooks are not re-exported.
- Verbs call `client.query()` / `client.infiniteQuery()` (the non-deprecated API). Those default `retry` to `false`, so verbs pass the read default instead: 0 on the server, 3 in the browser, unless the factory or client sets one.
- **One observer per query hash**, recreated when the hash changes. Moving a `QueryObserver` to a new key refetches stale data (`shouldFetchOptionally`), which would refetch what the loader just fetched. Observers set `refetchOnMount: false`.
- **Stable thenables** live in `thenable.ts`, one set per `Query` in a `WeakMap`: a fulfilled thenable per data identity, and one pending thenable fed by `QueryCache.subscribe`. A read with no data and nothing in flight starts the fetch during render (`observer.fetchOptimistic`), because `use()` suspends before effects run.
- **An error is shown once, then the next read retries.** React re-renders a throwing tree once before the error boundary takes it, so the rejected thenable is returned until a microtask passes; after that, a read (an error boundary reset) refetches. This replaces TanStack's `retryOnMount`.
- Paged factories use `InfiniteQueryObserver`; `{ pages }` maps to `client.infiniteQuery({ pages })`.
- Dev-only check: two inputs with the same key hash warn once per key (`console.warn`).
- Integrations: TanStack Router uses TanStack's own `@tanstack/react-router-ssr-query` (no `/tanstack-router` subpath). `/rsc` exports a `HydrationBoundary` that dehydrates pending entries as promises and skips entries an earlier boundary already sent in the request; `/next` exports `QueryProvider` (client per server render, singleton in the browser).
- Not released: `.release-it.json` publishes core and react by name only, and its `after:bump` filter (`./packages/*`) doesn't reach `.experimental/`, so the version stays `0.0.0`.
- Tests: TanStack batches observer notifications on a `setTimeout(0)`, so React tests wait a macrotask inside `act` after any cache write (`flush()` in `test-utils.tsx`).
