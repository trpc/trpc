---
title: TanStack Start
description: Set up raf-query with TanStack Router and Start, start queries in loaders, stream them during SSR and handle redirects.
section: Integrations
order: 1
---

TanStack Router's loaders are where raf-query wants queries to start, and its SSR streaming is what carries the cache to the browser. The integration is one function call.

## Setup

```sample
tanstack-start/src/router.tsx
```

Mount DevTools only when `import.meta.env.DEV` is true so Vite drops the panel from production builds. The [example app](./examples.md) always renders it, so the panel stays available in the deployed demo.

Type the router context in the root route, so loaders see `queryClient`:

```sample
tanstack-start/src/routes/__root.tsx
```

`getRouter` runs once per request on the server and once in the browser, so each request gets its own client and the browser keeps one for the session.

## What the integration does

`setupRouterIntegration`:

- **Streams queries during SSR.** Entries go to the browser as they settle, through the router's own stream. Pending queries cross as promises.
- **Clears the request's cache** when the response finishes.
- **Turns `redirect()` thrown from a `queryFn` into a navigation**, wherever the query failed: a loader, a render or a background refetch in the browser.

Options:

| Option             | Use                                                            |
| ------------------ | -------------------------------------------------------------- |
| `dehydrateOptions` | `filter` which entries are sent, `keepErrors`, `serializeData` |
| `hydrateOptions`   | `deserializeData`, the counterpart of `serializeData`          |
| `handleRedirects`  | `false` to handle redirects yourself                           |

## Loaders

A loader starts every query its route needs and returns the handles:

```sample
tanstack-start/src/routes/posts.$slug.tsx
```

See [Starting queries](./starting-queries.md) for choosing between `prefetch` and `ensure`.

### Handles in route context

`beforeLoad` can return handles too. They're part of the route context, so child routes' loaders and components read them, and the router serializes them to the browser with the rest of the context:

```sample
tanstack-start/src/routes/_auth.tsx
```

```sample
tanstack-start/src/routes/_auth.dashboard.tsx#dashboard
```

Importing `@raf-query/react/tanstack-router` registers handles as serializable, so Start's type check of `beforeLoad`'s return accepts them.

### Router settings

- **`defaultPreload: "intent"`** runs a route's loader when the user hovers or focuses a link, so the queries start before the click.
- **`defaultPreloadStaleTime: 0`** makes the router run the loader again on click. Otherwise it reuses a hover's preload for 30 seconds, and the query cache never hears about the navigation. The query cache dedupes, so running the loader again is free when the data is fresh.

### Pending UI

While a loader's `ensure` is still running, the previous page stays on screen. Show that a navigation is in progress with the router — not [`useIsFetching`](./background-fetching-indicators.md#useisfetching):

- **`pendingComponent` and `pendingMs`** show a full-page skeleton after the delay (1 second by default) for routes whose loader `ensure`s slow data.
- **`useRouterState({ select: (state) => state.isLoading })`** drives a progress bar or spinner in the layout for any pending navigation:

```sample
tanstack-start/src/docs/tanstack-start.tsx#pending-ui
```

Per-query background refetches after the page has rendered use `controls.isFetching`. See [Background fetching indicators](./background-fetching-indicators.md).

### Search params

Use `loaderDeps` to pass validated search params to the loader, so it reruns when they change. See [URL state and pagination](./url-state-and-pagination.md).

## Server and browser requests

A loader runs on the server during SSR and in the browser after, so a factory's `queryFn` runs in both.

### Server functions

Factories can call server functions (`createServerFn`) directly, and get both sides for free. During SSR the call is a function call that sees the page request; in the browser, refetches call the same function over HTTP, with the browser's cookies.

```sample
tanstack-start/src/queries.ts#post-query
```

### Your own API

A factory that calls an API needs the user's cookies on both sides. The browser sends them; during SSR, forward the page request's:

```sample
tanstack-start/src/forwarded-headers.ts
```

- Send `forwardedHeaders()` with each request: Hono's `hc` and tRPC's and oRPC's links take a `headers` function.
- Forward only what the API reads (`cookie`, `authorization`), not every header.
- For an API in the same app, call it in the process during SSR instead of over HTTP to your own origin. [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) picks an in-process client on the server and an HTTP one in the browser with a `browser` export condition, so the API's code stays out of the browser bundle.

## Static prerendering

These docs are a TanStack Start app, prerendered to static HTML. Every page's loader `ensure`s its content during the build, the content crosses in the page's HTML, and later navigations load it in the browser. See the [source](https://github.com/KATT/raf-query/tree/main/www).

## Example

[`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) is a complete issue tracker: lists with filters and infinite scroll, details with comments, and mutations with optimistic updates.
