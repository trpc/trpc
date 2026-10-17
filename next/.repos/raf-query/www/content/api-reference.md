---
title: API reference
description: Every export of @raf-query/react and @raf-query/core, QueryClient's members, query options and their defaults.
section: Reference
order: 2
---

## QueryClient

```sample
tanstack-start/src/docs/api-reference.ts#queryclient
```

| Member                                              | Use                                                                                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new QueryClient(config?)`                          | `config.defaults`, `config.onError`, `config.isServer`, `config.layer`, `config.throwOnError` (Effect reads; default `false` with a `layer`) ([typed errors](./effect-errors.md)) |
| `prefetch(factory, input)`                          | Start a query; returns a `QueryHandle`. [Starting queries](./starting-queries.md)                                                                                                 |
| `ensure(factory, input, options?)`                  | `fetch`, but stale data resolves at once; returns `Promise<QueryHandleWithData>`                                                                                                  |
| `fetch(factory, input, options?)`                   | Wait for fresh data; returns `Promise<QueryHandleWithData>`                                                                                                                       |
| `invalidate(factory, input)` / `invalidate(filter)` | Mark stale and refetch read queries. [Query invalidation](./query-invalidation.md)                                                                                                |
| `setData(factory, input, updater)`                  | Write data. [Mutations](./mutations.md)                                                                                                                                           |
| `getData(factory, input)`                           | Cached data, or `undefined`. [Query functions](./query-functions.md)                                                                                                              |
| `reset(factory, input)` / `reset(filter)`           | Drop data and errors; read queries suspend and refetch. Resolves when they settle                                                                                                 |
| `remove(factory, input)` / `remove(filter)`         | Remove entries and abort their requests                                                                                                                                           |
| `effect`                                            | The [Effect](./effect.md) `QueryCache` behind the client                                                                                                                          |
| `runPromise(effect)`                                | Run an Effect with `QueryCache` and the layer's services, for loaders and actions. [Typed errors](./effect-errors.md)                                                             |
| `subscribe(listener)`                               | Cache events: `added`, `updated`, `observers` (a reader subscribed or left), `removed`, and `failed` (with the `error`)                                                           |
| `isFetching(filter?)`                               | How many entries have a request in flight, optionally only those matching `{ queryKey, exact? }`                                                                                  |
| `getAll()`, `getQuery(factory, input?)`             | Cache entries, for devtools and integrations                                                                                                                                      |
| `clear()`                                           | Drop every entry and abort in-flight requests                                                                                                                                     |
| `mount()`                                           | Start window-focus and reconnect refetching. The providers call it                                                                                                                |
| `isServer`                                          | Detected from `window`. Server clients don't retry, never gc, skip stale timers, and never revalidate cached data                                                                 |
| `dispose()`                                         | Interrupt every request and release the layer's services. Resolves when its finalizers have run                                                                                   |

`ensure` and `fetch` take `{ pages: n }` as a third argument for paged factories, to load more than the first page.

## Query options

Accepted by `queryOptions`, `infiniteQueryOptions` and `config.defaults` (all but `throwOnError`, which is per query):

| Option                                                                                                                                                     | Default                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `queryKey`                                                                                                                                                 | Required. [Query keys](./query-keys.md)                               |
| `queryFn`                                                                                                                                                  | Required. [Query functions](./query-functions.md)                     |
| `staleTime`                                                                                                                                                | `0` ms                                                                |
| `gcTime`                                                                                                                                                   | 5 minutes; `Infinity` on the server                                   |
| `retry` (count, `boolean`, predicate, `Schedule`)                                                                                                          | `3`; `0` on the server                                                |
| `retryDelay` (ms, or a function of the failure count)                                                                                                      | Doubling from 1 s, at most 30 s                                       |
| `refetchOnWindowFocus`, `refetchOnReconnect`                                                                                                               | `true` (only read, stale queries refetch)                             |
| `structuralSharing` (keep deeply equal parts of data)                                                                                                      | `true`                                                                |
| `enabled` (`false`: [the query doesn't run](./query-factories.md#disabling-a-query), such as [on the server](./ssr-and-hydration.md#browser-only-queries)) | `true`                                                                |
| [`meta`](./query-meta.md)                                                                                                                                  | None                                                                  |
| `throwOnError` (Effect reads: reject, or `false` for a `Result`; a read's own wins)                                                                        | The client's ([typed errors](./effect-errors.md#set-it-on-the-query)) |

`infiniteQueryOptions` also takes `initialPageParam`, `getNextPageParam`, `getPreviousPageParam` and `maxPages`. [Infinite queries](./infinite-queries.md)

## useQuery

```sample
tanstack-start/src/docs/api-reference.ts#usequery
```

Options: `whilePending` (`"suspend"` or `"previous"`), `refetchInterval`, `refetchOnWindowFocus`, `refetchOnReconnect`.

| Control        | Meaning                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------ |
| `isPending`    | No data yet for the handle's input; `use(promise)` will suspend                            |
| `isPrevious`   | The promise holds data for a previous input while the handle's input loads                 |
| `isFetching`   | A request is in flight: first load, new input, or background refetch                       |
| `isStale`      | Data is older than `staleTime`                                                             |
| `error`        | Error from a failed background refetch. Existing data stays readable                       |
| `updatedAt`    | When the data in the promise was fetched                                                   |
| `key`, `input` | Key and input of the data in the promise. They differ from the handle's while `isPrevious` |
| `hash`         | Stable string form of the handle's key, for `key` props on Suspense boundaries             |
| `refetch()`    | Refetch now. Returns a promise, so it can be awaited inside a transition or action         |

Paged factories add `fetchNextPage()`, `fetchPreviousPage()`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage` and `isFetchingPreviousPage`. See [Reading queries](./reading-queries.md).

The promise is a `Thenable<Data>`: read its `status`, `value` and `reason` to render without Suspense, like TanStack Query's `data`. See [Reading without Suspense](./comparison.md#reading-without-suspense).

## @raf-query/react

Everything from `@raf-query/core`, plus:

| Export                                | Use                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HydrationBoundary`                   | Writes server data into the client: a loader's `state`, or in server components the request's `client`. [React Server Components](./react-server-components.md) · [React Router](./react-router.md)                                                                                     |
| `QueryClientProvider`                 | Provides a client to the tree                                                                                                                                                                                                                                                           |
| `QueryProvider`                       | Provider for React Server Components apps: a client per server render and per browser tab; its server render starts no request. [React Server Components](./react-server-components.md)                                                                                                 |
| `useQueryClient()`                    | Read the client                                                                                                                                                                                                                                                                         |
| `useQuery(factory, handle, options?)` | `[Thenable<Data>, controls]`, or `[Data, controls]` for a `QueryHandleWithData`; Effect `queryFn`s with `throwOnError: false` (the call's, else the query's, else the client's: default with a `layer`) yield `Result<Data, ErrorOf>` instead. Paged: `Data` is `{ pages, pageParams }` |
| `useWaterfall(factory, input)`        | Start a query during render and return its handle. [Request waterfalls](./request-waterfalls.md#render-time-inputs-usewaterfall)                                                                                                                                                        |
| `useIsFetching(filter?)`              | Global in-flight count (compatibility). Prefer router pending + per-query `isFetching`. [Background fetching indicators](./background-fetching-indicators.md)                                                                                                                           |

Subpath entries:

| Entry                              | Use                                                              |
| ---------------------------------- | ---------------------------------------------------------------- |
| `@raf-query/react/tanstack-router` | `setupRouterIntegration`. [TanStack Start](./tanstack-start.md)  |
| `@raf-query/react/devtools`        | `QueryDevtools`, `QueryDevtoolsPanel`. [Devtools](./devtools.md) |

## @raf-query/core

Framework-agnostic: the Promise `QueryClient` and the Effect cache behind it.

| Export                                                       | Use                                                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `QueryClient`                                                | The cache with Promise methods ([above](#queryclient))                                                                      |
| `allKeyed(record)`                                           | Await a record of promises, keeping keys                                                                                    |
| `dehydrate(client)` / `hydrate(client, state)`               | Low-level cache transfer used by the integrations                                                                           |
| `QueryCache`                                                 | The cache service (`qc.effect`): `make`, `layer`, and the verbs as Effects                                                  |
| `Query`                                                      | Cache entries: `Query.fetch`, `Query.changes`, `Query.getUnsafe`, `Query.metaUnsafe`, …                                     |
| `QueryObserver`                                              | One reader's view of a query, with tracked results; for bindings                                                            |
| `Platform`                                                   | The page the cache watches (focus, network); swap it in tests                                                               |
| `queryOptions(options)`                                      | Typed options for a query factory                                                                                           |
| `infiniteQueryOptions(options)`                              | Typed options for a paged query factory                                                                                     |
| `hashKey(key)`, `matchesKey(key, prefix)`                    | Key helpers                                                                                                                 |
| `canDehydrate(query)`                                        | The default dehydrate filter: entries with data or a request in flight                                                      |
| `Query.CancelledError`                                       | Failure of an Effect request whose entry was removed before it settled. Promise verbs reject with an `AbortError` instead   |
| `Query.DisabledError`                                        | Why a query with `enabled: false` has no data: `ensure` / `fetch` fail with it, and on a server its promise rejects with it |
| `RedactedError`                                              | What a streamed pending query rejects with when its server request failed                                                   |
| `QueryHandle<TFactory>`                                      | Handle type for props fed by `prefetch`: `{ key, input }`                                                                   |
| `QueryHandleWithData<TFactory>`                              | What `ensure` and `fetch` return: a `QueryHandle` plus the `data` they waited for                                           |
| `Thenable<T>`                                                | Promise with `status` / `value` / `reason`, read by `use()` or [without Suspense](./comparison.md#reading-without-suspense) |
| `QueryOptions`, `InfiniteQueryOptions`, `InfiniteData`       | Typed by a bag: `QueryOptions<{ data: Post }>`. Effect `queryFn`s add `error` and `services`; `key` is the key's shape      |
| `DataOf<TFactory>`, `InputOf<TFactory>`, `ErrorOf<TFactory>` | A factory's data, input and error types                                                                                     |
| `ServicesOf<TFactory>`                                       | The services a factory's `queryFn` Effect needs; `never` for promises                                                       |
| `Register`, `QueryMeta`                                      | Augment `Register` with `queryMeta` to type [`meta`](./query-meta.md)                                                       |
