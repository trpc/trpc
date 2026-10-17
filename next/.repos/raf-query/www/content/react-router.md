---
title: React Router
description: "Client-only apps start queries in clientLoader on the tab's client; server-rendered apps start them in loader, dehydrate the cache, and hydrate it with HydrationBoundary."
section: Integrations
order: 3
---

React Router apps load data in one of two places, and raf-query fits each differently. Find yours, then read its section. Each one stands on its own:

- **[Client-only](#client-only-apps)**: [SPA Mode](https://reactrouter.com/how-to/spa) (`ssr: false`) with [`clientLoader`](https://reactrouter.com/start/framework/data-loading#client-data-loading), or [Data Mode](https://reactrouter.com/start/modes#data)'s [`createBrowserRouter`](https://reactrouter.com/api/data-routers/createBrowserRouter). Loaders run in the browser, on the tab's one `QueryClient`, and nothing is hydrated. `prefetch`, `ensure` and `fetch` work as in [Starting queries](./starting-queries.md).
- **[Server rendering](#server-rendering)**: [Framework Mode](https://reactrouter.com/start/modes#framework) with [`ssr: true`](https://reactrouter.com/api/framework-conventions/react-router.config.ts#ssr) (the default) and [`loader`](https://reactrouter.com/start/framework/data-loading#server-data-loading). Loaders run on the server with one `QueryClient` per request, which a root middleware creates, and dehydrate it into the loader data. `HydrationBoundary` writes it into the browser's client. Use `prefetch` and `fetch` there: `ensure` waits like `fetch`.

If you can choose the router, prefer [TanStack Start](./tanstack-start.md). A link preloaded on hover runs its route's loaders in the browser, so the next page's queries start in the browser's cache and the click uses them. React Router's `prefetch="intent"` doesn't: see [Prefetching links](#prefetching-links).

## Client-only apps

### SPA Mode

Turn off server rendering with [`ssr: false`](https://reactrouter.com/api/framework-conventions/react-router.config.ts#ssr):

```sample
react-router-spa/react-router.config.ts#config
```

Create the tab's `QueryClient` in a module, so loaders can import it, and provide it in the root route. Its [`HydrateFallback`](https://reactrouter.com/start/framework/route-module#hydratefallback) is what the page shows until the first `clientLoader` is done:

```sample
react-router-spa/app/query-client.ts#query-client
```

```sample
react-router-spa/app/root.tsx#app
```

Mount DevTools only when [`import.meta.env.DEV`](https://vite.dev/guide/env-and-mode#built-in-constants) is true so Vite drops the panel from production builds.

### Client loaders

Each `clientLoader` starts its queries on that client and returns the handles. There is no snapshot to dehydrate and no `HydrationBoundary`: the queries are already in the client the components read.

```sample
react-router-spa/app/routes/posts.$slug.tsx#loader
```

```sample
react-router-spa/app/routes/posts.$slug.tsx#component
```

```sample
react-router-spa/app/components/comments.tsx#component
```

- The client outlives navigations, so the verbs differ as in [Starting queries](./starting-queries.md#prefetch-or-ensure): `ensure` holds up only the first visit, and returning to a page shows the cached data at once, then refetches it behind the page once it's stale. `fetch` waits whenever the data is stale.
- React Router runs a route's `clientLoader` again on every navigation to it. Data that is still fresh costs no request.
- A module's client is safe only when nothing renders on the server. With `ssr: true`, every request would share it: see [Server rendering](#server-rendering).
- In Data Mode, a route's `loader` runs in the browser too: start queries in it the same way, on a client from a module.

## Server rendering

### Provider

One `QueryClient` per browser tab, in the root route's component:

```sample
react-router/app/root.tsx#app
```

Mount DevTools only when `import.meta.env.DEV` is true so Vite drops the panel from production builds. The [example app](./examples.md) always renders it, so the panel stays available in the deployed demo.

### A client per request

A root [`middleware`](https://reactrouter.com/how-to/middleware) creates the request's `QueryClient` and puts it in a [context](https://reactrouter.com/api/utils/createContext):

```sample
react-router/app/query-client.ts#context
```

```sample
react-router/app/root.tsx#middleware
```

Server middleware runs for the document request and for each client navigation's data request, before any loader. Every loader of that request reads the same client from `args.context`, so nested routes share one cache: React Router runs the matched routes' loaders in parallel, and a query that a layout's loader and a child route's loader both start is requested once.

### Server loaders

Each loader takes the request's client from the context, starts every query the route needs, and returns the handles with a dehydrated snapshot of the cache:

```sample
react-router/app/routes/posts.$slug.tsx#loader
```

The route component wraps what it renders in a `HydrationBoundary` with that snapshot, and passes the handles down:

```sample
react-router/app/routes/posts.$slug.tsx#component
```

```sample
react-router/app/components/comments.tsx#component
```

- Create the server's client **per request**, in the middleware. A module-level client would share data between requests and users.
- **`dehydrate(qc)`** takes entries with data and entries still loading. React Router [streams promises in loader data](https://reactrouter.com/how-to/suspense), so a `prefetch` that is still loading resolves in the browser when the server's request does, and the browser doesn't fetch it again.
- With nested routes, a loader's snapshot holds every entry the client has when the loader returns, other loaders' queries included. The browser keeps the newer copy of an entry, so the overlap only adds to the payload.
- **`HydrationBoundary`** writes the entries into the provider's client: entries the browser doesn't have yet while it renders, so its children read them, and the rest once it commits. The browser keeps whichever copy of an entry is newer. See [SSR and hydration](./ssr-and-hydration.md#when-the-browser-already-has-data).
- `await qc.fetch(...)` returns a handle with the `data`, for deciding on a redirect or building another query's input in the loader. Pass it to components as a `QueryHandleWithData`: `useQuery` returns the data without a promise, and follows later refetches. See [Handles](./handles.md).
- Use `prefetch` and `fetch` in a `loader`, not `ensure`. A `loader` runs on the server for every navigation, client-side ones included, and its client starts empty, so `ensure` waits for the request every time, exactly like `fetch`. See [Starting queries](./starting-queries.md#server-only-code).

### What the integration is

`HydrationBoundary`, from `@raf-query/react`, takes the dehydrated `state`. The cache verbs, handles and `useQuery` are the same as everywhere else. React Router has no hooks for streaming a cache with the page, so each loader returns its snapshot in its data. Options the other integrations take as `dehydrateOptions`, such as `keepErrors` and `filter`, go to `dehydrate(qc, options)`.

`react-router` isn't a peer dependency: raf-query imports nothing from it.

### Server and browser requests

Loaders run on the server, for the first page load and for each client navigation, so their client starts with an empty cache every time. Components refetch from the browser. A factory's `queryFn` runs in both places, and has to reach the same data as the same user in both:

- **On the server**, a relative `fetch("/api/...")` has no page origin to resolve against, and the browser's cookies aren't sent unless you forward them from `args.request`, the page's [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request).
- **In the browser**, `fetch` sends the user's cookies to your origin.

[`examples/react-router`](https://github.com/KATT/raf-query/tree/main/examples/react-router) serves its API from a resource route and gives its API client the page request's cookies while a loader runs, in `app/settings.ts` and `app/api.ts`. Loaders call the API in the same process, and the browser calls it over HTTP.

## Pending UI

While a link navigation is loading the next route, show pending state with React Router, not [`useIsFetching`](./background-fetching-indicators.md#useisfetching). [`useNavigation`](https://reactrouter.com/api/hooks/useNavigation) reports a navigation in progress, and [`NavLink`](https://reactrouter.com/api/components/NavLink) reports its own:

```sample
react-router/app/docs/react-router.tsx#pending-ui
```

Per-query background refetches after the page has rendered use `controls.isFetching`. See [Background fetching indicators](./background-fetching-indicators.md).

## Prefetching links

[`prefetch="intent"`](https://reactrouter.com/api/components/Link#prefetch) on a `Link` or `NavLink` preloads the route's modules when the user hovers or focuses the link (`"render"` does it when the link renders, `"viewport"` when it scrolls into view, and `"none"`, the default, never). With either kind of loader, the click doesn't start from the prefetch's queries:

- **A server `loader`**: the prefetch also requests the loader data, which runs the loaders on the server, but React Router doesn't keep the response. The click requests the loader data again, and the loaders and their queries run a second time. What the prefetch saves is loading the route's code.
- **A `clientLoader`**: the prefetch doesn't run it; it runs on the click. To start its queries earlier, call `queryClient.prefetch` from the link's `onPointerEnter`, as in [Preloading on intent](./starting-queries.md#preloading-on-intent).

In TanStack Router, the navigation reuses a route preloaded in the last 30 seconds, or joins its loader if it's still running ([Preloading](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)). Its loaders run in the browser, so the queries a preload starts land in the browser's cache, and the navigation's loader finds them there even once the preload is stale. See [TanStack Start](./tanstack-start.md).

## Search params

Read search params from `args.request.url` in the `loader` or `clientLoader`, validate them, and pass them as the input. React Router runs the loader again when they change. See [URL state and pagination](./url-state-and-pagination.md) for what to show while it loads.

## Mutations

Write from the browser, then invalidate the queries the write changed with `useQueryClient().invalidate(...)`, as in [Mutations](./mutations.md). React Router [actions](https://reactrouter.com/start/framework/actions) work too: after one, React Router runs the page's loaders again. A server `loader`'s new snapshot carries the new data. A `clientLoader` reads the tab's cache, which may still hold the old data as fresh, so `await queryClient.invalidate(...)` in the [`clientAction`](https://reactrouter.com/start/framework/actions#client-actions) before it returns.

## Example

[`examples/react-router`](https://github.com/KATT/raf-query/tree/main/examples/react-router) is the same issue tracker as the TanStack Start and Next.js examples, so the integrations can be compared side by side.
