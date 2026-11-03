import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { NodeHttpServer } from '@effect/platform-node';
import { createTRPCUntypedClient, createWSClient, wsLink } from '@trpc/client';
import { Effect, Exit, Layer, Scope } from 'effect';
import { serve } from '@trpc12/trpc/http';
import { createV11Handler, type V11HandlerOptions } from '@trpc12/trpc/interop';
import { initTrpc, type AnyRouter } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';

// The v11 adapter's subscription lifecycle (trpc/trpc#7704), on the v11
// interop handler: who owns an id from the request until `stopped`, and
// what a stop or a closed socket does at each step.

const t = initTrpc<{ ctx: object }>();

type OnError = NonNullable<V11HandlerOptions<AnyRouter>['onError']>;

async function start(
  router: AnyRouter,
  extra: Partial<V11HandlerOptions<AnyRouter>> = {},
) {
  const handler = createV11Handler({
    router,
    batch: { maxItems: 100 },
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
    handler,
    async [Symbol.asyncDispose]() {
      server.closeAllConnections();
      for (const socket of sockets) socket.destroy();
      await Effect.runPromise(Scope.close(scope, Exit.void));
      await handler.dispose();
    },
  };
}

interface Reply {
  id: number | string | null;
  result?: { type: string; data?: unknown };
  error?: { message: string; data?: { code?: string } };
}

/** A raw socket that collects every reply. */
async function connect(url: string) {
  const ws = new WebSocket(url);
  const replies: Reply[] = [];
  ws.addEventListener('message', (event) => {
    replies.push(JSON.parse(String(event.data)) as Reply);
  });
  const closed = new Promise<CloseEvent>((resolve) =>
    ws.addEventListener('close', resolve),
  );
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  return {
    send: (message: unknown) => ws.send(JSON.stringify(message)),
    replies,
    closed,
    of: (id: number) => replies.filter((reply) => reply.id === id),
    types: (id: number) =>
      replies
        .filter((reply) => reply.id === id)
        .map((reply) => reply.result?.type ?? 'error'),
    async close() {
      ws.close();
      await closed;
    },
  };
}

function defer<T = void>() {
  const settle: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => {
    settle.resolve = resolve;
  });
  return { promise, resolve: (value: T) => settle.resolve?.(value) };
}

const subscribe = (path: string, id = 1) => ({
  id,
  method: 'subscription',
  params: { path },
});
const stop = (id = 1) => ({ id, method: 'subscription.stop' });
const done = (): IteratorReturnResult<undefined> => ({
  done: true,
  value: undefined,
});
const onAbort = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });

test('stop during createContext cancels only its call, which replies stopped', async () => {
  const context = defer<object>();
  const resolver = vi.fn<() => AsyncGenerator<number>>(async function* () {
    yield 1;
  });
  const router = t.router({ pending: t.procedure.subscription(resolver) });
  await using app = await start(router, {
    createContext: () => context.promise,
  });
  const ws = await connect(app.url);
  ws.send(subscribe('pending', 1));
  ws.send(subscribe('pending', 2));
  ws.send(stop(1));
  await vi.waitFor(() =>
    expect(ws.of(1)).toEqual([{ id: 1, result: { type: 'stopped' } }]),
  );
  context.resolve({});
  await vi.waitFor(() =>
    expect(ws.types(2)).toEqual(['started', 'data', 'stopped']),
  );
  expect(ws.of(1)).toHaveLength(1);
  expect(resolver).toHaveBeenCalledOnce();
  await ws.close();
});

test.each([
  {
    rejection: 'an AbortError',
    reject: () => new DOMException('request aborted', 'AbortError'),
  },
  { rejection: 'an unrelated error', reject: () => new Error('setup failed') },
])(
  'stop during the procedure replies stopped, which then rejects with $rejection',
  async (rejection) => {
    const entered = defer<void>();
    const rejected = defer<void>();
    const onError = vi.fn<OnError>();
    let calls = 0;
    const router = t.router({
      pending: t.procedure.subscription(
        async (opts): Promise<AsyncIterable<string>> => {
          if (++calls === 1) {
            entered.resolve();
            await onAbort(opts.signal);
            rejected.resolve();
            throw rejection.reject();
          }
          return (async function* () {
            yield 'next';
          })();
        },
      ),
    });
    await using app = await start(router, { onError });
    const ws = await connect(app.url);
    ws.send(subscribe('pending'));
    await entered.promise;
    ws.send(stop());
    await rejected.promise;
    await vi.waitFor(() =>
      expect(ws.replies).toEqual([{ id: 1, result: { type: 'stopped' } }]),
    );
    expect(onError).not.toHaveBeenCalled();
    ws.send(subscribe('pending'));
    await vi.waitFor(() =>
      expect(ws.types(1)).toEqual(['stopped', 'started', 'data', 'stopped']),
    );
    await ws.close();
  },
);

test('stop during the middleware frees the id for the next subscription', async () => {
  const admission = defer<void>();
  const entered = defer<void>();
  const started = vi.fn<() => void>();
  let calls = 0;
  const router = t.router({
    sub: t.procedure
      .use(async (opts) => {
        if (++calls === 1) {
          entered.resolve();
          await admission.promise;
        }
        return opts.next();
      })
      .subscription(async function* () {
        started();
        yield 'next';
      }),
  });
  await using app = await start(router);
  const ws = await connect(app.url);
  ws.send(subscribe('sub'));
  await entered.promise;
  ws.send(stop());
  await vi.waitFor(() => expect(ws.types(1)).toEqual(['stopped']));
  ws.send(subscribe('sub'));
  await vi.waitFor(() =>
    expect(ws.types(1)).toEqual(['stopped', 'started', 'data', 'stopped']),
  );
  admission.resolve();
  ws.send(subscribe('sub', 2));
  await vi.waitFor(() => expect(ws.types(2)).toContain('stopped'));
  expect(started).toHaveBeenCalledTimes(2);
  await ws.close();
});

test('a stop for an id that is not running replies nothing', async () => {
  const router = t.router({
    finite: t.procedure.subscription(async function* () {
      yield 1;
    }),
  });
  await using app = await start(router);
  const ws = await connect(app.url);
  ws.send(stop(7));
  ws.send(subscribe('finite'));
  await vi.waitFor(() =>
    expect(ws.types(1)).toEqual(['started', 'data', 'stopped']),
  );
  ws.send(stop(1));
  ws.send(subscribe('finite', 2));
  await vi.waitFor(() => expect(ws.types(2)).toContain('stopped'));
  expect(ws.of(7)).toEqual([]);
  expect(ws.types(1)).toEqual(['started', 'data', 'stopped']);
  await ws.close();
});

test('dispose() during setup closes the socket without a stopped result', async () => {
  const entered = defer<void>();
  const router = t.router({
    pending: t.procedure.subscription(
      async (opts): Promise<AsyncIterable<never>> => {
        entered.resolve();
        await onAbort(opts.signal);
        throw new DOMException('request aborted', 'AbortError');
      },
    ),
  });
  await using app = await start(router);
  const ws = await connect(app.url);
  ws.send(subscribe('pending'));
  await entered.promise;
  await app.handler.dispose();
  expect((await ws.closed).code).toBe(1012);
  expect(ws.replies).toEqual([]);
});

test('stop disposes an active iterator once', async () => {
  const pending = defer<IteratorResult<number>>();
  const next = vi.fn<() => Promise<IteratorResult<number>>>(
    () => pending.promise,
  );
  const cleaned = vi.fn<() => Promise<IteratorReturnResult<undefined>>>(
    async () => done(),
  );
  const router = t.router({
    active: t.procedure.subscription(() => ({
      [Symbol.asyncIterator]: () => ({ next, return: cleaned }),
    })),
  });
  await using app = await start(router);
  const ws = await connect(app.url);
  ws.send(subscribe('active'));
  await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
  ws.send(stop());
  await vi.waitFor(() =>
    expect(ws.replies).toEqual([
      { id: 1, result: { type: 'started' } },
      { id: 1, result: { type: 'stopped' } },
    ]),
  );
  expect(cleaned).toHaveBeenCalledOnce();
  pending.resolve(done());
  await ws.close();
});

test('a duplicate id cannot enter or cancel a pending procedure', async () => {
  const admission = defer<void>();
  const entered = defer<void>();
  let signal: AbortSignal | undefined;
  const resolver = vi.fn<
    (opts: { signal: AbortSignal }) => Promise<AsyncGenerator<number>>
  >(async (opts) => {
    signal = opts.signal;
    entered.resolve();
    await admission.promise;
    return (async function* () {
      yield 1;
    })();
  });
  const router = t.router({ pending: t.procedure.subscription(resolver) });
  await using app = await start(router);
  const ws = await connect(app.url);
  ws.send(subscribe('pending'));
  await entered.promise;
  ws.send(subscribe('pending'));
  await vi.waitFor(() =>
    expect(ws.replies).toMatchObject([
      { id: 1, error: { message: 'Duplicate id 1' } },
    ]),
  );
  expect(resolver).toHaveBeenCalledOnce();
  expect(signal?.aborted).toBe(false);
  admission.resolve();
  await vi.waitFor(() => expect(ws.types(1)).toContain('stopped'));
  expect(ws.types(1)).toEqual(['error', 'started', 'data', 'stopped']);
  await ws.close();
});

test('a subscription that completes does not abort its signal', async () => {
  let signal: AbortSignal | undefined;
  const router = t.router({
    finite: t.procedure.subscription(async function* (opts) {
      signal = opts.signal;
      yield 1;
    }),
  });
  await using app = await start(router);
  const ws = await connect(app.url);
  ws.send(subscribe('finite'));
  await vi.waitFor(() =>
    expect(ws.types(1)).toEqual(['started', 'data', 'stopped']),
  );
  expect(signal?.aborted).toBe(false);
  await ws.close();
});

test('an AbortError from a procedure nobody stopped is an error', async () => {
  const onError = vi.fn<OnError>();
  const router = t.router({
    pending: t.procedure.subscription((): AsyncIterable<never> => {
      throw new DOMException('unrelated abort', 'AbortError');
    }),
  });
  await using app = await start(router, { onError });
  const ws = await connect(app.url);
  ws.send(subscribe('pending'));
  await vi.waitFor(() => expect(ws.replies).toHaveLength(1));
  expect(ws.replies[0]).toMatchObject({
    id: 1,
    error: { message: 'unrelated abort' },
  });
  expect(onError).toHaveBeenCalledOnce();
  await ws.close();
});

test('wsLink unsubscribing during the middleware never starts the resolver', async () => {
  const entered = defer<void>();
  const admission = defer<void>();
  let setupSignal: AbortSignal | undefined;
  const started = vi.fn<() => void>();
  const router = t.router({
    sub: t.procedure
      .use(async (opts) => {
        setupSignal = opts.signal;
        entered.resolve();
        await admission.promise;
        return opts.next();
      })
      .subscription(async function* () {
        started();
        yield 1;
      }),
  });
  await using app = await start(router);
  const wsClient = createWSClient({ url: app.url });
  try {
    const client = createTRPCUntypedClient({
      links: [wsLink({ client: wsClient })],
    });
    const subscription = client.subscription('sub', undefined, {});
    await entered.promise;
    subscription.unsubscribe();
    await vi.waitFor(() => expect(setupSignal?.aborted).toBe(true));
    admission.resolve();
    expect(await client.query('missing').catch(() => 'answered')).toBe(
      'answered',
    );
    expect(started).not.toHaveBeenCalled();
  } finally {
    await wsClient.close();
  }
});
