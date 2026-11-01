---
title: TanStack DB
description: A TanStack DB query collection over a procedure's `queryOptions()`, kept up to date by a subscription, or a collection synced by a subscription alone with `liveCollectionOptions()`.
section: Integrations
parent: integrations/tanstack-query
order: 12
experiment: tanstack-db
---

A [query collection](https://tanstack.com/db/latest/docs/collections/query-collection) takes a query key and function, so `queryOptions()` plugs in without an adapter. Rows keep the transformer's types (a `Date` stays a `Date`), and the collection's handlers call mutations:

```package-install
@tanstack/db @tanstack/query-db-collection
```

```ts twoslash
// ---cut-start---
import type { QueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { appRouter, db, t } from './server.ts';
const router = t.router({
  post: {
    ...appRouter.post,
    list: t.procedure
      .input(z.object({ limit: z.number(), cursor: z.string().optional() }))
      .query((opts) => {
        const items = db.post.list().slice(0, opts.input.limit);
        return { items, nextCursor: items.at(-1)?.id };
      }),
  },
});
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
const trpc = createTrpcQueryUtils({ client });
declare const queryClient: QueryClient;
// ---cut-end---
import { createCollection } from '@tanstack/db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';

const list = trpc.post.list.queryOptions({ input: { limit: 50 } });

const posts = createCollection(
  queryCollectionOptions({
    queryKey: list.queryKey,
    queryFn: list.queryFn,
    select: (data) => data.items,
    queryClient,
    getKey: (post) => post.id,
    onInsert: async (opts) => {
      for (const mutation of opts.transaction.mutations) {
        await client.post.create.mutate({ title: mutation.modified.title });
      }
    },
  }),
);
```

`posts.insert(...)` shows the row at once, and the collection refetches `post.list` once `onInsert` resolves. The query lives in the same `QueryClient`, so `invalidateQueries` with the tRPC key refreshes the collection too.

## Real-time

A collection holds the server's rows and writes them in sync transactions, and its live queries update as rows change. A subscription that brings changes keeps it up to date, in one of two ways.

### Changes into a query collection

Keep the query collection and write each change from a subscription into it with `utils.writeUpsert` and `utils.writeDelete`. Here the mutation publishes its change with the [Publisher](../../subscriptions/publisher.md):

```ts twoslash
// ---cut-start---
// @filename: router.ts
import {
  createFetchHandler,
  experimental_Publisher,
  initTrpc,
} from '@trpc12/trpc/server';
import { Effect } from 'effect';
import { z } from 'zod';
import { db, type Post } from './server.ts';
const t = initTrpc();
// ---cut-end---
export type PostChange =
  | { type: 'upsert'; row: Post }
  | { type: 'delete'; key: string };

class PostEvents extends experimental_Publisher.Service<
  PostEvents,
  { changes: PostChange }
>()('PostEvents') {}

export const router = t.router({
  post: {
    list: t.procedure.query(() => db.post.list()),
    changes: t.procedure.subscription((opts) =>
      PostEvents.subscribe('changes', { lastEventId: opts.lastEventId }),
    ),
    create: t.procedure
      .input(z.object({ title: z.string() }))
      .mutation((opts) =>
        Effect.gen(function* () {
          const post = db.post.create(opts.input);
          yield* PostEvents.publish('changes', { type: 'upsert', row: post });
          return post;
        }),
      ),
  },
});

createFetchHandler({ router, layer: PostEvents.memory({ buffer: 100 }) });
// ---cut-start---
// @filename: app.ts
import type { QueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { router } from './router.ts';
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
const trpc = createTrpcQueryUtils({ client });
declare const queryClient: QueryClient;
// ---cut-end---
import { createCollection } from '@tanstack/db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';

const list = trpc.post.list.queryOptions();
const posts = createCollection(
  queryCollectionOptions({
    queryKey: list.queryKey,
    queryFn: list.queryFn,
    queryClient,
    getKey: (post) => post.id,
  }),
);

for await (const event of client.post.changes.subscribe()) {
  if (event.data.type === 'upsert')
    await posts.utils.writeUpsert(event.data.row);
  else await posts.utils.writeDelete(event.data.key);
}
```

- A change wins over a fetch that started before it: when that fetch lands, it updates every other row but keeps the changed one. So a refetch (after `invalidateQueries`, on window focus) can't undo a newer change.
- The events are `tracked()` with the publisher's ids, so a reconnect resumes from the last one while the publisher's `buffer` still holds it.
- A change made after the list is read and before the subscription starts shows with the next refetch. When that matters, use a collection synced by the subscription alone.

### A collection synced by a subscription

`liveCollectionOptions` from `@trpc12/experimental-tanstack-db` makes a collection whose only source is a subscription: a `snapshot` event replaces the rows, then `upsert` and `delete` events change them. It needs no `QueryClient` and no list query.

```package-install
@trpc12/experimental-tanstack-db @tanstack/db
```

The server listens for changes before it reads the snapshot, so a write between the two comes after the snapshot instead of being lost. A change the snapshot already has is harmless: `upsert` writes the whole row and `delete` of a missing key does nothing.

```ts twoslash
// ---cut-start---
// @filename: router.ts
import { initTrpc, type TrackedEnvelope } from '@trpc12/trpc/server';
import { z } from 'zod';
import type { Post } from './server.ts';
const t = initTrpc();
type PostChange =
  | { type: 'upsert'; row: Post }
  | { type: 'delete'; key: string };
declare const posts: { list(): Post[]; save(post: Post): void };
/** Starts listening on the call, and yields `tracked(id, change)` events. */
declare function listen(
  signal: AbortSignal,
): AsyncIterable<TrackedEnvelope<PostChange>>;
/** Sends a change to every `listen()`, and returns its event id. */
declare function publish(change: PostChange): string;
// ---cut-end---
export const router = t.router({
  post: {
    live: t.procedure.subscription(async function* (opts) {
      const changes = listen(opts.signal);
      yield { type: 'snapshot', rows: posts.list() } as const;
      yield* changes;
    }),
    create: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => {
        const post = { ...opts.input, author: null, createdAt: new Date() };
        posts.save(post);
        return { eventId: publish({ type: 'upsert', row: post }) };
      }),
  },
});
// ---cut-start---
// @filename: app.ts
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { router } from './router.ts';
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
// ---cut-end---
import { createCollection } from '@tanstack/db';
import { liveCollectionOptions } from '@trpc12/experimental-tanstack-db';

const posts = createCollection(
  liveCollectionOptions({
    subscribe: (opts) => client.post.live.subscribe(undefined, opts),
    getKey: (post) => post.id,
    onInsert: async (opts) => {
      for (const mutation of opts.transaction.mutations) {
        const created = await client.post.create.mutate({
          id: mutation.modified.id,
          title: mutation.modified.title,
        });
        await opts.collection.utils.awaitEventId(created.eventId);
      }
    },
  }),
);
```

- Write `subscribe` before `getKey`: the row type comes from the subscription's events, and `getKey` reads it.
- The subscription starts with the collection's sync and closes with its cleanup. A failed subscription puts the collection in its `error` status. `subscribe` may also return an Effect `Stream`, such as an Effect client's `subscribe()`; cleanup interrupts it.
- `utils.awaitEventId(id)` resolves once the collection has applied the `tracked()` event with that id, or a newer snapshot. Awaited in a handler, it keeps the optimistic row on screen until the server's row replaces it; without it, the row disappears between the mutation's response and its event. It rejects after 10 seconds (pass a timeout as its second argument).
- `listen()` is your change feed: an `EventEmitter` read with `on()` from `node:events` in one process (`on()` listens from the call, an async generator only from its first `next()`), or your database's change feed for several.

### Resuming with changes

On a reconnect, the link sends the last `tracked()` id as `lastEventId`. A server that keeps a log of its changes can send the ones after it instead of a new snapshot, and a snapshot when the log no longer reaches back that far:

```ts twoslash
// ---cut-start---
import { initTrpc, type TrackedEnvelope } from '@trpc12/trpc/server';
import type { Post } from './server.ts';
const t = initTrpc();
type PostChange =
  | { type: 'upsert'; row: Post }
  | { type: 'delete'; key: string };
declare const posts: { list(): Post[] };
declare function listen(
  signal: AbortSignal,
): AsyncIterable<TrackedEnvelope<PostChange>>;
// ---cut-end---
declare const log: {
  /** The logged changes after `id`, or `undefined` once it's gone from the log. */
  since(id: string): TrackedEnvelope<PostChange>[] | undefined;
};

const live = t.procedure.subscription(async function* (opts) {
  const changes = listen(opts.signal);
  const missed = opts.lastEventId ? log.since(opts.lastEventId) : undefined;
  if (missed) yield* missed;
  else yield { type: 'snapshot', rows: posts.list() } as const;
  yield* changes;
});
```

A change both in `missed` and in `changes` is written twice, which is harmless. Over `wsLink`, every collection's subscription shares one socket, and all of them resume after a drop ([Over WebSockets](../../subscriptions/overview.md#over-websockets)).
