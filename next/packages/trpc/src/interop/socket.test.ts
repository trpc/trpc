import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Exit, Layer, Scope, Stream } from 'effect';
import { serve } from '@trpc12/trpc/http';
import { createV11Handler, type V11HandlerOptions } from '@trpc12/trpc/interop';
import { error, initTrpc, tracked } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc<{ ctx: { user: string | null } }>();

const router = {
  whoami: t.procedure.query((opts) => opts.ctx.user),
  echo: t.procedure.input(z.unknown()).mutation((opts) => opts.input),
  feed: t.procedure.subscription(async function* (opts) {
    yield tracked(String(Number(opts.lastEventId ?? 0) + 1), 'next');
    throw error({ code: 'CONFLICT', message: 'Feed ended badly' });
  }),
  forever: t.procedure.subscription(() => Stream.never),
};

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
          message: 'No procedure found on path "nowhere"',
        }),
      }),
      expect.objectContaining({
        id: 2,
        error: expect.objectContaining({
          message: '"whoami" is a query, not a mutation',
        }),
      }),
      expect.objectContaining({
        id: 3,
        error: expect.objectContaining({
          message: 'No procedure found on path ""',
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
  await using app = await start({ websocket: { idleTimeoutMs: 80 } });
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
