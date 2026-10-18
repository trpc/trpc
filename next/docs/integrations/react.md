---
title: React and Next.js
description: Which package to fetch with in React, and the pages for server components, Server Actions and route handlers.
section: Integrations
order: 2
v11: client/nextjs
---

React has three ways to fetch, and the server side of an RSC app has three more pieces. Pick one way to fetch; the server pieces work with any of them.

## Fetching in components

| Package                                                           | Model                                                                                    | Stability    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------ |
| [`@trpc12/tanstack-react-query`](./tanstack-query/react.md)       | TanStack Query's options, cache and devtools, with `useTrpc()` and `useSubscription`     | stable       |
| [`@trpc12/experimental-react`](./experimental-react.md)           | Loaders start queries and components read them with `use()`; cache features are links    | experimental |
| [`@trpc12/experimental-react-atom`](./experimental-react-atom.md) | Queries, mutations and subscriptions as Effect atoms, typed with each procedure's errors | experimental |

Start with TanStack Query unless you already use Effect Atom, or want Suspense without a query cache.

## On the server

- [React Server Components](./rsc.md): `createTrpcRsc` from `@trpc12/tanstack-react-query/rsc` prefetches in server components, streams pending queries to the browser, and tags Next's data cache by query key.
- [Server Actions](./server-actions.md): `experimental_createAction` from `@trpc12/trpc/actions` turns procedures into actions that take typed input or `FormData`, for `useActionState` and optimistic updates.
- Route handlers serve the router with `handler.fetch`, as in any fetch runtime ([Fetch runtimes](../adapters/fetch.md)).

None of these is Next-specific: they work with any React Server Components setup.
