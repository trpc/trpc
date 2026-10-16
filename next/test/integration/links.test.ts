import { Effect, Schema, Stream } from 'effect';
import {
  createTrpcClient,
  httpLink,
  link,
  localLink,
  loggerLink,
  retryLink,
  safe,
  splitLink,
  type LoggerEvent,
  routerType,
} from '@trpc12/trpc/client';
import { createUntypedClient } from '@trpc12/trpc/extend';
import { createV11Handler } from '@trpc12/trpc/interop';
import {
  call,
  createFetchHandler,
  createRouterClient,
  error,
  initTrpc,
} from '@trpc12/trpc/server';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { z } from 'zod';

interface Context {
  token: string | null;
}
const t = initTrpc<{ ctx: Context }>();

const signals = { aborted: 0 };

const router = {
  whoami: t.procedure.query(({ ctx }) => ctx.token ?? 'anonymous'),
  today: t.procedure.query(() => new Date('2026-10-10T00:00:00.000Z')),
  add: t.procedure
    .input(Schema.Struct({ a: Schema.Number, b: Schema.Number }))
    .mutation(({ input }) => input.a + input.b),
  find: t.procedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) =>
      input.id === '1'
        ? { id: '1' }
        : error({ code: 'NOT_FOUND', data: { id: input.id } }),
    ),
  ticks: t.procedure.subscription(async function* () {
    yield 1;
    yield 2;
  }),
  slow: t.procedure.query(
    ({ signal }) =>
      new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve('late'), 5000);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          signals.aborted++;
        });
      }),
  ),
};
type AppRouter = typeof router;

const serve = () =>
  createTestServer({
    router,
    batch: true,
    createContext: ({ request }) => ({
      token: request.headers['authorization'] ?? null,
    }),
  });

test('a link can add headers through the operation context', async () => {
  await using server = await serve();
  const authLink = link(({ op, next }) =>
    next({
      ...op,
      context: {
        ...op.context,
        headers: { authorization: `Bearer ${op.path}` },
      },
    }),
  );
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [authLink, httpLink({ url: server.url })],
  });
  expect(await client.whoami.query()).toBe('Bearer whoami');
  expect(
    await client.whoami.query(undefined, {
      headers: { authorization: 'per-call' },
    }),
  ).toBe('Bearer whoami');
});

test('httpLink headers can be computed per request', async () => {
  await using server = await serve();
  let n = 0;
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url: server.url,
        headers: () => ({ authorization: `token-${++n}` }),
      }),
    ],
  });
  expect(await client.whoami.query()).toBe('token-1');
  expect(await client.whoami.query()).toBe('token-2');
});

test('a link can replace a result or a subscription', async () => {
  await using server = await serve();
  const cacheLink = link(({ op, next }) => {
    if (op.path === 'whoami') return Stream.make('cached');
    if (op.type === 'subscription') {
      return next(op).pipe(Stream.map((n) => (n as number) * 10));
    }
    return next(op);
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [cacheLink, httpLink({ url: server.url })],
  });
  expect(await client.whoami.query()).toBe('cached');
  const ticks: number[] = [];
  for await (const n of client.ticks.subscribe()) ticks.push(n);
  expect(ticks).toEqual([10, 20]);
});

test('an Effect link wraps the result stream', async () => {
  await using server = await serve();
  const seen: unknown[] = [];
  const tapLink = link(({ op, next }) =>
    next(op).pipe(
      Stream.tap((value) => Effect.sync(() => seen.push([op.path, value]))),
    ),
  );
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [tapLink, httpLink({ url: server.url })],
  });
  await client.add.mutate({ a: 1, b: 2 });
  expect(seen).toEqual([['add', 3]]);
});

test('splitLink routes subscriptions and batched calls differently', async () => {
  await using server = await serve();
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: httpLink({ url: server.url }),
        false: httpLink({ url: server.url, batch: true }),
      }),
    ],
  });
  const [a, b] = await Promise.all([
    client.whoami.query(),
    client.today.query(),
  ]);
  expect(a).toBe('anonymous');
  expect(b).toBe('2026-10-10T00:00:00.000Z');
  expect(server.requests).toHaveLength(1);
  const ticks: number[] = [];
  for await (const n of client.ticks.subscribe()) ticks.push(n);
  expect(ticks).toEqual([1, 2]);
  expect(server.requests.at(-1)!.headers.get('accept')).toBe(
    'text/event-stream',
  );
});

test('loggerLink sees requests, results and errors', async () => {
  await using server = await serve();
  const events: LoggerEvent[] = [];
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      loggerLink({ log: (event) => events.push(event) }),
      httpLink({ url: server.url }),
    ],
  });
  await client.find.query({ id: '1' });
  await safe(client.find.query({ id: '2' }));
  expect(events.map((e) => e.direction)).toEqual(['up', 'down', 'up', 'error']);
  const last = events.at(-1)!;
  expect(last.direction === 'error' && last.error.code).toBe('NOT_FOUND');
});

test('retryLink retries network failures on queries only', async () => {
  await using server = await serve();
  let failures = 2;
  const attempts: string[] = [];
  const flakyFetch: typeof fetch = (input, init) => {
    attempts.push(init?.method ?? 'GET');
    if (failures-- > 0) return Promise.reject(new TypeError('fetch failed'));
    return fetch(input, init);
  };
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      retryLink({ retries: 3, delayMs: () => 1 }),
      httpLink({ url: server.url, fetch: flakyFetch }),
    ],
  });
  expect(await client.whoami.query()).toBe('anonymous');
  expect(attempts).toEqual(['GET', 'GET', 'GET']);

  failures = 1;
  attempts.length = 0;
  const [, err] = await safe(client.add.mutate({ a: 1, b: 1 }));
  expect(err).toMatchObject({ code: 'NETWORK_ERROR' });
  expect(attempts).toEqual(['POST']);

  attempts.length = 0;
  const [, notFound] = await safe(client.find.query({ id: 'x' }));
  expect(notFound).toMatchObject({ code: 'NOT_FOUND' });
  expect(attempts).toHaveLength(1);
});

test('aborting a call rejects with CLIENT_CLOSED_REQUEST and aborts the server', async () => {
  await using server = await serve();
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  const before = signals.aborted;
  const controller = new AbortController();
  const pending = safe(
    client.slow.query(undefined, { signal: controller.signal }),
  );
  await vi.waitFor(() => expect(server.requests).toHaveLength(1));
  controller.abort();
  const [, err] = await pending;
  expect(err).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST', defined: false });
  await vi.waitFor(() => expect(signals.aborted).toBe(before + 1));
});

test('an aborted request.signal aborts the call on handler.fetch', async () => {
  const createContext = () => ({ token: null });
  for (const handler of [
    createFetchHandler({ router, createContext }),
    createV11Handler({ router, createContext }),
  ]) {
    const before = signals.aborted;
    const controller = new AbortController();
    const pending = handler.fetch(
      new Request('http://localhost/trpc/slow', { signal: controller.signal }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await pending;
    expect(signals.aborted).toBe(before + 1);
  }
});

test('localLink runs the router in-process, through the serializer', async () => {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [localLink({ router, createContext: () => ({ token: 'local' }) })],
  });
  expect(await client.whoami.query()).toBe('local');
  const today = await client.today.query();
  expect(today).toBe('2026-10-10T00:00:00.000Z');
  const [, err] = await safe(client.find.query({ id: 'x' }));
  expect(err).toMatchObject({ code: 'NOT_FOUND', defined: true });
});

test('createRouterClient and call() skip the network and the serializer', async () => {
  const caller = createRouterClient(router, { ctx: { token: 'server' } });
  expect(await caller.whoami.query()).toBe('server');
  expect(await caller.add.mutate({ a: 2, b: 3 })).toBe(5);
  const [, err] = await safe(caller.find.query({ id: 'x' }));
  expect(err).toMatchObject({ code: 'NOT_FOUND', data: { id: 'x' } });
  const ticks: number[] = [];
  for await (const n of caller.ticks.subscribe()) ticks.push(n);
  expect(ticks).toEqual([1, 2]);

  // @ts-expect-error -- the router needs a ctx
  createRouterClient(router);

  const sum = await call(router.add, { a: 4, b: 5 }, { ctx: { token: null } });
  expect(sum).toBe(9);
  expectTypeOf(sum).toEqualTypeOf<number>();
  await expect(
    call(router.find, { id: 'x' }, { ctx: { token: null } }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('the untyped client takes paths as strings', async () => {
  await using server = await serve();
  const client = createUntypedClient({
    links: [httpLink({ url: server.url })],
  });
  expect(
    await client.request({ type: 'query', path: 'find', input: { id: '1' } }),
  ).toEqual({ id: '1' });
  const events: unknown[] = [];
  for await (const n of client.subscribe({ path: 'ticks' })) events.push(n);
  expect(events).toEqual([1, 2]);
});

test('one client for routers on two servers with different contexts (docs/client.md)', async () => {
  const blogT = initTrpc<{ ctx: { locale: string } }>();
  const shopT = initTrpc<{ ctx: { cart: string[] } }>();
  const blogRouter = {
    hello: blogT.procedure.query(({ ctx }) => `hej (${ctx.locale})`),
  };
  const shopRouter = {
    cart: shopT.procedure.query(({ ctx }) => ctx.cart),
  };
  await using blog = await createTestServer({
    router: blogRouter,
    createContext: () => ({ locale: 'sv' }),
  });
  await using shop = await createTestServer({
    router: shopRouter,
    createContext: () => ({ cart: ['apple'] }),
  });

  const unprefix = (prefix: string) =>
    link(({ op, next }) =>
      next({ ...op, path: op.path.slice(prefix.length + 1) }),
    );
  const client = createTrpcClient({
    router: routerType<{
      blog: typeof blogRouter;
      shop: typeof shopRouter;
    }>(),
    links: [
      splitLink({
        condition: (op) => op.path.startsWith('shop.'),
        true: [unprefix('shop'), httpLink({ url: shop.url })],
        false: [unprefix('blog'), httpLink({ url: blog.url })],
      }),
    ],
  });
  expect(await client.blog.hello.query()).toBe('hej (sv)');
  const cart = await client.shop.cart.query();
  expect(cart).toEqual(['apple']);
  expectTypeOf(cart).toEqualTypeOf<string[]>();
});

test('httpLink init: a per-request default, merged with each call’s init', async () => {
  await using server = await serve();
  const seen: RequestInit[] = [];
  const opsPerInit: string[][] = [];
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url: server.url,
        batch: true,
        headers: { authorization: 'link' },
        init: ({ ops }) => {
          opsPerInit.push(ops.map((op) => op.path));
          return {
            cache: 'no-store',
            headers: { 'x-base': 'base', authorization: 'base' },
            next: { revalidate: 60 },
          };
        },
        fetch: (url, init) => {
          seen.push(init!);
          return fetch(url, init);
        },
      }),
    ],
  });

  const [a, b, c] = await Promise.all([
    client.whoami.query(),
    client.today.query(),
    client.whoami.query(undefined, {
      init: { headers: { authorization: 'call' }, next: { tags: ['me'] } },
    }),
  ]);
  expect([a, b, c]).toEqual(['link', '2026-10-10T00:00:00.000Z', 'call']);
  expect(opsPerInit).toEqual([['whoami', 'today'], ['whoami']]);
  expect(server.requests).toHaveLength(2);

  const own = seen.find(
    (init) => new Headers(init.headers).get('authorization') === 'call',
  );
  expect(own).toMatchObject({
    method: 'POST',
    cache: 'no-store',
    next: { revalidate: 60, tags: ['me'] },
  });
  expect(new Headers(own!.headers).get('x-base')).toBe('base');

  await client.whoami.query(undefined, {
    headers: { authorization: 'header' },
    init: { headers: { authorization: 'init' } },
  });
  expect(new Headers(seen.at(-1)!.headers).get('authorization')).toBe('header');
});
