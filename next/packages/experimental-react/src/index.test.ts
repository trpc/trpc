import {
  cacheLink,
  createReactClient,
  dehydrate,
  hydrate,
  invalidateOnMutationLink,
  refetchOnMountLink,
  standardLinks,
  structuralSharingLink,
  type QueryPromise,
} from '@trpc12/experimental-react';
import {
  link,
  localLink,
  routerType,
  safe,
  type AnyLink,
} from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import { Effect, Stream } from 'effect';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  db,
  freshDb,
  router,
  tick,
  type AppRouter,
  type Post,
} from '../../trpc/src/fixtures/posts.ts';

const make = <const L extends ReadonlyArray<AnyLink>>(
  links: L,
  opts: { isServer?: boolean } = {},
) =>
  createReactClient({
    router: routerType<AppRouter>(),
    links: [...links, localLink({ router, serializer: createSerializer() })],
    isServer: opts.isServer ?? false,
  });

test('one promise per query while it loads, settled for use() once it has', async () => {
  using _db = freshDb();
  const trpc = make([]);
  const first = trpc.post.list.query({ limit: 2, order: 'asc' });
  expect(trpc.post.list.query({ order: 'asc', limit: 2 })).toBe(first);
  expect(first.status).toBe('pending');
  const posts = await first;
  expect(first.status).toBe('fulfilled');
  expect(first.status === 'fulfilled' && first.value).toBe(posts);
  expect(db.calls).toEqual(['list']);
  expect(posts[0]!.at).toEqual(new Date(0));
});

test('without links, an entry lives only while something holds it', async () => {
  using _db = freshDb();
  const trpc = make([]);
  await trpc.post.byId.query({ id: '1' });
  expect(trpc.store.entries()).toHaveLength(0);
  await trpc.post.byId.query({ id: '1' });
  expect(db.calls).toEqual(['byId:1', 'byId:1']);

  // A mounted reader keeps it: the next call returns the data and
  // refetches in the background.
  const read = trpc.post.byId.query({ id: '1' });
  await read;
  const entry = trpc.store.entryOf(read)!;
  const unmount = trpc.store.mount(entry);
  const again = trpc.post.byId.query({ id: '1' });
  expect(again).toBe(read);
  expect(again.status).toBe('fulfilled');
  await trpc.store.refetch(entry);
  expect(db.calls).toHaveLength(4);
  unmount();
  expect(trpc.store.entries()).toHaveLength(0);
});

test('cacheLink serves fresh data without a request and keeps unread entries', async () => {
  using _db = freshDb();
  const trpc = make([cacheLink({ staleTime: 60_000, gcTime: 20 })]);
  const first = trpc.post.byId.query({ id: '1' });
  await first;
  expect(trpc.post.byId.query({ id: '1' })).toBe(first);
  expect(db.calls).toEqual(['byId:1']);
  await tick(40);
  expect(trpc.store.entries()).toHaveLength(0);
});

test('stale data is returned at once and refetched; changed data gets a new promise', async () => {
  using _db = freshDb();
  const trpc = make([cacheLink({ staleTime: 0 })]);
  const first = trpc.post.byId.query({ id: '1' });
  await first;
  db.posts.get('1')!.title = 'Changed';
  const stale = trpc.post.byId.query({ id: '1' });
  expect(stale).toBe(first);
  const entry = trpc.store.entryOf(first)!;
  expect(entry.snapshot.isFetching).toBe(true);
  await trpc.store.refetch(entry);
  const next = trpc.store.entryOf(first)!.promise;
  expect(next).not.toBe(first);
  expect(((await next) as { title: string }).title).toBe('Changed');
});

test('structuralSharingLink keeps the promise when a refetch changes nothing', async () => {
  using _db = freshDb();
  const shared = make([cacheLink(), structuralSharingLink()]);
  const first = shared.post.list.query({ limit: 2, order: 'asc' });
  const before = await first;
  const entry = shared.store.entryOf(first)!;
  await shared.store.refetch(entry);
  expect(entry.promise).toBe(first);

  db.posts.get('2')!.title = 'Renamed';
  await shared.store.refetch(entry);
  const after = (await entry.promise) as typeof before;
  expect(entry.promise).not.toBe(first);
  expect(after[0]).toBe(before[0]);
  expect(after[1]!.tags).toBe(before[1]!.tags);
  expect(after[1]!.at).toBe(before[1]!.at);

  // Dates share by time; Sets, like class instances, by identity.
  db.posts.get('1')!.at = new Date(5);
  await shared.store.refetch(entry);
  const moved = (await entry.promise) as typeof before;
  expect(moved[0]!.at).toEqual(new Date(5));
  expect(moved[1]).toBe(after[1]);
  const tags = shared.post.tagSet.query({ id: '1' });
  const set = await tags;
  await shared.store.refetch(shared.store.entryOf(tags)!);
  expect(await shared.post.tagSet.query({ id: '1' })).not.toBe(set);

  // Past 500 levels the rest is new data, not compared.
  const raw = createReactClient({
    router: routerType<AppRouter>(),
    links: [
      cacheLink(),
      structuralSharingLink(),
      localLink({ router, serializer: false }),
    ],
  });
  for (const depth of [400, 600]) {
    const deep = raw.post.nested.query({ depth });
    await deep;
    await raw.store.refetch(raw.store.entryOf(deep)!);
    const again = raw.post.nested.query({ depth });
    expect(again === deep).toBe(depth === 400);
  }

  // Without it, every refetch is new data.
  const plain = make([cacheLink()]);
  const p = plain.post.list.query({ limit: 2, order: 'asc' });
  await p;
  await plain.store.refetch(plain.store.entryOf(p)!);
  expect(plain.store.entryOf(p)!.promise).not.toBe(p);
});

test("refetchOnMountLink skips the loader's own request, and refetches on a later mount", async () => {
  using _db = freshDb();
  const trpc = make([cacheLink(), refetchOnMountLink()]);
  const post = trpc.post.byId.query({ id: '1' });
  await post;
  const entry = trpc.store.entryOf(post)!;
  trpc.store.mount(entry)();
  await tick();
  expect(db.calls).toEqual(['byId:1']);
  const unmount = trpc.store.mount(entry);
  await tick();
  expect(db.calls).toEqual(['byId:1', 'byId:1']);
  unmount();
});

test('a failed first load rejects; the next call tries again with a new promise', async () => {
  using _db = freshDb();
  const trpc = make([cacheLink()]);
  const missing = trpc.post.byId.query({ id: '3' });
  const [, err] = await safe(missing);
  expect(err?.defined && err.code === 'NOT_FOUND' && err.data.id).toBe('3');
  expect(missing.status).toBe('rejected');
  db.posts.set('3', { id: '3', title: 'Late', tags: [], at: new Date(2) });
  const retried = trpc.post.byId.query({ id: '3' });
  expect(retried).not.toBe(missing);
  expect((await retried).title).toBe('Late');
});

test('invalidate refetches what is read and resolves once it has', async () => {
  using _db = freshDb();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  const one = trpc.post.byId.query({ id: '1' });
  const two = trpc.post.byId.query({ id: '2' });
  await Promise.all([one, two]);
  const unmount = trpc.store.mount(trpc.store.entryOf(one)!);
  db.posts.get('1')!.title = 'Fresh';
  await trpc.post.byId.invalidate({ id: '1' });
  expect(trpc.post.byId.getData({ id: '1' })?.title).toBe('Fresh');
  expect(db.calls).toEqual(['byId:1', 'byId:2', 'byId:1']);

  // An unread entry is only marked stale, and refetched on its next call.
  await trpc.invalidate('post');
  expect(db.calls).toHaveLength(4);
  expect(trpc.store.isStale(trpc.store.entryOf(two)!)).toBe(true);
  unmount();
});

test('setData writes data readers see without suspending', async () => {
  using _db = freshDb();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  const post = trpc.post.byId.query({ id: '1' });
  await post;
  trpc.post.byId.setData({ id: '1' }, (prev) => ({ ...prev!, title: 'Set' }));
  const current = trpc.post.byId.query({ id: '1' });
  expect(current).not.toBe(post);
  expect(current.status === 'fulfilled' && current.value.title).toBe('Set');
  expect(db.calls).toEqual(['byId:1']);
});

test('invalidateOnMutationLink: the mutation resolves after the read queries refetch', async () => {
  using _db = freshDb();
  const trpc = make([
    cacheLink({ staleTime: 60_000 }),
    invalidateOnMutationLink({ invalidates: (op) => op.path.split('.')[0] }),
  ]);
  const post = trpc.post.byId.query({ id: '1' });
  await post;
  const unmount = trpc.store.mount(trpc.store.entryOf(post)!);
  await trpc.post.rename.mutate({ id: '1', title: 'Renamed' });
  expect(trpc.post.byId.getData({ id: '1' })?.title).toBe('Renamed');
  expect(db.calls).toEqual(['byId:1', 'rename:1', 'byId:1']);
  unmount();
});

test('invalidateOnMutationLink invalidates every query by default, until the store is disposed', async () => {
  using _db = freshDb();
  const trpc = make([
    cacheLink({ staleTime: 60_000 }),
    invalidateOnMutationLink(),
  ]);
  const post = trpc.post.byId.query({ id: '1' });
  await post;
  const unmount = trpc.store.mount(trpc.store.entryOf(post)!);
  await trpc.post.rename.mutate({ id: '1', title: 'Renamed' });
  expect(db.calls).toEqual(['byId:1', 'rename:1', 'byId:1']);
  unmount();
  trpc.store.dispose();
  await trpc.post.rename.mutate({ id: '1', title: 'Again' });
  expect(db.calls).toEqual(['byId:1', 'rename:1', 'byId:1', 'rename:1']);
});

test('standardLinks revalidates after a mutation, narrowed by invalidates', async () => {
  using _db = freshDb();
  const trpc = make(
    standardLinks({ staleTime: 60_000, invalidates: () => 'post.byId' }),
  );
  const post = trpc.post.byId.query({ id: '1' });
  const list = trpc.post.list.query({ limit: 2, order: 'asc' });
  await Promise.all([post, list]);
  const unmount = [post, list].map((p) =>
    trpc.store.mount(trpc.store.entryOf(p)!),
  );
  await trpc.post.rename.mutate({ id: '1', title: 'Renamed' });
  expect(trpc.post.byId.getData({ id: '1' })?.title).toBe('Renamed');
  expect(db.calls).toEqual(['byId:1', 'list', 'rename:1', 'byId:1']);
  for (const u of unmount) u();
});

test('the server keeps entries; dehydrate and hydrate carry them with the serializer', async () => {
  using _db = freshDb();
  const server = make([], { isServer: true });
  await server.post.byId.query({ id: '1' });
  void server.post.byId.query({ id: '2' });
  const state = JSON.parse(JSON.stringify(dehydrate(server)));
  expect(state.queries).toHaveLength(1);

  const browser = make([cacheLink({ staleTime: 60_000 })]);
  hydrate(browser, state);
  const post = browser.post.byId.query({ id: '1' });
  expect(post.status).toBe('fulfilled');
  expect(post.status === 'fulfilled' && post.value.at).toEqual(new Date(0));
  await tick();
  expect(db.calls).toEqual(['byId:1', 'byId:2']);
});

test('standardLinks is a links array; call options and errors stay typed', () => {
  using _db = freshDb();
  const headerLink = link<{ context: { tenant?: string } }>(({ op, next }) =>
    next(op),
  );
  const trpc = createReactClient({
    router: routerType<AppRouter>(),
    links: [...standardLinks(), headerLink, localLink({ router })],
  });
  const post = trpc.post.byId.query({ id: '1' }, { tenant: 'ada' });
  expectTypeOf(post).toExtend<QueryPromise<{ id: string; title: string }>>();
  type Rename = typeof trpc.post.rename.mutate;
  expectTypeOf<ReturnType<Rename>>().toExtend<Promise<string>>();
  expectTypeOf(trpc.post.count.getData()).toEqualTypeOf<number | undefined>();
  // @ts-expect-error byId takes an input
  trpc.post.byId.getData();
  expectTypeOf(trpc.post.byId.getData({ id: '1' })).toExtend<
    { title: string } | undefined
  >();
  // @ts-expect-error: the input is checked
  void trpc.post.byId.query({ id: 1 });
  // @ts-expect-error: no link reads this option
  void trpc.post.byId.query({ id: '1' }, { nope: true });
});

test('inputless queries key on their path, and survive dehydrate and hydrate', async () => {
  using _db = freshDb();
  const server = make([], { isServer: true });
  expect(await server.post.count.query()).toBe(2);
  const state = JSON.parse(JSON.stringify(dehydrate(server)));
  expect(state.queries[0]).toMatchObject({ path: 'post.count', input: null });

  const browser = make([cacheLink({ staleTime: 60_000, gcTime: Infinity })]);
  hydrate(browser, state);
  expect(browser.post.count.getData()).toBe(2);
  db.posts.delete('2');
  const count = browser.post.count.query();
  const unmount = browser.store.mount(browser.store.entryOf(count)!);
  await browser.post.count.invalidate();
  expect(browser.post.count.getData()).toBe(1);
  unmount();
  // A second call of the same unmount does nothing.
  unmount();
  expect(browser.store.entryOf(count)!.observers).toBe(0);
  // gcTime: Infinity keeps idle entries.
  await tick(5);
  expect(browser.store.entries()).toHaveLength(1);
});

test('array inputs key by value; setData writes a query never read', async () => {
  using _db = freshDb();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  const titles = trpc.post.many.query({ ids: ['2', '1'] });
  expect(trpc.post.many.query({ ids: ['2', '1'] })).toBe(titles);
  expect(trpc.post.many.query({ ids: ['1', '2'] })).not.toBe(titles);
  expect(await titles).toEqual(['World', 'Hello']);

  const nine: Post = { id: '9', title: 'Nine', tags: [], at: new Date(9) };
  trpc.post.byId.setData({ id: '9' }, nine);
  expect(trpc.post.byId.getData({ id: '9' })).toEqual(nine);
  expect(trpc.post.byId.query({ id: '9' }).status).toBe('fulfilled');
  expect(db.calls).toEqual(['many:2,1', 'many:1,2']);
});

test('removing entries: filters that match nothing, loads that settle late, stale mounts', async () => {
  using _db = freshDb();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  const first = trpc.post.byId.query({ id: '1' });
  await first;
  trpc.store.remove('user');
  expect(trpc.store.entries()).toHaveLength(1);

  // A removed entry's late answer, data or error, is dropped.
  void trpc.post.byId.query({ id: '2' });
  void trpc.post.byId.query({ id: 'missing' });
  const old = trpc.store.entryOf(first)!;
  trpc.store.remove();
  await tick(5);
  expect(trpc.store.entries()).toHaveLength(0);

  // Mounting an entry replaced since leaves the new one alone.
  const second = trpc.post.byId.query({ id: '1' });
  await second;
  trpc.store.mount(old)();
  expect(trpc.store.entryOf(second)).not.toBe(old);
  expect(trpc.store.entries()).toHaveLength(1);
});

test('hydrating older data keeps newer data; foreign promises have no entry', async () => {
  using _db = freshDb();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  const post = trpc.post.byId.query({ id: '1' });
  await post;
  const state = JSON.parse(JSON.stringify(dehydrate(trpc)));
  await tick(2);
  db.posts.get('1')!.title = 'Newer';
  await trpc.store.refetch(trpc.store.entryOf(post)!);
  hydrate(trpc, state);
  expect(trpc.post.byId.getData({ id: '1' })?.title).toBe('Newer');

  expect(trpc.store.entryOf(Promise.resolve())).toBeUndefined();
  expect(make([]).store.entryOf(post)).toBeUndefined();
  // The client and its paths aren't thenables, so they can be awaited.
  const posts = await Promise.resolve(trpc.post);
  expect((await posts.byId.query({ id: '1' })).title).toBe('Newer');
});

test('an answer that lands after its entry was removed is dropped', async () => {
  using _db = freshDb();
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const gated = link(({ op, next }) =>
    next(op).pipe(
      Stream.mapEffect((value) =>
        Effect.promise(() => gate).pipe(Effect.as(value)),
      ),
    ),
  );
  const trpc = make([cacheLink(), gated]);
  const one = trpc.post.byId.query({ id: '1' });
  const two = trpc.post.byId.query({ id: '2' });
  const removed = trpc.store.entryOf(two)!;
  await tick(5);
  trpc.store.subscribe(trpc.store.entryOf(one)!, () =>
    trpc.store.remove((entry) => entry === removed),
  );
  open();
  await one;
  await tick(5);
  expect(removed.hasData).toBe(false);
  expect(trpc.post.byId.getData({ id: '2' })).toBeUndefined();
  expect(trpc.store.entries()).toHaveLength(1);
});

test('without a serializer on the client, hydration uses JSON', async () => {
  using _db = freshDb();
  const trpc = createReactClient({
    router: routerType<AppRouter>(),
    links: [cacheLink(), localLink({ router, serializer: false })],
  });
  await trpc.post.byId.query({ id: '1' });
  const state = dehydrate(trpc);
  expect(state.queries[0]!.data).toEqual({
    json: { id: '1', title: 'Hello', tags: ['a'], at: new Date(0).toJSON() },
  });
});
