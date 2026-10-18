---
title: Integrations
label: Overview
description: Data fetching for every TanStack Query framework, React and Next.js, and the libraries tRPC works with.
section: Integrations
order: 0
---

The core client works anywhere ([The client](../client/overview.md)). These pages cover the packages and recipes that fit it into a framework or a library.

## Data fetching

[TanStack Query](./tanstack-query.md) is the stable way to fetch in a UI: `@trpc12/tanstack-query` makes query, mutation and subscription options, and a package per framework provides the client to components.

- Frameworks: [React](./tanstack-query/react.md), [Preact](./tanstack-query/preact.md), [Vue](./tanstack-query/vue.md), [Solid](./tanstack-query/solid.md), [Svelte](./tanstack-query/svelte.md), [Angular](./tanstack-query/angular.md) and [Lit](./tanstack-query/lit.md).
- Topics: [query keys and filters](./tanstack-query/keys.md), [subscriptions](./tanstack-query/subscriptions.md), [streamed mutations](./tanstack-query/streamed-mutations.md), [hydration and offline mutations](./tanstack-query/hydration.md) and [TanStack DB](./tanstack-query/tanstack-db.md).

## React and Next.js

[React and Next.js](./react.md) compares the ways to fetch in React, and covers the server side:

- [React Server Components](./rsc.md): prefetch in server components, stream pending queries to the browser, and tag Next's data cache by query key.
- [Server Actions](./server-actions.md): procedures as Server Actions that take typed input or `FormData`.
- [React without TanStack Query](./experimental-react.md): render-as-you-fetch with `use()` and Suspense, where cache features are links. Experimental.
- [React atoms](./experimental-react-atom.md): query, mutation and subscription atoms on Effect Atom. Experimental.

## Libraries

- [AI SDK](./ai-sdk.md): stream `useChat` responses from a procedure, and give procedures to the model as tools.
- [Better Auth](./better-auth.md): read the session in a middleware and type `ctx.user` with Better Auth's user.
- [NestJS](./nestjs.md): serve a contract from Nest controllers with `@trpc12/nest`.
