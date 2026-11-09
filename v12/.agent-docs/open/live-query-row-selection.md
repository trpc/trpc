---
title: How should a live collection choose which rows it syncs?
summary: A live collection loads every row its subscription's input allows. Keep shapes as inputs, or map TanStack DB's on-demand `loadSubset` predicates.
area: live
recommended: A
questions: [Q26.6]
links:
  - kind: spike
    label: live-queries
    url: ../../spikes/live-queries/
  - kind: proposal
    label: 26 Live queries and sync
    url: ../proposals/26-live-queries-and-sync.md
  - kind: decision
    label: live-queries
    url: ../decisions/live-queries.md
  - kind: decision
    label: tanstack-db-live-collections
    url: ../decisions/tanstack-db-live-collections.md
  - kind: decision
    label: publisher-tags
    url: ../decisions/publisher-tags.md
  - kind: code
    label: liveCollectionOptions
    url: ../../packages/experimental-tanstack-db/src/index.ts
---

# How should a live collection choose which rows it syncs?

## Why it matters

`liveCollectionOptions` syncs eagerly: the subscription's input picks a shape (a project, a filter), and the collection holds every row in it. TanStack DB also has an on-demand mode, where a collection loads only what its live queries ask for through `loadSubset` with predicate trees. That matters for large tables, and decides who says which rows a client may read: the server from `ctx`, or the client's query.

## Options

### A) Keep it as it is: shapes are procedure inputs

The input is validated, and the server turns it into a filter with `ctx`, so a client only picks among shapes the server allows.

```ts twoslash
// ---cut-start---
// @filename: router.ts
import { type TrackedEnvelope } from '@trpc12/trpc/server';
import type { LiveEvent } from '@trpc12/experimental-tanstack-db';
import { z } from 'zod';
import { t, type User } from './server.ts';
export interface Todo {
  id: string;
  projectId: string;
  title: string;
  done: boolean;
}
declare const todos: { list(): Todo[] };
declare function canRead(user: User | null, todo: Todo): boolean;
/** Starts listening on the call, and yields the changes to rows `visible` accepts. */
declare function listen(
  signal: AbortSignal,
  visible: (todo: Todo) => boolean,
): AsyncIterable<TrackedEnvelope<LiveEvent<Todo, string>>>;
// ---cut-end---
const router = {
  todo: {
    live: t.procedure
      .input(z.object({ projectId: z.string(), done: z.boolean().optional() }))
      .subscription(async function* (opts) {
        const visible = (todo: Todo) =>
          todo.projectId === opts.input.projectId &&
          canRead(opts.ctx.user, todo);
        const changes = listen(opts.signal, visible);
        yield { type: 'snapshot', rows: todos.list().filter(visible) } as const;
        yield* changes;
      }),
  },
};
// ---cut-start---
export type Router = typeof router;
// @filename: app.ts
import { createCollection } from '@tanstack/db';
import { liveCollectionOptions } from '@trpc12/experimental-tanstack-db';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { Router } from './router.ts';
const client = createTrpcClient({
  router: routerType<Router>(),
  links: [httpLink({ url: '/trpc' })],
});
declare const projectId: string;
// ---cut-end---

createCollection(
  liveCollectionOptions({
    subscribe: (opts) => client.todo.live.subscribe({ projectId }, opts),
    getKey: (todo) => todo.id,
  }),
);
```

- ✅ Authorization stays in ordinary procedure code, with `ctx`, middleware and an input schema; the same principle as the publisher-tags answer (the server picks the audience)
- ✅ Works with the shipped adapter; a row moving into or out of a shape is an `upsert` or a `delete`
- ❌ A collection loads its whole shape, so very large tables need narrower shapes
- ❌ Each open subscription filters every change (subscriptions × writes per process) until a source indexes shapes or a database filters

### B) Map TanStack DB's on-demand predicates to input

Simple predicates (`eq` on fields the server allows) become the subscription's input, one subscription per loaded subset.

```ts twoslash
// ---cut-start---
// @filename: router.ts
import type { TrackedEnvelope } from '@trpc12/trpc/server';
import type { LiveEvent } from '@trpc12/experimental-tanstack-db';
import { z } from 'zod';
import { t } from './server.ts';
interface Todo {
  id: string;
  projectId: string;
  done: boolean;
}
declare function feed(input: {
  projectId: string;
  done?: boolean;
}): AsyncIterable<TrackedEnvelope<LiveEvent<Todo, string>>>;
export const router = {
  todo: {
    live: t.procedure
      .input(z.object({ projectId: z.string(), done: z.boolean().optional() }))
      .subscription((opts) => feed(opts.input)),
  },
};
// @filename: app.ts
import { createCollection } from '@tanstack/db';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import {
  liveCollectionOptionsB as liveCollectionOptions,
  toInputB as toInput,
} from '../open/live-query-row-selection.ts';
import type { router } from './router.ts';
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
// ---cut-end---
createCollection(
  liveCollectionOptions({
    syncMode: 'on-demand',
    subscribe: (opts, subset) =>
      client.todo.live.subscribe(
        toInput(subset.where, { allow: ['projectId', 'done'] }),
        opts,
      ),
    getKey: (todo) => todo.id,
  }),
);
// useLiveQuery((q) => q.from({ todos }).where(({ todos }) => eq(todos.projectId, id)))
//   -> loadSubset({ where: eq(ref('projectId'), id) }) -> subscribe({ projectId: id })
```

- ✅ Large tables without loading a whole shape up front
- ❌ The predicate trees are TanStack DB's and may change before its 1.0
- ❌ Over-fetching is safe (TanStack DB filters again), but a mistranslated predicate under-fetches and loses rows silently; each subset is another subscription to pool

## Recommendation

**A.** The server, not the client's query, decides which rows a client sees, as with publisher channels, and it works today. On-demand mode can come once TanStack DB's predicates settle; under A, over-fetching is the only cost.

## Blocked until answered

- Nothing: the shipped adapter and docs are A (`syncMode` isn't an option of `liveCollectionOptions`).
