---
title: Vue
description: Read queries in Vue components with @raf-query/experimental-vue, start them from Vue Router navigations, and render them on the server.
section: Integrations
order: 4
---

`@raf-query/experimental-vue` is raf-query for Vue 3.5 or newer. Query factories, handles, the `QueryClient` and its verbs (`prefetch`, `ensure`, `invalidate`, `setData`, `dehydrate`) are the same as with React, so the rest of these docs applies. Only how a component reads a query is different: composables instead of hooks.

```bash
pnpm add @raf-query/experimental-vue effect
```

## Setup

Install `QueryPlugin` with a client. Every component reads that client with `useQueryClient()`, and in the browser the client refetches stale queries on window focus and reconnect until the app unmounts:

```sample
vue/src/docs/vue.ts#plugin
```

`QueryClientProvider` (a component) and `provideQueryClient(client)` (in `setup`) provide a client to a subtree instead.

## Reading a query

`useQuery(factory, handle)` reads the query a handle points at. Pass the handle as a getter or a ref when it can change, such as a prop:

```sample
vue/src/docs/vue.ts#without-suspense
```

The result is reactive. Read its properties in the template, a `computed` or a `watch`: `data`, `isFetching`, `isStale`, `error`, `updatedAt`, `refetch()`, and for paged queries `fetchNextPage()`, `hasNextPage` and `isFetchingNextPage`. A component re-renders only when a property it read changed. Destructuring the result reads each property once, so it stops following the cache.

`data` is `undefined` until the query has data. Under `<Suspense>`, await `promise` in an async `setup` instead, and `data` is there on the first render, on the server too:

```sample
vue/src/PostPage.vue#script
```

```sample
vue/src/PostPage.vue#template
```

A query that fails rejects `promise`, so the error goes to the nearest `onErrorCaptured`. Without `await`, read `error` instead. Errors of an Effect `queryFn` are typed, and with a client built from a `layer`, `data` and `promise` hold a `Result` that never throws. See [Effect errors](./effect-errors.md).

A handle from `ensure` or `fetch` carries its data, so with a `QueryHandleWithData`, `data` is never `undefined`.

## Vue Router

Start a route's queries when navigation starts, not when its component renders. A component that loads lazily would otherwise wait for its code before it asks for its data. Declare what each route prefetches in its `meta`:

```sample
vue/src/router.ts#meta
```

A global `beforeEach` runs each matched route's `prefetch`, on the first load, on links, and when only the params change. The route's `props` pass the components their handles. `qc.getQuery(...).handle` doesn't fetch, so the handles are free to build on every render:

```sample
vue/src/router.ts#router
```

`prefetch` doesn't wait. The page's async `setup` awaits the queries under the `<Suspense>` around `RouterView`, and Vue keeps the previous page on screen while the next one loads:

```sample
vue/src/App.vue#app
```

The page passes its child the comments handle, and the child awaits it too. Both requests started together in `beforeEach`, so neither waits for the other:

```sample
vue/src/Comments.vue#script
```

```sample
vue/src/Comments.vue#template
```

A write calls the API, then invalidates what it changed with `useQueryClient().invalidate(...)`, as in [Mutations](./mutations.md).

## Server rendering

Create a client and an app per request, so users never share data:

```sample
vue/src/app.ts#app
```

The server renders the URL, then dehydrates the cache into the page. `renderToString` waits for every async `setup`, so the queries the page awaited have their data. The `filter` sends only entries with data, which `JSON.stringify` can carry, and the `\u003c` escape keeps data from closing the `<script>`:

```sample
vue/src/entry-server.ts#server
```

The browser hydrates its client before it mounts the app, so components read the server's data and the browser doesn't fetch it again:

```sample
vue/src/entry-client.ts#client
```

On the server, `useQuery` doesn't subscribe and `useIsFetching()` stays `0`, so the server's HTML and the browser's first render agree. See [SSR and hydration](./ssr-and-hydration.md) for how the browser reconciles entries it already has.

### `HydrationBoundary`

State that arrives after the app has mounted, such as a payload a framework fetches with each navigation, goes through `HydrationBoundary`. It hydrates its `state` into the provided client before its slot renders, and again whenever `state` changes:

```vue
<HydrationBoundary :state="payload.queries">
  <RouterView />
</HydrationBoundary>
```

In [Nuxt](https://nuxt.com), install `QueryPlugin` from a plugin, dehydrate the server's client into `nuxtApp.payload` in the `app:rendered` hook, and hydrate it on the browser's client before the app mounts.

## Other composables

`useWaterfall(factory, input)` starts a query from a component and returns its handle as a `ComputedRef`, for inputs only the component knows, such as an id from another query's data. Each one is a [request waterfall](./request-waterfalls.md), so prefer starting queries in `beforeEach`:

```sample
vue/src/docs/vue.ts#waterfall
```

`useIsFetching(filter?)` is a read-only ref of how many queries have a request in flight. See [Background fetching indicators](./background-fetching-indicators.md#useisfetching):

```sample
vue/src/docs/vue.ts#is-fetching
```
