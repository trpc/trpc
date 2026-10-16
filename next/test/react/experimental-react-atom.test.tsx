import {
  HydrationBoundary,
  RegistryContext,
  useAtomSuspense,
} from '@effect/atom-react';
import { createAtomClient } from '@trpc12/experimental-react-atom';
import { localLink, routerType } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import { Option } from 'effect';
import {
  AsyncResult,
  AtomRegistry,
  Hydration,
  type Atom,
} from 'effect/reactivity';
import { Suspense } from 'react';
import { prerender } from 'react-dom/static';
import { beforeEach, expect, expectTypeOf, test } from 'vite-plus/test';
import { db, router, type AppRouter } from './fixtures.ts';

const serializer = createSerializer();

beforeEach(() => db.reset());

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
  const { trpc, registry } = setup();
  const list = trpc.post.list.query({ limit: 1, order: 'asc' });
  expect(trpc.post.list.query({ order: 'asc', limit: 1 })).toBe(list);
  expect(trpc.post.list.query({ order: 'desc', limit: 1 })).not.toBe(list);
  const posts = AsyncResult.getOrThrow(await until(registry, list, done));
  expect(posts[0]!.at).toEqual(new Date(0));

  const missing = await until(
    registry,
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
  const { trpc, registry } = setup();
  const post = trpc.post.byId.query({ id: '1' }, { reactivityKeys: ['posts'] });
  const unmount = registry.mount(post);
  await until(registry, post, done);
  const rename = trpc.post.rename.mutation();
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
  const { trpc, registry } = setup();
  const events = trpc.post.onRename.subscription(undefined);
  const unmount = registry.mount(events);
  await until(
    registry,
    events,
    (r) => AsyncResult.isSuccess(r) && r.value === 'latest',
  );
  unmount();
});

test('query atoms hydrate with the serializer: the browser renders without a request', async () => {
  function Title() {
    const { trpc } = client;
    const post = useAtomSuspense(trpc.post.byId.query({ id: '1' })).value;
    return <h1>{`${post.title} ${post.at.getTime()}`}</h1>;
  }
  let client = setup();
  // A server's registry keeps idle atoms until it dehydrates.
  const server = AtomRegistry.make({ defaultIdleTTL: 60_000 });
  const { prelude } = await prerender(
    <RegistryContext.Provider value={server}>
      <Suspense fallback="loading">
        <Title />
      </Suspense>
    </RegistryContext.Provider>,
  );
  expect(await new Response(prelude).text()).toContain('Hello 0');
  void server.get(client.trpc.post.byId.query({ id: '404' }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const state = JSON.parse(JSON.stringify(Hydration.dehydrate(server)));
  expect(state).toHaveLength(1);
  server.dispose();

  client = setup();
  db.calls = [];
  const browser = AtomRegistry.make();
  const { prelude: again } = await prerender(
    <RegistryContext.Provider value={browser}>
      <HydrationBoundary state={state}>
        <Suspense fallback="loading">
          <Title />
        </Suspense>
      </HydrationBoundary>
    </RegistryContext.Provider>,
  );
  expect(await new Response(again).text()).toContain('Hello 0');
  expect(db.calls).toEqual([]);
});
