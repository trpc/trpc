import {
  dehydrate,
  hydrate,
  QueryClient,
  QueryObserver,
} from '@tanstack/query-core';
import { createTrpcQueryUtils, hydrationOptions } from '@trpc12/tanstack-query';
import { createRouterClient } from '@trpc12/trpc/server';
import { describe, expect, test, vi } from 'vite-plus/test';
import { appRouter, createApp, db } from './fixtures/app.ts';

const overTheWire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const withQueryClient = async (opts: { keyPrefix?: string } = {}) => {
  const app = await createApp();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const trpc = createTrpcQueryUtils({
    client: app.client,
    queryClient,
    ...opts,
  });
  return Object.assign(app, { queryClient, bound: trpc });
};

describe('$ensure', () => {
  test('waits for the data and returns a handle that $fromHandle reads without a second call', async () => {
    await using app = await withQueryClient();

    const handle = await app.bound.post.byId.$ensure({ input: { id: '1' } });
    expect(handle).toStrictEqual({
      queryKey: [['post', 'byId'], { input: { id: '1' }, type: 'query' }],
      input: { id: '1' },
    });
    expect(db.calls).toEqual(['post.byId:1']);

    const options = app.trpc.$fromHandle(overTheWire(handle));
    expect(options.queryKey).toEqual(
      app.trpc.post.byId.queryKey({ input: { id: '1' } }),
    );
    const observer = new QueryObserver(app.queryClient, {
      ...options,
      staleTime: Infinity,
    });
    expect(observer.getCurrentResult().data?.title).toBe('Post 1');
    expect(db.calls).toEqual(['post.byId:1']);
  });

  test('resolves with cached data however old, and refetches stale data in the background', async () => {
    await using app = await withQueryClient();
    const key = app.trpc.post.byId.queryKey({ input: { id: '1' } });
    await app.bound.post.byId.$ensure({ input: { id: '1' } });

    await app.bound.post.byId.$ensure({
      input: { id: '1' },
      staleTime: Infinity,
    });
    expect(app.queryClient.getQueryState(key)?.fetchStatus).toBe('idle');

    await app.bound.post.byId.$ensure({ input: { id: '1' } });
    expect(app.queryClient.getQueryState(key)?.fetchStatus).toBe('fetching');
    await vi.waitFor(() =>
      expect(app.queryClient.getQueryState(key)?.fetchStatus).toBe('idle'),
    );
    expect(db.calls).toEqual(['post.byId:1', 'post.byId:1']);
  });

  test('rejects with the typed error when the fetch fails', async () => {
    await using app = await withQueryClient();
    await expect(
      app.bound.post.byId.$ensure({ input: { id: 'nope' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', data: { id: 'nope' } });
  });
});

test('$prefetch returns the handle right away and leaves errors to the reader', async () => {
  await using app = await withQueryClient();

  const handle = app.bound.post.byId.$prefetch({ input: { id: 'nope' } });
  expect(handle.input).toEqual({ id: 'nope' });
  const key = app.trpc.$fromHandle(handle).queryKey;
  await vi.waitFor(() =>
    expect(app.queryClient.getQueryState(key)?.error).toMatchObject({
      code: 'NOT_FOUND',
    }),
  );
  expect(db.calls).toEqual(['post.byId:nope']);
});

test('$fetch waits for stale data to refetch', async () => {
  await using app = await withQueryClient();
  await app.bound.post.byId.$ensure({ input: { id: '1' } });
  app.queryClient.setQueryData(
    app.trpc.post.byId.queryKey({ input: { id: '1' } }),
    (post) => post && { ...post, title: 'Edited' },
  );

  await app.bound.post.byId.$fetch({ input: { id: '1' } });
  expect(
    app.queryClient.getQueryData(
      app.trpc.post.byId.queryKey({ input: { id: '1' } }),
    )?.title,
  ).toBe('Post 1');
  expect(db.calls).toHaveLength(2);
});

test('handles of procedures without input have no input key, so Next.js can serialize them', async () => {
  await using app = await withQueryClient();
  const handles = [
    app.bound.greeting.$prefetch(),
    await app.bound.greeting.$ensure(),
    await app.bound.greeting.$fetch(),
    await app.bound.greeting.$ensure({ input: undefined }),
  ];

  for (const handle of handles) {
    expect(Object.keys(handle)).toEqual(['queryKey']);
    expect(app.trpc.$fromHandle(overTheWire(handle)).queryKey).toEqual(
      app.trpc.greeting.queryOptions().queryKey,
    );
  }
  // `getServerSideProps` and `getStaticProps` reject `undefined` anywhere in props
  expect(overTheWire(handles)).toStrictEqual(handles);
});

test('$fromHandle passes TanStack options and context on, and works on any router', async () => {
  await using app = await withQueryClient();
  const handle = await app.bound.post.byId.$ensure({ input: { id: '2' } });

  const options = app.trpc.post.$fromHandle(handle, {
    staleTime: 1000,
    select: (post) => post.title,
    context: { dedupe: false },
  });
  expect(options.staleTime).toBe(1000);
  expect(options.queryKey).toEqual(
    app.trpc.post.byId.queryKey({ input: { id: '2' } }),
  );
  await expect(
    new QueryClient().query({ ...options, retry: false }),
  ).resolves.toBe('Post 2');
});

test('a server component ensures with the router, the browser reads the handle from hydrated data', async () => {
  await using app = await createApp();
  const serverClient = new QueryClient({
    defaultOptions: hydrationOptions({ client: app.client }),
  });
  const serverTrpc = createTrpcQueryUtils({
    client: createRouterClient(appRouter, { ctx: { locale: 'en' } }),
    queryClient: () => serverClient,
  });
  const handle = await serverTrpc.post.byId.$ensure({ input: { id: '1' } });
  const html = JSON.stringify({ state: dehydrate(serverClient), handle });

  const page = JSON.parse(html);
  const browserClient = new QueryClient({
    defaultOptions: hydrationOptions({ client: app.client }),
  });
  hydrate(browserClient, page.state);
  const observer = new QueryObserver(browserClient, {
    ...app.trpc.$fromHandle(page.handle as typeof handle),
    staleTime: Infinity,
  });
  expect(observer.getCurrentResult().data?.createdAt).toBeInstanceOf(Date);
  expect(db.calls).toEqual(['post.byId:1']);
});

test('keyPrefix: handles carry it, and a reader with another prefix refuses them', async () => {
  await using app = await withQueryClient({ keyPrefix: 'billing' });
  const handle = await app.bound.post.byId.$ensure({ input: { id: '1' } });
  expect(handle.queryKey).toEqual([
    ['billing', 'post', 'byId'],
    { input: { id: '1' }, type: 'query' },
  ]);
  expect(app.bound.$fromHandle(handle).queryKey).toEqual(handle.queryKey);

  const other = createTrpcQueryUtils({ client: app.client, keyPrefix: 'blog' });
  expect(() => other.$fromHandle(handle)).toThrow(
    'The handle for "billing.post.byId" has no keyPrefix "blog"',
  );
});

test('the query client can be a function, called for each verb', async () => {
  await using app = await createApp();
  const clients = [new QueryClient(), new QueryClient()];
  let calls = 0;
  const getQueryClient = vi.fn<() => QueryClient>(() => clients[calls++]!);
  const trpc = createTrpcQueryUtils({
    client: app.client,
    queryClient: getQueryClient,
  });

  await trpc.greeting.$ensure();
  await trpc.greeting.$ensure();
  expect(getQueryClient).toHaveBeenCalledTimes(2);
  for (const queryClient of clients) {
    expect(queryClient.getQueryData(trpc.greeting.queryKey())).toBe('hello');
  }
});

test('helper edges: no query client, and values that are not handles', async () => {
  await using app = await createApp();
  // @ts-expect-error -- helpers made without a queryClient have no handle verbs
  expect(() => app.trpc.post.byId.$ensure({ input: { id: '1' } })).toThrow(
    'post.byId.$ensure() needs a QueryClient',
  );

  const notHandles: unknown[] = [
    undefined,
    {},
    { queryKey: 'post.byId' },
    { queryKey: [['post', 'list'], { type: 'infinite' }] },
  ];
  for (const value of notHandles) {
    expect(() => app.trpc.$fromHandle(value as never)).toThrow(
      '$fromHandle() expects a handle from $prefetch(), $ensure() or $fetch()',
    );
  }
});
