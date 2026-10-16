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
import { beforeEach, expect, expectTypeOf, test } from 'vite-plus/test';
import { db, router, tick, type AppRouter } from './fixtures.ts';

beforeEach(() => db.reset());

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
  const trpc = make([cacheLink({ staleTime: 60_000, gcTime: 20 })]);
  const first = trpc.post.byId.query({ id: '1' });
  await first;
  expect(trpc.post.byId.query({ id: '1' })).toBe(first);
  expect(db.calls).toEqual(['byId:1']);
  await tick(40);
  expect(trpc.store.entries()).toHaveLength(0);
});

test('stale data is returned at once and refetched; changed data gets a new promise', async () => {
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

  // Without it, every refetch is new data.
  const plain = make([cacheLink()]);
  const p = plain.post.list.query({ limit: 2, order: 'asc' });
  await p;
  await plain.store.refetch(plain.store.entryOf(p)!);
  expect(plain.store.entryOf(p)!.promise).not.toBe(p);
});

test("refetchOnMountLink skips the loader's own request, and refetches on a later mount", async () => {
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

test('the server keeps entries; dehydrate and hydrate carry them with the serializer', async () => {
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
  expectTypeOf(trpc.post.byId.getData({ id: '1' })).toExtend<
    { title: string } | undefined
  >();
  // @ts-expect-error: the input is checked
  void trpc.post.byId.query({ id: 1 });
  // @ts-expect-error: no link reads this option
  void trpc.post.byId.query({ id: '1' }, { nope: true });
});
