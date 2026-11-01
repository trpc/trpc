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
import {
  createFetchHandler,
  initTrpc,
  experimental_makeMemoryPublisher,
} from '@trpc12/trpc/server';
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Scope,
  Stream,
} from 'effect';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { z } from 'zod';
import {
  createLivePool,
  liveCollectionOptions,
  versionOf,
  type OpenFeed,
} from './collection.ts';
import {
  LiveCommits,
  liveFeeds,
  makeLiveTable,
  VERSION_HEADER,
  type Commit,
  type LiveEvent,
  type LiveTable,
} from './live.ts';

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

const seed: Todo[] = [
  { id: '1', title: 'A', done: false },
  { id: '2', title: 'B', done: true },
];
const getKey = (todo: Todo) => todo.id;

class Todos extends Context.Service<Todos, LiveTable<Todo>>()('Todos') {}

const layer = (history = 100) =>
  Layer.effect(Todos)(
    makeLiveTable<Todo>({ name: 'todos', getKey, rows: seed, history }),
  ).pipe(Layer.provide(LiveCommits.memory({ buffer: 100 })));

const t = initTrpc();
const TodoFilter = z.object({ done: z.boolean().optional() });

const feeds = {
  todos: (input: z.infer<typeof TodoFilter>, lastEventId: string | undefined) =>
    Stream.unwrap(
      Effect.map(Todos, (todos) =>
        todos.feed({
          lastEventId,
          where:
            input.done === undefined
              ? undefined
              : (todo) => todo.done === input.done,
        }),
      ),
    ),
  todo: (input: { id: string }, lastEventId: string | undefined) =>
    Stream.unwrap(
      Effect.map(Todos, (todos) =>
        todos.feed({ lastEventId, where: (todo) => todo.id === input.id }),
      ),
    ),
};

const PooledInput = z.object({
  subs: z.record(
    z.string(),
    z.discriminatedUnion('feed', [
      z.object({ feed: z.literal('todos'), input: TodoFilter }),
      z.object({
        feed: z.literal('todo'),
        input: z.object({ id: z.string() }),
      }),
    ]),
  ),
});

const router = t.router({
  todo: {
    live: t.procedure
      .input(TodoFilter)
      .subscription((opts) => feeds.todos(opts.input, opts.lastEventId)),
    add: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) =>
        Effect.gen(function* () {
          const todos = yield* Todos;
          const version = yield* todos.mutate((draft) =>
            draft.set({ ...opts.input, done: false }),
          );
          opts.response.headers.set(VERSION_HEADER, String(version));
          return { id: opts.input.id };
        }),
      ),
    check: t.procedure.input(z.object({ id: z.string() })).mutation((opts) =>
      Effect.gen(function* () {
        const todos = yield* Todos;
        const version = yield* todos.mutate((draft) => {
          const todo = draft.get(opts.input.id);
          if (todo) draft.set({ ...todo, done: true });
        });
        opts.response.headers.set(VERSION_HEADER, String(version));
      }),
    ),
  },
  live: t.procedure
    .input(PooledInput)
    .subscription((opts) => liveFeeds(feeds)(opts)),
  stats: t.procedure.query(() =>
    Effect.map(Todos, (todos) => ({ ...todos.stats })),
  ),
});
type AppRouter = typeof router;

/** The router over in-memory fetch, recording request paths. */
function setup() {
  const handler = createFetchHandler({ router, layer: layer() });
  const paths: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    paths.push(new URL(request.url).pathname);
    const res = await handler.fetch(request);
    if (!res.body) return res;
    // As over a network, an aborted request ends its response: in memory,
    // a quiet SSE body would otherwise keep the client's reader waiting.
    const body = new TransformStream();
    res.body
      .pipeTo(body.writable, { signal: request.signal })
      .catch(() => undefined);
    return new Response(body.readable, res);
  };
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: 'http://localhost/trpc', fetch })],
  });
  return {
    client,
    paths,
    [Symbol.asyncDispose]: () => handler.dispose(),
  };
}

/** Delays each event, like a slow network. */
const slow =
  <Row>(feed: OpenFeed<Row>, ms: number): OpenFeed<Row> =>
  (opts) =>
    Stream.toAsyncIterable(
      Stream.fromAsyncIterable(feed(opts), (cause) => cause).pipe(
        Stream.tap(() => Effect.sleep(ms)),
      ),
    );

const runTable = <A>(
  effect: Effect.Effect<A, never, LiveCommits | Scope.Scope>,
  commits: Layer.Layer<LiveCommits> = LiveCommits.memory({ buffer: 100 }),
) => Effect.runPromise(Effect.scoped(Effect.provide(effect, commits)));

/** Runs `feed` until it has `n` events, starting `writes` after the first. */
const collectFeed = (
  feed: Stream.Stream<LiveEvent<Todo>>,
  n: number,
  writes: Effect.Effect<unknown>,
) =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const fiber = yield* feed.pipe(
      Stream.tap(() => Deferred.succeed(started, undefined)),
      Stream.take(n),
      Stream.runCollect,
      Effect.forkChild,
    );
    yield* Deferred.await(started);
    yield* writes;
    return yield* Fiber.join(fiber);
  });

test('a feed sends a snapshot, then each commit as the changes its shape sees', async () => {
  const events = await runTable(
    Effect.gen(function* () {
      const todos = yield* makeLiveTable<Todo>({
        name: 'todos',
        getKey,
        rows: seed,
      });
      return yield* collectFeed(
        todos.feed({ where: (todo) => !todo.done }),
        4,
        Effect.all([
          todos.mutate((d) => d.set({ id: '3', title: 'C', done: false })),
          todos.mutate((d) => d.set({ ...d.get('1')!, done: true })),
          todos.mutate((d) => d.set({ ...d.get('2')!, title: 'B2' })),
        ]),
      );
    }),
  );
  expect(events.map((e) => [e.id, e.data])).toEqual([
    ['0', { kind: 'snapshot', rows: [seed[0]] }],
    [
      '1',
      {
        kind: 'changes',
        changes: [
          { type: 'insert', value: { id: '3', title: 'C', done: false } },
        ],
      },
    ],
    ['2', { kind: 'changes', changes: [{ type: 'delete', key: '1' }] }],
    // Invisible to this shape, but the cursor still moves.
    ['3', { kind: 'changes', changes: [] }],
  ]);
});

test('a resume gets the commits after lastEventId, or a snapshot once the log has moved on', async () => {
  const result = await runTable(
    Effect.gen(function* () {
      const todos = yield* makeLiveTable<Todo>({
        name: 'todos',
        getKey,
        rows: seed,
        history: 2,
      });
      for (const title of ['x', 'y', 'z']) {
        yield* todos.mutate((d) => d.set({ ...d.get('1')!, title }));
      }
      const first = (lastEventId: string) =>
        todos.feed({ lastEventId }).pipe(Stream.take(1), Stream.runCollect);
      return {
        fromOne: yield* first('1'),
        fromZero: yield* first('0'),
        unknown: yield* first('99'),
        stats: { ...todos.stats },
      };
    }),
  );
  expect(result.fromOne.map((e) => [e.id, e.data.kind])).toEqual([
    ['2', 'changes'],
  ]);
  expect(result.fromZero.map((e) => [e.id, e.data.kind])).toEqual([
    ['3', 'snapshot'],
  ]);
  expect(result.unknown.map((e) => e.data.kind)).toEqual(['snapshot']);
  expect(result.stats.snapshots).toBe(2);
});

test('commits the backend drops are read from the log', async () => {
  const lossy = Layer.effect(LiveCommits)(
    Effect.map(
      experimental_makeMemoryPublisher<{ [table: `table:${string}`]: Commit }>({
        buffer: 100,
      }),
      (publisher) => {
        let n = 0;
        return {
          ...publisher,
          publish: (channel, data) =>
            ++n === 2
              ? Effect.succeed('lost')
              : publisher.publish(channel, data),
        } satisfies typeof publisher;
      },
    ),
  );
  const result = await runTable(
    Effect.gen(function* () {
      const todos = yield* makeLiveTable<Todo>({
        name: 'todos',
        getKey,
        rows: seed,
      });
      const events = yield* collectFeed(
        todos.feed(),
        4,
        Effect.forEach(['x', 'y', 'z'], (title) =>
          todos.mutate((d) => d.set({ ...d.get('1')!, title })),
        ),
      );
      return { events, gaps: todos.stats.gaps };
    }),
    lossy,
  );
  expect(result.events.map((e) => e.id)).toEqual(['0', '1', '2', '3']);
  expect(result.gaps).toBe(1);
});

test('a TanStack DB collection syncs from a live subscription over SSE', async () => {
  await using app = setup();
  const todos = createCollection(
    liveCollectionOptions({
      id: 'todos',
      getKey,
      feed: (opts) => app.client.todo.live.subscribe({}, opts),
    }),
  );
  await todos.preload();
  expectTypeOf(todos.toArray).items.toExtend<Todo>();
  expect(todos.toArray.map((todo) => todo.title)).toEqual(['A', 'B']);

  await app.client.todo.add.mutate({ id: '9', title: 'From elsewhere' });
  await vi.waitFor(() => expect(todos.get('9')?.title).toBe('From elsewhere'));
  await app.client.todo.check.mutate({ id: '1' });
  await vi.waitFor(() => expect(todos.get('1')?.done).toBe(true));
  expect(app.paths.filter((p) => p.endsWith('/todo.live'))).toHaveLength(1);
  await todos.cleanup();
});

test('a mutation handler that waits for its version keeps the row on screen', async () => {
  await using app = setup();
  const make = (wait: boolean) =>
    createCollection(
      liveCollectionOptions({
        id: `todos-${wait}`,
        getKey,
        feed: slow((opts) => app.client.todo.live.subscribe({}, opts), 20),
        onInsert: async (opts) => {
          const call = versionOf();
          for (const m of opts.transaction.mutations) {
            await app.client.todo.add.mutate(
              { id: m.modified.id, title: m.modified.title },
              call,
            );
          }
          expect(call.version).toMatch(/^\d+$/);
          if (wait) await opts.collection.utils.awaitVersion(call.version);
        },
      }),
    );

  for (const [wait, id] of [
    [true, 'w'],
    [false, 'n'],
  ] as const) {
    const todos = make(wait);
    await todos.preload();
    const present: boolean[] = [];
    const watch = todos.subscribeChanges(() => present.push(todos.has(id)));
    const tx = todos.insert({ id, title: 'Mine', done: false });
    await tx.when('settled');
    await vi.waitFor(() => expect(present.at(-1)).toBe(true));
    watch.unsubscribe();
    // Without the wait, the optimistic row is dropped before the feed
    // brings the server's, and the row blinks out.
    expect(present.includes(false)).toBe(!wait);
    await todos.cleanup();
  }
});

test('collections share one pooled subscription and resume when the set changes', async () => {
  await using app = setup();
  const pool = createLivePool<typeof feeds>((input, opts) =>
    app.client.live.subscribe(input, opts),
  );
  const all = createCollection(
    liveCollectionOptions({ id: 'all', getKey, feed: pool.feed('todos', {}) }),
  );
  const done = createCollection(
    liveCollectionOptions({
      id: 'done',
      getKey,
      feed: pool.feed('todos', { done: true }),
    }),
  );
  await Promise.all([all.preload(), done.preload()]);
  expectTypeOf(done.toArray).items.toExtend<Todo>();
  expect(all.size).toBe(2);
  expect(done.toArray.map((todo) => todo.id)).toEqual(['2']);
  expect(pool.stats.opens).toBe(1);

  await app.client.todo.check.mutate({ id: '1' });
  await vi.waitFor(() => expect(done.size).toBe(2));

  const one = createCollection(
    liveCollectionOptions({
      id: 'one',
      getKey,
      feed: pool.feed('todo', { id: '1' }),
    }),
  );
  await one.preload();
  expect(one.toArray).toMatchObject([{ id: '1', done: true, $synced: true }]);
  await one.cleanup();
  await app.client.todo.add.mutate({ id: '3', title: 'C' });
  await vi.waitFor(() => expect(all.size).toBe(3));

  const stats = await app.client.stats.query();
  // One snapshot per query; the reopens resumed the others from their versions.
  expect(stats.snapshots).toBe(3);
  expect(pool.stats.opens).toBe(3);
  expect(app.paths.filter((p) => p.endsWith('/live'))).toHaveLength(3);
  await Promise.all([all.cleanup(), done.cleanup()]);
});

/** The router on a real port, for WebSockets. */
async function serve() {
  const server = createServer();
  const sockets = new Set<Duplex>();
  let upgrades = 0;
  server.on('upgrade', (_req, socket: Duplex) => {
    upgrades++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const scope = Scope.makeUnsafe();
  const context = await Effect.runPromise(
    Layer.buildWithScope(
      TestServer.layer({ router, layer: layer() }).pipe(
        Layer.provide(
          NodeHttpServer.layer(() => server, { port: 0, host: '127.0.0.1' }),
        ),
      ),
      scope,
    ),
  );
  const test = Context.get(context, TestServer);
  return {
    ...test,
    upgrades: () => upgrades,
    drop: () => {
      for (const socket of sockets) socket.destroy();
    },
    [Symbol.asyncDispose]: async () => {
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await Effect.runPromise(Scope.close(scope, Exit.void));
    },
  };
}

test('live collections share one WebSocket and resume with changes after a drop', async () => {
  await using server = await serve();
  await using ws = wsLink({
    url: server.wsUrl,
    reconnect: { delay: () => 10 },
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [ws],
  });
  const http = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  const all = createCollection(
    liveCollectionOptions({
      id: 'all',
      getKey,
      feed: (opts) => client.todo.live.subscribe({}, opts),
    }),
  );
  const open = createCollection(
    liveCollectionOptions({
      id: 'open',
      getKey,
      feed: (opts) => client.todo.live.subscribe({ done: false }, opts),
    }),
  );
  await Promise.all([all.preload(), open.preload()]);
  expect(server.upgrades()).toBe(1);

  server.drop();
  await http.todo.add.mutate({ id: '3', title: 'While away' });
  await vi.waitFor(() => expect(open.get('3')?.title).toBe('While away'));
  expect(all.size).toBe(3);
  expect(server.upgrades()).toBe(2);
  const stats = await http.stats.query();
  expect(stats).toMatchObject({ feeds: 4, snapshots: 2 });
  await Promise.all([all.cleanup(), open.cleanup()]);
});
