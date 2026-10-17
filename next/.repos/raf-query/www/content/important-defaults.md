---
title: Important defaults
description: When raf-query fetches, refetches, retries and garbage-collects by default, and which options change it.
section: Guides
order: 1
---

Out of the box, raf-query is configured with **aggressive but sane** defaults, the same ones TanStack Query uses. They can catch you off guard if you don't know them, so keep them in mind as you read the rest of the guides:

- **Cached data is stale immediately** (`staleTime: 0`).

  > [!TIP]
  > Set `staleTime` per query or for the whole client (`new QueryClient({ defaults: { staleTime } })`). A longer `staleTime` means fewer refetches. `Infinity` never refetches on its own: only [invalidation](./query-invalidation.md) does.

- **Stale data refetches in the background** when:
  - a loader or server component starts the query again (`prefetch`, `ensure` or `fetch`), which TanStack Router does on every navigation
  - the window becomes visible again ([window focus refetching](./window-focus-refetching.md)), for queries being read
  - the browser comes back online, for queries being read
  - the query is [invalidated](./query-invalidation.md)

- **Mounting a component never fetches.** Unlike TanStack Query, raf-query has no refetch on mount: whatever started the query decides when it loads. Rendering the same handle in ten components reads one cache entry.

- **Polling is per read.** `useQuery(factory, handle, { refetchInterval })` refetches on a timer while that component is mounted and the page is visible, independent of `staleTime`. See [Polling](./polling.md).

- **Unread entries are kept for five minutes** (`gcTime: 300_000`). An entry nobody reads is **inactive**: it stays in the cache in case it's needed again, then is garbage-collected.

- **Failed requests retry three times**, with a delay that doubles from one second, up to 30 seconds, before the error reaches the UI. Retries wait while the browser is offline. See [Retries](./retries.md).

- **Data is structurally shared.** When a refetch returns data that's deeply equal to what's cached, the cache keeps the old objects, so unchanged parts keep their identity and nothing re-renders. See [Render optimizations](./render-optimizations.md).

## On the server

A server client (one per request) renders once, so it behaves differently:

- **Cached data is always reused**, whatever `staleTime` says. A background refetch on the server could only repeat a request whose result is never shown. Entries marked by `invalidate` still refetch.
- **No retries** (`retry: 0`) and **no garbage collection** (`gcTime: Infinity`): the cache lives as long as the request.
- `useIsFetching()` returns `0`, so loading indicators never appear in server HTML.

## Changing the defaults

Every option can be set per query in the factory, or for every query with `config.defaults`. A query's own option wins:

```ts twoslash
import { QueryClient } from "@raf-query/react";
// ---cut---
const queryClient = new QueryClient({
	defaults: {
		staleTime: 30_000,
		gcTime: 10 * 60_000,
		retry: 1,
		refetchOnWindowFocus: false,
	},
});
```

| Option                                            | Default                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `staleTime`                                       | `0` ms                                                                                                                                      |
| `gcTime`                                          | 5 minutes; `Infinity` on the server                                                                                                         |
| `retry` (count, `boolean`, predicate, `Schedule`) | `3`; `0` on the server                                                                                                                      |
| `retryDelay` (ms, or a function of the count)     | Doubling from 1 s, at most 30 s                                                                                                             |
| `refetchOnWindowFocus`, `refetchOnReconnect`      | `true` (only read, stale queries refetch)                                                                                                   |
| `structuralSharing`                               | `true`                                                                                                                                      |
| `enabled`                                         | `true`; `false` [disables it](./query-factories.md#disabling-a-query), such as [on the server](./ssr-and-hydration.md#browser-only-queries) |
| `meta`                                            | None                                                                                                                                        |

Watch the defaults at work in [Caching](./caching.md), which has a live demo of an entry going from fresh to stale to garbage-collected.
