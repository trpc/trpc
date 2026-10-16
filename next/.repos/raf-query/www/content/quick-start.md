---
title: Quick start
description: Set up a QueryClient, define a query factory, start it in a TanStack Start loader and read it with useQuery and use().
section: Getting started
order: 3
---

This walks through the three core concepts of raf-query on [TanStack Start](https://tanstack.com/start):

- **Query factories**, which describe a query once
- **Starting queries** in a loader, which hands components a handle
- **Reading queries** with `useQuery` and `use()`

For the Next.js App Router, the same steps apply with a server component in place of the loader: see [React Server Components](./react-server-components.md). For React Router Framework Mode, see [React Router](./react-router.md).

## 1. Create the client

Create one `QueryClient` per router. On the server, `getRouter` runs once per request, so each request gets its own cache; in the browser it runs once per tab.

```sample
tanstack-start/src/router.tsx
```

`setupRouterIntegration` streams the server's cache to the browser while the page renders, so data loaded on the server is never fetched twice. In development, [DevTools](./devtools.md) show what's in the cache. Give the root route the client's type:

```sample
tanstack-start/src/routes/__root.tsx
```

## 2. Define a query

A query is a **factory**: a function of at most one argument that returns `queryOptions(...)`. The argument is the query's input. Loaders and components call the same factory, so the data's type flows end to end.

```sample
tanstack-start/src/queries.ts#todos
```

## 3. Start it in the loader

The loader starts the query and returns its **handle**, a small `{ key, input }` object:

```sample
tanstack-start/src/routes/todos.tsx#loader
```

`prefetch` starts the request and returns immediately, so the page renders while the data is on its way. Use `ensure` instead when the page can't lay out without the data: the navigation then waits for it. [Starting queries](./starting-queries.md) covers the trade-off.

## 4. Read it in a component

```sample
tanstack-start/src/routes/todos.tsx#component
```

`useQuery` returns a stable promise and the query's controls. `use()` suspends until the data is there, then returns it; once the cache has data, the promise is already resolved and `use()` returns synchronously.

## 5. Write data with an Action

There is no `useMutation`. Write in a form action, then invalidate what changed:

```sample
tanstack-start/src/components/add-todo.tsx#add-todo
```

`await qc.invalidate(...)` resolves once every query being read has refetched, so the form stays pending until the new todo is on screen. See [Mutations](./mutations.md) for optimistic updates and errors.

## What you get for free

Out of the box the cache dedupes requests, retries failures, refetches stale data when the window regains focus, garbage-collects unused entries and keeps unchanged data referentially stable. Read [Important defaults](./important-defaults.md) next: they explain when raf-query fetches and when it doesn't.
