import { request as httpRequest } from 'node:http';
import { Stream } from 'effect';
import { cors } from '@trpc12/trpc/http';
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
  splitLink,
  wsLink,
} from '@trpc12/trpc/client';
import {
  error,
  initTrpc,
  tracked,
  type CreateContextOpts,
} from '@trpc12/trpc/server';
import {
  createTestServer,
  type NodeTestServer as TestServer,
} from '../fixtures/server.ts';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { z } from 'zod';

interface Ctx {
  user: string | null;
  transport: string;
}
const t = initTrpc<{ ctx: Ctx }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const state = {
  cleanups: 0,
  lastEventIds: [] as (string | undefined)[],
  contexts: [] as CreateContextOpts['info'][],
};
let current: TestServer | undefined;

const router = {
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => `hello ${opts.input.name} over ${opts.ctx.transport}`),
  whoami: t.procedure.query((opts) => opts.ctx.user),
  add: t.procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .mutation((opts) => opts.input.a + opts.input.b),
  find: t.procedure
    .input(z.object({ id: z.string() }))
    .query((opts) =>
      opts.input.id === '1'
        ? { id: '1', at: new Date(0) }
        : error({ code: 'NOT_FOUND', data: { id: opts.input.id } }),
    ),
  slow: t.procedure.query(async (opts) => {
    await sleep(50);
    return opts.signal.aborted ? 'aborted' : 'done';
  }),
  report: t.procedure.query(() => ({
    title: 'Report',
    total: (async () => {
      await sleep(20);
      return 42;
    })(),
    rows: (async function* () {
      yield 'a';
      await sleep(5);
      yield 'b';
    })(),
  })),
  ticks: t.procedure.subscription(async function* (opts) {
    try {
      let n = 0;
      while (!opts.signal.aborted) {
        yield n++;
        await sleep(5);
      }
    } finally {
      state.cleanups++;
    }
  }),
  posts: t.procedure.subscription(async function* ({ lastEventId }) {
    state.lastEventIds.push(lastEventId);
    const start = lastEventId ? Number(lastEventId) + 1 : 1;
    for (let id = start; id <= 4; id++) {
      yield tracked(String(id), { id });
      if (id === 2 && !lastEventId) {
        await sleep(10);
        current!.dropConnections();
        await sleep(1000);
      }
    }
  }),
  jobs: t.procedure.subscription(async function* () {
    for (const id of ['a', 'b']) {
      yield {
        id,
        result: (async () => {
          await sleep(id === 'a' ? 30 : 5);
          return `${id} done`;
        })(),
      };
    }
  }),
  failing: t.procedure.subscription(async function* () {
    yield 1;
    throw error({ code: 'CONFLICT', message: 'Gone' });
  }),
  stream: t.procedure.subscription(() => Stream.make('x', 'y')),
};
type AppRouter = typeof router;

async function setup(
  opts: { user?: string; idleMs?: number; params?: boolean } = {},
) {
  const server = await createTestServer({
    router,
    createContext: ({ info }) => {
      state.contexts.push(info);
      return {
        user:
          (info.connectionParams?.['token'] as string | undefined) ??
          opts.user ??
          null,
        transport: info.transport,
      };
    },
  });
  current = server;
  const link = wsLink({
    url: server.wsUrl,
    reconnect: { delayMs: () => 10 },
    idleMs: opts.idleMs,
    ...(opts.params
      ? { connectionParams: async () => ({ token: 'kim' }) }
      : {}),
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [link],
  });
  return {
    server,
    link,
    client,
    [Symbol.asyncDispose]: async () => {
      await link.close();
      await server.close();
    },
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

const countUpgrades = (server: TestServer) => {
  const counter = { count: 0 };
  server.server.on('upgrade', () => counter.count++);
  return counter;
};

test('queries and mutations share one WebSocket', async () => {
  await using ctx = await setup();
  const upgrades = countUpgrades(ctx.server);
  const [hello, sum] = await Promise.all([
    ctx.client.hello.query({ name: 'ws' }),
    ctx.client.add.mutate({ a: 1, b: 2 }),
  ]);
  expect(hello).toBe('hello ws over websocket');
  expectTypeOf(hello).toEqualTypeOf<string>();
  expect(sum).toBe(3);
  expect(await ctx.client.hello.query({ name: 'again' })).toBe(
    'hello again over websocket',
  );
  expect(upgrades.count).toBe(1);
  expect(ctx.server.requests).toHaveLength(0);
});

test('the default serializer and typed errors work as over HTTP', async () => {
  await using ctx = await setup();
  const post = await ctx.client.find.query({ id: '1' });
  expect(post.at).toBe(new Date(0).toJSON());
  const res = await safe(ctx.client.find.query({ id: '2' }));
  expect(res.error).toMatchObject({
    code: 'NOT_FOUND',
    defined: true,
    data: { id: '2' },
  });
  const invalid = await safe(
    ctx.client.add.mutate({ a: 1, b: 'two' as unknown as number }),
  );
  expect(invalid.error).toMatchObject({ code: 'BAD_REQUEST', defined: true });
});

test('connectionParams reach createContext once per connection', async () => {
  await using ctx = await setup({ params: true });
  state.contexts = [];
  expect(await ctx.client.whoami.query()).toBe('kim');
  expect(state.contexts[0]).toMatchObject({
    transport: 'websocket',
    connectionParams: { token: 'kim' },
    calls: [{ path: 'whoami', type: 'query' }],
  });
});

test('aborting a call sends an abort and aborts the server signal', async () => {
  await using ctx = await setup();
  const controller = new AbortController();
  const pending = ctx.client.slow.query(undefined, {
    signal: controller.signal,
  });
  await sleep(5);
  controller.abort();
  await expect(pending).rejects.toMatchObject({
    code: 'CLIENT_CLOSED_REQUEST',
  });
  expect(await ctx.client.slow.query()).toBe('done');
});

test('close() fails calls in flight, and the next call reconnects', async () => {
  await using ctx = await setup();
  const upgrades = countUpgrades(ctx.server);
  const pending = ctx.client.slow.query();
  const ticks = collect(ctx.client.ticks.subscribe());
  await sleep(10);
  await ctx.link.close();
  await expect(pending).rejects.toMatchObject({
    code: 'CLIENT_CLOSED_REQUEST',
  });
  await expect(ticks).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect(await ctx.client.slow.query()).toBe('done');
  expect(upgrades.count).toBe(2);
});

test('close() fails a subscription waiting to reconnect at once', async () => {
  await using server = await createTestServer({
    router,
    createContext: () => ({ user: null, transport: 'ws' }),
  });
  const url = server.wsUrl;
  await server.close();
  const link = wsLink({ url, reconnect: { delayMs: () => 60_000 } });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [link],
  });
  const ticks = collect(client.ticks.subscribe());
  await sleep(20);
  const started = Date.now();
  await link.close();
  await expect(ticks).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect(Date.now() - started).toBeLessThan(1000);
});

test('deferred values in a result stream over the socket', async () => {
  await using ctx = await setup();
  const report = await ctx.client.report.query();
  expect(report.title).toBe('Report');
  expectTypeOf(report.total).toEqualTypeOf<Promise<number>>();
  expect(await report.total).toBe(42);
  expect(await collect(report.rows)).toEqual(['a', 'b']);
});

test('subscriptions stream events and stop when the loop breaks', async () => {
  await using ctx = await setup();
  const before = state.cleanups;
  const seen: number[] = [];
  for await (const n of ctx.client.ticks.subscribe()) {
    seen.push(n);
    if (n === 2) break;
  }
  expect(seen).toEqual([0, 1, 2]);
  await vi.waitFor(() => expect(state.cleanups).toBe(before + 1));
  expect(await collect(ctx.client.stream.subscribe())).toEqual(['x', 'y']);
});

test('errors mid-subscription reach the loop', async () => {
  await using ctx = await setup();
  const seen: number[] = [];
  await expect(async () => {
    for await (const n of ctx.client.failing.subscribe()) seen.push(n);
  }).rejects.toMatchObject({ code: 'CONFLICT', defined: false });
  expect(seen).toEqual([1]);
});

test('after a dropped connection, subscriptions resume from the last tracked id', async () => {
  await using ctx = await setup();
  state.lastEventIds = [];
  const events = await collect(ctx.client.posts.subscribe());
  expect(events.map((e) => e.data.id)).toEqual([1, 2, 3, 4]);
  expect(state.lastEventIds).toEqual([undefined, '2']);
});

test('reconnect: false ends the subscription when the connection drops', async () => {
  await using ctx = await setup();
  state.lastEventIds = [];
  const seen: number[] = [];
  await expect(async () => {
    for await (const event of ctx.client.posts.subscribe(undefined, {
      reconnect: false,
    })) {
      seen.push(event.data.id);
    }
  }).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  expect(seen).toEqual([1, 2]);
  expect(state.lastEventIds).toEqual([undefined]);
});

test('queries in flight fail when the connection drops', async () => {
  await using ctx = await setup();
  await ctx.client.whoami.query();
  const pending = ctx.client.slow.query();
  await sleep(5);
  ctx.server.dropConnections();
  await expect(pending).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  expect(await ctx.client.slow.query()).toBe('done');
});

test('deferred values inside subscription events', async () => {
  await using ctx = await setup();
  const jobs = await collect(ctx.client.jobs.subscribe());
  expect(jobs.map((j) => j.id)).toEqual(['a', 'b']);
  expectTypeOf(jobs[0]!.result).toEqualTypeOf<Promise<string>>();
  expect(await Promise.all(jobs.map((j) => j.result))).toEqual([
    'a done',
    'b done',
  ]);
});

test('an idle connection closes and the next call reconnects', async () => {
  await using ctx = await setup({ idleMs: 10 });
  const upgrades = countUpgrades(ctx.server);
  await ctx.client.whoami.query();
  await sleep(40);
  await ctx.client.whoami.query();
  expect(upgrades.count).toBe(2);
});

test('splitLink sends subscriptions over WebSockets and the rest over HTTP', async () => {
  await using server = await createTestServer({
    router,
    createContext: (opts) => ({ user: null, transport: opts.info.transport }),
  });
  await using ws = wsLink({ url: server.wsUrl });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: ws,
        false: httpLink({ url: server.url }),
      }),
    ],
  });
  expect(await client.hello.query({ name: 'a' })).toBe('hello a over http');
  expect(await collect(client.stream.subscribe())).toEqual(['x', 'y']);
  expect(server.requests).toHaveLength(1);
});

test('a client with another protocol version gets a connection error', async () => {
  await using ctx = await setup();
  const socket = new WebSocket(ctx.server.wsUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  const message = new Promise<unknown>((resolve) =>
    socket.addEventListener('message', (e) =>
      resolve(JSON.parse(String(e.data))),
    ),
  );
  const closed = new Promise<CloseEvent>((resolve) =>
    socket.addEventListener('close', resolve),
  );
  socket.send(JSON.stringify({ type: 'init', version: '0' }));
  expect(await message).toMatchObject({
    id: null,
    type: 'error',
    body: { json: { error: { code: 'UNSUPPORTED_PROTOCOL' } } },
  });
  expect((await closed).code).toBe(1002);
});

test('a call keeps the connectionParams it arrived under, despite a later init', async () => {
  await using ctx = await setup();
  const socket = new WebSocket(ctx.server.wsUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  const results: unknown[] = [];
  const two = new Promise<void>((resolve) =>
    socket.addEventListener('message', (e) => {
      const message = JSON.parse(String(e.data)) as { type: string };
      if (message.type === 'result') results.push(message);
      if (results.length === 2) resolve();
    }),
  );
  const init = (token: string) =>
    socket.send(
      JSON.stringify({
        type: 'init',
        version: '12',
        connectionParams: { token },
      }),
    );
  const whoami = (id: number) =>
    socket.send(
      JSON.stringify({ id, type: 'request', method: 'query', path: 'whoami' }),
    );
  init('ada');
  whoami(1);
  init('grace');
  whoami(2);
  await two;
  socket.close();
  expect(results).toEqual(
    expect.arrayContaining([
      { id: 1, type: 'result', body: { json: 'ada' } },
      { id: 2, type: 'result', body: { json: 'grace' } },
    ]),
  );
});

test('the Node upgrade handles large messages and enforces maxPayload', async () => {
  const echoRouter = {
    length: t.procedure.input(z.string()).query((opts) => opts.input.length),
  };
  await using server = await createTestServer({
    router: echoRouter,
    createContext: () => ({ user: null, transport: 'x' }),
    maxPayload: 200_000,
  });
  await using link = wsLink({ url: server.wsUrl, reconnect: { attempts: 0 } });
  const client = createTrpcClient({
    router: routerType<typeof echoRouter>(),
    links: [link],
  });
  expect(await client.length.query('x'.repeat(100_000))).toBe(100_000);
  await expect(client.length.query('x'.repeat(300_000))).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
  });
});

test('the upgrade checks the path, and cors() checks its origin (13 C)', async () => {
  await using server = await createTestServer({
    router,
    createContext: () => ({ user: null, transport: 'x' }),
    middleware: [cors({ allowedOrigins: ['https://app.example.com'] })],
  });
  const url = new URL(server.url);
  const upgrade = (path: string, origin: string) =>
    new Promise<number>((resolve) => {
      const req = httpRequest({
        port: url.port,
        host: '127.0.0.1',
        path,
        headers: {
          connection: 'Upgrade',
          upgrade: 'websocket',
          origin,
          'sec-websocket-version': '13',
          'sec-websocket-key': Buffer.alloc(16, 1).toString('base64'),
        },
      });
      req.on('upgrade', (res, socket) => {
        socket.destroy();
        resolve(res.statusCode ?? 0);
      });
      req.on('response', (res) => resolve(res.statusCode ?? 0));
      req.end();
    });
  expect(await upgrade('/trpc', 'https://app.example.com')).toBe(101);
  expect(await upgrade('/trpc', 'https://evil.example.com')).toBe(403);
  expect(await upgrade('/elsewhere', 'https://app.example.com')).toBe(404);
});

test('wsLink replaces a connection that stops answering pings', async () => {
  const sockets: DeafSocket[] = [];
  class DeafSocket extends WebSocket {
    deaf = false;
    constructor(url: string | URL) {
      super(url);
      sockets.push(this);
    }
    override addEventListener(
      ...args: Parameters<WebSocket['addEventListener']>
    ) {
      const [type, listener, options] = args;
      if (type !== 'message') return super.addEventListener(...args);
      super.addEventListener(
        type,
        (event) => {
          if (!this.deaf) (listener as (e: Event) => void)(event);
        },
        options,
      );
    }
  }
  await using server = await createTestServer({
    router,
    createContext: () => ({ user: null, transport: 'ws' }),
  });
  await using link = wsLink({
    url: server.wsUrl,
    WebSocket: DeafSocket,
    keepAlive: { intervalMs: 20, timeoutMs: 20 },
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [link],
  });
  expect(await client.hello.query({ name: 'a' })).toBe('hello a over ws');
  await sleep(100);
  expect(sockets).toHaveLength(1);

  sockets[0]!.deaf = true;
  await sleep(100);
  expect(await client.hello.query({ name: 'b' })).toBe('hello b over ws');
  expect(sockets).toHaveLength(2);
});

test('the server closes a socket that sends nothing for idleTimeoutMs, and pings keep it open', async () => {
  await using server = await createTestServer({
    router,
    createContext: () => ({ user: null, transport: 'websocket' }),
    websocket: { idleTimeoutMs: 80 },
  });
  const open = async () => {
    const socket = new WebSocket(server.wsUrl);
    await new Promise((resolve) => socket.addEventListener('open', resolve));
    const closed = new Promise<CloseEvent>((resolve) =>
      socket.addEventListener('close', resolve),
    );
    socket.send(JSON.stringify({ type: 'init', version: '12' }));
    return { socket, closed };
  };

  const silent = await open();
  expect((await silent.closed).code).toBe(1001);

  const pinging = await open();
  let isClosed = false;
  void pinging.closed.then(() => (isClosed = true));
  for (let i = 0; i < 6; i++) {
    await sleep(40);
    pinging.socket.send(JSON.stringify({ type: 'ping' }));
  }
  expect(isClosed).toBe(false);
  pinging.socket.close();
});
