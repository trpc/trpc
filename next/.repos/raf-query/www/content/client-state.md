---
title: What belongs in the cache
description: raf-query caches asynchronous data from a backend or the browser. What that leaves for URL state, local state and a client store.
section: Guides
order: 22
---

raf-query is a cache for **asynchronous data**: anything you load with a promise, that can go out of date, and that many components may need. Most of that is data a backend owns — posts, users, comments. It also fits work only the browser can do: a push subscription, a notification permission, a service worker. Mark those [`enabled: typeof window !== "undefined"`](./ssr-and-hydration.md#browser-only-queries) so they never run during SSR, and still use the same factories, handles, invalidation and readers as everything else.

It's not a general-purpose state manager for synchronous UI state.

Once async data lives in the cache, most apps find that what's left is small:

| State                                                      | Where it belongs                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Posts, users, comments, anything from a backend            | raf-query                                                              |
| Push subscription, permission, service worker, media query | raf-query, [browser-only](./ssr-and-hydration.md#browser-only-queries) |
| Filters, sort, pagination, the selected tab                | The URL: search params and the path                                    |
| An input's text, whether a menu is open                    | `useState` in the component                                            |
| Pending and optimistic state of a write                    | `useActionState`, `useOptimistic`                                      |
| Theme, a draft that survives navigation                    | A small client store, or `localStorage`                                |

The URL deserves special mention. raf-query asks that anything which changes what a query fetches lives in the URL, so the loader can start the query on navigation. That's also what makes a page shareable, bookmarkable and restorable with the back button, which state in a store isn't.

## Copying query data into a store

Avoid copying query data into a client store (or into `useState`). The copy doesn't refetch, doesn't hear about invalidation, and goes stale the moment the cache updates. Read the query wherever the data is needed: requests are deduped, and readers share one cache entry.

The exception is a form: initializing an input from query data is fine. `defaultValue={post.title}` gives the user their own copy to edit, and the write goes through an action.
