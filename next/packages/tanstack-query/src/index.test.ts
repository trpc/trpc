import {
  dehydrate,
  hydrate,
  InfiniteQueryObserver,
  MutationObserver,
  onlineManager,
  QueriesObserver,
  QueryClient,
  QueryObserver,
  skipToken,
} from '@tanstack/query-core';
import {
  createTrpcQueryUtils,
  hydrationOptions,
  SubscriptionObserver,
  type SubscriptionResult,
} from '@trpc12/tanstack-query';
import superjson from 'superjson';
import {
  createTrpcClient,
  localLink,
  type ClientError,
  routerType,
} from '@trpc12/trpc/client';
import {
  createSerializer,
  createSyncSerializer,
} from '@trpc12/trpc/serializer';
import {
  createRouterClient,
  type InputValidationErrorData,
  type TrpcError,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
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

  const post = await queryClient.query(options);
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

  expect(await queryClient.query(app.trpc.greeting.queryOptions())).toBe(
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
    queryClient.query(
      app.trpc.post.byId.queryOptions({ input: { id: '1' } }),
    ),
    queryClient.query(
      app.trpc.post.byId.queryOptions({ input: { id: '2' } }),
    ),
    queryClient.query(
      app.trpc.post.list.queryOptions({ input: { limit: 2 } }),
    ),
    queryClient.query(app.trpc.greeting.queryOptions()),
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

test('keyPrefix keeps two APIs apart in one QueryClient', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  const billing = createTrpcQueryUtils({
    client: app.client,
    keyPrefix: 'billing',
  });

  const options = billing.post.byId.queryOptions({ input: { id: '1' } });
  expect(options.queryKey).toEqual([
    ['billing', 'post', 'byId'],
    { input: { id: '1' }, type: 'query' },
  ]);
  expect(billing.post.create.mutationKey()).toEqual([
    ['billing', 'post', 'create'],
  ]);
  expect(billing.pathKey()).toEqual([['billing']]);

  await Promise.all([
    queryClient.query(options),
    queryClient.query(
      app.trpc.post.byId.queryOptions({ input: { id: '1' } }),
    ),
  ]);
  expect(
    queryClient.getQueryData(billing.post.byId.queryKey({ input: { id: '1' } }))
      ?.title,
  ).toBe('Post 1');

  await queryClient.invalidateQueries({
    ...billing.pathFilter(),
    refetchType: 'none',
  });
  expect(
    queryClient
      .getQueryCache()
      .findAll({ stale: true })
      .map((q) => q.queryKey[0]),
  ).toEqual([['billing', 'post', 'byId']]);
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

test('mutationFilter matches the procedure, typed for predicate', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  const create = new MutationObserver(
    queryClient,
    app.trpc.post.create.mutationOptions(),
  );
  const pending = create.mutate({ title: 'Pending' });
  const filter = app.trpc.post.create.mutationFilter({
    status: 'pending',
    predicate: (mutation) => {
      expectTypeOf(mutation.state.variables).toEqualTypeOf<
        { title: string } | undefined
      >();
      expectTypeOf(mutation.state.data).toEqualTypeOf<Post | undefined>();
      return mutation.state.variables?.title === 'Pending';
    },
  });
  expect(filter.mutationKey).toEqual(app.trpc.post.create.mutationKey());
  expect(queryClient.isMutating(filter)).toBe(1);
  await pending;
  expect(queryClient.isMutating(filter)).toBe(0);
  expect(
    queryClient
      .getMutationCache()
      .findAll(app.trpc.post.create.mutationFilter({ status: 'success' })),
  ).toHaveLength(1);
});

test('QueriesObserver (useQueries) takes queryOptions for many inputs', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const observer = new QueriesObserver(
    queryClient,
    ['1', '2', 'nope'].map((id) =>
      app.trpc.post.byId.queryOptions({ input: { id } }),
    ),
  );
  const results = await until(observer, (r) =>
    r.every((q) => q.status !== 'pending'),
  );
  const posts = results.map((q) => q.data as Post | undefined);
  expect(posts.map((post) => post?.title)).toEqual([
    'Post 1',
    'Post 2',
    undefined,
  ]);
  expect(results[2]?.error).toMatchObject({ code: 'NOT_FOUND' });
  expect(posts[0]?.createdAt).toBeInstanceOf(Date);
  expect(
    queryClient.getQueryData(
      app.trpc.post.byId.queryKey({ input: { id: '2' } }),
    )?.title,
  ).toBe('Post 2');
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

test('streamedMutationOptions collect chunks into data, and into a query as they arrive (#5846)', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  const chunks = new QueryObserver(
    queryClient,
    app.trpc.chat.send.chunksOptions(),
  );
  const seen: string[][] = [];
  const unsubscribe = chunks.subscribe((r) => {
    if (r.data) seen.push(r.data);
  });
  const each: string[] = [];
  const mutation = new MutationObserver(
    queryClient,
    app.trpc.chat.send.streamedMutationOptions({
      onChunk: (chunk) => each.push(chunk),
    }),
  );
  const data = await mutation.mutate({ text: 'hi' });
  unsubscribe();

  expectTypeOf(data).toEqualTypeOf<string[]>();
  expect(data).toEqual(['ok', 'hi']);
  expect(each).toEqual(['ok', 'hi']);
  expect(seen).toEqual([[], ['ok'], ['ok', 'hi']]);
  expect(
    queryClient.getQueryData(app.trpc.chat.send.streamedMutationKey()),
  ).toEqual(['ok', 'hi']);
  expect(app.trpc.chat.send.streamedMutationKey()).toEqual([
    ['chat', 'send'],
    { type: 'mutation' },
  ]);
});

test('abortWhenUnobserved stops the server stream once nothing reads the chunks', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  const chunks = new QueryObserver(
    queryClient,
    app.trpc.chat.forever.chunksOptions(),
  );
  const unsubscribe = chunks.subscribe(() => {});
  const mutation = new MutationObserver(
    queryClient,
    app.trpc.chat.forever.streamedMutationOptions({
      abortWhenUnobserved: true,
    }),
  );
  const pending = mutation.mutate();
  await vi.waitFor(() =>
    expect(
      queryClient.getQueryData(app.trpc.chat.forever.streamedMutationKey())
        ?.length,
    ).toBeGreaterThanOrEqual(2),
  );
  expect(db.openChats).toBe(1);
  unsubscribe();
  const data = await pending;
  expect(data.length).toBeGreaterThanOrEqual(2);
  expect(data.slice(0, 2)).toEqual([0, 1]);
  await vi.waitFor(() => expect(db.openChats).toBe(0));
});

test('a per-call signal stops a streamed mutation; data is the chunks so far', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  let controller: AbortController | undefined;
  const mutation = new MutationObserver(
    queryClient,
    app.trpc.chat.forever.streamedMutationOptions({
      signal: () => (controller = new AbortController()).signal,
      onChunk: (_chunk, all) => {
        if (all.length === 3) controller!.abort();
      },
    }),
  );
  const data = await mutation.mutate();
  expect(data).toEqual([0, 1, 2]);
  await vi.waitFor(() => expect(db.openChats).toBe(0));

  const again = await mutation.mutate();
  expect(again).toEqual([0, 1, 2]);
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

test('observers with the same key share one subscription', async () => {
  await using app = await createApp();
  const seen: string[] = [];
  const observe = (name: string) =>
    new SubscriptionObserver(
      app.trpc.post.onAdd.subscriptionOptions({
        onData: (post) => seen.push(`${name}:${post.title}`),
      }),
    );
  const a = observe('a');
  const b = observe('b');
  const stopA = a.subscribe(() => {});
  const stopB = b.subscribe(() => {});
  expect(b.getCurrentResult().status).toBe('connecting');
  await sleep(30);
  expect(db.listeners.size).toBe(1);

  app.addPost('One');
  const [ra, rb] = await Promise.all([
    until(a, (r) => r.status === 'active'),
    until(b, (r) => r.status === 'active'),
  ]);
  expect(ra.data.title).toBe('One');
  expect(rb).toBe(ra);
  expect(seen).toEqual(['a:One', 'b:One']);

  const late = observe('late');
  const stopLate = late.subscribe(() => {});
  expect(late.getCurrentResult()).toBe(a.getCurrentResult());

  stopA();
  app.addPost('Two');
  await until(b, (r) => r.status === 'active' && r.data.title === 'Two');
  expect(seen).toEqual(['a:One', 'b:One', 'b:Two', 'late:Two']);

  b.reset();
  expect(late.getCurrentResult().status).toBe('connecting');
  stopB();
  stopLate();
  await sleep(20);
  expect(db.listeners.size).toBe(0);

  const own = new SubscriptionObserver({
    ...app.trpc.post.onAdd.subscriptionOptions(),
    subscriptionCache: undefined,
  });
  const stopOwn = own.subscribe(() => {});
  const stopShared = observe('c').subscribe(() => {});
  await sleep(30);
  expect(db.listeners.size).toBe(2);
  stopOwn();
  stopShared();
});

test('context reaches the links, typed from what they declare', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  await queryClient.query(
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

  const serverClient = new QueryClient({
    defaultOptions: hydrationOptions({ client: app.client }),
  });
  const serverTrpc = createTrpcQueryUtils({
    client: createRouterClient(appRouter, { ctx: { locale: 'en' } }),
  });
  await serverClient.query(
    serverTrpc.post.byId.queryOptions({ input: { id: '1' } }),
  );
  const html = JSON.stringify(dehydrate(serverClient));
  expect(html).not.toContain('"createdAt":"2026');

  const browserClient = new QueryClient({
    defaultOptions: hydrationOptions({ client: app.client }),
  });
  hydrate(browserClient, JSON.parse(html));
  const post = browserClient.getQueryData(
    app.trpc.post.byId.queryKey({ input: { id: '1' } }),
  );
  expect(post?.createdAt).toBeInstanceOf(Date);
  expect(db.calls).toEqual(['post.byId:1']);
});

test("hydration follows the client's serializer (19)", async () => {
  await using _app = await createApp();
  const serializer = createSyncSerializer<Date>(superjson);
  const client = createTrpcClient({
    router: routerType<typeof appRouter>(),
    links: [
      localLink({
        router: appRouter,
        serializer,
        createContext: () => ({ locale: 'en' }),
      }),
    ],
  });
  const options = hydrationOptions({ client });
  const serverClient = new QueryClient({ defaultOptions: options });
  const serverTrpc = createTrpcQueryUtils({
    client: createRouterClient(appRouter, { ctx: { locale: 'en' } }),
  });
  await serverClient.query(
    serverTrpc.post.byId.queryOptions({ input: { id: '1' } }),
  );
  const html = JSON.stringify(dehydrate(serverClient));
  expect(html).toContain('"meta":{"values":{"createdAt":["Date"]}');

  const browserClient = new QueryClient({ defaultOptions: options });
  hydrate(browserClient, JSON.parse(html));
  const post = browserClient.getQueryData(
    serverTrpc.post.byId.queryKey({ input: { id: '1' } }),
  );
  expect(post?.createdAt).toBeInstanceOf(Date);
  expect(
    hydrationOptions({ client, serializer: createSerializer() }).dehydrate
      .serializeData!(new Date(0)),
  ).toEqual({ json: { _: '$', type: 'Date', value: new Date(0).toJSON() } });
});

test('a refetch with equal Dates keeps the data reference', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient();
  const options = app.trpc.post.byId.queryOptions({ input: { id: '2' } });
  const first = await queryClient.query(options);
  await queryClient.refetchQueries({ queryKey: options.queryKey });
  expect(queryClient.getQueryData(options.queryKey)).toBe(first);
});

test('helper edges: skipToken streams and pages, keys, unknown helpers, non-streams and early aborts', async () => {
  await using app = await createApp();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ticks = app.trpc.clock.ticks;
  expect(ticks.streamedKey({ input: { from: 1 } })).toEqual(
    ticks.streamedOptions({ input: { from: 1 } }).queryKey,
  );
  expect(ticks.streamedOptions({ input: skipToken }).queryFn).toBe(skipToken);
  expect(ticks.liveOptions({ input: skipToken }).queryFn).toBe(skipToken);
  const pages = app.trpc.post.list.infiniteOptions({
    input: skipToken,
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  });
  expect(pages.queryFn).toBe(skipToken);
  expect(pages.queryKey).toEqual(
    app.trpc.post.list.infiniteKey({ input: skipToken, initialPageParam: 0 }),
  );

  const untyped = app.trpc as any;
  expect(untyped.then).toBeUndefined();
  expect(untyped[Symbol.iterator]).toBeUndefined();
  expect(() => untyped.post.byId.fetchEverything()).toThrow(
    'post.byId.fetchEverything() is not a TanStack Query helper',
  );

  const plain = new MutationObserver<unknown, Error, { title: string }>(
    queryClient,
    untyped.post.create.streamedMutationOptions(),
  );
  await expect(plain.mutate({ title: 'x' })).rejects.toThrow(
    'post.create did not return an AsyncIterable',
  );

  const aborted = new MutationObserver(
    queryClient,
    app.trpc.chat.forever.streamedMutationOptions({
      signal: AbortSignal.abort(),
    }),
  );
  expect(await aborted.mutate()).toEqual([]);
  await vi.waitFor(() => expect(db.openChats).toBe(0));
});
