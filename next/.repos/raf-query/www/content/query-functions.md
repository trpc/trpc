---
title: Query functions
description: What a queryFn may return, how errors are reported, and what the query function context contains.
section: Guides
order: 3
---

A query function can be literally any function that **returns a value, a promise, or an [Effect](./effect.md)**. The promise should either **resolve the data** or **throw an error**.

Unlike TanStack Query, `undefined` is a valid result: a `queryFn` typed `Promise<User | undefined>` caches `undefined` like any other value. So `getData` and a `setData` updater's `previous` are `undefined` both with no data and with `undefined` data; `Query.getUnsafe(qc.getQuery(factory, input)).hasData` tells them apart.

All of these are valid:

```sample
tanstack-start/src/docs/query-functions.ts#intro
```

In practice the `queryFn` lives in a [factory](./query-factories.md) and closes over the factory's input, which is easier to type than reading it back from the key.

## Handling and throwing errors

For raf-query to know a query failed, the query function **must throw** or return a **rejected promise**. The error is kept on the query: the first load's error rejects the promise `useQuery` returns, so `use()` throws it to the nearest error boundary, and a later background error shows up in `controls.error` while the old data stays readable.

```sample
tanstack-start/src/docs/query-functions.ts#handling-and-throwing-errors
```

Failed requests are [retried](./retries.md) three times before they count as failed.

## With `fetch` and other clients that don't throw

Many clients, such as axios, throw for unsuccessful HTTP responses. `fetch` doesn't, so throw yourself:

```sample
tanstack-start/src/docs/query-functions.ts#with-fetch-and-other-clients-that-dont-throw
```

A not-found is often better as a value than an error: return `null` and let the page decide, or throw your router's `notFound()` from the `queryFn` so the route renders its not-found component.

## The query function context

Each `queryFn` receives a context object:

- `queryKey: QueryKey`, the query's [key](./query-keys.md)
- `signal: AbortSignal`, aborted when the request is cancelled. Pass it to `fetch` so [cancelled requests](./query-cancellation.md) stop using the network.
- `meta: QueryMeta | undefined`, the query's [`meta`](./query-meta.md)

[Paged queries](./infinite-queries.md) also get:

- `pageParam`, the page to load
- `direction: "forward" | "backward"`, which end of the list the page is added to

## Redirects

In TanStack Start, a `queryFn` can `throw redirect({ to: "/login" })`. The router integration turns it into a navigation, from a loader or from a background refetch. Pass `handleRedirects: false` to `setupRouterIntegration` to handle them yourself.
