---
title: Render optimizations
description: Structural sharing, stable promises and tracked controls keep re-renders to the components whose data actually changed.
section: Guides
order: 19
---

raf-query re-renders a component only when something it uses has changed. Three mechanisms make that happen, all on by default.

## Structural sharing

When a query refetches, the new data is compared with the old. Objects and arrays that are deeply equal keep their old identity:

```ts twoslash
// ---cut---
// Before: { id: 1, author: { name: "Ada" }, tags: ["a"] }
// After:  { id: 1, author: { name: "Ada" }, tags: ["a", "b"] }
// `after.author === before.author`: unchanged parts keep their identity.
```

This lets `memo` components and React Compiler skip re-rendering children whose props didn't change, and keeps effects from re-running on refetches that changed nothing.

When the whole response is deeply equal to the cached data, the old data is kept as it is, and the reader's promise doesn't change: nothing re-renders at all.

Structural sharing only looks inside plain objects and arrays. Class instances, `Map`s and `Date`s are compared by identity. Turn it off for very large responses where the comparison costs more than it saves:

```sample
tanstack-start/src/docs/render-optimizations.ts#structural-sharing
```

## Stable promises

`useQuery` returns a promise owned by the cache. It changes only when the data does, so it's safe to pass down, compare, or use as a dependency. A new promise is always pre-resolved: `use()` returns its value synchronously, and nothing suspends on a refetch.

## Tracked controls

The controls object returned by `useQuery` tracks which fields a component reads. Reading `controls.isFetching` subscribes the component to `isFetching`; a component that never reads it isn't re-rendered when a background refetch starts and ends.

```sample
tanstack-start/src/docs/render-optimizations.tsx#tracked-controls
```

Both components read the same query; each pays only for what it reads. Destructure only what you use. Spreading the controls (`{ ...controls }`) reads every field and subscribes to all of them.

## Passing promises down

A parent can read a prefetched handle and hand the promise to a child, so only the child suspends. The parent re-renders when the promise changes, which is exactly when the child needs new props:

```sample
tanstack-start/src/docs/render-optimizations.passing-promises-down.tsx#passing-promises-down
```

## Deriving data

There's no `select` option. Derive in render: the data only changes when it actually changed, so with React Compiler (or `useMemo`) the derivation reruns only then:

```sample
tanstack-start/src/docs/render-optimizations.tsx#deriving-data
```

To share a derivation, put it in a function next to the factory, and call it wherever the data is read.
