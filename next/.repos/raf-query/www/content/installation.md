---
title: Installation
description: Install @raf-query/react and effect with npm, pnpm, Yarn or Bun.
section: Getting started
order: 2
---

Apps install one package, `@raf-query/react`. It re-exports everything from `@raf-query/core`, so you never import core directly.

```bash
npm install @raf-query/react effect
# or
pnpm add @raf-query/react effect
# or
yarn add @raf-query/react effect
# or
bun add @raf-query/react effect
```

## Requirements

- **React 19.2 or newer.** raf-query reads data with `use()` and relies on transitions, Actions and `useOptimistic`.
- **`effect` 4.x** as a peer dependency. The cache is written in [Effect](https://effect.website), but an app that doesn't use Effect never imports it: `queryFn`s return promises, and the client, hooks and integrations speak promises. An app that does use Effect shares one copy with raf-query.
- **Node.js 22 or newer** for server rendering.

## Framework integrations

The TanStack Router integration and the devtools are subpath exports of the same package, so there is nothing else to install:

| Import                             | For                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `@raf-query/react/tanstack-router` | [TanStack Start and TanStack Router](./tanstack-start.md) SSR streaming |
| `@raf-query/react/devtools`        | The [devtools](./devtools.md) panel; omit the element to tree-shake it  |

[React Server Components](./react-server-components.md) apps, such as the Next.js App Router, and [React Router Framework Mode](./react-router.md) need no subpath: `QueryProvider` and `HydrationBoundary` come from `@raf-query/react`.

`@tanstack/react-router` is an optional peer: only apps that import `/tanstack-router` need it.

## TypeScript

raf-query is written in TypeScript and ships its types. Query data, inputs and errors are inferred from your [query factories](./query-factories.md), so most apps never write a type argument. TypeScript 5.5 or newer with `strict` is recommended.

Next, build your first page in the [quick start](./quick-start.md).
