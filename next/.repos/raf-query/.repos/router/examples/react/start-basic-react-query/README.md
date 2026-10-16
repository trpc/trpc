# TanStack Start - Basic React Query Example

A TanStack Start example demonstrating integration with TanStack Query (React Query).

- [TanStack Router Docs](https://tanstack.com/router)
- [TanStack Query Docs](https://tanstack.com/query)

## Start a new project based on this example

To start a new project based on this example, run:

```sh
npx gitpick TanStack/router/tree/main/examples/react/start-basic-react-query start-basic-react-query
```

## Getting Started

From your terminal:

```sh
pnpm install
pnpm dev
```

This starts your app in development mode, rebuilding assets on file changes.

## Build

To build the app for production:

```sh
pnpm build
```

## TanStack Query Integration

This example demonstrates how to use TanStack Query with TanStack Start for:

- Server-side data fetching
- Client-side caching and synchronization
- Confirmed server mutations followed by query invalidation
- Explicit freshness and automatic refetching

## SSR and mutation checks

Read the [Start + TanStack Query guide](https://tanstack.com/start/latest/docs/framework/react/guide/tanstack-query). The `/preferences` page stores a harmless display name in a cookie, so its tests need no account or external API. This cookie is not authentication. The other post/user examples use JSONPlaceholder.

```sh
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
QUERY_EXAMPLE_PRODUCTION=1 pnpm test:e2e
```

The tests check concurrent SSR request isolation, no duplicate hydration read, one refetch after mutation invalidation, and persistence on reload. Query data is fresh for 30 seconds by default in this example; choose a window appropriate for your application.
