# @tanstack/router-devtools-core

## 1.168.2

### Patch Changes

- [#8321](https://github.com/TanStack/router/pull/8321) [`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6) - Consolidate internal path interpolation into `interpolatePath`, returning a pathname directly and collecting metadata only when requested. Update router and devtools callers without changing route parsing or interpolation caching.

- [#8327](https://github.com/TanStack/router/pull/8327) [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef) - Reuse parsed route segments when generating paths for navigation, Links, and Devtools. Preserve interpolation metadata and refresh segments when the route tree is rebuilt, without reparsing templates for new parameter values.

- [#8327](https://github.com/TanStack/router/pull/8327) [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef) - Share compact parsed route segments between matching and interpolation, preserve original parameter names, and avoid reparsing templates while building paths. Simplify route-tree traversal, reuse existing path helpers, and keep Devtools-only navigation validation out of the production formatter. Preserve dynamic match identity for standalone legacy fallback routes.

- Updated dependencies [[`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6), [`b747fb8`](https://github.com/TanStack/router/commit/b747fb8891b3347b1ffdfe0fa81e7d15049cb776), [`6cfb1e8`](https://github.com/TanStack/router/commit/6cfb1e8b564be282584765352250bf61747895ed), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`873c830`](https://github.com/TanStack/router/commit/873c830ccb2610a864ee697250e10fcc99772ffa), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`f151ab0`](https://github.com/TanStack/router/commit/f151ab018eede64ae849b77e68f3cdf31cb95cc5), [`bc57fa3`](https://github.com/TanStack/router/commit/bc57fa3f12450cf34c731450947c7c8f1ea05e58), [`9872d2a`](https://github.com/TanStack/router/commit/9872d2ac39fc05f4ef6566c0b421f71ceb115244), [`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`9448caa`](https://github.com/TanStack/router/commit/9448caa03a89076b9770631c356c0cc502802c09), [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef)]:
  - @tanstack/router-core@1.171.30

## 1.168.1

### Patch Changes

- [#7805](https://github.com/TanStack/router/pull/7805) [`45c4ad8`](https://github.com/TanStack/router/commit/45c4ad8d629e291fab70c37900525449e415ffcd) - Rewrite match loading around a lane-based scheduler that tracks each navigation, preload, and background reload as an ordered unit of work. This fixes pending/redirect/retry state leaking between overlapping navigations, restores correct SSR status codes for redirects, errors, and not-found responses, and closes hydration gaps where the client re-ran work the server had already completed.
  - Invalidation now retires matching active preloads so older speculative loader results cannot become fresh cache data after invalidation.
  - Route `headers()` now only runs on the server, matching the documented behavior — it is no longer invoked during client-side asset projection.
  - The documented default `gcTime` and `preloadGcTime` now match the existing runtime default of 5 minutes (`300_000`).

  **Removed / changed exported internals**
  - `RouterState` no longer includes `loadedAt`, `isTransitioning`, `statusCode`, or `redirect`. Use `match.updatedAt` in place of `loadedAt`; subscribe to `router.state.status` / `router.state.isLoading` in place of `isTransitioning`; server response status and redirect handling are now internal to the server loader and are no longer exposed on `router.state`.
  - `RouteMatch.fetchCount` has been removed, with no replacement — it was purely informational.
  - `RouteMatch.status` no longer includes `'redirected'` (it remains `'pending' | 'success' | 'error' | 'notFound'`) — redirected matches are dropped from the match list instead of being rendered.
  - `RouteMatch.globalNotFound` has been renamed and privatized to the internal `_notFound` field. Use `match.status === 'notFound'` instead.
  - The exported React, Solid, and Vue `Match` components now accept `routeId` instead of `matchId`.
  - The exported `RouterStores` adapter contract now uses route-keyed presentation stores: `matchesId` is replaced by `ids`, `matchStores` by `byRoute`, and `getRouteMatchStore()` by `getMatchStore()`. The separate `loadedAt`, `isLoading`, `isTransitioning`, `statusCode`, and `redirect` stores have been removed, along with the pending/cache stores and their setters. `StoreConfig.init` has also been removed. Read application-facing state from `router.state`; preload and cache coordination are now internal.
  - Removed `RouterCore` members `getMatch()`, `updateMatch()`, `cancelMatch()`, and `cancelMatches()` — read matches from `router.state.matches` (e.g. `router.state.matches.find((m) => m.id === id)`); there is no replacement for mutating or cancelling an individual in-flight match from outside the router.
  - Removed `RouterCore.hasNotFoundMatch()` — use `router.state.matches.some((m) => m.status === 'notFound')`.
  - Removed `RouterCore.looseRoutesById` — use `routesById`.
  - Removed `RouterCore.isPrerendering()`, `RouterCore.isViewTransitionTypesSupported`, and `RouterCore.viewTransitionPromise`, with no replacement.
  - Removed `RouterCore.getParsedLocationHref()` and `RouterCore.clearExpiredCache()`, with no replacement — expired cache entries are now reconciled automatically as part of match commit.
  - Removed `RouterCore.latestLoadPromise` and `RouterCore.beforeLoad()`, with no replacement.
  - `RouterCore.commitLocationPromise` and `RouterCore.pendingBuiltLocation` have been replaced by the internal `_commitPromise` and `_pendingLocation` fields.
  - Removed the exported `GetMatchFn` and `UpdateMatchFn` types, along with the methods they typed.
  - Removed the standalone `getMatchedRoutes()` export from `@tanstack/router-core` — use the `router.getMatchedRoutes()` instance method instead.
  - `RouterCore.loadRouteChunk()` no longer accepts an array of component types as its second argument. One-argument usage is unchanged; the optional second argument is now `'errorComponent'`, `'notFoundComponent'`, or `false` for internal boundary loading.
  - Removed `Redirect.redirectHandled`, which was internal redirect bookkeeping.
  - `MatchRoutesOpts.preload` and `MatchRoutesOpts.dest` have been removed.
  - `StartTransitionFn` is now `(fn, expected) => Promise<boolean>` (previously `(fn) => void`). This only affects custom framework adapters that implement `startTransition`.

- Updated dependencies [[`45c4ad8`](https://github.com/TanStack/router/commit/45c4ad8d629e291fab70c37900525449e415ffcd)]:
  - @tanstack/router-core@1.171.16

## 1.168.0

### Minor Changes

- Clean minor bump, fresh start ([#7395](https://github.com/TanStack/router/pull/7395))

### Patch Changes

- Updated dependencies [[`b1c061a`](https://github.com/TanStack/router/commit/b1c061aff9185cdf5fdc08c0136382a9dce0302f), [`201e150`](https://github.com/TanStack/router/commit/201e150bd1412bae2faa9ce53f0fefcb7574ac14)]:
  - @tanstack/router-core@1.170.0

## 1.167.3

### Patch Changes

- shorten internal non-minifiable store names for byte shaving ([#7152](https://github.com/TanStack/router/pull/7152))

- Updated dependencies [[`6355bb7`](https://github.com/TanStack/router/commit/6355bb75f7637ba77f06a923c18fdaf37720bb48)]:
  - @tanstack/router-core@1.168.11

## 1.167.2

### Patch Changes

- migrate createStore > createAtom for simpler API ([#7150](https://github.com/TanStack/router/pull/7150))

- Updated dependencies [[`459057c`](https://github.com/TanStack/router/commit/459057cd2d90cff20d20e51d4964b0a8c950555e)]:
  - @tanstack/router-core@1.168.10

## 1.167.1

### Patch Changes

- Replace tiny-invariant and tiny-warning with in-house solution for bundle-size ([#7007](https://github.com/TanStack/router/pull/7007))

- Updated dependencies [[`c9e1855`](https://github.com/TanStack/router/commit/c9e18555f3a5531e96de8f574cfca9edcdb18e5c)]:
  - @tanstack/router-core@1.168.2

## 1.167.0

### Minor Changes

- remove pendingMatches, cachedMatches ([#6704](https://github.com/TanStack/router/pull/6704))
  move to signal-based reactivity
  solid uses its own native signals

### Patch Changes

- Updated dependencies [[`0545239`](https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30)]:
  - @tanstack/router-core@1.168.0

## 1.166.9

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/router-core@1.167.2

## 1.166.8

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/router-core@1.167.1
