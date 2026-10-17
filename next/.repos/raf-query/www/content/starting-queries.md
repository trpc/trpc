---
title: Starting queries
description: "prefetch, ensure and fetch: what each returns, what it waits for, and how to choose between granular skeletons and a blocked navigation."
section: Guides
order: 5
---

Queries start where the page's inputs are known: a route loader, a server component, or an event handler. All three verbs live on the query client and take a factory plus its input. They differ in what they return and what they wait for:

| Call                          | Returns                        | Cache miss            | Stale data                                    | TanStack Query                                                                                                                                         |
| ----------------------------- | ------------------------------ | --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `qc.prefetch(factory, input)` | `QueryHandle`                  | Starts the request    | Refetches in the background                   | [`prefetchQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient#prefetchquery), not awaited                     |
| `qc.ensure(factory, input)`   | `Promise<QueryHandleWithData>` | Waits for the request | Resolves at once, refetches in the background | [`ensureQueryData({ revalidateIfStale: true })`](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient#ensurequerydata) |
| `qc.fetch(factory, input)`    | `Promise<QueryHandleWithData>` | Waits for the request | Waits for the refetch                         | [`fetchQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient#fetchquery)                                        |

Fresh cached data is reused by all three, without a request. So `prefetch` never holds anything up, `ensure` holds up only the first visit (returning to a page shows the cached data at once, then fresh data), and `fetch` always returns fresh data, at the cost of a round trip whenever the cache is stale. That difference needs a client that keeps its cache between navigations, as a TanStack Router loader's or a client-only React Router `clientLoader`'s does. Code that only runs on the server has none: see [Server-only code](#server-only-code).

`ensure` and `fetch` return the same thing: the handle `prefetch` returns, plus the `data` they waited for. See [Handles](./handles.md).

```sample
tanstack-start/src/routes/posts.$slug.tsx#route
```

## prefetch or ensure?

Neither is faster: both start the request at the same moment. The difference is what the user sees while it loads:

- **`prefetch` navigates now.** The new page renders at once, and each part still waiting for data shows its nearest [Suspense](https://react.dev/reference/react/Suspense) fallback.
- **`ensure` navigates when the data is in.** Until then the previous page stays on screen. In TanStack Router, a route's [`pendingComponent`](https://tanstack.com/router/latest/docs/guide/data-loading#showing-a-pending-component) replaces it after `pendingMs` (1 second by default).

Choose per query: `ensure` what the page can't lay out without (the post itself), and `prefetch` the rest (comments, sidebars, counts).

```demo
starting-queries
```

> [!IMPORTANT]
> Start every query before awaiting any of them, as the `prefetch` before the `await` above does, so a blocking query never delays the others.

## Awaiting several queries

Await independent blocking queries together with `allKeyed`, which ships with raf-query. It's a ponyfill of the TC39 [`Promise.allKeyed` proposal](https://github.com/tc39/proposal-await-dictionary): a record of promises in, a promise of the same record out, rejecting on the first failure.

```sample
tanstack-start/src/docs/starting-queries.ts#awaiting-several-queries
```

## When to use fetch

`fetch` is `ensure` that also waits on stale data. Use it when the code that starts the query needs the data to be fresh, not just present:

- a loader that must branch on the data, such as a redirect
- outside React, in scripts and tests

In a browser loader, prefer `ensure`: a stale `fetch` blocks the navigation on the refetch, while a stale `ensure` renders the cached data at once and updates when the refetch lands. TanStack Router hides the difference while it still holds the route's last loader data: it renders that and reruns the loader in the background, unless the loader's [`staleReloadMode`](https://tanstack.com/router/latest/docs/guide/data-loading#choosing-background-vs-blocking-stale-reloads) is `"blocking"`, as in the [demo](#prefetch-or-ensure). There, open a post, go back, and reopen it once its cache is stale.

## Server-only code

React server components and React Router's [`loader`](https://reactrouter.com/start/framework/data-loading#server-data-loading) run only on the server, for every navigation, and each request gets a new client. Its cache starts empty, so every query is a cache miss, and a server client never refetches data it already has (see [Behavior](#behavior)). There, `ensure` and `fetch` wait for the same request every time, and returning to a page waits again.

Use `prefetch` and `fetch` in that code, not `ensure`: `prefetch` for what can stream in behind a Suspense fallback, `fetch` for what the page can't lay out without or the code needs to branch on. See [React Server Components](./react-server-components.md#pages) and [React Router](./react-router.md#server-loaders).

A client-only React Router app is different: its [`clientLoader`](https://reactrouter.com/start/framework/data-loading#client-data-loading)s run in the browser on the tab's client, which keeps its cache between navigations, so there `ensure` holds up only the first visit, as in TanStack Router. See [React Router](./react-router.md#client-loaders).

## Behavior

- Every verb dedupes against the cache: a request already in flight for the entry is joined, not repeated.
- Loaders run on every navigation (TanStack Router reruns them when [its own `staleTime`](https://tanstack.com/router/latest/docs/guide/data-loading#using-staletime-to-control-how-long-data-is-considered-fresh) has passed, `0` by default), so returning to a page shows what's cached at once and then fresh data. With [`defaultPreload: "intent"`](https://tanstack.com/router/latest/docs/guide/preloading), also set [`defaultPreloadStaleTime: 0`](https://tanstack.com/router/latest/docs/guide/preloading#built-in-preloading-freshness-and-retention): otherwise the router reuses a hover's preload for 30 seconds instead of running the loader on click, and the query cache never hears about the navigation.
- On the server, cached data is always reused, whatever `staleTime` says. Entries marked by `invalidate` still refetch.
- A [browser-only query](./ssr-and-hydration.md#browser-only-queries) never runs on the server: use `prefetch` there, not `ensure` or `fetch`.
- A failed `prefetch` never throws out of the loader. The error surfaces where the data is read, and is reported to the client's `onError`.
- A failed `ensure` or `fetch` rejects, so it reaches the route's error boundary.

## Preloading on intent

Outside loaders, call the client directly. Starting a query when the pointer enters a link means the click finds it cached or in flight:

```sample
tanstack-start/src/docs/starting-queries.tsx#preloading-on-intent
```

With TanStack Router's `defaultPreload: "intent"` you get this for free: hovering a link runs its loader, which starts its queries.

Paged factories accept a third argument on `ensure` and `fetch`: `{ pages: n }` loads the first `n` pages up front. See [Infinite queries](./infinite-queries.md).
