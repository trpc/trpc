---
title: Coming from TanStack Query
description: How TanStack Query's APIs map onto raf-query, what stays the same, what changes about where queries start, and what we leave out on purpose.
section: Getting started
order: 4
---

raf-query's cache is modelled on [TanStack Query](https://tanstack.com/query)'s: query keys, request deduping, `staleTime` and `gcTime`, retries with backoff, structural sharing, infinite pages, refetching on focus and reconnect. If you know how TanStack Query caches, you know how raf-query caches.

What changes is the API around the cache. TanStack Query lets any component start a query by rendering `useQuery`. raf-query moves the start to the route: loaders and server components start queries, and components only read them.

## API map

| TanStack Query                                       | raf-query                                                    | Notes                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `queryOptions({ queryKey, queryFn })`                | `function q(input) { return queryOptions({ ... }) }`         | A [factory](./query-factories.md) of one input, so handles can carry the input                                                       |
| `queryClient.prefetchQuery()` (not awaited)          | `qc.prefetch(factory, input)` → handle                       | [Starting queries](./starting-queries.md)                                                                                            |
| `queryClient.ensureQueryData({ revalidateIfStale })` | `qc.ensure(factory, input)` → `Promise<QueryHandleWithData>` |                                                                                                                                      |
| `queryClient.fetchQuery()`                           | `qc.fetch(factory, input)` → `Promise<QueryHandleWithData>`  |                                                                                                                                      |
| `useSuspenseQuery()`                                 | `use(useQuery(factory, handle)[0])`                          | The hook returns a promise; [read it](./reading-queries.md) where you need it                                                        |
| `useQuery()` in render, starting the request         | `useWaterfall(factory, input)` + `useQuery`                  | An [escape hatch](./request-waterfalls.md#render-time-inputs-usewaterfall)                                                           |
| `useQuery().data` (doesn't suspend)                  | `promise.status === "fulfilled" ? promise.value : undefined` | [Reading without Suspense](#reading-without-suspense)                                                                                |
| `enabled: typeof window !== "undefined"`             | Same, in `queryOptions`                                      | [Browser-only queries](./ssr-and-hydration.md#browser-only-queries)                                                                  |
| `enabled: false`                                     | Same, in `queryOptions`                                      | Readers suspend until it's enabled; `refetch()` doesn't run it either. [Disabling a query](./query-factories.md#disabling-a-query)   |
| `useInfiniteQuery()`                                 | `useQuery()` with an `infiniteQueryOptions` factory          | [Infinite queries](./infinite-queries.md)                                                                                            |
| `placeholderData: keepPreviousData`                  | `useQuery(f, h, { whilePending: "previous" })`               | `isPrevious` instead of `isPlaceholderData`                                                                                          |
| `useMutation()`                                      | Form Actions + `qc.invalidate()`                             | React provides pending and [optimistic](./mutations.md) state                                                                        |
| `queryClient.invalidateQueries(filters)`             | `qc.invalidate(filter)` or `qc.invalidate(factory, input)`   | Resolves when read queries have refetched                                                                                            |
| `queryClient.resetQueries` / `removeQueries`         | `qc.reset(...)` / `qc.remove(...)`                           | Same [filters](./query-invalidation.md#query-filters)                                                                                |
| `queryClient.setQueryData` / `getQueryData`          | `qc.setData(factory, input, updater)` / `qc.getData(...)`    |                                                                                                                                      |
| `useIsFetching()`                                    | `useIsFetching()`                                            | Kept for compatibility; prefer router pending + per-query `isFetching`. [Background indicators](./background-fetching-indicators.md) |
| `HydrationBoundary` + `dehydrate()`                  | Automatic streaming                                          | [SSR and hydration](./ssr-and-hydration.md)                                                                                          |
| `cancelQueries()`                                    | `qc.remove(...)`                                             | Unread background refetches are [aborted](./query-cancellation.md) for you                                                           |

## Loading data

### Start queries in the loader

Where a TanStack Query app renders [`useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery) and lets it fetch, a raf-query route starts the query in its loader and passes the handle down. Pick the verb by what the route needs:

- **`ensure`** when the route can't render without the data. The loader waits for it, and `useQuery` returns the data itself.
- **`prefetch`** when the UI can render without it. The loader doesn't wait, and `useQuery` returns a thenable plus controls.
- **[`enabled: typeof window !== "undefined"`](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries)** for inputs only the browser has, such as [`localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) or the [Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API). The server never runs it or sends it, and the browser does. See [Browser-only queries](./ssr-and-hydration.md#browser-only-queries).
- **`useWaterfall`** only as a last resort. It starts the query in render, which is a [request waterfall](./request-waterfalls.md#render-time-inputs-usewaterfall).

```sample
tanstack-start/src/routes/posts.$slug.tsx#route
```

### Reading without Suspense

The thenable `useQuery` returns for a `prefetch` handle is TanStack Query's non-suspending `data`, with no [`use()`](https://react.dev/reference/react/use). Read its `status`:

```sample
tanstack-start/src/docs/comparison.tsx#thenable
```

- `promise.value` is the data once `status` is `"fulfilled"`. `promise.reason` is the error once it's `"rejected"`.
- `controls.isPending` and `controls.isFetching` are the loading state.
- The component re-renders when the first load lands.
- Reading `status` never throws to an error boundary, which suits optional UI.
- Call `use(promise)` instead when you want Suspense. See [Reading queries](./reading-queries.md).

### Side by side

A setting that shows the browser's notification permission. With TanStack Query, the component starts the query, and `enabled` keeps it off the server:

```sample
tanstack-start/src/docs/comparison.tanstack.tsx#tanstack
```

With raf-query, the factory says the query runs in the browser only, the loader starts it, and the component reads its `status`:

```sample
tanstack-start/src/docs/comparison.tsx#queries
```

```sample
tanstack-start/src/docs/comparison.tsx#route
```

```sample
tanstack-start/src/docs/comparison.tsx#component
```

## What stays the same

- **Query keys** are arrays, hashed deterministically, and matched by prefix in filters. See [Query keys](./query-keys.md).
- **Defaults**: `staleTime: 0`, `gcTime` of five minutes, three retries with exponential backoff, refetch on focus and reconnect, structural sharing. See [Important defaults](./important-defaults.md).
- **Deduping**: every way of starting a query joins a request already in flight for the same key.
- **Infinite queries** keep `{ pages, pageParams }`, with `getNextPageParam`, `getPreviousPageParam` and `maxPages`.

## What's different

- **No refetch on mount.** Mounting a component that reads a query never fetches; whatever started the query decides. Loaders run on every navigation, so returning to a page still revalidates it.
- **The URL is the input.** There is no option to change a read's input. Anything that changes what a query fetches lives in the route, so the loader starts the right query. [URL state and pagination](./url-state-and-pagination.md) shows the pattern.
- **`undefined` is a valid result.** A `queryFn` typed `Promise<User | undefined>` caches `undefined` like any other value. TanStack Query treats it as an error.
- **No `select`, no `placeholderData`.** Shape data in the `queryFn` or the component; use `whilePending: "previous"` to keep showing the last page.
- **`enabled` doesn't wait for input.** Start queries only when the route has their input. `enabled: false` is for a query that's off for now, such as one behind a flag or only the browser can run.
- **Mutations aren't a hook.** Actions, `useOptimistic` and `useActionState` already give you pending, optimistic and error state.
- **Hydration is a stream.** Handles carry only a key and an input. The server's cache streams to the browser as queries settle, and pending queries cross as promises.
- **Browser-only queries are first-class.** `enabled: typeof window !== "undefined"` skips the server and runs in the browser — push subscriptions, permissions, service workers — with the same factory and handle API. See [Browser-only queries](./ssr-and-hydration.md#browser-only-queries).

## What we leave out

TanStack Query is mature and broad. raf-query is a narrower experiment: what that cache looks like when queries start in loaders and server components, and components only read them. The gaps below are intentional, thinned, or outside that scope — not unfinished ports of the same API.

### Intentional

Things that would undo the render-as-you-fetch shape:

| TanStack Query                                                    | Why raf-query leaves it out                                                                                                                                  | Closest substitute                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `useQuery` that starts a request in render                        | Starting in render is what causes request waterfalls                                                                                                         | Loader / RSC `prefetch` · [`useWaterfall`](./request-waterfalls.md) escape hatch                                                |
| `skipToken`, `enabled` waiting for input                          | The route owns the input; if it isn't there yet, don't start the query                                                                                       | URL / `loaderDeps` gate the start · [browser-only queries](./ssr-and-hydration.md#browser-only-queries) for browser-only inputs |
| `refetchOnMount` / `retryOnMount`                                 | Mounting a reader must never fetch; whoever started the query decides                                                                                        | Loader revalidate · invalidate · focus / reconnect · `refetch()`                                                                |
| Changing input at the read site                                   | Anything that changes what a query fetches lives in the URL so the loader starts the right one                                                               | Search params → loader → new handle                                                                                             |
| Dependent queries as a normal pattern                             | `await`-then-start chains create waterfalls; reshape the route or backend instead                                                                            | Route input · backend join · `useWaterfall` last resort                                                                         |
| `select`                                                          | Keep one cached shape; derive in the `queryFn` or the component                                                                                              | `queryFn` mapping · component derive                                                                                            |
| Arbitrary `placeholderData`                                       | Only the keep-previous-page case is needed for URL-driven list switches                                                                                      | `whilePending: "previous"` + `isPrevious`                                                                                       |
| `useMutation` / MutationCache / mutation keys / offline mutations | React Actions, `useOptimistic` and `useActionState` already cover pending, optimistic UI and errors; the cache only invalidates or `setData` after the write | Form action · `startTransition` · `qc.invalidate` / `setData`                                                                   |
| Non-suspense status model (`isLoading`, `status`, `fetchStatus`)  | The API is promise-first: the promise carries `status`; controls stay thin (`isPending`, `isFetching`, `isStale`, `error`)                                   | [`promise.status`](#reading-without-suspense) · `use(promise)` under Suspense                                                   |
| `useQueries` / `useSuspenseQueries` / `combine`                   | Parallelism belongs in the loader (start every query before awaiting any), not a multi-observer hook                                                         | Multiple `prefetch` / `ensure` · [`allKeyed`](./starting-queries.md)                                                            |
| Manual `HydrationBoundary` + `dehydrate` as the default path      | Handles carry key + input only; the cache streams. RSC still uses a boundary where needed                                                                    | Router stream · [RSC `HydrationBoundary`](./react-server-components.md#pages)                                                   |
| Separate `useInfiniteQuery` / `prefetchInfinite*` verbs           | Paged vs plain is decided only by the factory                                                                                                                | `infiniteQueryOptions` + `useQuery`                                                                                             |

### Thinned

Same problem space, fewer knobs:

| TanStack Query                                                      | What raf-query does instead                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `networkMode` (`offlineFirst` / `always`) + `fetchStatus: "paused"` | Retries pause while offline; the first attempt always runs (`navigator.onLine` is unreliable)         |
| `refetchOnWindowFocus` / `Reconnect`: `'always'` or a function      | Boolean only: refetch read + stale queries, or don't                                                  |
| `refetchIntervalInBackground`                                       | Polling is per-read and pauses while the tab is hidden                                                |
| `initialData` / `initialDataUpdatedAt`                              | Seed with `setData` / hydrate, or let the loader fetch                                                |
| Custom `structuralSharing` merge function                           | Boolean on / off; deep equality on plain objects and arrays                                           |
| Query filter `type` / `stale` / `fetchStatus` fields                | Filter is `{ queryKey?, exact?, predicate? }`; `predicate` covers the rest                            |
| `cancelQueries` as its own verb                                     | `remove` cancels; unread background refetches abort when the last reader leaves                       |
| Manual `notifyOnChangeProps` allowlist                              | Automatic tracked results, like TanStack's default path                                               |
| `throwOnError` as a function / for promise `queryFn`s               | Promise `queryFn`s always throw; Effect `queryFn`s can return a `Result` when `throwOnError` is false |

### Out of scope

| TanStack Query                                                  | Why                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Multi-framework adapters (Vue, Solid, Svelte, Angular, …)       | A React + Suspense / RSC / loader experiment, not a framework-agnostic product |
| `PersistQueryClient` / storage persisters / per-query persister | No offline persistence story; the cache is in-memory plus the SSR stream       |
| Default `queryFn` / `setQueryDefaults` / `getQueryDefaults`     | Every query is an explicit factory; no key → defaultFn registry                |
| Custom `queryKeyHashFn` / precomputed `queryHash`               | One hashing function (`hashKey`); keys stay plain arrays                       |
| `@tanstack/eslint-plugin-query`                                 | Factories and handles carry the constraint instead of lint rules               |
| `isMutating` / mutation filters / dehydrating mutations         | No mutation subsystem                                                          |

## Why a different API?

TanStack Query is excellent, and it runs anywhere a component renders. That flexibility is also what makes waterfalls easy: a component deep in the tree can only start its query once it renders, which is after its parents have loaded. raf-query trades that flexibility for a shape where the route knows every query up front. The cache underneath is the same idea; raf-query just won't let a render start a request unless you call the function named [`useWaterfall`](./request-waterfalls.md#render-time-inputs-usewaterfall).
