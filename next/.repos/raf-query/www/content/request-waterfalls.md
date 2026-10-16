---
title: Request waterfalls
description: What a request waterfall is, why it's the biggest performance problem in data fetching, and how loaders, routes and backends remove them.
section: Guides
order: 11
---

A request waterfall is a request that can't start until another one has finished. Each level of the waterfall costs a full round trip, and on a slow connection a round trip can be hundreds of milliseconds. Removing waterfalls is usually the single most effective thing you can do for an app's loading time.

raf-query is designed around this. Queries start in route loaders and server components, where everything a page needs is known up front, so they start together:

```
1. |-> Post
1. |-> Comments
1. |-> Author
```

instead of one after the other as each component renders and discovers what it needs:

```
1. |-> Post
2.   |-> Comments
3.     |-> Author
```

The demo below runs the same page both ways. Open a post with each strategy and watch the Queries panel: with the loader, all three requests load at once; in render, they load one after another.

```demo
waterfalls
```

## Fetch-on-render

The classic waterfall comes from fetching where data is used. A component fetches its data, suspends, and only renders its children, which fetch their own data, once that request is done:

```sample
tanstack-start/src/docs/request-waterfalls.tsx#fetch-on-render
```

Suspense makes this worse, not better: a suspending component renders nothing below it, so its children can't even begin to fetch.

raf-query has no fetch-on-render hook. `useQuery` only reads; the loader starts every query:

```sample
tanstack-start/src/routes/posts.$slug.tsx#route
```

Both requests start the moment the navigation does, before any component renders. With `defaultPreload: "intent"`, they start when the user hovers the link.

## Start every query before awaiting any

Inside a loader, the order matters. An `await` before a `prefetch` turns two parallel requests back into a waterfall:

```sample
tanstack-start/src/docs/request-waterfalls.ts#start-every-query-before-awaiting-any
```

For several queries the route can't render without, `allKeyed` awaits them together:

```sample
tanstack-start/src/docs/request-waterfalls.all-keyed.ts#all-keyed
```

## Dependent queries

A query whose input comes from another query's result is a waterfall by construction. Fix it where the data is shaped, so every query a route needs can start from what the URL already holds:

- **Put the input in the route.** If the page is about an organization, its id belongs in the path (`/orgs/$orgId`), not in a lookup on the current user.
- **Have the backend resolve it.** The server already knows the session and the relations, so an endpoint can return the child with its parent, or be keyed by what the client has (`GET /me/org` instead of `GET /me` then `GET /orgs/:id`).

<details>
<summary>Example: the current user's organization</summary>

A settings page needs the user and their organization, and the organization's id is a field of the user:

```sample
tanstack-start/src/docs/request-waterfalls.settings-waterfall.ts#settings-waterfall
```

With a 150 ms round trip, the organization can't arrive before 300 ms, and the navigation is blocked for the first 150 even though nothing on the page needed the user that early.

Fix it in the backend: the server can find the session's organization itself, so give it an endpoint and a query with no input.

```sample
tanstack-start/src/docs/request-waterfalls.settings-backend.ts#settings-backend
```

Or fix it in the routes: links into the page come from places that already know the organization (the org switcher, a list of orgs), so they can put its id in the URL.

Either way, both requests start together, and the page is ready after one round trip instead of two.

</details>

When the data really can't be reshaped (a third-party API you don't control), you have two options, and both pay the extra round trip:

- **In the loader**: `await qc.fetch(...)` the parent and build the input from its `data`. The navigation waits for both.
- **In a component**: start the child with `useWaterfall`, below. The rest of the page renders first.

## Render-time inputs: useWaterfall

When an input is only known at render time (an id from a parent query's result), no loader can start the query. `useWaterfall` starts it during render and returns a handle, so the consumer looks the same as one fed by a loader:

```sample
tanstack-start/src/docs/request-waterfalls.render-time-inputs-usewaterfall.tsx#render-time-inputs-usewaterfall
```

Like `prefetch` in a loader, `useWaterfall` refetches stale cached data in the background, once each time the component mounts or its input changes. Re-renders don't refetch.

The name is the warning: each waterfall is an extra round trip after render. Search a codebase for `useWaterfall` and you have a list of every waterfall in it.

In TanStack Start, the `queryFn` runs on the server during SSR and the router streams the result. Under the Next.js `QueryProvider` it starts nothing on the server: the reader's Suspense boundary renders its fallback there, and the query loads in the browser. To have it in the HTML, start the dependent query in the server component instead:

```sample
tanstack-start/src/docs/request-waterfalls.tsx#fetch-then-prefetch
```

## Code splitting

Lazy-loaded route components are another source of waterfalls: the code has to download before it can render and discover what to fetch. Loaders avoid this too. A route's loader is part of the route definition, not the lazy component, so the router runs it in parallel with downloading the component's code.

These docs do the same: each page's demos are separate chunks, and the page's loader starts loading them alongside the page's content instead of after it renders.

## Summary

- Start queries in loaders and server components, never in render.
- Start every query before awaiting any.
- Shape data so a route's inputs come from the URL, not from other queries.
- Use `useWaterfall` only when you can't, and treat each one as a known cost.
