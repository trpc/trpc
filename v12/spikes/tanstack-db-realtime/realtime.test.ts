/**
 * Spike: real-time TanStack DB collections over tRPC subscriptions.
 *
 * A. A query collection refetched on each change event.
 * B. A query collection with change events written in (`utils.writeUpsert`):
 *    a fetch that started before a direct write keeps that key's write.
 * C. A collection synced by one subscription: a snapshot, then changes
 *    (`liveCollectionOptions` from `@trpc12/experimental-tanstack-db`).
 *
 * Plus the two hazards that shaped C: a server that reads the snapshot
 * before it subscribes loses a change, and a handler that doesn't wait for
 * its change makes the optimistic row blink.
 *
 * Note: `../.agent-docs/notes/tanstack-db-realtime.md`.
 */
import { EventEmitter, on } from 'node:events';
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { createCollection } from '@tanstack/db';
import { QueryClient } from '@tanstack/query-core';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { liveCollectionOptions } from '@trpc12/experimental-tanstack-db';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { TestServer } from '@trpc12/trpc/internal/testing';
import {
  experimental_Publisher,
  initTrpc,
  tracked,
  type TrackedEnvelope,
} from '@trpc12/trpc/server';
import { Context, Effect, Exit, Layer, Scope, Stream } from 'effect';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

interface Post {
  id: string;
  title: string;
}

type PostChange =
  | { readonly type: 'upsert'; readonly row: Post }
  | { readonly type: 'delete'; readonly key: string };

class Posts extends experimental_Publisher.Service<
  Posts,
  { changes: PostChange }
>()('Posts') {}

const t = initTrpc();

function createApp() {
  const posts = new Map<string, Post>([['1', { id: '1', title: 'A' }]]);
  const emitter = new EventEmitter();
  const stats = { lists: 0 };
  let seq = 0;
  const publish = (change: PostChange) => {
    const id = String(++seq);
    emitter.emit('change', tracked(id, change));
    return id;
  };
  /**
   * Listens from the call. An async generator would only start listening
   * at its first `next()`, after the snapshot is sent.
   */
  function changes(signal: AbortSignal) {
    const events = on(emitter, 'change', { signal });
    return (async function* () {
      for await (const args of events) {
        yield args[0] as TrackedEnvelope<PostChange>;
      }
    })();
  }
  const snapshot = () =>
    ({ type: 'snapshot', rows: [...posts.values()] }) as const;

  const router = t.router({
    post: {
      list: t.procedure.query(() => {
        stats.lists++;
        return [...posts.values()];
      }),
      changes: t.procedure.subscription(async function* (opts) {
        yield* changes(opts.signal);
      }),
      live: t.procedure.subscription(async function* (opts) {
        const pending = changes(opts.signal);
        const rows = snapshot();
        await new Promise((resolve) => setTimeout(resolve, 30));
        yield rows;
        yield* pending;
      }),
      /** Reads the snapshot, then subscribes: what `Stream.concat` does. */
      liveFromPublisher: t.procedure.subscription(() =>
        Stream.concat(
          // A database read that takes a moment after its read point.
          Stream.fromEffect(
            Effect.tap(Effect.sync(snapshot), () => Effect.sleep(30)),
          ),
          Posts.subscribe('changes'),
        ),
      ),
      create: t.procedure
        .input(z.object({ id: z.string(), title: z.string() }))
        .mutation((opts) =>
          Effect.gen(function* () {
            posts.set(opts.input.id, opts.input);
            const change = { type: 'upsert', row: opts.input } as const;
            yield* Posts.publish('changes', change);
            return { eventId: publish(change) };
          }),
        ),
    },
  });
  return { router, posts, stats };
}

type AppRouter = ReturnType<typeof createApp>['router'];

async function serve() {
  const app = createApp();
  const scope = Scope.makeUnsafe();
  const context = await Effect.runPromise(
    Layer.buildWithScope(
      TestServer.layer({ router: app.router, layer: Posts.memory() }).pipe(
        Layer.provide(
          NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
        ),
      ),
      scope,
    ),
  );
  const server = Context.get(context, TestServer);
  return {
    ...app,
    client: createTrpcClient({
      router: routerType<AppRouter>(),
      links: [httpLink({ url: server.url })],
    }),
    [Symbol.asyncDispose]: () =>
      Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}

/** Closes a collection, and with it the subscription that keeps the server open. */
const closing = <T extends { cleanup: () => Promise<void> }>(collection: T) =>
  Object.assign(collection, {
    [Symbol.asyncDispose]: () => collection.cleanup(),
  });

/** Aborts on dispose, so a failed test doesn't hold the server open. */
const aborting = () => {
  const controller = new AbortController();
  return Object.assign(controller, {
    [Symbol.dispose]: () => controller.abort(),
  });
};

async function* delayed<T>(events: AsyncIterable<T>, ms: number) {
  for await (const event of events) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    yield event;
  }
}

test('A: a query collection refetched on each change sees every write, one list per event', async () => {
  await using app = await serve();
  const queryClient = new QueryClient();
  await using posts = closing(
    createCollection(
      queryCollectionOptions({
        queryKey: ['post.list'],
        queryFn: () => app.client.post.list.query(),
        queryClient,
        getKey: (post) => post.id,
      }),
    ),
  );
  await posts.preload();
  using controller = aborting();
  void (async () => {
    for await (const _ of app.client.post.changes.subscribe(undefined, {
      signal: controller.signal,
    })) {
      await posts.utils.refetch();
    }
  })().catch(() => undefined);
  await vi.waitFor(() => expect(app.stats.lists).toBe(1));
  await new Promise((resolve) => setTimeout(resolve, 20));

  await app.client.post.create.mutate({ id: '2', title: 'B' });
  await app.client.post.create.mutate({ id: '3', title: 'C' });
  await vi.waitFor(() => expect(posts.size).toBe(3));
  expect(app.stats.lists).toBe(3);
});

test('B: a change written into a query collection wins over older fetches, per key, and a catch-up refetch still lands', async () => {
  await using app = await serve();
  const queryClient = new QueryClient();
  let gate: Promise<void> | undefined;
  let release!: () => void;
  const hold = () => {
    gate = new Promise<void>((resolve) => (release = resolve));
  };
  await using posts = closing(
    createCollection(
      queryCollectionOptions({
        queryKey: ['post.list'],
        queryFn: async () => {
          const rows = await app.client.post.list.query();
          await gate;
          return rows;
        },
        queryClient,
        getKey: (post) => post.id,
      }),
    ),
  );
  using controller = aborting();
  const applied: string[] = [];
  void (async () => {
    for await (const event of app.client.post.changes.subscribe(undefined, {
      signal: controller.signal,
    })) {
      if (event.data.type === 'upsert') {
        await posts.utils.writeUpsert(event.data.row);
        applied.push(event.data.row.title);
      }
    }
  })().catch(() => undefined);

  // The first fetch reads, then a write lands before its response.
  hold();
  const ready = posts.preload();
  await vi.waitFor(() => expect(app.stats.lists).toBe(1));
  await new Promise((resolve) => setTimeout(resolve, 20));
  await app.client.post.create.mutate({ id: '1', title: 'A2' });
  await vi.waitFor(() => expect(applied).toEqual(['A2']));
  release();
  await ready;
  expect(posts.get('1')?.title).toBe('A2');

  // A catch-up refetch (after a reconnect) reads a change the feed missed,
  // then a live change lands before its response.
  app.posts.set('9', { id: '9', title: 'Missed' });
  hold();
  const refetch = posts.utils.refetch();
  await vi.waitFor(() => expect(app.stats.lists).toBe(2));
  await app.client.post.create.mutate({ id: '1', title: 'A3' });
  await vi.waitFor(() => expect(applied).toEqual(['A2', 'A3']));
  release();
  await refetch;

  expect(posts.get('1')?.title).toBe('A3');
  expect(posts.get('9')?.title).toBe('Missed');
});

test('C: a server that reads its snapshot before subscribing to the Publisher loses a change', async () => {
  await using app = await serve();
  await using posts = closing(
    createCollection(
      liveCollectionOptions({
        subscribe: (opts) =>
          app.client.post.liveFromPublisher.subscribe(undefined, opts),
        getKey: (post) => post.id,
      }),
    ),
  );
  const ready = posts.preload();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await app.client.post.create.mutate({ id: '2', title: 'B' });
  await ready;
  await app.client.post.create.mutate({ id: '3', title: 'C' });
  await vi.waitFor(() => expect(posts.has('3')).toBe(true));

  expect(posts.has('2')).toBe(false);
});

test('C: a server that listens before reading its snapshot misses nothing', async () => {
  await using app = await serve();
  await using posts = closing(
    createCollection(
      liveCollectionOptions({
        subscribe: (opts) => app.client.post.live.subscribe(undefined, opts),
        getKey: (post) => post.id,
      }),
    ),
  );
  const ready = posts.preload();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await app.client.post.create.mutate({ id: '2', title: 'B' });
  await ready;
  await app.client.post.create.mutate({ id: '3', title: 'C' });
  await vi.waitFor(() =>
    expect(posts.toArray.map((post) => post.id)).toEqual(['1', '2', '3']),
  );
});

test('C: a handler that does not await its event id lets the optimistic row blink out', async () => {
  await using app = await serve();
  await using posts = closing(
    createCollection(
      liveCollectionOptions({
        subscribe: (opts) =>
          delayed(app.client.post.live.subscribe(undefined, opts), 50),
        getKey: (post) => post.id,
        onInsert: async (opts) => {
          for (const mutation of opts.transaction.mutations) {
            await app.client.post.create.mutate(mutation.modified);
          }
        },
      }),
    ),
  );
  await posts.preload();
  const present: boolean[] = [];
  const watch = posts.subscribeChanges(() => present.push(posts.has('2')));
  await posts.insert({ id: '2', title: 'Mine' }).when('settled');
  await vi.waitFor(() => expect(posts.get('2')?.$hasPendingWrites).toBe(false));
  watch.unsubscribe();

  expect(present).toEqual([true, false, true]);
});
