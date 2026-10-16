---
title: Query keys
description: How query keys identify cache entries, how they're hashed, and how to include a factory's input in its key.
section: Guides
order: 2
---

At its core, raf-query caches by **query key**. A key is an array at the top level. It can be as simple as one string, or as complex as many strings and nested objects. As long as it serializes with `JSON.stringify` and is **unique to the query's data**, you can use it.

Keys also travel inside [handles](./handles.md), from the server to the browser, so they must be plain data: strings, numbers, booleans, `null`, arrays and plain objects.

## Simple keys

The simplest key is an array of constants. It suits:

- generic list or index resources
- non-hierarchical resources

```sample
tanstack-start/src/docs/query-keys.ts#simple-keys
```

## Keys with variables

When a query needs more information to describe its data, add it to the array: an id, an index, or an object of parameters. This suits:

- hierarchical or nested resources, usually identified by an id
- queries with parameters, usually passed as an object

```sample
tanstack-start/src/docs/query-keys.ts#keys-with-variables
```

## Keys are hashed deterministically

Object keys are sorted before hashing, and `undefined` fields are dropped, so all of these name the same entry:

```sample
tanstack-start/src/docs/query-keys.ts#keys-are-hashed-deterministically
```

Array order does matter. These are three different entries:

```sample
tanstack-start/src/docs/query-keys.ts#array-order-matters
```

`hashKey(key)` returns the string form, and `useQuery`'s controls expose it as `hash`, which makes a good `key` prop for a Suspense boundary.

## Put the input in the key

A query's key must change whenever its data would. In raf-query that's natural: a factory's single argument is its **input**, and the key is built from it.

```sample
tanstack-start/src/docs/query-keys.ts#put-the-input-in-the-key
```

Each distinct input gets its own entry, cached independently. Because the input comes from the URL (see [URL state and pagination](./url-state-and-pagination.md)), a new search param means a new key, and the loader starts it.

## Design keys for invalidation

Filters match keys by **prefix**, and object segments match partially. Ordering a key from general to specific lets one call reach a whole group:

```sample
tanstack-start/src/docs/query-keys.ts#design-keys-for-invalidation
```

See [Query invalidation](./query-invalidation.md) for every filter option.
