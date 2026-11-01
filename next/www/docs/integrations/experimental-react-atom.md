---
title: React atoms
description: Query, mutation and subscription atoms on Effect Atom, typed with each procedure's errors.
section: Integrations
parent: integrations/react
order: 4
experiment: experimental-react
---

`@trpc12/experimental-react-atom` is modeled on Effect's `AtomRpc`. Each query is an atom of its `AsyncResult`, typed with the procedure's errors; the same call returns the same atom. Like [`@trpc12/experimental-react`](./experimental-react.md), the whole package is experimental.

```package-install
@trpc12/trpc effect @trpc12/experimental-react-atom @effect/atom-react
```

The [`examples/experimental/react-atom`](../../../examples/experimental/react-atom/README.md) app uses this package on TanStack Start, with the server render dehydrated into the browser's registry. [`react-suspense`](../../../examples/experimental/react-suspense/README.md) is the same page with `@trpc12/experimental-react`.

```tsx twoslash
// ---cut-start---
import { httpLink, routerType } from '@trpc12/trpc/client';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import { z } from 'zod';
import { appRouter, db, t } from './server.ts';
const router = t.router({
  ...appRouter,
  post: {
    ...appRouter.post,
    rename: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => db.post.find(opts.input.id)),
  },
});
type AppRouter = typeof router;
// ---cut-end---
import { useAtomSuspense, useAtomSet } from '@effect/atom-react';
import { createAtomClient } from '@trpc12/experimental-react-atom';

export const trpc = createAtomClient({
  router: routerType<AppRouter>(),
  links: [
    httpLink({
      url: '/trpc',
      transformer: experimental_createProgressiveJson(),
    }),
  ],
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

Query atoms are serializable. On the server, keep the atoms you load in the request's registry, mounted (`registry.mount(atom)`) or idle with a TTL (`AtomRegistry.make({ defaultIdleTTL })`, whose timers outlive the request), and call `Hydration.dehydrate(registry)` after the render. In the browser, wrap the tree in `HydrationBoundary` from `@effect/atom-react`, or call `Hydration.hydrate(registry, state)` yourself. A browser registry of your own needs an idle TTL, as `@effect/atom-react`'s default registry has (`defaultIdleTTL: 400`): a component reads a hydrated atom before it subscribes, and without a TTL the registry drops the value and runs the query again. Results encode with the links' [transformer](../server/transformers.md) (`transformerSchema(transformer)` is that `Schema`, for your own atoms). Failed results aren't carried; the browser runs those queries again.
