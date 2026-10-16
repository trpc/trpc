---
title: Query invalidation
description: Mark queries stale after a write, refetch the ones on screen, and select queries with key prefixes and predicates.
section: Guides
order: 13
---

Waiting for data to go stale on its own doesn't work after a write: the user just changed something and expects to see it. `invalidate` marks queries stale and refetches the ones that are being read:

```sample
tanstack-start/src/docs/query-invalidation.ts#intro
```

When a query is invalidated:

- It's marked stale, whatever its `staleTime`. The next `prefetch` or `ensure` refetches it, even on the server.
- If something is reading it, it refetches now, in the background. Readers keep showing the current data and re-render when the new data lands.
- If nothing is reading it, nothing happens until the next time something starts it.

`invalidate` returns a promise that resolves once every refetch it started has settled. Await it at the end of an action, and the action stays pending until the fresh data is on screen.

Try it. Each list below reads its own query. Invalidate by prefix, or exactly, and watch which ones refetch:

```demo
invalidation
```

## Query filters

`invalidate`, `reset` and `remove` take either a factory and its input, or a filter:

```ts twoslash
import type { QueryKey } from "@raf-query/react";
import { Query as QueryModule } from "@raf-query/react";
type Query = QueryModule.Query;
// ---cut---
interface Filter {
	queryKey?: QueryKey; // key prefix; every key matches without it
	exact?: boolean; // match `queryKey` exactly instead of as a prefix
	predicate?: (query: Query) => boolean; // runs after key matching
}
```

Given these keys:

```ts twoslash
["todos"];
["todos", { status: "done" }];
["todos", { status: "done", page: 2 }];
["todos", 5];
["users"];
```

| Filter                                        | Matches               |
| --------------------------------------------- | --------------------- |
| `{}`                                          | Everything            |
| `{ queryKey: ["todos"] }`                     | All four `todos` keys |
| `{ queryKey: ["todos"], exact: true }`        | Only `["todos"]`      |
| `{ queryKey: ["todos", { status: "done" }] }` | Both `done` lists     |
| `{ queryKey: ["todos", 5] }`                  | Only `["todos", 5]`   |

Object segments match **partially**: `{ status: "done" }` matches any object segment with that field, whatever else it has. This is why [query keys](./query-keys.md) go from general to specific, with an object of filters last: one prefix then reaches every variant.

### Matching with predicate

`predicate` receives each `Query` that passed the key match. Read its `key` and `handle.input`, or its state with the `Query` functions:

```sample
tanstack-start/src/docs/query-invalidation.matching-with-predicate.ts#matching-with-predicate
```

`handle.input` is the input of the latest factory call for that entry. An entry that was only hydrated, and not yet read or started on this client, has `undefined` input, so match on `key` to include those.

## Invalidate, reset or remove

| Call         | Data                   | Read queries                                 | Use for                                    |
| ------------ | ---------------------- | -------------------------------------------- | ------------------------------------------ |
| `invalidate` | Kept, shown meanwhile  | Refetch in the background                    | After writes: the normal case              |
| `reset`      | Dropped                | Suspend and refetch                          | Data that must not be shown again (logout) |
| `remove`     | Dropped with the entry | Keep what they rendered until they re-render | Freeing memory, dropping an abandoned key  |

`reset` resolves when the refetches it caused settle, like `invalidate`. `remove` is synchronous, and aborts in-flight requests.

## Invalidating from mutations

The common pattern is to invalidate at the end of an action, so it covers whatever the write affected:

```sample
tanstack-start/src/docs/query-invalidation.tsx#invalidating-from-mutations
```

Prefer invalidating a little too much over too little. Only queries being read refetch, so a broad prefix costs a request per list on screen, not per list ever loaded.

When the server's response has everything the cache needs, write it with `setData` instead and skip the refetch. See [Mutations](./mutations.md#updates-from-mutation-responses).

## Invalidation on the server

A server render's cache never considers data stale, because it renders once. `invalidate` is the exception: an entry marked by `invalidate` refetches on the server, too. This matters in Next.js server actions that render again after a write.
