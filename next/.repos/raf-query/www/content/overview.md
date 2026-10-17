---
title: Overview
description: What raf-query is, the principles behind it, and how it relates to TanStack Query.
section: Getting started
order: 1
---

raf-query is a data-fetching library for React built around **render-as-you-fetch**. Queries start in route loaders and React Server Components, travel to components as small serializable **handles**, and are read with React's `use()` under Suspense. Fetch-on-render is an explicitly named escape hatch, not the default.

The cache's mechanics (dedupe, staleness, retries, infinite paging, SSR hydration) follow [TanStack Query](https://tanstack.com/query). The public API is built around loaders, RSC and `use()` instead of `useQuery`-in-render.

> [!NOTE]
> raf-query is early. Both packages are on npm at `0.x`, and the API can still change between minor releases.

## Motivation

Most React data fetching starts in a component: it renders, notices it needs data, and asks for it. Every nested component that does the same adds a round trip, so a page with a post, its comments and its author waits for three requests one after another. That's a **waterfall**, and it's the default shape of fetch-on-render code.

React's own guidance is to start fetching before rendering: in the router's loader, or in a server component. The page knows everything it needs from the URL, so every request can start at once, and components read the results as they arrive. raf-query is a cache shaped around that flow:

- The **loader** (or server component) starts queries with `prefetch`, `ensure` or `fetch`.
- It passes **handles** to components. A handle is a key and an input, plus the data once `ensure` or `fetch` has loaded it, so it serializes for free.
- Components call `useQuery(factory, handle)`. It returns the data for a handle the loader waited for, and a promise to unwrap with `use()` for one it didn't. Suspense boundaries decide what shows while data is on its way.

## Principles

- **Fetch where React recommends.** Loaders and server components start queries. Components read them.
- **Promises in, `use()` out.** The read hook returns a stable promise; components unwrap it with `use()`, so reads can be conditional or happen in a child.
- **The URL is the input.** Anything that changes what a query fetches (filters, sort, page) lives in path or search params, so the loader starts the right query on every navigation. Components never derive query input from local state.
- **Actions for writes.** Mutations are plain async functions in form actions or transitions. The cache provides invalidation, React provides pending and optimistic state.

## A taste

```sample title="src/queries.ts"
tanstack-start/src/docs/overview.ts#a-taste
```

```sample title="src/routes/posts.$slug.tsx"
tanstack-start/src/docs/overview.route.tsx#a-taste
```

The loader decides when the request starts and whether navigation waits for it; the component only reads. Try both strategies:

```demo
starting-queries
```

## Packages

| Package            | Contents                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@raf-query/core`  | Framework-agnostic: `QueryClient` (the cache with Promise methods), its Effect `QueryCache`, `queryOptions` / `infiniteQueryOptions`, handles, `allKeyed`, dehydrate / hydrate |
| `@raf-query/react` | Hooks, providers, `HydrationBoundary`. Re-exports `@raf-query/core`, so apps import only this package                                                                          |

`@raf-query/react` has subpath entries for framework integrations and tooling:

| Entry                              | Use                                                       |
| ---------------------------------- | --------------------------------------------------------- |
| `@raf-query/react/tanstack-router` | Streams the router's query cache to the client during SSR |
| `@raf-query/react/devtools`        | [Devtools](./devtools.md) panel for inspecting the cache  |

## Where next

- [Installation](./installation.md) and the [quick start](./quick-start.md) get an app running.
- [Coming from TanStack Query](./comparison.md) maps what you know onto raf-query.
- The guides start with [important defaults](./important-defaults.md), and each one has live demos you can poke at.
- [What belongs in the cache](./client-state.md) covers backend data, browser-only queries, URL state and local UI state.
