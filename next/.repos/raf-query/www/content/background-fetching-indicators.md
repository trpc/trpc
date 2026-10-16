---
title: Background fetching indicators
description: Show that a query is refreshing with isFetching. Prefer the router's pending UI for navigations; useIsFetching stays for compatibility when you need a global count.
section: Guides
order: 17
---

A query's first load suspends, so Suspense fallbacks cover it. Later requests (refetches on focus, invalidation) happen in the background, while the old data stays on screen. Read `isFetching` on that query's controls. For navigations, prefer the router's pending UI — you usually don't need a global fetch counter.

## One query: isFetching

`isFetching` on the reader's controls is `true` while any request for the query is in flight, first loads included:

```sample
tanstack-start/src/docs/background-fetching-indicators.tsx#one-query-isfetching
```

Controls are tracked: only components that read `isFetching` re-render when it changes. A parent that just passes the promise down stays put during background refetches.

## Navigations

A navigation is not a background fetch: it's a transition. Use the router's pending state for the navigation itself:

- [TanStack Start](./tanstack-start.md#pending-ui): `pendingComponent` / `pendingMs`, or `useRouterState({ select: (state) => state.isLoading })`
- [Next.js](./react-server-components.md#pending-ui): `useLinkStatus` from `next/link`

`isFetching` covers what happens after the page has rendered.

## useIsFetching

You probably don't need this. Prefer the router's pending UI for navigations ([TanStack Start](./tanstack-start.md#pending-ui), [Next.js](./react-server-components.md#pending-ui)) and per-query `isFetching` for background refetches. The hook stays for TanStack Query compatibility when you want one count of every in-flight request across the app:

```sample
tanstack-start/src/docs/background-fetching-indicators.tsx#useisfetching
```

Pass a filter to count only some queries:

```ts twoslash
import { useIsFetching } from "@raf-query/react";
// ---cut---
const savingComments = useIsFetching({ queryKey: ["comments"] });
```

It's always `0` on the server and during hydration, so the indicator never appears in server HTML. Outside React, `qc.isFetching(filter?)` returns the same number.

Refetch the queries below, together or one at a time, and watch both indicators:

```demo
fetching-indicators
```

## Avoiding flashes

On a fast connection, a background refetch can finish in 50 ms, and a spinner that flashes for that long is more distracting than helpful. Delay it with CSS, so it only appears for slower requests:

```css
.spinner {
	animation: fade-in 0s 300ms both;
}

@keyframes fade-in {
	from {
		opacity: 0;
	}
}
```
