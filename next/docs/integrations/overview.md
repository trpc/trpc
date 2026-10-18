---
title: Integrations
label: Overview
description: Data fetching for every TanStack Query framework, React and Next.js, and the libraries tRPC works with.
section: Integrations
order: 0
---

The core client works anywhere ([The client](../client/overview.md)). These pages cover the packages and recipes that fit it into a framework or a library.

## Data fetching

- [TanStack Query](./tanstack-query.md): query, mutation and subscription options for React, Preact, Vue, Solid, Svelte, Angular and Lit, with streamed mutations, offline mutations, TanStack DB and hydration. This is the stable way to fetch in a UI.
- [React without TanStack Query](./experimental-react.md): render-as-you-fetch with `use()` and Suspense, where cache features are links. Experimental.
- [React atoms](./experimental-react-atom.md): query, mutation and subscription atoms on Effect Atom. Experimental.

## React and Next.js

- [React Server Components](./rsc.md): prefetch in server components, stream pending queries to the browser, and tag Next's data cache by query key.
- [Server Actions](./server-actions.md): procedures as Server Actions that take typed input or `FormData`.
- Route handlers serve the router with `handler.fetch` ([Fetch runtimes](../adapters/fetch.md)).

## Libraries

- [AI SDK](./ai-sdk.md): stream `useChat` responses from a procedure, and give procedures to the model as tools.
- [Better Auth](./better-auth.md): read the session in a middleware and type `ctx.user` with Better Auth's user.
- [NestJS](./nestjs.md): serve a contract from Nest controllers with `@trpc12/nest`.

For OpenAPI tools and REST clients, see [OpenAPI](../openapi/overview.md).
