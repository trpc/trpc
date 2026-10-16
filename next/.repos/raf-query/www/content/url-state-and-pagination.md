---
title: URL state and pagination
description: Put filters, sort and page in the URL, let the loader turn them into the query's input, and pick what shows while the new input loads.
section: Guides
order: 9
---

Filters, sort order and pagination are search params. The loader turns them into the query's input, so every navigation starts the right query and the component only ever reads the handle it was given:

```sample
tanstack-start/src/routes/posts.tsx#route
```

Clicking a link navigates, the loader prefetches `{ sort: "oldest", page: 1 }` without blocking, and the component receives a new handle.

## What shows while the new input loads

That's up to `whilePending`:

| `whilePending`        | While the new input loads                                                                                                                                                                  | Use for                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `"suspend"` (default) | `use()` suspends. TanStack Router and Next.js run navigations as React transitions, so React keeps the whole previous screen, including the old URL's active links, until the data arrives | Short loads, and pages that shouldn't show stale data          |
| `"previous"`          | The navigation commits immediately. The promise keeps the previous input's data and `isPrevious` is true until the new data lands                                                          | Lists, filters, pagination — anything that should feel instant |

Either way, an input that's already cached renders immediately. A component that mounts with a pending handle has no previous data, so `"previous"` suspends like `"suspend"` on first load.

Page through the demo with each mode. Watch the address bar: with `"suspend"` it waits for the data, with `"previous"` it updates at once and the old page dims. Hovering **Next** prefetches the next page, so with a bit of patience neither mode waits.

```demo
pagination
```

This replaces TanStack Query's `placeholderData: keepPreviousData` and `isPlaceholderData`.

## Skeletons for unrelated content

To show a skeleton instead, for instance when moving between unrelated posts, give the Suspense boundary the query's key. React treats it as new content and shows its fallback, even inside a transition:

```sample
tanstack-start/src/docs/url-state-and-pagination.tsx#skeletons-for-unrelated-content
```

`hash` is the stable string form of the handle's key.

## Pagination versus infinite scroll

They differ in where the page lives:

- **Pagination**: the page is a search param and part of the input, so each page is its own query and the URL links to it.
- **Infinite scroll**: filters and sort are search params, and pages are loaded into one paged query per input. Changing a filter starts a new list from its first page. See [Infinite queries](./infinite-queries.md).

## Why not local state?

It's tempting to keep the page number in `useState` and build the input from it. Don't: the loader can't see component state, so the query would start only after render, the back button wouldn't restore the page, and a shared link would open page one. Keeping the input in the URL makes every view linkable and every query startable before render.

In Next.js the same rules apply: read `searchParams` in the page, `prefetch` with them, and pass the handle to the client component.
