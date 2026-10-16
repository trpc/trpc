---
title: Retries and errors
description: Retry failed requests with counts, predicates or Schedules, choose delays, and show errors with error boundaries.
section: Guides
order: 14
---

When a request fails in the browser, raf-query retries it **3 times**, waiting 1, 2 and then 4 seconds, before treating the query as failed. Readers keep suspending, or keep showing their current data, the whole time.

```sample
tanstack-start/src/docs/retries.ts#intro
```

| `retry`                                | Retries                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `3` (default in the browser)           | Up to that many times                                 |
| `0` or `false` (default on the server) | Never                                                 |
| `true`                                 | Forever                                               |
| `(failureCount, error) => boolean`     | While it returns `true`. `failureCount` starts at `1` |
| A `Schedule`                           | As the [Effect](./effect.md) schedule decides         |

Server renders never retry by default: the user is waiting for the HTML, and a failure can be retried by the browser instead.

A predicate is the place to skip retries for errors that won't go away:

```sample
tanstack-start/src/docs/retries.retry-predicate.ts#retry-predicate
```

Set it once for the app with `config.defaults`:

```ts twoslash
import { QueryClient } from "@raf-query/react";
// ---cut---
const queryClient = new QueryClient({
	defaults: { retry: 1 },
});
```

## Retry delay

`retryDelay` sets the wait before each retry. The default doubles from one second, up to 30 seconds. Pass a number for a constant delay, or a function:

```sample
tanstack-start/src/docs/retries.ts#retry-delay
```

### Retries while offline

In the browser, retries pause while `navigator.onLine` is `false`: after the delay, the next attempt waits for the window's `online` event. The request counts as fetching meanwhile. The first attempt always runs, since `navigator.onLine` can't be trusted to be right.

## Showing errors

What the user sees depends on whether there was data before the failure.

**The first load fails.** The query's promise rejects, so `use()` throws to the nearest error boundary. Resetting that boundary re-renders the reader, which refetches the query:

```sample
tanstack-start/src/docs/retries.tsx#showing-errors
```

Any error boundary works: `CatchBoundary` from TanStack Router, `react-error-boundary`, Next.js's `error.tsx`, or your own class component.

**A background refetch fails.** The existing data stays on screen: losing it because a refetch failed would be worse than showing it a little longer. The error is on the reader's controls as `error`, for a hint:

```sample
tanstack-start/src/docs/retries.stale-data-notice.tsx#stale-data-notice
```

Make the next request fail in the demo, then reload a post to see each case:

```demo
retries
```

## Errors from loaders

A failed `prefetch` never throws out of the loader: the error surfaces where the data is read, and only that part of the page shows it. A failed `ensure` or `fetch` rejects, so it reaches the route's error boundary (`errorComponent` in TanStack Router, `error.tsx` in Next.js), replacing the page.

This is one more reason to choose per query: `ensure` what the page can't do without, and `prefetch` the rest, so a failing sidebar doesn't take the whole page down.

## One place for every error

`config.onError` is called for every failed request, after its retries, whether or not anything shows it. It's the place for logging and toasts:

```sample
tanstack-start/src/docs/retries.ts#one-place-for-every-error
```

Combine it with [query meta](./query-meta.md) for a per-query message.

## Redirects

In TanStack Start, a `queryFn` can throw the router's `redirect()`, for instance when a session has expired. `setupRouterIntegration` turns it into a navigation wherever the query failed: a loader, a render or a background refetch. Redirects aren't retried.
