// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import {
  createTRPCClient,
  createWSClient,
  TRPCClientError,
  wsLink,
} from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, tracked, TRPCError } from '@trpc/server';
import type {
  CreateWSSContextFnOptions,
  Encoder,
  WSSHandlerOptions,
} from '@trpc/server/adapters/ws';
import { applyWSSHandler, jsonEncoder } from '@trpc/server/adapters/ws';
import { observable } from '@trpc/server/observable';
import type { TRPCResponseMessage } from '@trpc/server/rpc';
import { TRPC_ERROR_CODES_BY_KEY } from '@trpc/server/rpc';
import {
  createDeferred,
  isObject,
  makeAsyncResource,
} from '@trpc/server/unstable-core-do-not-import';
import type { RawData } from 'ws';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';

type OnError = NonNullable<WSSHandlerOptions<AnyRouter>['onError']>;

function text(data: RawData) {
  return (
    Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data)
  ).toString('utf8');
}

/**
 * A plain `ws` client, for frames that `wsLink` never sends. It records the
 * text frames it gets, and doesn't answer pings.
 */
async function rawSocketResource(url: string) {
  const ws = new WebSocket(url);
  const frames: string[] = [];
  const waiting = new Set<() => void>();
  ws.on('message', (data) => {
    frames.push(text(data));
    for (const check of waiting) {
      check();
    }
  });
  /** Resolves once `count` frames have arrived, without polling. */
  const received = (count: number) =>
    new Promise<void>((resolve) => {
      const check = () => {
        if (frames.length >= count) {
          waiting.delete(check);
          resolve();
        }
      };
      waiting.add(check);
      check();
    });
  // kept for the socket's whole life: ws throws an `error` event nobody
  // listens to
  const errors: unknown[] = [];
  ws.on('error', (error) => errors.push(error));
  const closed = new Promise<void>((resolve) => {
    ws.once('close', () => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return makeAsyncResource(
    {
      ws,
      frames,
      errors,
      closed,
      received,
      responses: () =>
        frames
          .filter((frame) => frame !== 'PING')
          .map((frame) => JSON.parse(frame) as TRPCResponseMessage),
    },
    async () => {
      ws.terminate();
      await closed;
    },
  );
}

/** The `wss` server side of each connection, in the order they connect. */
function serverSockets(wss: WebSocketServer) {
  const sockets: WebSocket[] = [];
  wss.on('connection', (socket) => {
    sockets.push(socket);
  });
  return sockets;
}

describe('responses that cannot be encoded', () => {
  test('a query whose data cannot be encoded gets an error', async () => {
    const onError = vi.fn<OnError>();
    const t = initTRPC.create();
    const router = t.router({
      big: t.procedure.query(() => 1n),
      greeting: t.procedure.query(() => 'hello'),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wssServer: { onError },
    });

    const error = await waitError(ctx.client.big.query(), TRPCClientError);
    expect(error.message).toMatch(/BigInt/);
    expect(error.data?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0].path).toBe('big');
    expect(await ctx.client.greeting.query()).toBe('hello');
  });

  test('a subscription value that cannot be encoded ends the subscription with an error', async () => {
    const onError = vi.fn<OnError>();
    const cleanedUp = vi.fn();
    let signal: AbortSignal | undefined;
    const t = initTRPC.create();
    const router = t.router({
      values: t.procedure.subscription(async function* (opts) {
        signal = opts.signal;
        try {
          yield 1;
          yield 2n;
          yield 3;
        } finally {
          cleanedUp();
        }
      }),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wssServer: { onError },
    });

    const onData = vi.fn();
    const onClientError = vi.fn();
    ctx.client.values.subscribe(undefined, {
      onData,
      onError: onClientError,
    });

    await vi.waitFor(() => expect(onClientError).toHaveBeenCalledOnce());
    expect(onData.mock.calls).toEqual([[1]]);
    expect(onClientError.mock.calls[0]?.[0].message).toMatch(/BigInt/);
    expect(cleanedUp).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
    expect(onError).toHaveBeenCalledOnce();
  });

  test('a subscription whose started message cannot be encoded disposes its iterator', async () => {
    const isStarted = (data: unknown) =>
      isObject(data) &&
      isObject(data['result']) &&
      data['result']['type'] === 'started';
    const encoder: Encoder = {
      encode: (data) => {
        if (isStarted(data)) {
          throw new Error('cannot encode started');
        }
        return jsonEncoder.encode(data);
      },
      decode: (data) => jsonEncoder.decode(data),
    };
    const onError = vi.fn<OnError>();
    const next = vi.fn(async (): Promise<IteratorResult<number>> => ({
      done: false,
      value: 1,
    }));
    const returned = vi.fn(async (): Promise<IteratorResult<number>> => ({
      done: true,
      value: undefined,
    }));
    let signal: AbortSignal | undefined;
    const t = initTRPC.create();
    const router = t.router({
      values: t.procedure.subscription((opts) => {
        signal = opts.signal;
        const iterable: AsyncIterable<number> = {
          [Symbol.asyncIterator]: () => ({ next, return: returned }),
        };
        return iterable;
      }),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wssServer: { onError, experimental_encoder: encoder },
    });

    const onStarted = vi.fn();
    const onClientError = vi.fn();
    ctx.client.values.subscribe(undefined, {
      onStarted,
      onError: onClientError,
    });

    await vi.waitFor(() => expect(onClientError).toHaveBeenCalledOnce());
    expect(onClientError.mock.calls[0]?.[0].message).toBe(
      'cannot encode started',
    );
    expect(onStarted).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(returned).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
    expect(onError).toHaveBeenCalledOnce();
  });

  test('a started message that cannot be encoded is reported, even when the iterator then cannot be opened', async () => {
    const encoder: Encoder = {
      encode: (data) => {
        if (
          isObject(data) &&
          isObject(data['result']) &&
          data['result']['type'] === 'started'
        ) {
          throw new Error('cannot encode started');
        }
        return jsonEncoder.encode(data);
      },
      decode: (data) => jsonEncoder.decode(data),
    };
    const onError = vi.fn<OnError>();
    const t = initTRPC.create();
    const router = t.router({
      values: t.procedure.subscription((): AsyncIterable<number> => ({
        [Symbol.asyncIterator]: () => {
          throw new Error('cannot open');
        },
      })),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wssServer: { onError, experimental_encoder: encoder },
    });

    ctx.client.values.subscribe(undefined, {});

    await vi.waitFor(() =>
      expect(onError.mock.calls.map(([opts]) => opts.error.message)).toContain(
        'cannot encode started',
      ),
    );
  });
});

describe('procedures that return the wrong thing', () => {
  test('a query that returns an async iterable', async () => {
    const t = initTRPC.create();
    const router = t.router({
      iterable: t.procedure.query(async function* () {
        yield 1;
      }),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
    });

    const error = await waitError(ctx.client.iterable.query(), TRPCClientError);
    expect(error.data?.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(error.message).toBe(
      'Cannot return an async iterable or observable from a query procedure with WebSockets',
    );
  });

  test('a subscription that returns neither an observable nor an async iterable', async () => {
    const t = initTRPC.create();
    const router = t.router({
      notIterable: t.procedure.subscription(() => 'nope' as never),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
    });

    const onStarted = vi.fn();
    const onError = vi.fn();
    ctx.client.notIterable.subscribe(undefined, { onStarted, onError });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError.mock.calls[0]?.[0].message).toBe(
      'Subscription notIterable did not return an observable or a AsyncGenerator',
    );
    expect(onStarted).not.toHaveBeenCalled();
  });

  test('a subscription whose iterable throws when iterated', async () => {
    const onServerError = vi.fn<OnError>();
    let signal: AbortSignal | undefined;
    const t = initTRPC.create();
    const router = t.router({
      throwing: t.procedure.subscription((opts) => {
        signal = opts.signal;
        return {
          [Symbol.asyncIterator](): AsyncIterator<number> {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'no iterator' });
          },
        };
      }),
      greeting: t.procedure.query(() => 'hello'),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wssServer: { onError: onServerError },
    });

    const onStarted = vi.fn();
    const onError = vi.fn();
    ctx.client.throwing.subscribe(undefined, { onStarted, onError });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onStarted).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0].data.code).toBe('FORBIDDEN');
    expect(signal?.aborted).toBe(true);
    expect(onServerError).toHaveBeenCalledOnce();
    expect(await ctx.client.greeting.query()).toBe('hello');
  });
});

test('a subscription gets the context error when createContext fails', async () => {
  const onError = vi.fn<OnError>();
  const resolver = vi.fn(async function* () {
    yield 1;
  });
  const requested = createDeferred();
  const t = initTRPC.create();
  const router = t.router({ values: t.procedure.subscription(resolver) });
  await using ctx = testServerAndClientResource(router, {
    wssServer: {
      onError,
      createContext: async (opts) => {
        opts.res.once('message', () => requested.resolve());
        await requested.promise;
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'who are you' });
      },
    },
  });
  // wsLink fails every pending request with the connection's error, so the
  // per-request error is checked on the wire
  await using socket = await rawSocketResource(ctx.wssUrl);

  socket.ws.send(
    JSON.stringify({
      id: 1,
      method: 'subscription',
      params: { path: 'values' },
    }),
  );
  await socket.closed;

  expect(socket.responses()).toMatchObject([
    { id: null, error: { data: { code: 'UNAUTHORIZED' } } },
    { id: 1, error: { data: { code: 'UNAUTHORIZED', path: 'values' } } },
  ]);
  expect(resolver).not.toHaveBeenCalled();
  expect(onError.mock.calls.map(([opts]) => opts.path)).toEqual([
    undefined,
    'values',
  ]);
});

test('lastEventId is added to an object input when a subscription resumes', async () => {
  const inputs: unknown[] = [];
  const t = initTRPC.create();
  const router = t.router({
    room: t.procedure
      .input(z.object({ room: z.string(), lastEventId: z.string().optional() }))
      .subscription(async function* ({ input, signal }) {
        inputs.push(input);
        yield tracked(String(Number(input.lastEventId ?? 0) + 1), input.room);
        await new Promise((resolve) => {
          signal?.addEventListener('abort', resolve);
        });
      }),
  });
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: { lazy: { enabled: false, closeMs: 0 }, retryDelayMs: () => 10 },
  });

  const onData = vi.fn();
  const onStarted = vi.fn();
  const subscription = ctx.client.room.subscribe(
    { room: 'a' },
    { onData, onStarted },
  );
  await vi.waitFor(() => expect(onData).toHaveBeenCalledOnce());

  ctx.destroyConnections();
  await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(2));

  expect(inputs).toEqual([{ room: 'a' }, { room: 'a', lastEventId: '1' }]);
  expect(onData.mock.calls.map(([data]) => data)).toEqual([
    { id: '1', data: 'a' },
    { id: '2', data: 'a' },
  ]);
  subscription.unsubscribe();
});

describe('a stop that arrives in the same read as its subscription', () => {
  // Frames that arrive together are handled in the same tick, whatever is
  // between them, so the stop is taken before the subscription's setup goes
  // on.
  test.each(Array.from({ length: 13 }, (_, pongs) => pongs))(
    'with %i pongs before it, the procedure is not called',
    async (pongs) => {
      let signal: AbortSignal | undefined;
      const t = initTRPC.create();
      const router = t.router({
        values: t.procedure.subscription(async function* (opts) {
          signal = opts.signal;
          while (true) {
            yield 1;
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }),
      });
      await using ctx = testServerAndClientResource(router);
      await using socket = await rawSocketResource(ctx.wssUrl);
      const tcp = (
        socket.ws as unknown as { _socket: { cork(): void; uncork(): void } }
      )._socket;

      tcp.cork();
      socket.ws.send(
        JSON.stringify({
          id: 1,
          method: 'subscription',
          params: { path: 'values' },
        }),
      );
      for (let i = 0; i < pongs; i++) {
        socket.ws.send('PONG');
      }
      socket.ws.send(JSON.stringify({ id: 1, method: 'subscription.stop' }));
      tcp.uncork();

      await vi.waitFor(() =>
        expect(socket.responses().at(-1)).toMatchObject({
          id: 1,
          result: { type: 'stopped' },
        }),
      );
      expect(signal).toBeUndefined();
    },
  );
});

test('a stopped subscription sends no data, not even what it yields because of the stop, before or after the PONG of a PING sent with the stop', async () => {
  const t = initTRPC.create();
  const router = t.router({
    values: t.procedure.subscription(({ signal }): AsyncIterable<string> => {
      let pending: ((result: IteratorResult<string>) => void) | null = null;
      // added before the adapter's own abort listener
      signal?.addEventListener('abort', () =>
        pending?.({ done: false, value: 'after-abort' }),
      );
      return {
        [Symbol.asyncIterator]: () => ({
          next: () =>
            new Promise((resolve) => {
              pending = resolve;
            }),
          return: async () => ({ done: true, value: undefined }),
        }),
      };
    }),
  });
  await using ctx = testServerAndClientResource(router);
  await using socket = await rawSocketResource(ctx.wssUrl);
  socket.ws.send(
    JSON.stringify({
      id: 1,
      method: 'subscription',
      params: { path: 'values' },
    }),
  );
  await socket.received(1);

  const tcp = (
    socket.ws as unknown as { _socket: { cork(): void; uncork(): void } }
  )._socket;
  tcp.cork();
  socket.ws.send(JSON.stringify({ id: 1, method: 'subscription.stop' }));
  socket.ws.send('PING');
  tcp.uncork();

  const stopped = JSON.stringify({ id: 1, result: { type: 'stopped' } });
  await vi.waitFor(() => {
    expect(socket.frames).toContain('PONG');
    expect(socket.frames).toContain(stopped);
  });
  const afterStop = socket.frames.slice(1);
  const afterPong = afterStop.slice(afterStop.indexOf('PONG') + 1);
  expect(afterStop.filter((frame) => frame.includes('after-abort'))).toEqual(
    [],
  );
  expect(afterPong.filter((frame) => frame.includes('after-abort'))).toEqual(
    [],
  );
});

describe('frames that wsLink never sends', () => {
  function greetingServer(
    opts?: Pick<WSSHandlerOptions<AnyRouter>, 'maxBatchSize'> & {
      createContext?: (opts: CreateWSSContextFnOptions) => object;
    },
  ) {
    const onError = vi.fn<OnError>();
    const t = initTRPC.create();
    const router = t.router({ greeting: t.procedure.query(() => 'hello') });
    const ctx = testServerAndClientResource(router, {
      wssServer: { onError, ...opts },
    });
    // added to the resource, rather than spread, to keep its disposal
    return Object.assign(ctx, { onError });
  }

  test.each([
    { frame: 'not json', cause: /JSON/ },
    { frame: '"not an object"', cause: /Message was not an object/ },
  ])('malformed connection params: $frame', async ({ frame, cause }) => {
    await using ctx = greetingServer();
    await using socket = await rawSocketResource(
      `${ctx.wssUrl}?connectionParams=1`,
    );

    socket.ws.send(frame);
    await socket.closed;

    expect(socket.responses()).toMatchObject([
      {
        id: null,
        error: {
          message: 'Malformed TRPCConnectionParamsMessage',
          data: { code: 'PARSE_ERROR' },
        },
      },
    ]);
    expect(ctx.onError).toHaveBeenCalledOnce();
    expect(ctx.onError.mock.calls[0]?.[0].error.cause).toMatchObject({
      message: expect.stringMatching(cause),
    });
  });

  test('a frame that is not a request gets a parse error, which onError is not told about', async () => {
    await using ctx = greetingServer();
    await using socket = await rawSocketResource(ctx.wssUrl);

    socket.ws.send(JSON.stringify({ id: 1, method: 'not a method' }));

    await socket.received(1);
    expect(socket.responses()).toMatchObject([
      { id: null, error: { data: { code: 'PARSE_ERROR' } } },
    ]);
    expect(ctx.onError).not.toHaveBeenCalled();
  });

  test('an oversized batch gets an error for every request, with its jsonrpc', async () => {
    await using ctx = greetingServer({ maxBatchSize: 1 });
    await using socket = await rawSocketResource(ctx.wssUrl);

    socket.ws.send(
      JSON.stringify([
        {
          id: 'a',
          jsonrpc: '2.0',
          method: 'query',
          params: { path: 'greeting' },
        },
        42,
        { id: 2, method: 'query', params: { path: 'greeting' } },
      ]),
    );

    await socket.received(2);
    expect(socket.responses()).toMatchObject([
      { id: 'a', jsonrpc: '2.0', error: { data: { code: 'BAD_REQUEST' } } },
      { id: 2, error: { data: { code: 'BAD_REQUEST' } } },
    ]);
    expect(socket.responses()[1]).not.toHaveProperty('jsonrpc');
    expect(ctx.onError).toHaveBeenCalledOnce();
  });

  test('an oversized batch without request ids gets one error', async () => {
    await using ctx = greetingServer({ maxBatchSize: 1 });
    await using socket = await rawSocketResource(ctx.wssUrl);

    socket.ws.send(
      JSON.stringify([{ id: 1, method: 'subscription.stop' }, 'not a request']),
    );

    await socket.received(1);
    expect(socket.responses()).toMatchObject([
      {
        id: null,
        error: {
          message: 'Batch call exceeds maximum size',
          data: { code: 'BAD_REQUEST' },
        },
      },
    ]);
  });

  test('a frame ws does not deliver as a Buffer is rejected', async () => {
    await using ctx = greetingServer({
      createContext: (opts) => {
        opts.res.binaryType = 'arraybuffer';
        return {};
      },
    });
    await using socket = await rawSocketResource(ctx.wssUrl);

    // ws applies `binaryType` to binary frames only
    socket.ws.send(
      Buffer.from(
        JSON.stringify({
          id: 1,
          method: 'query',
          params: { path: 'greeting' },
        }),
      ),
    );

    await socket.received(1);
    expect(socket.responses()).toMatchObject([
      {
        id: null,
        error: {
          message: 'Unexpected WebSocket message format',
          data: { code: 'UNPROCESSABLE_CONTENT' },
        },
      },
    ]);
  });
});

describe('a throwing callback never crashes the server', () => {
  const t = initTRPC.create();
  const router = t.router({
    greeting: t.procedure.query(() => 'hello'),
  });

  test('an errorFormatter that throws for an oversized batch gives each request a fallback error with its code, and later frames are served', async () => {
    const onError = vi.fn<OnError>();
    const failingFormatter = initTRPC.create({
      errorFormatter: (opts) => {
        if (opts.error.message === 'Batch call exceeds maximum size') {
          throw new Error('formatter bug');
        }
        return opts.shape;
      },
    });
    const failingRouter = failingFormatter.router({
      greeting: failingFormatter.procedure.query(() => 'hello'),
    });
    await using ctx = testServerAndClientResource(failingRouter, {
      wssServer: { onError, maxBatchSize: 1 },
    });
    await using socket = await rawSocketResource(ctx.wssUrl);

    const greeting = (id: number) => ({
      id,
      method: 'query',
      params: { path: 'greeting' },
    });
    socket.ws.send(JSON.stringify([greeting(1), greeting(2)]));
    socket.ws.send(JSON.stringify(greeting(3)));

    // it says nothing beyond the error's code
    const fallback = {
      code: TRPC_ERROR_CODES_BY_KEY.BAD_REQUEST,
      message: 'BAD_REQUEST',
      data: { code: 'BAD_REQUEST', httpStatus: 400 },
    };
    await socket.received(3);
    expect(socket.responses()).toEqual([
      { id: 1, error: fallback },
      { id: 2, error: fallback },
      { id: 3, result: { type: 'data', data: 'hello' } },
    ]);
    expect(onError.mock.calls.map(([opts]) => opts.error.message)).toEqual([
      'Batch call exceeds maximum size',
      'formatter bug',
    ]);
  });

  test('a frame that throws while it is handled is reported, and later frames are served', async () => {
    const onError = vi.fn<OnError>();
    const decodeBug = new Error('decoded value bug');
    const encoder: Encoder = {
      encode: (data) => jsonEncoder.encode(data),
      decode: (data) => {
        const decoded = jsonEncoder.decode(data);
        if (!Array.isArray(decoded)) {
          return decoded;
        }
        return decoded.map((request) =>
          Object.defineProperty({ ...request }, 'method', {
            get: () => {
              throw decodeBug;
            },
          }),
        );
      },
    };
    await using ctx = testServerAndClientResource(router, {
      wssServer: { onError, maxBatchSize: 1, experimental_encoder: encoder },
    });
    await using socket = await rawSocketResource(ctx.wssUrl);

    const greeting = (id: number) => ({
      id,
      method: 'query',
      params: { path: 'greeting' },
    });
    // an oversized batch, so that the throwing `method` is read outside of
    // parsing
    socket.ws.send(JSON.stringify([greeting(1), greeting(2)]));
    socket.ws.send(JSON.stringify(greeting(3)));

    await socket.received(1);
    expect(socket.responses()).toMatchObject([
      { id: 3, result: { type: 'data', data: 'hello' } },
    ]);
    expect(onError.mock.calls.map(([opts]) => opts.error.cause)).toEqual([
      undefined,
      decodeBug,
    ]);
  });
});

test('a socket error is reported to onError', async () => {
  const onError = vi.fn<OnError>();
  const t = initTRPC.create();
  const router = t.router({
    echo: t.procedure.input(z.string()).query(({ input }) => input),
  });
  const wss = new WebSocketServer({ port: 0, maxPayload: 64 });
  applyWSSHandler({ wss, router, onError });
  await using _server = makeAsyncResource({}, async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
  const address = wss.address();
  assert(address !== null && typeof address === 'object');
  const wsClient = createWSClient({
    url: `ws://localhost:${address.port}`,
    retryDelayMs: () => 60_000,
  });
  await using _client = makeAsyncResource({}, () => wsClient.close());
  const client = createTRPCClient<typeof router>({
    links: [wsLink({ client: wsClient })],
  });

  await expect(client.echo.query('x'.repeat(1_000))).rejects.toThrow();

  await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
  expect(onError.mock.calls[0]?.[0]).toMatchObject({
    type: 'unknown',
    path: undefined,
    error: { cause: { message: 'Max payload size exceeded' } },
  });
});

describe('keepAlive', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function keepAliveServer(
    keepAlive: WSSHandlerOptions<AnyRouter>['keepAlive'],
  ) {
    const t = initTRPC.create();
    const router = t.router({ greeting: t.procedure.query(() => 'hello') });
    const ctx = testServerAndClientResource(router, {
      wssServer: { keepAlive },
    });
    const sockets = serverSockets(ctx.wss);
    return Object.assign(ctx, { sockets });
  }

  test('pings a quiet client after 30s, and closes it if it stays quiet for 5s', async () => {
    await using ctx = keepAliveServer({ enabled: true });
    await using socket = await rawSocketResource(ctx.wssUrl);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(socket.frames).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await socket.received(1);
    expect(socket.frames).toEqual(['PING']);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(ctx.sockets[0]?.readyState).toBe(WebSocket.OPEN);
    await vi.advanceTimersByTimeAsync(1);
    await socket.closed;
  });

  test('a message before the ping is due postpones it', async () => {
    await using ctx = keepAliveServer({ enabled: true, pingMs: 1_000 });
    await using socket = await rawSocketResource(ctx.wssUrl);
    const received = createDeferred();
    expect(ctx.sockets).toHaveLength(1);
    ctx.sockets[0]?.once('message', () => received.resolve());

    await vi.advanceTimersByTimeAsync(600);
    socket.ws.send('PONG');
    await received.promise;
    await vi.advanceTimersByTimeAsync(600);
    expect(socket.frames).toEqual([]);

    await vi.advanceTimersByTimeAsync(400);
    await socket.received(1);
    expect(socket.frames).toEqual(['PING']);
  });
});

test('applyWSSHandler only serves connections under its prefix', async () => {
  const createContext = vi.fn(() => ({}));
  const t = initTRPC.create();
  const router = t.router({ greeting: t.procedure.query(() => 'hello') });
  await using ctx = testServerAndClientResource(router, {
    wssServer: { prefix: '/trpc', createContext },
  });
  await using _other = await rawSocketResource(`${ctx.wssUrl}/other`);
  const wsClient = createWSClient({ url: `${ctx.wssUrl}/trpc` });
  await using _client = makeAsyncResource({}, () => wsClient.close());
  const client = createTRPCClient<typeof router>({
    links: [wsLink({ client: wsClient })],
  });

  expect(await client.greeting.query()).toBe('hello');
  expect(createContext).toHaveBeenCalledOnce();
});

test('broadcastReconnectNotification skips connections that are closing', async () => {
  const t = initTRPC.create();
  const router = t.router({ greeting: t.procedure.query(() => 'hello') });
  await using ctx = testServerAndClientResource(router);
  const sockets = serverSockets(ctx.wss);
  await using closing = await rawSocketResource(ctx.wssUrl);
  await using open = await rawSocketResource(ctx.wssUrl);
  await vi.waitFor(() => expect(sockets).toHaveLength(2));

  sockets[0]?.close();
  expect(sockets[0]?.readyState).toBe(WebSocket.CLOSING);
  ctx.wssHandler.broadcastReconnectNotification();

  await vi.waitFor(() =>
    expect(open.frames.map((frame) => JSON.parse(frame))).toEqual([
      { id: null, method: 'reconnect' },
    ]),
  );
  await closing.closed;
  expect(closing.frames).toEqual([]);
});

describe('what the adapter it replaces did', () => {
  function subscribeTo(path: string) {
    return JSON.stringify({ id: 1, method: 'subscription', params: { path } });
  }

  test('a subscription whose observable throws when subscribed to gets the error', async () => {
    const onError = vi.fn<OnError>();
    const t = initTRPC.create();
    const router = t.router({
      values: t.procedure.subscription(() =>
        observable<number>(() => {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not you' });
        }),
      ),
      greeting: t.procedure.query(() => 'hello'),
    });
    await using ctx = testServerAndClientResource(router, {
      wssServer: { onError },
    });
    await using socket = await rawSocketResource(ctx.wssUrl);

    socket.ws.send(subscribeTo('values'));
    socket.ws.send(
      JSON.stringify({ id: 2, method: 'query', params: { path: 'greeting' } }),
    );

    await socket.received(2);
    // the two requests run concurrently, so their replies come in any order
    const responses = socket
      .responses()
      .sort((a, b) => Number(a.id) - Number(b.id));
    expect(responses).toMatchObject([
      { id: 1, error: { message: 'Not you', data: { code: 'UNAUTHORIZED' } } },
      { id: 2, result: { type: 'data', data: 'hello' } },
    ]);
    expect(onError.mock.calls.map(([opts]) => opts.error.message)).toEqual([
      'Not you',
    ]);
  });

  test('every query and mutation gets a signal of its own, which never aborts', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const t = initTRPC.create();
    const router = t.router({
      read: t.procedure.query((opts) => {
        signals.push(opts.signal);
        return 'ok';
      }),
      write: t.procedure.mutation((opts) => {
        signals.push(opts.signal);
        return 'ok';
      }),
    });
    await using ctx = testServerAndClientResource(router);
    {
      await using socket = await rawSocketResource(ctx.wssUrl);
      socket.ws.send(
        JSON.stringify([
          { id: 1, method: 'query', params: { path: 'read' } },
          { id: 2, method: 'query', params: { path: 'read' } },
          { id: 3, method: 'mutation', params: { path: 'write' } },
        ]),
      );
      await socket.received(3);
    }

    // a listener a procedure adds must not outlive its request's signal
    expect(new Set(signals).size).toBe(3);
    expect(signals.map((signal) => signal?.aborted)).toEqual([
      false,
      false,
      false,
    ]);
  });

  test('a connection aborts its subscriptions and its context signal before later close listeners run', async () => {
    let subscriptionSignal: AbortSignal | undefined;
    let contextSignal: AbortSignal | undefined;
    const t = initTRPC.create();
    const router = t.router({
      values: t.procedure.subscription(async function* (opts) {
        subscriptionSignal = opts.signal;
        yield 1;
        await new Promise(() => {
          // until it's aborted
        });
      }),
    });
    await using ctx = testServerAndClientResource(router, {
      wssServer: {
        createContext(opts) {
          contextSignal = opts.info.signal;
          return {};
        },
      },
    });
    // added after the adapter's listeners, so it runs after them
    const aborted = createDeferred<(boolean | undefined)[]>();
    ctx.wss.on('connection', (socket) => {
      socket.once('close', () => {
        aborted.resolve([subscriptionSignal?.aborted, contextSignal?.aborted]);
      });
    });
    await using socket = await rawSocketResource(ctx.wssUrl);
    socket.ws.send(subscribeTo('values'));
    await socket.received(2);

    socket.ws.close();

    expect(await aborted.promise).toEqual([true, true]);
  });

  test('a subscription that completes while its socket is closing has its signal aborted', async () => {
    let signal: AbortSignal | undefined;
    const finish = createDeferred();
    const t = initTRPC.create();
    const router = t.router({
      values: t.procedure.subscription(async function* (opts) {
        signal = opts.signal;
        yield 1;
        await finish.promise;
      }),
    });
    await using ctx = testServerAndClientResource(router);
    const sockets = serverSockets(ctx.wss);
    await using socket = await rawSocketResource(ctx.wssUrl);
    socket.ws.send(subscribeTo('values'));
    await socket.received(2);

    // a paused peer doesn't answer the closing handshake, so the socket
    // stays closing
    socket.ws.pause();
    sockets[0]!.close();
    expect(sockets[0]!.readyState).toBe(WebSocket.CLOSING);
    finish.resolve();

    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
  });

  test('a socket error does not stop the connection from serving frames', async () => {
    const onError = vi.fn<OnError>();
    const t = initTRPC.create();
    const router = t.router({
      greeting: t.procedure.query(() => 'hello'),
    });
    await using ctx = testServerAndClientResource(router, {
      wssServer: { onError },
    });
    const sockets = serverSockets(ctx.wss);
    await using socket = await rawSocketResource(ctx.wssUrl);
    await vi.waitFor(() => expect(sockets).toHaveLength(1));

    sockets[0]!.emit('error', new Error('Socket trouble'));
    socket.ws.send(
      JSON.stringify({ id: 1, method: 'query', params: { path: 'greeting' } }),
    );

    await socket.received(1);
    expect(socket.responses()).toEqual([
      { id: 1, result: { type: 'data', data: 'hello' } },
    ]);
    expect(onError.mock.calls.map(([opts]) => opts.error.message)).toEqual([
      'Socket trouble',
    ]);
  });
});
