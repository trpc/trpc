---
title: Handles
description: The small, serializable object that carries a query from the loader or server to the component that reads it.
section: Guides
order: 6
---

A handle is the only thing that crosses the loader → component or server → client boundary:

```sample
tanstack-start/src/docs/handles.ts#intro
```

## Handles with data

`prefetch` doesn't wait, so its handle is the query's key and input. `ensure` and `fetch` waited for the data, so they return a `QueryHandleWithData`: the same handle plus `data`, for the code that called them. A loader can branch on it or build another query's input from it, and a server component can render it.

`data` is the cache entry's own object, not a copy. Data reaches the browser's cache through the [hydration stream](./ssr-and-hydration.md), and the TanStack Router serializer and React's RSC payload both send an object once, however many handles and entries point at it.

## Typed by what the loader did

The loader's return value lists exactly which queries a route started, and its types show which ones the route waited for. `useQuery` returns **the data** for a `QueryHandleWithData` and **a promise** for a `QueryHandle`:

```sample
tanstack-start/src/docs/handles.tsx#typed-by-what-the-loader-did
```

Type a prop with the handle its loader returns:

```sample
tanstack-start/src/docs/handles.handle-props.tsx#handle-props
```

A handle's type names its factory, and a factory's type includes its key's shape (`readonly ["post", string]`). So `useQuery(draftQuery, handle)` is a type error when `handle` came from `postQuery`, even when both take the same input and return the same data. Factories whose keys have the same shape read the same entries, so their handles mix. Annotating a factory's return type as `QueryOptions<{ data: Post }>` widens its key to any `QueryKey`, and its handles mix with any factory's of the same input and data.

`QueryHandleWithData` extends `QueryHandle`, so TypeScript lets a handle with data into a `QueryHandle` prop. `useQuery` picks by the handle it gets at runtime, though: there it returns the data while the prop's type says promise, and `use()` on it throws. If you switch a query from `prefetch` to `ensure`, switch the props that receive its handle to `QueryHandleWithData`.

## The cache is the source of truth

`data` is what the cache held when the verb resolved. `useQuery` reads the entry's current data instead: after a refetch, an invalidation or a `setData`, every reader updates, which a value frozen into loader data couldn't do.

If the entry has lost its data since — it was garbage-collected while the router kept the loader data, or something called `reset` — `useQuery` suspends until it's refetched instead of returning `undefined`.

## Where handles come from

- `qc.prefetch(factory, input)` returns a `QueryHandle` synchronously.
- `await qc.ensure(factory, input)` and `await qc.fetch(factory, input)` return a `QueryHandleWithData`.
- `useWaterfall(factory, input)` starts a query during render and returns a `QueryHandle`. It's an [escape hatch](./request-waterfalls.md#render-time-inputs-usewaterfall).

You never build handles by hand: the factory's key and input must agree, and the verbs guarantee it.
