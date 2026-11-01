import { EventEmitter, on } from 'node:events';
import { createServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { NodeHttpServer } from '@effect/platform-node';
import { createCollection } from '@tanstack/db';
import {
  createTrpcClient,
  httpLink,
  routerType,
  wsLink,
} from '@trpc12/trpc/client';
import { TestServer } from '@trpc12/trpc/internal/testing';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import { initTrpc, tracked, type TrackedEnvelope } from '@trpc12/trpc/server';
import { Context, Effect, Exit, Layer, Scope, Stream } from 'effect';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { z } from 'zod';
import { liveCollectionOptions, type LiveEvent } from './index.ts';

interface Post {
  id: string;
  title: string;
  createdAt: Date;
}

type PostChange = LiveEvent<Post, string>;

const transformer = experimental_createProgressiveJson();
const t = initTrpc();

function createDb() {
  const posts = new Map<string, Post>();
  const emitter = new EventEmitter();
  const stats = { feeds: 0, resumes: 0, snapshots: 0 };
  const log: TrackedEnvelope<PostChange>[] = [];
  let seq = 0;
  const publish = (change: PostChange) => {
    const event = tracked(String(++seq), change);
    log.push(event);
    emitter.emit('change', event);
    return event.id;
  };
  /** Listens from the call, so a snapshot read after it misses nothing. */
  function changes(signal: AbortSignal) {
    const events = on(emitter, 'change', { signal });
    return (async function* (): AsyncGenerator<TrackedEnvelope<PostChange>> {
      for await (const args of events) {
        yield args[0] as TrackedEnvelope<PostChange>;
      }
    })();
  }
  const snapshot = () => {
    stats.snapshots++;
    return { type: 'snapshot', rows: [...posts.values()] } as const;
  };
  return {
    posts,
    stats,
    log,
    changes,
    snapshot,
    /** The logged changes after `id`, or `undefined` once it's gone from the log. */
    since: (id: string) => {
      const at = log.findIndex((event) => event.id === id);
      return at === -1 ? undefined : log.slice(at + 1);
    },
    upsert: (post: Post) => {
      posts.set(post.id, post);
      return publish({ type: 'upsert', row: post });
    },
    remove: (id: string) => {
      posts.delete(id);
      return publish({ type: 'delete', key: id });
    },
  };
}

function createRouter(db: ReturnType<typeof createDb>) {
  return t.router({
    post: {
      live: t.procedure.subscription(async function* (opts) {
        db.stats.feeds++;
        if (opts.lastEventId) db.stats.resumes++;
        const changes = db.changes(opts.signal);
        yield db.snapshot();
        yield* changes;
      }),
      resumable: t.procedure.subscription(async function* (opts) {
        db.stats.feeds++;
        const changes = db.changes(opts.signal);
        const missed = opts.lastEventId
          ? db.since(opts.lastEventId)
          : undefined;
        if (missed) yield* missed;
        else yield db.snapshot();
        yield* changes;
      }),
      create: t.procedure
        .input(z.object({ id: z.string(), title: z.string() }))
        .mutation((opts) => {
          const post: Post = { ...opts.input, createdAt: new Date() };
          return { post, eventId: db.upsert(post) };
        }),
      rename: t.procedure
        .input(z.object({ id: z.string(), title: z.string() }))
        .mutation((opts) => {
          const post = db.posts.get(opts.input.id)!;
          return { eventId: db.upsert({ ...post, title: opts.input.title }) };
        }),
      remove: t.procedure
        .input(z.object({ id: z.string() }))
        .mutation((opts) => ({ eventId: db.remove(opts.input.id) })),
    },
  });
}

type AppRouter = ReturnType<typeof createRouter>;

const seed = (db: ReturnType<typeof createDb>) => {
  for (const id of ['1', '2']) {
    db.posts.set(id, { id, title: `Post ${id}`, createdAt: new Date(0) });
  }
};

/** The router on a real port, with fresh posts. */
async function serve() {
  const db = createDb();
  seed(db);
  const server = createServer();
  const sockets = new Set<Duplex>();
  server.on('upgrade', (_req, socket: Duplex) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const scope = Scope.makeUnsafe();
  const context = await Effect.runPromise(
    Layer.buildWithScope(
      TestServer.layer({ router: createRouter(db), transformer }).pipe(
        Layer.provide(
          NodeHttpServer.layer(() => server, { port: 0, host: '127.0.0.1' }),
        ),
      ),
      scope,
    ),
  );
  const testServer = Context.get(context, TestServer);
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: testServer.url, transformer })],
  });
  return {
    db,
    client,
    wsUrl: testServer.wsUrl,
    dropSockets: () => {
      for (const socket of sockets) socket.destroy();
    },
    [Symbol.asyncDispose]: async () => {
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await Effect.runPromise(Scope.close(scope, Exit.void));
    },
  };
}

/** Closes a collection, and with it the subscription that keeps the server open. */
const closing = <T extends { cleanup: () => Promise<void> }>(collection: T) =>
  Object.assign(collection, {
    [Symbol.asyncDispose]: () => collection.cleanup(),
  });

/** Delays each event, like a slow network. */
async function* delayed<T>(events: AsyncIterable<T>, ms: number) {
  for await (const event of events) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    yield event;
  }
}

test('a live collection loads the snapshot, then applies changes from anywhere', async () => {
  await using app = await serve();
  const posts = createCollection(
    liveCollectionOptions({
      subscribe: (opts) => app.client.post.live.subscribe(undefined, opts),
      getKey: (post) => post.id,
    }),
  );
  await posts.preload();

  expectTypeOf(posts.toArray).items.toExtend<Post>();
  expect(posts.toArray.map((post) => post.title)).toEqual(['Post 1', 'Post 2']);
  expect(posts.get('1')?.createdAt).toBeInstanceOf(Date);

  await app.client.post.create.mutate({ id: '3', title: 'Post 3' });
  await app.client.post.rename.mutate({ id: '1', title: 'Renamed' });
  await app.client.post.remove.mutate({ id: '2' });
  await vi.waitFor(() =>
    expect(posts.toArray.map((post) => post.title)).toEqual([
      'Renamed',
      'Post 3',
    ]),
  );
  await posts.cleanup();
});

test('changes the collection already has are harmless', async () => {
  const events: PostChange[] = [
    {
      type: 'snapshot',
      rows: [{ id: '1', title: 'A', createdAt: new Date(0) }],
    },
    { type: 'upsert', row: { id: '1', title: 'A', createdAt: new Date(0) } },
    { type: 'upsert', row: { id: '1', title: 'B', createdAt: new Date(0) } },
    { type: 'delete', key: '2' },
    { type: 'upsert', row: { id: '2', title: 'C', createdAt: new Date(0) } },
    { type: 'upsert', row: { id: '2', title: 'C', createdAt: new Date(0) } },
  ];
  const posts = createCollection(
    liveCollectionOptions({
      subscribe: async function* () {
        yield* events;
      },
      getKey: (post) => post.id,
    }),
  );
  await posts.preload();
  await vi.waitFor(() =>
    expect(posts.toArray.map((post) => post.title)).toEqual(['B', 'C']),
  );
  await posts.cleanup();
});

test('a handler that awaits its event id keeps the optimistic row until the server row arrives', async () => {
  await using app = await serve();
  const posts = createCollection(
    liveCollectionOptions({
      subscribe: (opts) =>
        delayed(app.client.post.live.subscribe(undefined, opts), 30),
      getKey: (post) => post.id,
      onInsert: async (opts) => {
        for (const mutation of opts.transaction.mutations) {
          const created = await app.client.post.create.mutate({
            id: mutation.modified.id,
            title: mutation.modified.title,
          });
          await opts.collection.utils.awaitEventId(created.eventId);
        }
      },
    }),
  );
  await posts.preload();

  const present: boolean[] = [];
  const watch = posts.subscribeChanges(() => present.push(posts.has('3')));
  const tx = posts.insert({ id: '3', title: 'Mine', createdAt: new Date() });
  await tx.when('settled');
  await vi.waitFor(() => expect(posts.get('3')?.$hasPendingWrites).toBe(false));
  watch.unsubscribe();

  expect(present).not.toContain(false);
  expect(app.db.posts.get('3')?.title).toBe('Mine');
  await posts.cleanup();
});

test('awaitEventId resolves for an event applied before the call, and rejects after its timeout', async () => {
  await using app = await serve();
  const posts = createCollection(
    liveCollectionOptions({
      subscribe: (opts) => app.client.post.live.subscribe(undefined, opts),
      getKey: (post) => post.id,
    }),
  );
  await posts.preload();
  const created = await app.client.post.create.mutate({ id: '3', title: 'C' });
  await vi.waitFor(() => expect(posts.has('3')).toBe(true));

  await expect(posts.utils.awaitEventId(created.eventId)).resolves.toBe(
    undefined,
  );
  await expect(posts.utils.awaitEventId('never', 20)).rejects.toThrow(
    'Timed out after 20ms awaiting event never',
  );
  await posts.cleanup();
});

test('after a dropped WebSocket, the new snapshot replaces the rows', async () => {
  await using app = await serve();
  await using ws = wsLink({
    url: app.wsUrl,
    transformer,
    reconnect: { delay: () => 10 },
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [ws],
  });
  const posts = createCollection(
    liveCollectionOptions({
      subscribe: (opts) => client.post.live.subscribe(undefined, opts),
      getKey: (post) => post.id,
    }),
  );
  await posts.preload();
  await app.client.post.create.mutate({ id: '3', title: 'C' });
  await vi.waitFor(() => expect(posts.size).toBe(3));

  app.dropSockets();
  app.db.posts.delete('1');
  await vi.waitFor(() => expect(app.db.stats.feeds).toBe(2));
  await vi.waitFor(() =>
    expect(posts.toArray.map((post) => post.id)).toEqual(['2', '3']),
  );
  expect(app.db.stats.resumes).toBe(1);
  await posts.cleanup();
});

test('a server with a change log resumes a dropped WebSocket with the changes it missed', async () => {
  await using app = await serve();
  await using ws = wsLink({
    url: app.wsUrl,
    transformer,
    reconnect: { delay: () => 10 },
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [ws],
  });
  await using posts = closing(
    createCollection(
      liveCollectionOptions({
        subscribe: (opts) => client.post.resumable.subscribe(undefined, opts),
        getKey: (post) => post.id,
      }),
    ),
  );
  await posts.preload();
  await app.client.post.create.mutate({ id: '3', title: 'C' });
  await vi.waitFor(() => expect(posts.size).toBe(3));

  app.dropSockets();
  await app.client.post.remove.mutate({ id: '1' });
  await app.client.post.rename.mutate({ id: '2', title: 'While away' });
  await vi.waitFor(() =>
    expect(posts.toArray.map((post) => post.title)).toEqual([
      'While away',
      'C',
    ]),
  );
  expect(app.db.stats).toMatchObject({ feeds: 2, snapshots: 1 });

  app.db.log.length = 0;
  app.dropSockets();
  await vi.waitFor(() => expect(app.db.stats.feeds).toBe(3));
  await vi.waitFor(() => expect(app.db.stats.snapshots).toBe(2));
  expect(posts.toArray.map((post) => post.title)).toEqual(['While away', 'C']);
});

test('a failed subscription puts the collection in its error status', async () => {
  const posts = createCollection(
    liveCollectionOptions<Post, string>({
      subscribe: async function* () {
        yield { type: 'snapshot', rows: [] };
        throw new Error('gone');
      },
      getKey: (post) => post.id,
    }),
  );
  posts.preload().catch(() => undefined);
  await vi.waitFor(() => expect(posts.status).toBe('error'));
  await posts.cleanup();
});

test('cleanup aborts the signal of a subscription that awaits it, and leaves no error', async () => {
  let signal: AbortSignal | undefined;
  let ended = false;
  const posts = createCollection(
    liveCollectionOptions<Post, string>({
      subscribe: async function* (opts) {
        signal = opts.signal;
        try {
          yield { type: 'snapshot', rows: [] };
          await new Promise((_, reject) =>
            opts.signal.addEventListener('abort', () =>
              reject(opts.signal.reason),
            ),
          );
        } finally {
          ended = true;
        }
      },
      getKey: (post) => post.id,
    }),
  );
  await posts.preload();
  await posts.cleanup();
  expect(signal?.aborted).toBe(true);
  await vi.waitFor(() => expect(ended).toBe(true));
  expect(posts.status).toBe('cleaned-up');
});

test('a subscription can be an Effect Stream, interrupted by cleanup, and its failure is the error', async () => {
  let ended = 0;
  const posts = createCollection(
    liveCollectionOptions({
      subscribe: () =>
        Stream.fromIterable<PostChange>([
          { type: 'snapshot', rows: [] },
          {
            type: 'upsert',
            row: { id: '1', title: 'From a Stream', createdAt: new Date(0) },
          },
        ]).pipe(
          Stream.concat(Stream.never),
          Stream.ensuring(Effect.sync(() => ended++)),
        ),
      getKey: (post) => post.id,
    }),
  );
  await posts.preload();
  expect(posts.get('1')?.title).toBe('From a Stream');
  await posts.cleanup();
  expect(ended).toBe(1);

  const failing = createCollection(
    liveCollectionOptions<Post, string>({
      subscribe: () => Stream.fail(new Error('gone')),
      getKey: (post) => post.id,
    }),
  );
  failing.preload().catch(() => undefined);
  await vi.waitFor(() => expect(failing.status).toBe('error'));
  await failing.cleanup();
});

test('cleanup closes the subscription', async () => {
  await using app = await serve();
  let closed = false;
  const posts = createCollection(
    liveCollectionOptions({
      subscribe: async function* (opts) {
        try {
          yield* app.client.post.live.subscribe(undefined, opts);
        } finally {
          closed = true;
        }
      },
      getKey: (post) => post.id,
    }),
  );
  await posts.preload();
  await posts.cleanup();
  await vi.waitFor(() => expect(closed).toBe(true));
});
