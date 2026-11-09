---
title: Should `liveCollectionOptions` keep its own `@trpc12/experimental-tanstack-db` package?
summary: Real-time TanStack DB collections ship as `@trpc12/experimental-tanstack-db`. Keep it, drop it for the no-API recipe, or move it elsewhere.
area: live
recommended: A
questions: [Q26.4]
links:
  - kind: spike
    label: tanstack-db-realtime
    url: ../../spikes/tanstack-db-realtime/
  - kind: docs
    label: TanStack DB, Real-time
    url: https://v12.trpc.io/v12/docs/integrations/tanstack-query/tanstack-db?flags=tanstack-db#real-time
  - kind: decision
    label: tanstack-db-live-collections
    url: ../decisions/tanstack-db-live-collections.md
  - kind: decision
    label: integration-packages
    url: ../decisions/integration-packages.md
  - kind: decision
    label: tanstack-db-collections
    url: ../decisions/tanstack-db-collections.md
  - kind: proposal
    label: 26 Live queries and sync
    url: ../proposals/26-live-queries-and-sync.md
  - kind: note
    label: tanstack-db-realtime spike
    url: ../notes/tanstack-db-realtime.md
  - kind: code
    label: '@trpc12/experimental-tanstack-db'
    url: ../../packages/experimental-tanstack-db/src/index.ts
---

# Should `liveCollectionOptions` keep its own `@trpc12/experimental-tanstack-db` package?

## Why it matters

The human asked for a real-time story on the TanStack DB page. Two ways shipped: changes from a subscription written into a query collection (no new API), and `liveCollectionOptions`, a collection synced by one subscription, in a new `@trpc12/experimental-tanstack-db` (about 270 lines, Effect inside, Promises outside). Where it lives decides whether `@tanstack/db`, still at 0.15, becomes anyone else's peer dependency, and whether we version a package against its releases.

## Options

### A) Keep it as it is: its own experimental package

```ts twoslash
// ---cut-start---
// @filename: router.ts
import { initTrpc, type TrackedEnvelope } from '@trpc12/trpc/server';
import type { LiveEvent } from '@trpc12/experimental-tanstack-db';
import { z } from 'zod';
import type { Post } from './server.ts';
const t = initTrpc();
declare const posts: { list(): Post[]; save(post: Post): void };
declare function listen(
  signal: AbortSignal,
): AsyncIterable<TrackedEnvelope<LiveEvent<Post, string>>>;
declare function publish(change: LiveEvent<Post, string>): string;
export const router = {
  post: {
    live: t.procedure.subscription(async function* (opts) {
      const changes = listen(opts.signal);
      yield { type: 'snapshot', rows: posts.list() } as const;
      yield* changes;
    }),
    create: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => {
        posts.save(opts.input);
        return { eventId: publish({ type: 'upsert', row: opts.input }) };
      }),
  },
};
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
      const created = await client.post.create.mutate(
        opts.transaction.mutations[0].modified,
      );
      await opts.collection.utils.awaitEventId(created.eventId);
    },
  }),
);
```

- ✅ Matches the human's rule: an integration with its own peer dependencies is its own `@trpc12/*` package ([`integration-packages.md`](../decisions/integration-packages.md))
- ✅ Handles what hand-written sync configs get wrong: truncate on snapshot, `DuplicateKeySyncError` on resends, readiness, cleanup, and waiting for the write without deadlocking on TanStack DB's commit receipt
- ❌ One more package to release against TanStack DB's pre-1.0 versions (`>=0.15.0 <0.16.0` today)

### B) Drop the package; document only changes into a query collection

```ts twoslash
// ---cut-start---
// @filename: router.ts
import { experimental_Publisher, initTrpc } from '@trpc12/trpc/server';
import { Effect } from 'effect';
import { z } from 'zod';
import { db, type Post } from './server.ts';
const t = initTrpc();
type PostChange =
  | { type: 'upsert'; row: Post }
  | { type: 'delete'; key: string };
class PostEvents extends experimental_Publisher.Service<
  PostEvents,
  { changes: PostChange }
>()('PostEvents') {}
export const router = {
  post: {
    list: t.procedure.query(() => db.post.list()),
    changes: t.procedure.subscription((opts) =>
      PostEvents.subscribe('changes', { lastEventId: opts.lastEventId }),
    ),
    create: t.procedure
      .input(z.object({ title: z.string() }))
      .mutation((opts) =>
        Effect.gen(function* () {
          const post = db.post.create(opts.input.title);
          yield* PostEvents.publish('changes', { type: 'upsert', row: post });
          return post;
        }),
      ),
  },
};
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

- ✅ No package to maintain; it's TanStack DB's own API
- ❌ A change between the list's read and the subscription's start only shows on the next refetch, and the subscription's lifetime is the app's
- ❌ No wait for the server's write in mutation handlers, so the optimistic row can blink out

### C) Move it into `@trpc12/tanstack-query`

```ts
import { liveCollectionOptions } from '@trpc12/tanstack-query';
```

- ✅ No new package
- ❌ `@tanstack/db` becomes a peer of every TanStack Query user's package, which the integration-packages rule avoids

### D) A method on the options proxy

```ts twoslash
// ---cut-start---
// @filename: router.ts
import { initTrpc, type TrackedEnvelope } from '@trpc12/trpc/server';
import type { LiveEvent } from '@trpc12/experimental-tanstack-db';
import { z } from 'zod';
import type { Post } from './server.ts';
const t = initTrpc();
declare const posts: { list(): Post[]; save(post: Post): void };
declare function listen(
  signal: AbortSignal,
): AsyncIterable<TrackedEnvelope<LiveEvent<Post, string>>>;
declare function publish(change: LiveEvent<Post, string>): string;
export const router = {
  post: {
    live: t.procedure.subscription(async function* (opts) {
      const changes = listen(opts.signal);
      yield { type: 'snapshot', rows: posts.list() } as const;
      yield* changes;
    }),
    create: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => {
        posts.save(opts.input);
        return { eventId: publish({ type: 'upsert', row: opts.input }) };
      }),
  },
};
// @filename: app.ts
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { router } from './router.ts';
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
import { createCollection } from '@tanstack/db';
import { createOptionsProxyD as createOptionsProxy } from '../open/tanstack-db-live-package.ts';
const trpc = createOptionsProxy({ client });
// ---cut-end---
const posts = createCollection(
  trpc.post.live.collectionOptions({
    input: undefined,
    getKey: (post) => post.id,
    //       ^?
  }),
);
```

- ✅ No `subscribe` closure to write
- ❌ Binds the adapter to the options proxy and its client, which was decided against for query collections ([`tanstack-db-collections.md`](../decisions/tanstack-db-collections.md))
- ❌ Harder to point at a pooled subscription or an Effect client's `subscribe()`

## Recommendation

**A.** It follows the human's package rule, it's where the subtle parts live (readiness, resends, the write wait), and the `experimental-` name already says it can change with TanStack DB. Effect-native inside, as it is: the sync runs as a `Stream` fiber in a `Scope`, and `subscribe` may return an Effect `Stream`.

## Blocked until answered

- Publishing `@trpc12/experimental-tanstack-db` with the first release; it's `private` until then.
- The TanStack DB page's "A collection synced by a subscription" section, which B would remove.

## Details

Left out of the shipped package, for later under A:

- **Batched changes.** Each `upsert` or `delete` is its own TanStack DB transaction. A write touching several rows shows them one at a time; a `batch` event (several changes in one `begin`/`commit`) would apply them together. The live-queries spike's protocol had this as `changes`.
- **Resuming across reloads.** A reload starts with a snapshot. TanStack DB's sync metadata (`metadata.collection`, persisted when persistence is on) could keep the last `tracked()` id, so a reload sends it as `lastEventId` and gets only the changes, if the server keeps a log that long.
- **Row inference wants `subscribe` before `getKey`.** Both are context-sensitive, so TypeScript fixes the row from the first one; the docs write `subscribe` first, as `queryCollectionOptions` writes `queryFn` first.
