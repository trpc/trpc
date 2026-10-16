---
title: Window focus refetching
description: Stale queries on screen refetch when the user comes back to the tab or reconnects. How to turn it off, globally or per read.
section: Guides
order: 15
---

When the user leaves your app and comes back, the data on screen may be out of date. raf-query refetches every **read, stale** query when the page becomes visible again, and when the browser reconnects after being offline.

Only queries that are being read refetch, and only stale ones: data within its `staleTime` stays as it is. With the default `staleTime` of `0`, that's everything on screen.

## Turning it off

For every query, in the client's defaults:

```ts twoslash
import { QueryClient } from "@raf-query/react";
// ---cut---
const queryClient = new QueryClient({
	defaults: {
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	},
});
```

For one query, in its factory:

```sample
tanstack-start/src/docs/window-focus-refetching.ts#turning-it-off
```

Or for one reader, in `useQuery`'s options. The query refetches on focus if any reader wants it to:

```sample
tanstack-start/src/docs/window-focus-refetching.per-query.ts#per-query
```

A long `staleTime` is often the better fix: the data then refetches on focus only once it's actually old.

## What counts as focus

The page counts as focused when `document.visibilityState` becomes `"visible"`: switching back to the tab, restoring the window, unlocking the phone. Clicking between two visible windows isn't a visibility change, so it doesn't refetch.

To test it by hand, switch tabs and come back. The [polling](./polling.md) demo shows it too: polling pauses while the tab is hidden.

## A custom platform

The cache learns about focus and network changes from a `Platform` service. Its default reads `window`, `document` and `navigator`. Provide your own for environments without them (React Native, an embedded webview) or to control focus in tests:

```sample
tanstack-start/src/docs/window-focus-refetching.ts#a-custom-platform
```

The cache is built on top of the client's `layer`, so the platform it provides replaces the default.

See [Testing](./testing.md) for using it in tests.
