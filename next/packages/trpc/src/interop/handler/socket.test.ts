import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Exit, Layer, Scope, Stream } from 'effect';
import { serve } from '@trpc12/trpc/http';
import { createV11Handler, type V11HandlerOptions } from '@trpc12/trpc/interop';
import { error, initTrpc, tracked } from '@trpc12/trpc/server';
import superjson from 'superjson';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc<{ ctx: { user: string | null } }>();

const router = t.router({
  whoami: t.procedure.query((opts) => opts.ctx.user),
  echo: t.procedure.input(z.unknown()).mutation((opts) => opts.input),
  feed: t.procedure.subscription(async function* (opts) {
    yield tracked(String(Number(opts.lastEventId ?? 0) + 1), 'next');
    throw error({ code: 'CONFLICT', message: 'Feed ended badly' });
  }),
  forever: t.procedure.subscription(() => Stream.never),
});

async function start(extra: Partial<V11HandlerOptions<typeof router>> = {}) {
  const handler = createV11Handler({
    router,
    createContext: (opts) => ({
      user:
        (opts.info.connectionParams?.['token'] as string | undefined) ?? null,
    }),
    ...extra,
  });
  const server = createServer();
  const sockets = new Set<Duplex>();
  server.on('upgrade', (_req, socket: Duplex) => sockets.add(socket));
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
    url: `ws://127.0.0.1:${address.port}/trpc`,
    async [Symbol.asyncDispose]() {
      server.closeAllConnections();
      for (const socket of sockets) socket.destroy();
      await Effect.runPromise(Scope.close(scope, Exit.void));
      await handler.dispose();
    },
  };
}

/** A raw socket that collects every reply, parsed when it is JSON. */
async function connect(url: string) {
  const ws = new WebSocket(url);
  const replies: unknown[] = [];
  const waiters: Array<() => void> = [];
  ws.addEventListener('message', (event) => {
    const data = String(event.data);
    replies.push(data === 'PONG' ? data : JSON.parse(data));
    waiters.splice(0).forEach((w) => w());
  });
  const closed = new Promise<CloseEvent>((resolve) =>
    ws.addEventListener('close', resolve),
  );
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  const until = async (count: number) => {
    while (replies.length < count) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    return replies.slice(0, count);
  };
  return {
    send: (message: unknown) =>
      ws.send(typeof message === 'string' ? message : JSON.stringify(message)),
    until,
    replies,
    closed,
    close: () => ws.close(),
  };
}

test('malformed messages get PARSE_ERROR replies with no id', async () => {
  await using app = await start();
  const ws = await connect(app.url);
  ws.send('PING');
  ws.send('PONG');
  ws.send('{nope');
  ws.send('5');
  ws.send({ method: 'query', params: { path: 'whoami' } });
  ws.send({ id: 1, jsonrpc: '2.0', method: 'delete' });
  expect(await ws.until(5)).toMatchObject([
    'PONG',
    { id: null, error: { message: 'Invalid JSON', code: -32700 } },
    { id: null, error: { message: 'Invalid message' } },
    { id: null, error: { message: '`id` is required' } },
    { id: 1, jsonrpc: '2.0', error: { message: 'Unknown method "delete"' } },
  ]);
  ws.close();
});

test("a message with more calls than batch.maxItems runs none and fails each by id, as v11's maxBatchSize does over HTTP", async () => {
  const onError = vi.fn<() => void>();
  await using app = await start({ batch: { maxItems: 2 }, onError });
  const ws = await connect(app.url);
  const echo = (id: number) => ({
    id,
    jsonrpc: '2.0',
    method: 'mutation',
    params: { path: 'echo', input: id },
  });
  ws.send([echo(1), echo(2), echo(3), { method: 'connectionParams' }]);
  const refused = {
    jsonrpc: '2.0',
    error: {
      message: 'Batch call exceeds maximum size',
      code: -32600,
      data: { code: 'BAD_REQUEST', httpStatus: 400 },
    },
  };
  expect(await ws.until(3)).toEqual([
    { id: 1, ...refused },
    { id: 2, ...refused },
    { id: 3, ...refused },
  ]);
  expect(onError).toHaveBeenCalledOnce();
  ws.send([echo(4), echo(5)]);
  expect(await ws.until(5)).toEqual(
    expect.arrayContaining([
      { id: 4, jsonrpc: '2.0', result: { type: 'data', data: 4 } },
      { id: 5, jsonrpc: '2.0', result: { type: 'data', data: 5 } },
    ]),
  );
  ws.send([{ id: 6, method: 'subscription.stop' }, 'x', 7]);
  expect((await ws.until(6))[5]).toEqual({
    id: null,
    ...refused,
    jsonrpc: undefined,
  });
  ws.close();
});

test('with batch: false, a WebSocket message keeps the default cap of 100 calls', async () => {
  await using app = await start({ batch: false });
  const ws = await connect(app.url);
  const calls = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: from + i,
      method: 'query',
      params: { path: 'whoami' },
    }));
  ws.send(calls(0, 100));
  const ran = await ws.until(100);
  expect(ran.every((reply) => 'result' in (reply as object))).toBe(true);
  ws.send(calls(100, 101));
  const refused = (await ws.until(201)).slice(100);
  expect(
    refused.every(
      (reply) =>
        (reply as { error?: { message?: string } }).error?.message ===
        'Batch call exceeds maximum size',
    ),
  ).toBe(true);
  ws.close();
});

test('calls to missing paths, or with the wrong method, fail by id', async () => {
  await using app = await start();
  const ws = await connect(app.url);
  ws.send({ id: 1, method: 'query', params: { path: 'nowhere' } });
  ws.send({ id: 2, method: 'mutation', params: { path: 'whoami' } });
  ws.send({ id: 3, method: 'query', params: 'not an object' });
  const replies = await ws.until(3);
  expect(replies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 1,
        error: expect.objectContaining({
          message: 'No "query"-procedure on path "nowhere"',
        }),
      }),
      expect.objectContaining({
        id: 2,
        error: expect.objectContaining({
          message: 'No "mutation"-procedure on path "whoami"',
          data: expect.objectContaining({ code: 'NOT_FOUND' }),
        }),
      }),
      expect.objectContaining({
        id: 3,
        error: expect.objectContaining({
          message: 'No "query"-procedure on path ""',
        }),
      }),
    ]),
  );
  ws.close();
});

test('a duplicate id is refused while the first call runs; stop frees it', async () => {
  await using app = await start();
  const ws = await connect(app.url);
  ws.send({ id: 'a', method: 'subscription', params: { path: 'forever' } });
  expect(await ws.until(1)).toEqual([{ id: 'a', result: { type: 'started' } }]);
  ws.send({ id: 'a', method: 'subscription', params: { path: 'forever' } });
  expect((await ws.until(2))[1]).toMatchObject({
    id: 'a',
    error: { message: 'Duplicate id a' },
  });
  ws.send({ id: 'a', method: 'subscription.stop' });
  expect((await ws.until(3))[2]).toEqual({
    id: 'a',
    result: { type: 'stopped' },
  });
  ws.close();
});

test('subscriptions resume from params.lastEventId and end with their error', async () => {
  await using app = await start();
  const ws = await connect(app.url);
  ws.send({
    id: 1,
    jsonrpc: '2.0',
    method: 'subscription',
    params: { path: 'feed', lastEventId: '4' },
  });
  expect(await ws.until(4)).toMatchObject([
    { id: 1, jsonrpc: '2.0', result: { type: 'started' } },
    {
      id: 1,
      result: { type: 'data', id: '5', data: { id: '5', data: 'next' } },
    },
    {
      id: 1,
      error: { message: 'Feed ended badly', data: { code: 'CONFLICT' } },
    },
    { id: 1, result: { type: 'stopped' } },
  ]);
  ws.close();
});

test("a subscription resumes from the input's lastEventId, read after the transformer", async () => {
  await using app = await start({ transformer: superjson });
  const ws = await connect(app.url);
  ws.send({
    id: 1,
    method: 'subscription',
    params: {
      path: 'feed',
      input: superjson.serialize({ lastEventId: '7' }),
    },
  });
  expect((await ws.until(2))[1]).toMatchObject({
    id: 1,
    result: { type: 'data', id: '8' },
  });
  ws.close();
});

test('connectionParams must be an object, and apply to the calls after them', async () => {
  await using app = await start();
  const ws = await connect(app.url);
  ws.send({ method: 'connectionParams', data: 'token' });
  ws.send({ id: 1, method: 'query', params: { path: 'whoami' } });
  ws.send({ method: 'connectionParams', data: { token: 'ada' } });
  ws.send({ id: 2, method: 'query', params: { path: 'whoami' } });
  expect(await ws.until(2)).toEqual([
    { id: 1, result: { type: 'data', data: null } },
    { id: 2, result: { type: 'data', data: 'ada' } },
  ]);
  ws.close();
});

test('inputs the transformer cannot read, and createContext errors, fail the call', async () => {
  await using app = await start({
    transformer: {
      serialize: (v: unknown) => v,
      deserialize: () => {
        throw new Error('unreadable');
      },
    },
    createContext: (opts) => {
      if (opts.info.connectionParams?.['token'] === 'bad') {
        throw error({ code: 'UNAUTHORIZED', message: 'Bad token' });
      }
      if (opts.info.connectionParams?.['token'] === 'crash') {
        throw new Error('db down');
      }
      return { user: null };
    },
    exposeUnexpectedErrors: false,
  });
  const ws = await connect(app.url);
  ws.send({ id: 1, method: 'mutation', params: { path: 'echo', input: 1 } });
  expect((await ws.until(1))[0]).toMatchObject({
    id: 1,
    error: { message: 'Invalid input', data: { code: 'PARSE_ERROR' } },
  });

  ws.send({ method: 'connectionParams', data: { token: 'bad' } });
  ws.send({ id: 2, method: 'query', params: { path: 'whoami' } });
  expect((await ws.until(2))[1]).toMatchObject({
    id: 2,
    error: { message: 'Bad token', data: { code: 'UNAUTHORIZED' } },
  });

  ws.send({ method: 'connectionParams', data: { token: 'crash' } });
  ws.send({ id: 3, method: 'query', params: { path: 'whoami' } });
  expect((await ws.until(3))[2]).toMatchObject({
    id: 3,
    error: { message: 'Internal server error' },
  });
  ws.close();
});

test('an idle connection closes; each message restarts the clock', async () => {
  await using app = await start({ websocket: { idleTimeout: 80 } });
  const ws = await connect(app.url);
  const opened = Date.now();
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    ws.send('PING');
  }
  const closed = await ws.closed;
  expect(closed.code).toBe(1001);
  expect(closed.reason).toBe('Idle timeout');
  expect(Date.now() - opened).toBeGreaterThanOrEqual(190);
  expect(ws.replies).toEqual(['PONG', 'PONG', 'PONG']);
});

/** A server-side `WebSocket` as `Deno.upgradeWebSocket` or Bun hand it over. */
class StandardSocket extends EventTarget {
  readyState = 0;
  readonly sent: unknown[] = [];
  closed: { code: number | undefined; reason: string | undefined } | undefined;
  send(data: string | Uint8Array) {
    if (this.readyState !== 1) throw new Error('send before open');
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason }));
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  receive(message: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(message) }),
    );
  }
}

test('dispose() closes the sockets handed to websocket() and ends their subscriptions, without a stopped result', async () => {
  let ended = 0;
  const handler = createV11Handler({
    router: t.router({
      ...router,
      forever: t.procedure.subscription(async function* (opts) {
        try {
          yield 1;
          await new Promise((resolve) =>
            opts.signal.addEventListener('abort', resolve),
          );
        } finally {
          ended++;
        }
      }),
    }),
    createContext: () => ({ user: null }),
  });
  const socket = new StandardSocket();
  handler.websocket(socket, { request: new Request('http://localhost/trpc') });
  socket.open();
  socket.receive({
    id: 1,
    method: 'subscription',
    params: { path: 'forever' },
  });
  await vi.waitFor(() => expect(socket.sent).toHaveLength(2));
  await handler.dispose();
  // A stopped result would end the subscription in wsLink, which instead
  // resends it with its lastEventId once it reconnects.
  expect(socket.sent).toEqual([
    { id: 1, result: { type: 'started' } },
    { id: 1, result: { type: 'data', data: 1 } },
  ]);
  expect(socket.closed).toEqual({ code: 1012, reason: 'Service restart' });
  expect(ended).toBe(1);

  const late = new StandardSocket();
  handler.websocket(late, { request: new Request('http://localhost/trpc') });
  late.open();
  await vi.waitFor(() =>
    expect(late.closed).toEqual({ code: 1012, reason: 'Service restart' }),
  );
});

test('dispose() ends the session of a socket still connecting, and closes it with 1012 once it opens', async () => {
  const handler = createV11Handler({
    router,
    createContext: () => ({ user: null }),
  });
  const socket = new StandardSocket();
  const listening = new Set<string>();
  const add = socket.addEventListener.bind(socket);
  const remove = socket.removeEventListener.bind(socket);
  socket.addEventListener = (type, listener, options) => {
    listening.add(type);
    add(type, listener, options);
  };
  socket.removeEventListener = (type, listener, options) => {
    listening.delete(type);
    remove(type, listener, options);
  };
  handler.websocket(socket, { request: new Request('http://localhost/trpc') });
  await vi.waitFor(() => expect(listening.has('message')).toBe(true));
  await handler.dispose();
  expect(listening.has('message')).toBe(false);
  expect(socket.closed).toBeUndefined();
  socket.open();
  expect(socket.closed).toEqual({ code: 1012, reason: 'Service restart' });
});
