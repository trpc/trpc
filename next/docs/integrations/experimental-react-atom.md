---
title: React atoms
description: Query, mutation and subscription atoms on Effect Atom, typed with each procedure's errors.
section: Integrations
order: 5
---

`@trpc12/experimental-react-atom` is modeled on Effect's `AtomRpc`. Each query is an atom of its `AsyncResult`, typed with the procedure's errors; the same call returns the same atom. Like [`@trpc12/experimental-react`](./experimental-react.md), the whole package is experimental.

```tsx
import { useAtomSuspense, useAtomSet } from '@effect/atom-react';
import { createAtomClient } from '@trpc12/experimental-react-atom';

export const trpc = createAtomClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc', serializer: createSerializer() })],
});

function Post(props: { id: string }) {
  const post = useAtomSuspense(
    trpc.post.byId.query({ id: props.id }, { reactivityKeys: ['posts'] }),
  ).value;
  const rename = useAtomSet(trpc.post.rename.mutation());
  return (
    <button
      onClick={() =>
        rename({
          input: { id: props.id, title: 'New' },
          reactivityKeys: ['posts'],
        })
      }
    >
      {post.title}
    </button>
  );
}
```

- `query(input, { reactivityKeys, timeToLive })`: a mutation with the same reactivity keys refetches it. `timeToLive` keeps the result after the last reader; `Infinity` keeps it alive.
- `mutation()`: a function atom, set with `{ input, reactivityKeys }`.
- `subscription(input)`: an atom of the latest event.
- `trpc.client` is the [Effect client](../client/effect.md) the atoms call; `trpc.runtime` is their runtime.

## Server rendering

Query atoms are serializable. On the server, render with a registry that keeps idle atoms (`AtomRegistry.make({ defaultIdleTTL })`) and call `Hydration.dehydrate(registry)` afterwards; in the browser, wrap the tree in `HydrationBoundary` from `@effect/atom-react`. Results encode with the links' [serializer](../server/serializers.md) (`serializerSchema(serializer)` is that `Schema`, for your own atoms). Failed results aren't carried; the browser runs those queries again.
