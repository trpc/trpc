---
title: Infinite queries
description: Paged queries with infiniteQueryOptions, "load more" buttons, infinite scroll, bidirectional lists and maxPages.
section: Guides
order: 10
---

Lists that load more data onto what's already shown, such as "load more" buttons and infinite scroll, are a common UI pattern. A paged factory returns `infiniteQueryOptions(...)`; everything else uses the same `useQuery` and the same verbs as any query.

```sample title="src/queries.ts"
tanstack-start/src/docs/infinite-queries.ts#intro
```

- `initialPageParam` is the first page's param.
- `getNextPageParam(lastPage, pages, lastPageParam, pageParams)` returns the next page's param, or `null` / `undefined` when there are no more pages.
- The `queryFn` receives the param as `context.pageParam`.

## Reading pages

With a paged factory, `useQuery` returns the same tuple. The promise resolves to `{ pages, pageParams }`, and the controls add paging:

```sample
tanstack-start/src/docs/infinite-queries.tsx#reading-pages
```

| Control                                        | Meaning                                      |
| ---------------------------------------------- | -------------------------------------------- |
| `fetchNextPage()`, `fetchPreviousPage()`       | Load a page at either end; returns a promise |
| `hasNextPage`, `hasPreviousPage`               | Whether the page param functions found one   |
| `isFetchingNextPage`, `isFetchingPreviousPage` | A page is loading at that end                |

They exist only on the type for paged factories.

## Infinite scroll

Infinite scroll is the same paged query with an automatic "Load more". A ref callback watches the button and presses it when it nears the viewport. Unmount the button while a page loads: it watches again when it remounts, so it keeps loading while it stays in reach. Its place is taken by skeletons the size of the incoming page, so the loaded rows replace them without moving anything below.

```sample
tanstack-start/src/docs/infinite-queries.tsx#infinite-scroll
```

Scroll the feed below. Switch the filter to see a new list start from its first page, and switch back to find the old one still cached, with every page you loaded.

```demo
infinite-scroll
```

## Loading several pages up front

On the server, `ensure` and `fetch` load the first page. Pass `{ pages: n }` as a third argument to load more:

```sample
tanstack-start/src/docs/infinite-queries.loading-several-pages-up-front.ts#loading-several-pages-up-front
```

The option is only accepted for paged factories.

## Refetching

When a paged query refetches — stale on navigation, invalidated, focused — every loaded page is refetched **in order**, starting from the first, so cursors stay consistent: page two's param is recomputed from the new page one.

## Writing pages while one loads

`setData` on a paged query can land while `fetchNextPage` or `fetchPreviousPage` is in flight, for example from a live subscription updating a loaded page. The new page is added to the data as it is when the page arrives, so the write stays. If the write changed the end being loaded (it dropped or replaced the pages there), the page that arrives no longer follows the list and is dropped; load it again with another `fetchNextPage`.

A refetch reads every page again, and keeps writes that are newer than its reads. A page written after the refetch started reading it stays as written. A page written before that is read again, and the read replaces it. So a live subscription can keep writing pages while a refetch runs, and its results survive. If a write changed the list's page params, only pages whose param the refetch also loaded are kept.

## Bidirectional lists

Add `getPreviousPageParam` to load pages before the first one, for a chat log that starts in the middle:

```sample
tanstack-start/src/docs/infinite-queries.ts#bidirectional-lists
```

`context.direction` tells the `queryFn` which end it's loading.

## Limiting pages with maxPages

Long sessions can accumulate many pages. `maxPages` keeps at most that many: when a new page is added, the page at the far end is dropped. Refetches then load fewer pages, too. With `maxPages`, define both `getNextPageParam` and `getPreviousPageParam`, so a dropped page can be loaded again when the user scrolls back.

## Changing the input

Pages belong to one input. A filter or sort in the URL changes the input, and with it the key, so a new list starts from its first page. The old list stays cached under its own key until `gcTime`, which is why switching back is instant.
