import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NodeHttpServer } from '@effect/platform-node';
import {
  createTRPCClient,
  createTRPCUntypedClient,
  createWSClient,
  httpBatchLink,
  httpBatchStreamLink,
  httpLink,
  httpSubscriptionLink,
  splitLink,
  TRPCClientError,
  wsLink,
  type TRPCLink,
} from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { Effect, Exit, Layer, Scope, Stream } from 'effect';
import superjson from 'superjson';
import { EventSource } from 'undici';
import { serve } from '@trpc12/trpc/http';
import { createTrpcClient, routerType } from '@trpc12/trpc/client';
import {
  createV11Handler,
  fromV11Link,
  type V11HandlerOptions,
} from '@trpc12/trpc/interop';
import { error, initTrpc, tracked } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

interface Ctx {
  user: string | null;
  transport: string;
}
const t = initTrpc<{ ctx: Ctx }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stopped = 0;

const router = {
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => `hello ${opts.input.name}`),
  whoami: t.procedure.query((opts) => ({
    user: opts.ctx.user,
    transport: opts.ctx.transport,
  })),
  post: {
    add: t.procedure
      .input(z.object({ title: z.string() }))
      .mutation((opts) => ({ id: 1, title: opts.input.title })),
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query((opts) =>
        opts.input.id === '1'
          ? { id: '1', title: 'First' }
          : error({ code: 'NOT_FOUND', message: `No post ${opts.input.id}` }),
      ),
  },
  created: t.procedure
    .input(z.object({ name: z.string() }))
    .mutation((opts) => {
      opts.response.status = 201;
      opts.response.headers.append('set-cookie', `${opts.input.name}=1`);
      return opts.input.name;
    }),
  upload: t.procedure
    .input(z.object({ name: z.string(), file: z.instanceof(File) }))
    .mutation(async (opts) => ({
      name: opts.input.name,
      text: await opts.input.file.text(),
    })),
  bytes: t.procedure
    .input(z.instanceof(Blob))
    .mutation(async (opts) => opts.input.size),
  locked: t.procedure
    .errors({ POST_LOCKED: { status: 423 } })
    .query(() => error({ code: 'POST_LOCKED', message: 'Locked' })),
  dates: t.procedure
    .input(z.object({ at: z.date() }))
    .query((opts) => ({ next: new Date(opts.input.at.getTime() + 1000) })),
  report: t.procedure.query(() => ({
    title: 'Report',
    total: (async () => {
      await sleep(10);
      return 42;
    })(),
  })),
  rows: t.procedure.query(async function* () {
    yield 'a';
    await sleep(5);
    yield 'b';
  }),
  events: t.procedure
    .input(z.object({ from: z.number().optional() }).optional())
    .subscription(async function* (opts) {
      const start = opts.lastEventId
        ? Number(opts.lastEventId) + 1
        : (opts.input?.from ?? 1);
      for (let id = start; id <= 3; id++) yield tracked(String(id), { id });
    }),
  ticks: t.procedure.subscription(() => Stream.make(1, 2, 3)),
  forever: t.procedure.subscription(async function* (opts) {
    try {
      for (let n = 0; !opts.signal.aborted; n++) {
        yield n;
        await sleep(5);
      }
    } finally {
      stopped++;
    }
  }),
  failing: t.procedure.subscription(async function* () {
    yield 1;
    throw error({ code: 'CONFLICT', message: 'Gone' });
  }),
};

interface Running {
  readonly url: string;
  readonly wsUrl: string;
  readonly requests: string[];
  [Symbol.asyncDispose](): Promise<void>;
}

async function start(
  extra: Partial<V11HandlerOptions<typeof router>> = {},
): Promise<Running> {
  const requests: string[] = [];
  const handler = createV11Handler({
    router,
    createContext: (opts) => ({
      user:
        (opts.info.connectionParams?.['token'] as string | undefined) ??
        opts.request.headers['x-user'] ??
        null,
      transport: opts.info.transport,
    }),
    ...extra,
  });
  const server: Server = createServer();
  server.on('request', (req) => requests.push(`${req.method} ${req.url}`));
  const scope = Scope.makeUnsafe();
  await Effect.runPromise(
    Layer.buildWithScope(
      serve(handler).pipe(
        Layer.provide(
          NodeHttpServer.layer(() => server, { port: 0, host: '127.0.0.1' }),
        ),
      ),
      scope,
    ),
  );
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/trpc`,
    wsUrl: `ws://127.0.0.1:${address.port}/trpc`,
    requests,
    async [Symbol.asyncDispose]() {
      server.closeAllConnections();
      await Effect.runPromise(Scope.close(scope, Exit.void));
      await handler.dispose();
    },
  };
}

const untyped = (links: TRPCLink<any>[]) =>
  createTRPCUntypedClient<any>({ links });

test('httpLink: queries, mutations and createContext', async () => {
  await using app = await start();
  const client = untyped([
    httpLink({ url: app.url, headers: { 'x-user': 'kim' } }),
  ]);
  expect(await client.query('greet', { name: 'v11' })).toBe('hello v11');
  expect(await client.mutation('post.add', { title: 'New' })).toEqual({
    id: 1,
    title: 'New',
  });
  expect(await client.query('whoami')).toEqual({
    user: 'kim',
    transport: 'http',
  });
  expect(app.requests).toEqual([
    `GET /trpc/greet?input=${encodeURIComponent('{"name":"v11"}')}`,
    'POST /trpc/post.add',
    'GET /trpc/whoami',
  ]);
});

test('errors reach v11 clients as TRPCClientErrors with the JSON-RPC shape', async () => {
  await using app = await start();
  const client = untyped([httpLink({ url: app.url })]);
  const err = await client
    .query('post.byId', { id: '2' })
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(TRPCClientError);
  expect(err).toMatchObject({
    message: 'No post 2',
    shape: {
      code: -32004,
      data: { code: 'NOT_FOUND', httpStatus: 404, path: 'post.byId' },
    },
  });

  const invalid = await client
    .query('post.byId', { id: 1 })
    .catch((e: unknown) => e);
  expect(invalid).toMatchObject({
    data: { code: 'BAD_REQUEST', httpStatus: 400 },
  });

  const missing = await client.query('nope').catch((e: unknown) => e);
  expect(missing).toMatchObject({
    message: 'No procedure found on path "nope"',
    data: { code: 'NOT_FOUND' },
  });

  // A code v11 doesn't have becomes the one for its status.
  const locked = await fetch(`${app.url}/locked`);
  expect(locked.status).toBe(423);
  expect(await locked.json()).toEqual({
    error: {
      message: 'Locked',
      code: -32603,
      data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 423, path: 'locked' },
    },
  });

  const wrongMethod = await fetch(`${app.url}/post.add`);
  expect(wrongMethod.status).toBe(405);
});

test('errorFormatter reproduces the v11 router errorFormatter', async () => {
  await using app = await start({
    errorFormatter: (opts) => ({
      ...opts.shape,
      data: {
        ...opts.shape.data,
        v12Code: opts.error.code,
        issues: opts.error.code === 'BAD_REQUEST' ? 'see issues' : null,
      },
    }),
  });
  const client = untyped([httpLink({ url: app.url })]);
  const locked = await client.query('locked').catch((e: unknown) => e);
  expect(locked).toMatchObject({
    data: { v12Code: 'POST_LOCKED', issues: null },
  });
  const invalid = await client
    .query('greet', { name: 1 })
    .catch((e: unknown) => e);
  expect(invalid).toMatchObject({ data: { issues: 'see issues' } });
});

test('httpBatchLink: one request, results in order, 207 when statuses differ', async () => {
  await using app = await start();
  const client = untyped([httpBatchLink({ url: app.url })]);
  const [a, b, c] = await Promise.allSettled([
    client.query('greet', { name: 'a' }),
    client.query('post.byId', { id: '1' }),
    client.query('post.byId', { id: '9' }),
  ]);
  expect(a).toEqual({ status: 'fulfilled', value: 'hello a' });
  expect(b).toEqual({
    status: 'fulfilled',
    value: { id: '1', title: 'First' },
  });
  expect(c).toMatchObject({
    status: 'rejected',
    reason: { data: { code: 'NOT_FOUND', path: 'post.byId' } },
  });
  expect(app.requests).toHaveLength(1);
  expect(app.requests[0]).toMatch(
    /^GET \/trpc\/greet,post\.byId,post\.byId\?batch=1&input=/,
  );

  const raw = await fetch(
    `${app.url}/greet,post.byId?batch=1&input=${encodeURIComponent(
      JSON.stringify({ 0: { name: 'x' }, 1: { id: '9' } }),
    )}`,
  );
  expect(raw.status).toBe(207);
  expect(await raw.json()).toMatchObject([
    { result: { data: 'hello x' } },
    { error: { code: -32004 } },
  ]);

  // Promises in outputs are settled for the JSON links.
  expect(await client.query('report')).toEqual({ title: 'Report', total: 42 });
  await expect(client.query('rows')).rejects.toMatchObject({
    data: { code: 'UNSUPPORTED_MEDIA_TYPE' },
  });
});

test('httpBatchStreamLink: results stream as they settle, deferred values included', async () => {
  await using app = await start();
  const client = untyped([httpBatchStreamLink({ url: app.url })]);
  const [report, rows, missing] = await Promise.allSettled([
    client.query('report') as Promise<{
      title: string;
      total: Promise<number>;
    }>,
    client.query('rows') as Promise<AsyncIterable<string>>,
    client.query('post.byId', { id: '9' }),
  ]);
  expect(app.requests).toHaveLength(1);
  if (report.status !== 'fulfilled' || rows.status !== 'fulfilled') {
    throw new Error('expected results');
  }
  expect(report.value.title).toBe('Report');
  expect(await report.value.total).toBe(42);
  const seen: string[] = [];
  for await (const row of rows.value) seen.push(row);
  expect(seen).toEqual(['a', 'b']);
  expect(missing).toMatchObject({
    status: 'rejected',
    reason: { data: { code: 'NOT_FOUND' } },
  });
});

test('a v11 transformer (superjson) carries Dates both ways', async () => {
  await using app = await start({ transformer: superjson });
  for (const link of [
    httpLink({ url: app.url, transformer: superjson }),
    httpBatchLink({ url: app.url, transformer: superjson }),
    httpBatchStreamLink({ url: app.url, transformer: superjson }),
  ]) {
    const client = untyped([link]);
    const out = (await client.query('dates', { at: new Date(0) })) as {
      next: Date;
    };
    expect(out.next).toEqual(new Date(1000));
  }
  const client = untyped([httpLink({ url: app.url, transformer: superjson })]);
  await expect(client.query('post.byId', { id: '2' })).rejects.toMatchObject({
    data: { code: 'NOT_FOUND' },
  });

  const ws = createWSClient({ url: app.wsUrl });
  try {
    const overWs = untyped([wsLink({ client: ws, transformer: superjson })]);
    const out = (await overWs.query('dates', { at: new Date(0) })) as {
      next: Date;
    };
    expect(out.next).toEqual(new Date(1000));
  } finally {
    await ws.close();
  }
});

test('allowMethodOverride accepts POST queries, as v11 methodOverride sends them', async () => {
  await using strict = await start();
  const viaPost = (url: string) =>
    untyped([httpLink({ url, methodOverride: 'POST' })]).query('greet', {
      name: 'p',
    });
  await expect(viaPost(strict.url)).rejects.toMatchObject({
    data: { code: 'METHOD_NOT_SUPPORTED', httpStatus: 405 },
  });
  await using lenient = await start({ allowMethodOverride: true });
  expect(await viaPost(lenient.url)).toBe('hello p');
});

const collect = (
  client: ReturnType<typeof untyped>,
  path: string,
  input: unknown,
) =>
  new Promise<{ data: unknown[]; error?: unknown }>((resolve) => {
    const data: unknown[] = [];
    const sub = client.subscription(path, input, {
      onData: (value) => data.push(value),
      onError: (error) => {
        sub.unsubscribe();
        resolve({ data, error });
      },
      onComplete: () => resolve({ data }),
    });
  });

const firstThenStop = (client: ReturnType<typeof untyped>) =>
  new Promise<unknown>((resolve) => {
    const sub = client.subscription('forever', undefined, {
      onData: (value) => {
        sub.unsubscribe();
        resolve(value);
      },
    });
  });

test('httpSubscriptionLink: tracked events, lastEventId from the input, errors', async () => {
  await using app = await start();
  const client = untyped([
    httpSubscriptionLink({ url: app.url, EventSource: EventSource as never }),
  ]);
  expect(await collect(client, 'events', undefined)).toEqual({
    data: [
      { id: '1', data: { id: 1 } },
      { id: '2', data: { id: 2 } },
      { id: '3', data: { id: 3 } },
    ],
  });
  // How v11 clients resume after a reconnect.
  expect(await collect(client, 'events', { lastEventId: '2' })).toEqual({
    data: [{ id: '3', data: { id: 3 } }],
  });
  expect(await collect(client, 'ticks', undefined)).toEqual({
    data: [1, 2, 3],
  });
  const failing = await collect(client, 'failing', undefined);
  expect(failing.data).toEqual([1]);
  expect(failing.error).toMatchObject({
    message: 'Gone',
    data: { code: 'CONFLICT', httpStatus: 409, path: 'failing' },
  });

  // Closing the EventSource stops the subscription on the server.
  const before = stopped;
  expect(await firstThenStop(client)).toBe(0);
  await expect.poll(() => stopped).toBe(before + 1);
});

test('wsLink: calls, subscriptions, stop and connectionParams', async () => {
  await using app = await start();
  const ws = createWSClient({
    url: app.wsUrl,
    connectionParams: async () => ({ token: 'ws-user' }),
  });
  try {
    const client = untyped([wsLink({ client: ws })]);
    expect(await client.query('greet', { name: 'ws' })).toBe('hello ws');
    expect(await client.query('whoami')).toEqual({
      user: 'ws-user',
      transport: 'websocket',
    });
    expect(await client.mutation('post.add', { title: 'W' })).toEqual({
      id: 1,
      title: 'W',
    });
    await expect(client.query('post.byId', { id: '2' })).rejects.toMatchObject({
      data: { code: 'NOT_FOUND', path: 'post.byId' },
    });
    expect(await collect(client, 'events', { from: 2 })).toEqual({
      data: [
        { id: '2', data: { id: 2 } },
        { id: '3', data: { id: 3 } },
      ],
    });
    const failing = await collect(client, 'failing', undefined);
    expect(failing.data).toEqual([1]);
    expect(failing.error).toMatchObject({ data: { code: 'CONFLICT' } });

    const before = stopped;
    await firstThenStop(client);
    await expect.poll(() => stopped).toBe(before + 1);
  } finally {
    await ws.close();
  }
});

test('old apps keep their v11 AppRouter type', async () => {
  // The type the old server exported, kept while clients migrate.
  const v11 = initTRPC.create();
  const legacyRouter = v11.router({
    greet: v11.procedure
      .input(z.object({ name: z.string() }))
      .query((opts) => `hello ${opts.input.name}`),
    post: v11.router({
      add: v11.procedure
        .input(z.object({ title: z.string() }))
        .mutation((opts) => ({ id: 1, title: opts.input.title })),
    }),
  });
  type LegacyAppRouter = typeof legacyRouter;

  await using app = await start();
  const client = createTRPCClient<LegacyAppRouter>({
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: httpSubscriptionLink({
          url: app.url,
          EventSource: EventSource as never,
        }),
        false: httpBatchLink({ url: app.url }),
      }),
    ],
  });
  const greeting = await client.greet.query({ name: 'typed' });
  expectTypeOf(greeting).toEqualTypeOf<string>();
  expect(greeting).toBe('hello typed');
  expect(await client.post.add.mutate({ title: 'T' })).toEqual({
    id: 1,
    title: 'T',
  });
});

test('a v12 client sends through a v11 terminating link', async () => {
  await using app = await start();
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      fromV11Link(
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            url: app.url,
            EventSource: EventSource as never,
          }),
          false: httpBatchLink({ url: app.url, headers: { 'x-user': 'kim' } }),
        }),
      ),
    ],
  });
  expect(await client.greet.query({ name: 'v12' })).toBe('hello v12');
  expect(await client.whoami.query()).toEqual({
    user: 'kim',
    transport: 'http',
  });
  await expect(client.post.byId.query({ id: '2' })).rejects.toMatchObject({
    code: 'NOT_FOUND',
    message: 'No post 2',
  });
  const ticks: number[] = [];
  for await (const n of client.ticks.subscribe()) ticks.push(n);
  expect(ticks).toEqual([1, 2, 3]);
});

test('the response handle sets status and cookies, batched or not', async () => {
  await using app = await start();
  const one = await fetch(`${app.url}/created`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'a' }),
  });
  expect(one.status).toBe(201);
  expect(one.headers.getSetCookie()).toEqual(['a=1']);
  expect(await one.json()).toEqual({ result: { data: 'a' } });

  const both = await fetch(`${app.url}/created,created?batch=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 0: { name: 'a' }, 1: { name: 'b' } }),
  });
  expect(both.status).toBe(201);
  expect(both.headers.getSetCookie()).toEqual(['a=1', 'b=1']);
});

test('FormData and binary inputs from v11 httpLink', async () => {
  await using app = await start();
  const client = untyped([httpLink({ url: app.url })]);
  const form = new FormData();
  form.set('name', 'notes');
  form.set('file', new File(['hello'], 'notes.txt'));
  expect(await client.mutation('upload', form)).toEqual({
    name: 'notes',
    text: 'hello',
  });
  expect(await client.mutation('bytes', new Blob(['12345']))).toBe(5);
});

test('a cross-site form or untyped body is refused, since v11 clients send no header to require', async () => {
  await using app = await start();
  const form = new FormData();
  form.set('name', 'notes');
  form.set('file', new File(['hello'], 'notes.txt'));
  const forged = await fetch(`${app.url}/upload`, {
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site' },
    body: form,
  });
  expect(forged.status).toBe(403);
  const untyped = await fetch(`${app.url}/bytes`, {
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site' },
    body: new Blob(['{}']),
  });
  expect(untyped.status).toBe(403);
  const sameSite = await fetch(`${app.url}/upload`, {
    method: 'POST',
    headers: { 'sec-fetch-site': 'same-origin' },
    body: form,
  });
  expect(sameSite.status).toBe(200);
});

test('batching can be turned off or capped', async () => {
  await using off = await start({ batch: false });
  const res = await fetch(`${off.url}/greet?batch=1&input={}`);
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject([
    { error: { message: 'Batching is not enabled on the server' } },
  ]);

  await using capped = await start({ batch: { maxItems: 1 } });
  const two = await fetch(`${capped.url}/greet,greet?batch=1&input={}`);
  expect(await two.json()).toMatchObject([
    { error: { message: 'Batch call exceeds maximum size' } },
    { error: { message: 'Batch call exceeds maximum size' } },
  ]);
});
