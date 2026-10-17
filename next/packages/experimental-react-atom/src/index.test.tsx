import {
  HydrationBoundary,
  RegistryContext,
  useAtomSuspense,
} from '@effect/atom-react';
import { createAtomClient } from '@trpc12/experimental-react-atom';
import { localLink, routerType } from '@trpc12/trpc/client';
import {
  createSerializer,
  jsonSerializer,
  type AnySerializer,
} from '@trpc12/trpc/serializer';
import { Effect, Option } from 'effect';
import {
  AsyncResult,
  AtomRegistry,
  Hydration,
  type Atom,
} from 'effect/reactivity';
import { Suspense } from 'react';
import { prerender } from 'react-dom/static';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  db,
  freshDb,
  router,
  type AppRouter,
} from '../../trpc/src/fixtures/posts.ts';

const serializer = createSerializer();

const setup = () => ({
  trpc: createAtomClient({
    router: routerType<AppRouter>(),
    links: [localLink({ router, serializer })],
  }),
  registry: AtomRegistry.make(),
});

/** Resolves with the atom's first value that matches. */
const until = <A,>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<A>,
  ok: (value: A) => boolean,
): Promise<A> =>
  new Promise((resolve) => {
    const cancel = registry.subscribe(
      atom,
      (value) => {
        if (!ok(value)) return;
        cancel();
        resolve(value);
      },
      { immediate: true },
    );
  });

const done = <A, E>(result: AsyncResult.AsyncResult<A, E>) =>
  !AsyncResult.isInitial(result) && !result.waiting;

test('the same call is the same atom, whatever the key order, with typed errors', async () => {
  using _db = freshDb();
  const app = setup();
  const { trpc } = app;
  const list = trpc.post.list.query({ limit: 1, order: 'asc' });
  expect(trpc.post.list.query({ order: 'asc', limit: 1 })).toBe(list);
  expect(trpc.post.list.query({ order: 'desc', limit: 1 })).not.toBe(list);
  const posts = AsyncResult.getOrThrow(await until(app.registry, list, done));
  expect(posts[0]!.at).toEqual(new Date(0));

  const missing = await until(
    app.registry,
    trpc.post.byId.query({ id: '404' }),
    done,
  );
  const err = Option.getOrThrow(AsyncResult.error(missing));
  expect(err).toMatchObject({ code: 'NOT_FOUND', data: { id: '404' } });
  if (err.defined && err.code === 'NOT_FOUND') {
    expectTypeOf(err.data).toEqualTypeOf<{ id: string }>();
  }
});

test('a mutation with reactivity keys refetches the queries that share them', async () => {
  using _db = freshDb();
  const app = setup();
  const { registry } = app;
  const post = app.trpc.post.byId.query(
    { id: '1' },
    { reactivityKeys: ['posts'] },
  );
  const unmount = registry.mount(post);
  await until(registry, post, done);
  const rename = app.trpc.post.rename.mutation();
  registry.set(rename, {
    input: { id: '1', title: 'Renamed' },
    reactivityKeys: ['posts'],
  });
  expect(AsyncResult.getOrThrow(await until(registry, rename, done))).toBe(
    'Renamed',
  );
  await until(
    registry,
    post,
    (r) => done(r) && AsyncResult.getOrThrow(r).title === 'Renamed',
  );
  expect(db.calls).toEqual(['byId:1', 'rename:1', 'byId:1']);
  unmount();
});

test('a subscription atom holds the latest event', async () => {
  using _db = freshDb();
  const app = setup();
  const events = app.trpc.post.onRename.subscription(undefined);
  const unmount = app.registry.mount(events);
  await until(
    app.registry,
    events,
    (r) => AsyncResult.isSuccess(r) && r.value === 'latest',
  );
  unmount();
});

test('query atoms hydrate with the serializer: the browser renders without a request', async () => {
  using _db = freshDb();
  function Title() {
    const post = useAtomSuspense(
      client.trpc.post.byId.query({ id: '1' }),
    ).value;
    return <h1>{`${post.title} ${post.at.getTime()}`}</h1>;
  }
  let client = setup();
  // A server's registry keeps idle atoms until it dehydrates.
  const server = AtomRegistry.make({ defaultIdleTTL: 60_000 });
  const rendered = await prerender(
    <RegistryContext.Provider value={server}>
      <Suspense fallback="loading">
        <Title />
      </Suspense>
    </RegistryContext.Provider>,
  );
  expect(await new Response(rendered.prelude).text()).toContain('Hello 0');
  void server.get(client.trpc.post.byId.query({ id: '404' }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const state = JSON.parse(JSON.stringify(Hydration.dehydrate(server)));
  expect(state).toHaveLength(1);
  server.dispose();

  client = setup();
  db.calls = [];
  const browser = AtomRegistry.make();
  const hydrated = await prerender(
    <RegistryContext.Provider value={browser}>
      <HydrationBoundary state={state}>
        <Suspense fallback="loading">
          <Title />
        </Suspense>
      </HydrationBoundary>
    </RegistryContext.Provider>,
  );
  expect(await new Response(hydrated.prelude).text()).toContain('Hello 0');
  expect(db.calls).toEqual([]);
});

test('array and Date inputs key by value; options are part of the key', async () => {
  using _db = freshDb();
  const { trpc, registry } = setup();
  const many = trpc.post.many.query({ ids: ['2', '1'] });
  expect(trpc.post.many.query({ ids: ['2', '1'] })).toBe(many);
  expect(trpc.post.many.query({ ids: ['1', '2'] })).not.toBe(many);
  expect(AsyncResult.getOrThrow(await until(registry, many, done))).toEqual([
    'World',
    'Hello',
  ]);
  const since = trpc.post.since.query({ at: new Date(1) });
  expect(trpc.post.since.query({ at: new Date(1) })).toBe(since);
  expect(AsyncResult.getOrThrow(await until(registry, since, done))).toBe(1);

  // A query kept alive keeps its result with nothing mounted; one with an
  // idle time to live is its own atom.
  const kept = trpc.post.byId.query({ id: '1' }, { timeToLive: Infinity });
  expect(
    trpc.post.byId.query({ id: '1' }, { timeToLive: '1 minute' }),
  ).not.toBe(kept);
  await until(registry, kept, done);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(AsyncResult.isSuccess(registry.get(kept))).toBe(true);
  expect(db.calls.filter((call) => call === 'byId:1')).toHaveLength(1);
  const idle = trpc.post.byId.query({ id: '1' }, { timeToLive: '1 minute' });
  await until(registry, idle, done);
  expect(db.calls.filter((call) => call === 'byId:1')).toHaveLength(2);
});

test('a mutation without reactivity keys refetches nothing', async () => {
  using _db = freshDb();
  const app = setup();
  const { registry } = app;
  const post = app.trpc.post.byId.query(
    { id: '1' },
    { reactivityKeys: ['posts'] },
  );
  const unmount = registry.mount(post);
  await until(registry, post, done);
  const rename = app.trpc.post.rename.mutation();
  registry.set(rename, { input: { id: '1', title: 'Quiet' } });
  await until(registry, rename, done);
  expect(db.calls).toEqual(['byId:1', 'rename:1']);
  unmount();
});

test('the client exposes its runtime and Effect client; other calls are errors', async () => {
  using _db = freshDb();
  const app = setup();
  const { trpc } = app;
  expect(trpc.runtime).toBeDefined();
  expect(
    await Effect.runPromise(trpc.client.post.byId.query({ id: '2' })),
  ).toMatchObject({ title: 'World' });
  expect(app.registry).toBeDefined();
  expect(() => (trpc.post.byId as unknown as () => void)()).toThrow(
    'Call .query(), .mutation() or .subscription() on a procedure, not post.byId()',
  );
  // Not a thenable, so it can be awaited, and symbols aren't paths.
  expect(await Promise.resolve(trpc.post)).toBeTypeOf('function');
  expect(
    (trpc.post as unknown as Record<symbol, unknown>)[Symbol.iterator],
  ).toBe(undefined);
});

test('without a serializer on its links, query atoms dehydrate as JSON unless one is given', async () => {
  using _db = freshDb();
  const encoded = async (opts: { serializer?: AnySerializer }) => {
    const trpc = createAtomClient({
      router: routerType<AppRouter>(),
      links: [localLink({ router, serializer: false })],
      ...opts,
    });
    const registry = AtomRegistry.make({ defaultIdleTTL: 60_000 });
    await until(registry, trpc.post.byId.query({ id: '1' }), done);
    const [entry] = JSON.parse(JSON.stringify(Hydration.dehydrate(registry)));
    registry.dispose();
    return JSON.stringify(entry.value);
  };
  expect(await encoded({})).toContain('"at":"1970-01-01T00:00:00.000Z"');
  expect(await encoded({ serializer: jsonSerializer })).toContain(
    '"at":"1970-01-01T00:00:00.000Z"',
  );
  expect(await encoded({ serializer })).toContain('"type":"Date"');
});
