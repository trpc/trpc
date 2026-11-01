---
title: Integrations
label: Overview
description: Data fetching with TanStack Query, and React and Next.js on the server.
section: Integrations
order: 0
---

The core client works anywhere ([The client](../client/overview.md)). These pages cover the packages that fit it into a framework.

## Data fetching

[TanStack Query](./tanstack-query.md) is the stable way to fetch in a UI: `@trpc12/tanstack-query` makes query, mutation and subscription options, and [`@trpc12/tanstack-react-query`](./tanstack-query/react.md) provides the client to React components.

- Topics: [query keys and filters](./tanstack-query/keys.md), [subscriptions](./tanstack-query/subscriptions.md), [streamed mutations](./tanstack-query/streamed-mutations.md) and [hydration and offline mutations](./tanstack-query/hydration.md).

## React and Next.js

[React and Next.js](./react.md) covers fetching in React and the server side:

- [React Server Components](./rsc.md): prefetch in server components, stream pending queries to the browser, and tag Next's data cache by query key.
- [Server Actions](./server-actions.md): procedures as Server Actions that take typed input or `FormData`.
