import {
  dehydrate,
  hydrate,
  InfiniteQueryObserver,
  MutationObserver,
  onlineManager,
  QueryClient,
  QueryObserver,
  skipToken,
} from '@tanstack/query-core';
import {
  createTrpcQueryUtils,
  hydrationOptions,
  SubscriptionObserver,
  type SubscriptionResult,
} from '@trpcdev/tanstack-query';
import type { ClientError } from 'trpcdev/client';
import {
  createRouterClient,
  type InputValidationErrorData,
  type TrpcError,
} from 'trpcdev/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { appRouter, createApp, db, sleep, type Post } from './fixtures/app.ts';

type Observable<T> = { subscribe(listener: (result: T) => void): () => void };

function until<T, S extends T>(
  observer: Observable<T>,
  predicate: (result: T) => result is S,
): Promise<S>;
function until<T>(
  observer: Observable<T>,
  predicate: (result: T) => boolean,
): Promise<T>;
function until<T>(
  observer: Observable<T>,
  predicate: (result: T) => boolean,
): Promise<T> {
  return new Promise((resolve) => {
    const unsubscribe = observer.subscribe((result) => {
      if (!predicate(result)) return;
      queueMicrotask(unsubscribe);
      resolve(result);
    });
  });
}

test('queryOptions fetch over HTTP and type the cache', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();

  const options = app.trpc.post.byId.queryOptions({ input: { id: '1' } });
  expect(options.queryKey).toEqual([
    ['post', 'byId'],
    { input: { id: '1' }, type: 'query' },
  ]);

  const post = await queryClient.fetchQuery(options);
  expect(post).toEqual({
    id: '1',
    title: 'Post 1',
    createdAt: new Date('2026-01-02'),
  });
  expectTypeOf(post).toEqualTypeOf<Post>();

  const cached = queryClient.getQueryData(
    app.trpc.post.byId.queryKey({ input: { id: '1' } }),
  );
  expectTypeOf(cached).toEqualTypeOf<Post | undefined>();
  expect(cached?.createdAt).toBeInstanceOf(Date);

  expect(await queryClient.fetchQuery(app.trpc.greeting.queryOptions())).toBe(
    'hello',
  );
});

test('errors are the typed client errors', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const observer = new QueryObserver(
    queryClient,
    app.trpc.post.byId.queryOptions({ input: { id: 'nope' } }),
  );
  const result = await until(observer, (r) => r.status === 'error');

  type Expected = ClientError<
    | TrpcError<'BAD_REQUEST', InputValidationErrorData>
    | TrpcError<'NOT_FOUND', { id: string }>
  >;
  expectTypeOf(result.error).toEqualTypeOf<Expected>();
  const error = result.error;
  expect(error.defined).toBe(true);
  if (error.defined) {
    expect(error.code).toBe('NOT_FOUND');
    expect(error.data).toEqual({ id: 'nope' });
  }
});

test('select, initialData and misspelled options are typed', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();

  const titleOnly = app.trpc.post.byId.queryOptions({
    input: { id: '2' },
    select: (post) => post.title,
  });
  const observer = new QueryObserver(queryClient, titleOnly);
  const result = await until(observer, (r) => r.status === 'success');
  expect(result.data).toBe('Post 2');
  expectTypeOf(result.data).toEqualTypeOf<string>();

  const withInitial = app.trpc.greeting.queryOptions({
    initialData: 'hello',
  });
  expectTypeOf(withInitial.initialData).not.toBeUndefined();

  app.trpc.post.byId.queryOptions({
    input: { id: '1' },
    // @ts-expect-error -- misspelled TanStack option
    staleTme: 1000,
  });
  // @ts-expect-error -- input is required
  app.trpc.post.byId.queryOptions({ staleTime: 1000 });
  // @ts-expect-error -- wrong input field
  app.trpc.post.byId.queryOptions({ input: { id: 1 } });
});

test('input: skipToken disables the query', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  const id: string | undefined = undefined as string | undefined;
  const observer = new QueryObserver(
    queryClient,
    app.trpc.post.byId.queryOptions({ input: id ? { id } : skipToken }),
  );
  const unsubscribe = observer.subscribe(() => {});
  await sleep(20);
  expect(observer.getCurrentResult()).toMatchObject({
    status: 'pending',
    fetchStatus: 'idle',
  });
  expect(db.calls).toEqual([]);
  unsubscribe();
});

test('pathFilter and queryFilter invalidate what they match', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  await Promise.all([
    queryClient.fetchQuery(
      app.trpc.post.byId.queryOptions({ input: { id: '1' } }),
    ),
    queryClient.fetchQuery(
      app.trpc.post.byId.queryOptions({ input: { id: '2' } }),
    ),
    queryClient.fetchQuery(
      app.trpc.post.list.queryOptions({ input: { limit: 2 } }),
    ),
    queryClient.fetchQuery(app.trpc.greeting.queryOptions()),
  ]);
  const stale = () =>
    queryClient
      .getQueryCache()
      .findAll({ stale: true })
      .map((q) => q.queryKey);

  await queryClient.invalidateQueries(
    app.trpc.post.byId.queryFilter({ input: { id: '1' } }),
    { cancelRefetch: false, throwOnError: true },
  );
  expect(stale()).toEqual([
    [['post', 'byId'], { input: { id: '1' }, type: 'query' }],
  ]);

  await queryClient.invalidateQueries({
    ...app.trpc.post.pathFilter(),
    refetchType: 'none',
  });
  expect(stale()).toHaveLength(3);

  await queryClient.invalidateQueries({
    ...app.trpc.pathFilter(),
    refetchType: 'none',
  });
  expect(stale()).toHaveLength(4);
  expect(app.trpc.post.pathKey()).toEqual([['post']]);
});

test('infiniteOptions map the page param to the input', async () => {
  await using app = await createApp({ posts: 5 });
  const queryClient = new QueryClient();
  const options = app.trpc.post.list.infiniteOptions({
    input: (cursor: number | undefined) => ({ limit: 2, cursor }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor,
  });
  expect(options.queryKey).toEqual([
    ['post', 'list'],
    { input: { limit: 2 }, type: 'infinite' },
  ]);

  const observer = new InfiniteQueryObserver(queryClient, options);
  const unsubscribe = observer.subscribe(() => {});
  await until(observer, (r) => r.status === 'success');
  await observer.fetchNextPage();
  const result = await observer.fetchNextPage();
  unsubscribe();

  expect(result.data?.pages.map((p) => p.items.map((i) => i.id))).toEqual([
    ['1', '2'],
    ['3', '4'],
    ['5'],
  ]);
  expect(result.hasNextPage).toBe(false);
  const cached = queryClient.getQueryData(
    app.trpc.post.list.infiniteKey({
      input: (cursor: number | undefined) => ({ limit: 2, cursor }),
      initialPageParam: undefined,
    }),
  );
  expect(cached?.pages).toHaveLength(3);
});

test('mutationOptions run mutations and invalidate queries', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  const list = new QueryObserver(
    queryClient,
    app.trpc.post.list.queryOptions({ input: { limit: 10 } }),
  );
  const stopList = list.subscribe(() => {});
  await until(list, (r) => r.status === 'success');

  const created: Post[] = [];
  const observer = new MutationObserver(
    queryClient,
    app.trpc.post.create.mutationOptions({
      onSuccess: async (post) => {
        created.push(post);
        await queryClient.invalidateQueries(app.trpc.post.list.pathFilter());
      },
    }),
  );
  const post = await observer.mutate({ title: 'New' });
  expect(post).toMatchObject({ id: '4', title: 'New' });
  expect(created).toEqual([post]);
  expect(
    queryClient.getQueryData(
      app.trpc.post.list.queryKey({ input: { limit: 10 } }),
    )?.items,
  ).toHaveLength(4);
  stopList();
  expect(app.trpc.post.create.mutationKey()).toEqual([['post', 'create']]);
  expect(
    queryClient
      .getMutationCache()
      .findAll({ mutationKey: app.trpc.post.pathKey() }),
  ).toHaveLength(1);

  const failing = new MutationObserver(
    queryClient,
    app.trpc.post.create.mutationOptions(),
  );
  await expect(failing.mutate({ title: '' })).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  });
  void (() => {
    // @ts-expect-error -- the variables are the procedure's input
    void failing.mutate({ name: 'x' });
  });
});

test('paused mutations resume in a new client from setMutationDefaults (docs/tanstack-query.md)', async () => {
  await using app = await createApp();
  const options = app.trpc.post.create.mutationOptions();
  onlineManager.setOnline(false);
  try {
    const offline = new QueryClient();
    void new MutationObserver(offline, options)
      .mutate({ title: 'Written offline' })
      .catch(() => {});
    await sleep(0);
    expect(offline.getMutationCache().getAll()[0]?.state.isPaused).toBe(true);
    const persisted = JSON.parse(JSON.stringify(dehydrate(offline)));

    const restored = new QueryClient();
    restored.setMutationDefaults(options.mutationKey, options);
    hydrate(restored, persisted);
    onlineManager.setOnline(true);
    await restored.resumePausedMutations();
    expect(restored.getMutationCache().getAll()[0]?.state).toMatchObject({
      status: 'success',
      data: { title: 'Written offline' },
    });
  } finally {
    onlineManager.setOnline(true);
  }
});

test('a query that returns an AsyncIterable streams chunks into the cache', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  const options = app.trpc.chat.reply.queryOptions({ input: { prompt: 'hi' } });
  const observer = new QueryObserver(queryClient, options);
  const seen: string[][] = [];
  const unsubscribe = observer.subscribe((r) => {
    if (r.data) seen.push(r.data);
  });
  const done = await until(
    observer,
    (r) => r.status === 'success' && r.fetchStatus === 'idle',
  );
  unsubscribe();

  expectTypeOf(done.data).toEqualTypeOf<string[] | undefined>();
  expect(done.data).toEqual(['you', 'said', 'hi']);
  expect(seen[0]).toEqual(['you']);
});

test('streamedOptions collect subscription events; liveOptions keep the latest', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();

  const streamed = new QueryObserver(
    queryClient,
    app.trpc.clock.ticks.streamedOptions({ input: { from: 1 }, maxChunks: 2 }),
  );
  const events = await until(streamed, (r) => (r.data?.at(-1) ?? 0) >= 4);
  expect(events.data).toEqual([3, 4]);
  expectTypeOf(events.data).toEqualTypeOf<number[] | undefined>();

  const live = new QueryObserver(
    queryClient,
    app.trpc.clock.ticks.liveOptions({ input: { from: 10 } }),
  );
  const stopLive = live.subscribe(() => {});
  const latest = await until(live, (r) => (r.data ?? 0) >= 12);
  expect(latest.data).toBe(12);
  expectTypeOf(latest.data).toEqualTypeOf<number | undefined>();
  // The streamed query lost its last observer, so its subscription closed.
  expect(db.openTickers).toBe(1);

  stopLive();
  await sleep(30);
  expect(db.openTickers).toBe(0);
  expect(
    queryClient.getQueryData(
      app.trpc.clock.ticks.liveKey({ input: { from: 10 } }),
    ),
  ).toBeGreaterThanOrEqual(12);
});

test('SubscriptionObserver tracks status, events and restarts', async () => {
  await using app = await createApp();
  const results: SubscriptionResult<Post, unknown>['status'][] = [];
  const titles: string[] = [];
  const observer = new SubscriptionObserver(
    app.trpc.post.onAdd.subscriptionOptions({
      onData: (post) => titles.push(post.title),
    }),
  );
  const unsubscribe = observer.subscribe((r) => results.push(r.status));
  expect(observer.getCurrentResult().status).toBe('connecting');
  await sleep(30);

  app.addPost('Hello');
  const active = await until(observer, (r) => r.status === 'active');
  expect(active.data.title).toBe('Hello');
  expect(titles).toEqual(['Hello']);
  expectTypeOf(active.data).toEqualTypeOf<Post>();

  unsubscribe();
  await sleep(20);
  expect(db.listeners.size).toBe(0);

  const countdown = new SubscriptionObserver(
    app.trpc.clock.countdown.subscriptionOptions({ input: { from: 2 } }),
  );
  const completed: number[] = [];
  countdown.setOptions(
    app.trpc.clock.countdown.subscriptionOptions({
      input: { from: 3 },
      onData: (n) => completed.push(n),
    }),
  );
  const idle = await until(countdown, (r) => r.status === 'idle');
  expect(idle.data).toBe(1);
  expect(completed).toEqual([3, 2, 1]);

  countdown.setOptions(
    app.trpc.clock.countdown.subscriptionOptions({ input: { from: 0 } }),
  );
  const failed = await until(countdown, (r) => r.status === 'error');
  expect(failed.error).toMatchObject({ code: 'CONFLICT', defined: false });

  const disabled = new SubscriptionObserver(
    app.trpc.clock.countdown.subscriptionOptions({ input: skipToken }),
  );
  disabled.subscribe(() => {})();
  expect(disabled.getCurrentResult().status).toBe('idle');
});

test('context reaches the links, typed from what they declare', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  await queryClient.fetchQuery(
    app.trpc.greeting.queryOptions({
      context: { headers: { 'x-locale': 'sv' }, dedupe: false },
    }),
  );
  expect(db.locales).toEqual(['sv']);

  app.trpc.greeting.queryOptions({
    // @ts-expect-error -- no link declares `dedup`
    context: { dedup: false },
  });
});

test('prefetch on the server, hydrate rich types in the browser', async () => {
  await using app = await createApp();

  const serverClient = new QueryClient({ defaultOptions: hydrationOptions() });
  const serverTrpc = createTrpcQueryUtils({
    client: createRouterClient(appRouter, { ctx: { locale: 'en' } }),
  });
  await serverClient.prefetchQuery(
    serverTrpc.post.byId.queryOptions({ input: { id: '1' } }),
  );
  const html = JSON.stringify(dehydrate(serverClient));
  expect(html).not.toContain('"createdAt":"2026');

  const browserClient = new QueryClient({ defaultOptions: hydrationOptions() });
  hydrate(browserClient, JSON.parse(html));
  const post = browserClient.getQueryData(
    app.trpc.post.byId.queryKey({ input: { id: '1' } }),
  );
  expect(post?.createdAt).toBeInstanceOf(Date);
  expect(db.calls).toEqual(['post.byId:1']);
});
