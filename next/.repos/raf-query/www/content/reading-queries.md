---
title: Reading queries
description: useQuery returns a stable promise and tracked controls; unwrap the promise with use() under Suspense, or pass it down to a child.
section: Guides
order: 7
---

Components read queries with `useQuery`, passing the factory and the handle the loader returned:

```sample
tanstack-start/src/docs/reading-queries.ts#intro
```

`promise` is a stable `Thenable<Data>` owned by the cache: a `Promise` that also carries its `status`, `value` and `reason`. Unwrap it with `use()`. When the cache already has data, the promise is pre-resolved and `use()` returns synchronously without suspending.

A handle from `ensure` or `fetch` had its data loaded before the route rendered, so `useQuery` returns the data itself. See [Handles](./handles.md#typed-by-what-the-loader-did) for typing the props that receive one.

```sample
tanstack-start/src/docs/reading-queries.tsx#post-page
```

`options` takes [`whilePending`](./url-state-and-pagination.md) and per-read refetch settings (`refetchInterval`, `refetchOnWindowFocus`, `refetchOnReconnect`). There is no option to change the input: the handle decides what is read.

## Controls

| Field          | Meaning                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| `isPending`    | No data yet for the handle's input; `use(promise)` will suspend                                         |
| `isPrevious`   | The promise holds data for a previous input while the handle's input loads (`whilePending: "previous"`) |
| `isFetching`   | A request is in flight: first load, new input, or background refetch                                    |
| `isStale`      | Data is older than `staleTime`, or was invalidated                                                      |
| `error`        | Error from a failed background refetch. Existing data stays readable                                    |
| `updatedAt`    | When the data in the promise was fetched                                                                |
| `key`, `input` | Key and input of the data in the promise. They differ from the handle's while `isPrevious` is true      |
| `hash`         | Stable string form of the handle's key, for `key` props on Suspense boundaries                          |
| `refetch()`    | Refetch now. Returns a promise, so it can be awaited inside a transition or action                      |

Paged factories add `fetchNextPage()`, `fetchPreviousPage()`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage` and `isFetchingPreviousPage`. See [Infinite queries](./infinite-queries.md).

## Updates never suspend

When the cache updates — refetch, invalidation, `setData` — the hook returns a new, pre-resolved promise and the component re-renders without suspending. New data is structurally shared with the old: a refetch that returns equal data keeps the same promise, so nothing re-renders. See [Render optimizations](./render-optimizations.md).

## Errors

When the **first** load fails, the promise rejects and `use()` throws to the nearest error boundary. Resetting that boundary refetches the query. A failed **background** refetch doesn't throw: the old data stays on screen and `controls.error` holds the error, so the component can show it next to the data. [Retries](./retries.md) has a demo of both.

Effect `queryFn`s can return a typed `Result` in the first tuple slot instead of rejecting — see [Typed errors](./effect-errors.md#in-react).

## Passing promises down

A component can call the hook with a prefetched handle and hand the promise to a child, so only the child suspends:

```sample
tanstack-start/src/docs/reading-queries.passing-promises-down.tsx#passing-promises-down
```

A component re-renders when the promise changes, and when a control it reads changes. Controls it never reads, like `isFetching` here, don't re-render it, so a parent that only passes the promise down stays put during background refetches.

Because `use()` can be called conditionally, a component can also decide **whether** to read:

```sample
tanstack-start/src/docs/reading-queries.tsx#details
```

## No refetch on mount

`useQuery` never refetches on mount: whatever started the query decides. Stale data refetches when a loader or server component starts the query again, when `useWaterfall` mounts, when invalidated, on window focus or reconnect, on `refetch()`, or on `refetchInterval`.

That means rendering the same handle in many components is free: they share one entry and one request. See [Background fetching indicators](./background-fetching-indicators.md) to show when a refetch is running.
