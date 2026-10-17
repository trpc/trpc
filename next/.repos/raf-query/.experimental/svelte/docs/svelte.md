---
title: Svelte
description: Read queries in Svelte 5 components with @raf-query/experimental-svelte, load them in SvelteKit, and render them on the server.
section: Integrations
order: 5
---

`@raf-query/experimental-svelte` is raf-query for Svelte 5.7 or newer, built on runes. Query factories, handles, the `QueryClient` and its verbs (`prefetch`, `ensure`, `invalidate`, `setData`, `dehydrate`) are the same as with React, so the rest of these docs applies. Only how a component reads a query is different.

```bash
pnpm add @raf-query/experimental-svelte effect
```

## Setup

Wrap the app in `QueryClientProvider`. Every component below it reads that client with `useQueryClient()`, and in the browser the client refetches stale queries on window focus and reconnect while the provider is mounted. In SvelteKit, that's the root layout:

```sample
sveltekit/src/routes/+layout.svelte
```

`setQueryClient(client)` in a component's `<script>` provides a client to its children instead.

The query factories are the same as in any other app:

```sample
sveltekit/src/lib/queries.ts#queries
```

## Reading a query

`useQuery(factory, () => handle, () => options)` reads the query a handle points at. The handle and the options are getters, so the result follows a new handle, such as a prop that changes when the page navigates:

```sample
sveltekit/src/lib/Post.svelte
```

The result is reactive. Read its properties in markup, `$derived` or `$effect`: `data`, `isFetching`, `isStale`, `error`, `updatedAt`, `refetch()`, and for paged queries `fetchNextPage()`, `hasNextPage` and `isFetchingNextPage`. Destructuring the result reads each property once, so it stops following the cache.

A handle from `ensure` or `fetch` carries its data, so with a `QueryHandleWithData`, `data` is never `undefined`. With a plain `QueryHandle`, `data` is `undefined` until the query has data, and `promise` settles with it, for `{#await}`:

```sample
sveltekit/src/docs/AwaitPost.svelte
```

A query that fails rejects `promise`, and `error` holds the error. Errors of an Effect `queryFn` are typed, and with a client built from a `layer`, `data` and `promise` hold a `Result` that never throws. See [Effect errors](./effect-errors.md).

## SvelteKit

A page's server `load` starts its queries before any component renders. It awaits them with `ensure` on a client of its own, then returns the handles and the dehydrated cache:

```sample
sveltekit/src/routes/posts/[slug]/+page.server.ts#load
```

The page writes the cache into the layout's client with `HydrationBoundary`, then passes each component its handle. `HydrationBoundary` hydrates before its children render, and again when `state` changes on the next navigation:

```sample
sveltekit/src/routes/posts/[slug]/+page.svelte
```

The handles carry their data, so the components render it on the server and on the first render in the browser, and the browser doesn't fetch it again. `load`'s data goes through SvelteKit's serializer, which carries the handles, the dehydrated entries and any `Date` or `Map` in them, and escapes them for the page.

A component that writes calls the API, then invalidates what it changed with `useQueryClient().invalidate(...)`, as in [Mutations](./mutations.md). The comments list refetches, and its next pages load with `fetchNextPage()`:

```sample
sveltekit/src/lib/Comments.svelte
```

Svelte's server rendering is synchronous, so a query the server's cache doesn't hold yet renders without data, and the browser fetches it. Start every query the page shows in `load`. On the server, `useQuery` doesn't subscribe and `useIsFetching()` stays `0`, so the server's HTML and the browser's first render agree. See [SSR and hydration](./ssr-and-hydration.md) for how the browser reconciles entries it already has.

## Other helpers

`useWaterfall(factory, () => input)` starts a query from a component and returns a getter of its handle, which `useQuery` takes as it is. It's for inputs only the component knows, such as an id from another query's data. Each one is a [request waterfall](./request-waterfalls.md), so prefer starting queries in `load`:

```sample
sveltekit/src/docs/Author.svelte
```

`useIsFetching(() => filter)` counts the queries with a request in flight, in its `current` property. See [Background fetching indicators](./background-fetching-indicators.md#useisfetching):

```sample
sveltekit/src/docs/FetchingIndicator.svelte
```
