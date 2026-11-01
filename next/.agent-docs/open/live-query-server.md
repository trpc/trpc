---
title: How should the server half of a live query ship?
summary: A live collection's server must listen before it reads its snapshot. Keep that a recipe, add a `Publisher` snapshot, or ship `@trpc12/trpc/live`.
area: live
recommended: B
questions: [Q26.1, Q26.2]
links:
  - kind: spike
    label: tanstack-db-realtime
    url: ../../spikes/tanstack-db-realtime/
  - kind: spike
    label: live-queries
    url: ../../spikes/live-queries/
  - kind: docs
    label: TanStack DB, Real-time
    url: https://v12.trpc.io/v12/docs/integrations/tanstack-query/tanstack-db?flags=tanstack-db#real-time
  - kind: proposal
    label: 26 Live queries and sync
    url: ../proposals/26-live-queries-and-sync.md
  - kind: decision
    label: tanstack-db-live-collections
    url: ../decisions/tanstack-db-live-collections.md
  - kind: decision
    label: live-queries
    url: ../decisions/live-queries.md
  - kind: note
    label: live-queries spike
    url: ../notes/live-queries.md
  - kind: code
    label: experimental_Publisher
    url: ../../packages/trpc/src/server/subscriptions/publisher.ts
---

# How should the server half of a live query ship?

## Why it matters

The client half shipped: `liveCollectionOptions` in `@trpc12/experimental-tanstack-db` syncs a TanStack DB collection from a subscription of `snapshot`, `upsert` and `delete` events. The server half is the app's. It must start listening for changes before it reads the snapshot, or a write in between is lost. The `Publisher` can't do that: its `subscribe()` only subscribes on its first pull, and a snapshot has no publisher position to resume from. So the docs hand-roll it with `node:events`, and that version is easy to get wrong: an async generator that calls `on()` only listens from its first `next()`.

## Options

### A) Keep it as it is: a docs recipe

The docs show a resolver that listens first, then yields the snapshot, with the app's own change feed and log.

```ts twoslash
// ---cut-start---
import type { TrackedEnvelope } from '@trpc12/trpc/server';
import type { LiveEvent } from '@trpc12/experimental-tanstack-db';
import { t } from './server.ts';
import { z } from 'zod';
interface Post {
  id: string;
  title: string;
  authorId: string;
}
const NewPost = z.object({
  id: z.string(),
  title: z.string(),
  authorId: z.string(),
});
type PostChange = LiveEvent<Post, string>;
declare const posts: { list(): Post[]; save(post: Post): void };
declare function listen(
  signal: AbortSignal,
): AsyncIterable<TrackedEnvelope<PostChange>>;
declare const log: {
  since(id: string): TrackedEnvelope<PostChange>[] | undefined;
};
declare function publish(change: PostChange): string;
// ---cut-end---
const router = t.router({
  post: {
    live: t.procedure.subscription(async function* (opts) {
      const changes = listen(opts.signal); // yours: node:events `on()`, or a DB change feed
      const missed = opts.lastEventId ? log.since(opts.lastEventId) : undefined;
      if (missed) yield* missed;
      else yield { type: 'snapshot', rows: posts.list() } as const;
      yield* changes;
    }),
    create: t.procedure.input(NewPost).mutation((opts) => {
      posts.save(opts.input);
      return { eventId: publish({ type: 'upsert', row: opts.input }) };
    }),
  },
});
```

- ✅ Built, documented and tested; nothing new in `@trpc12/trpc`
- ✅ Works with any source: the app owns ordering and ids
- ❌ Every app rewrites the listen-first rule and its log, which is where the spikes found bugs
- ❌ Doesn't use the `Publisher`, so the Redis, Postgres and Durable Object backends don't help

### B) A gapless `Publisher` snapshot

`subscribe(channel, { snapshot })` subscribes first, then runs the snapshot read, and gives the snapshot the publisher's latest id. A resume the buffer still covers replays the missed events instead of a new snapshot.

```ts twoslash
// ---cut-start---
import { Effect } from 'effect';
import type { LiveEvent } from '@trpc12/experimental-tanstack-db';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { experimental_PublisherB as experimental_Publisher } from '../open/live-query-server.ts';
const t = initTrpc();
import { z } from 'zod';
interface Post {
  id: string;
  title: string;
  authorId: string;
}
const NewPost = z.object({
  id: z.string(),
  title: z.string(),
  authorId: z.string(),
});
type PostChange = LiveEvent<Post, string>;
declare const posts: { list(): Post[]; save(post: Post): void };
// ---cut-end---
class PostEvents extends experimental_Publisher.Service<
  PostEvents,
  { changes: PostChange }
>()('PostEvents') {}

const router = t.router({
  post: {
    live: t.procedure.subscription((opts) =>
      PostEvents.subscribe('changes', {
        lastEventId: opts.lastEventId,
        snapshot: Effect.sync(
          () => ({ type: 'snapshot', rows: posts.list() }) as const,
        ),
      }),
    ),
    create: t.procedure.input(NewPost).mutation((opts) =>
      Effect.gen(function* () {
        posts.save(opts.input);
        const eventId = yield* PostEvents.publish('changes', {
          type: 'upsert',
          row: opts.input,
        });
        return { eventId };
      }),
    ),
  },
});

createFetchHandler({ router, layer: PostEvents.memory({ buffer: 100 }) });
```

- ✅ Effect-native: one option on the existing `Publisher` service; the snapshot is an `Effect`
- ✅ Closes the gap the shipped adapter hits today, with no new entry point; multi-process backends work as they are swapped by layers
- ❌ Every backend (memory, and the Redis, Postgres and Durable Object guides) needs a "latest id" read to give the snapshot a position
- ❌ Publisher ids are opaque and shared across channels, so a dropped event is silent until the next snapshot; filtering by shape is the app's

### C) An experimental `@trpc12/trpc/live`

`Live.feed()` over a source interface with a contiguous version per source, a commit log, shapes and empty batches; a memory source ships, database sources are guides. This was the agent's earlier tentative pick.

```ts twoslash
// ---cut-start---
import { Effect } from 'effect';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { LiveC as Live } from '../open/live-query-server.ts';
import { z } from 'zod';
interface Post {
  id: string;
  title: string;
  authorId: string;
}
const NewPost = z.object({
  id: z.string(),
  title: z.string(),
  authorId: z.string(),
});
const PostFilter = z.object({ authorId: z.string().optional() });
declare function currentUser(): { id: string };
const t = {
  procedure: initTrpc().procedure.use((opts) =>
    opts.next({ ctx: { user: currentUser() } }),
  ),
  router: initTrpc().router,
};
// ---cut-end---
// Live from '@trpc12/trpc/live'
class Posts extends Live.Source<Posts, Post>()('Posts') {}

const router = t.router({
  post: {
    live: t.procedure.input(PostFilter).subscription((opts) =>
      Live.feed(Posts, {
        lastEventId: opts.lastEventId,
        where: (post) => post.authorId === opts.ctx.user.id,
      }),
    ),
    create: t.procedure.input(NewPost).mutation((opts) =>
      Effect.gen(function* () {
        const version = yield* Posts.mutate((draft) => draft.set(opts.input));
        return { eventId: String(version) };
      }),
    ),
  },
});

createFetchHandler({
  router,
  layer: Posts.memory({ getKey: (post) => post.id }),
});
```

- ✅ The ordering rules live in one tested place: snapshot and position read together, gaps read from the log, empty batches so a client waiting on a write it can't see still resolves
- ✅ Shapes and gap detection come built in (the spike: a lossy publisher dropped a commit and the feed still sent every version)
- ❌ A new entry point to keep stable, and a source interface that has to fit Postgres logical replication, Electric and in-memory stores; only memory is proven
- ❌ The spike's protocol (`changes` batches, integer versions) differs from the shipped adapter's `LiveEvent`, so the adapter changes too

### D) A `live` procedure type

`t.procedure.live({ getKey, source })` is a query (the snapshot, for SSR) and a subscription (the changes) at once.

```ts twoslash
// ---cut-start---
import { createCollection } from '@tanstack/db';
import type { QueryClient } from '@tanstack/react-query';
import { initTrpc } from '@trpc12/trpc/server';
import {
  LiveC as Live,
  liveableD,
  type LiveOptionsProxyD,
} from '../open/live-query-server.ts';
import { z } from 'zod';
interface Post {
  id: string;
  title: string;
  authorId: string;
}
const NewPost = z.object({
  id: z.string(),
  title: z.string(),
  authorId: z.string(),
});
const PostFilter = z.object({ authorId: z.string().optional() });
const root = initTrpc<{ ctx: { user: { id: string } } }>();
const t = {
  procedure: {
    input: (schema: typeof PostFilter) =>
      liveableD(root.procedure.input(schema)),
  },
};
class Posts extends Live.Source<Posts, Post>()('Posts') {}
declare const queryClient: QueryClient;
declare const trpc: LiveOptionsProxyD<typeof router>;
// ---cut-end---
const router = {
  post: {
    live: t.procedure.input(PostFilter).live({
      getKey: (post) => post.id,
      source: Posts,
      where: (opts) => (post) => post.authorId === opts.ctx.user.id,
    }),
  },
};

await queryClient.prefetchQuery(trpc.post.live.queryOptions({})); // SSR snapshot
createCollection(trpc.post.live.collectionOptions({})); // live rows
```

- ✅ One definition gives the SSR snapshot, the collection and its keys
- ❌ A fourth procedure type through the protocol, contracts, OpenAPI and every adapter
- ❌ Needs C's source first

## Recommendation

**B.** It fixes the one rule every live server needs today, inside the Effect service that already does fan-out and resume, and fits the shipped adapter as it is (opaque `tracked()` ids, idempotent writes). C can come later on top of it once a database source is proven; D after C has had real use. Effect-native first ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)).

## Blocked until answered

- The docs' Real-time section keeps the `node:events` recipe until this is answered.
- Live-query pooling ([`live-query-pooling.md`](./live-query-pooling.md)) and shapes ([`live-query-row-selection.md`](./live-query-row-selection.md)) build on whichever server half ships.

## Details

This file also covers Q26.2, the version format, since each option fixes it:

- A: whatever ids the app's log uses.
- B: the publisher's ids. Opaque strings; the shipped `awaitEventId(id)` waits until it has seen that id, or a newer snapshot, so it needs no ordering.
- C and D: a contiguous integer per source (Q26.2 A). A feed that sees `n + 2` after `n` reads the gap from its log, and `awaitEventId` could compare with `>=`. Given up there: the database's own opaque position (Q26.2 B, no gap detection) and one counter across sources (Q26.2 C, one wait per multi-table write, but every write moves every feed).

With opaque ids, a mutation whose event a collection never receives (another channel, or filtered out) makes `awaitEventId` reject after its 10 s timeout. With C's empty batches it resolves. Under B that means one channel per audience, as the publisher-tags answer has it, and no filtering inside a channel.

How a mutation reports its id (Q26.3) isn't open: the shipped docs and adapter return it in the mutation's output (`return { eventId }`), which works on every transport. A response header would need `wsLink` to provide `'response'`, which is the open item in [`declared-invalidation-later.md`](../decisions/declared-invalidation-later.md).
