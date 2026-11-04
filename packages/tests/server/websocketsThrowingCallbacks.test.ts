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
import { initTRPC, TRPCError } from '@trpc/server';
import type { Encoder, WSSHandlerOptions } from '@trpc/server/adapters/ws';
import { applyWSSHandler, jsonEncoder } from '@trpc/server/adapters/ws';
import type { TRPCResponseMessage } from '@trpc/server/rpc';
import {
  isObject,
  makeAsyncResource,
} from '@trpc/server/unstable-core-do-not-import';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';

type OnError = NonNullable<WSSHandlerOptions<AnyRouter>['onError']>;

/** A plain `ws` client, for frames that `wsLink` never sends. */
async function rawSocketResource(url: string) {
  const ws = new WebSocket(url);
  const frames: string[] = [];
  ws.on('message', (data) => {
    assert(Buffer.isBuffer(data));
    frames.push(data.toString('utf8'));
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
      closed,
      errors,
      responses: () =>
        frames.map((frame) => JSON.parse(frame) as TRPCResponseMessage),
    },
    async () => {
      ws.terminate();
      await closed;
    },
  );
}

const t = initTRPC.create();
const router = t.router({
  fail: t.procedure.query(() => {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'bad input' });
  }),
  greeting: t.procedure.query(() => 'hello'),
});

const throwingOnError = () => {
  throw new Error('onError bug');
};

test('an onError that throws is ignored', async () => {
  const onError = vi.fn<OnError>(throwingOnError);
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wssServer: { onError },
  });

  const error = await waitError(ctx.client.fail.query(), TRPCClientError);
  expect(error.data?.code).toBe('BAD_REQUEST');
  expect(onError).toHaveBeenCalledOnce();
  expect(await ctx.client.greeting.query()).toBe('hello');
});

test('an onError that throws on a request without an id leaves the connection serving', async () => {
  await using ctx = testServerAndClientResource(router, {
    wssServer: { onError: throwingOnError },
  });
  await using socket = await rawSocketResource(ctx.wssUrl);

  socket.ws.send(
    JSON.stringify({ id: null, method: 'query', params: { path: 'x' } }),
  );
  socket.ws.send(
    JSON.stringify({ id: 1, method: 'query', params: { path: 'greeting' } }),
  );

  await vi.waitFor(() => expect(socket.responses()).toHaveLength(2));
  expect(socket.responses()).toMatchObject([
    { id: null, error: { data: { code: 'PARSE_ERROR' } } },
    { id: 1, result: { type: 'data', data: 'hello' } },
  ]);
});

test('an errorFormatter that throws is reported, the request gets no reply, and other requests are answered', async () => {
  const onError = vi.fn<OnError>();
  const failingFormatter = initTRPC.create({
    errorFormatter: () => {
      throw new Error('formatter bug');
    },
  });
  const failingRouter = failingFormatter.router({
    fail: failingFormatter.procedure.query(() => {
      throw new TRPCError({ code: 'BAD_REQUEST' });
    }),
    greeting: failingFormatter.procedure.query(() => 'hello'),
  });
  await using ctx = testServerAndClientResource(failingRouter, {
    wssServer: { onError },
  });
  await using socket = await rawSocketResource(ctx.wssUrl);

  socket.ws.send(
    JSON.stringify([
      { id: 1, method: 'query', params: { path: 'fail' } },
      { id: 2, method: 'query', params: { path: 'greeting' } },
    ]),
  );

  await vi.waitFor(() => {
    expect(onError).toHaveBeenCalledTimes(2);
    expect(socket.responses()).toMatchObject([
      { id: 2, result: { type: 'data', data: 'hello' } },
    ]);
  });
  expect(onError.mock.calls.map(([opts]) => opts.error.message)).toEqual([
    'BAD_REQUEST',
    'formatter bug',
  ]);
});

test('a frame error that cannot be encoded is reported, and later frames are served', async () => {
  const onError = vi.fn<OnError>();
  const encoder: Encoder = {
    encode: (data) => {
      if (isObject(data) && data['id'] === null) {
        throw new Error('cannot encode');
      }
      return jsonEncoder.encode(data);
    },
    decode: (data) => jsonEncoder.decode(data),
  };
  await using ctx = testServerAndClientResource(router, {
    wssServer: { onError, experimental_encoder: encoder },
  });
  await using socket = await rawSocketResource(ctx.wssUrl);

  socket.ws.send('not json');
  socket.ws.send(
    JSON.stringify({ id: 1, method: 'query', params: { path: 'greeting' } }),
  );

  await vi.waitFor(() => expect(socket.responses()).toHaveLength(1));
  expect(socket.responses()).toMatchObject([
    { id: 1, result: { type: 'data', data: 'hello' } },
  ]);
  expect(onError.mock.calls.map(([opts]) => opts.error.message)).toEqual([
    'cannot encode',
  ]);
});

test('a failed createContext with an onError that throws still closes the connection', async () => {
  await using ctx = testServerAndClientResource(router, {
    wssServer: {
      createContext: () => {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      },
      onError: throwingOnError,
    },
  });
  await using socket = await rawSocketResource(ctx.wssUrl);

  await socket.closed;
  expect(socket.responses()).toMatchObject([
    { id: null, error: { data: { code: 'UNAUTHORIZED' } } },
  ]);
});

test('an onError that throws on a socket error leaves the server serving', async () => {
  const onError = vi.fn<OnError>(throwingOnError);
  const echoRouter = t.router({
    echo: t.procedure.input(z.string()).query(({ input }) => input),
  });
  const wss = new WebSocketServer({ port: 0, maxPayload: 64 });
  applyWSSHandler({ wss, router: echoRouter, onError });
  await using _server = makeAsyncResource({}, async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
  const address = wss.address();
  assert(typeof address === 'object');
  const wsClient = createWSClient({
    url: `ws://localhost:${address.port}`,
    retryDelayMs: () => 60_000,
  });
  await using _client = makeAsyncResource({}, () => wsClient.close());
  const client = createTRPCClient<typeof echoRouter>({
    links: [wsLink({ client: wsClient })],
  });

  await expect(client.echo.query('x'.repeat(1_000))).rejects.toThrow();
  await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

  await using socket = await rawSocketResource(
    `ws://localhost:${address.port}`,
  );
  socket.ws.send(
    JSON.stringify({
      id: 1,
      method: 'query',
      params: { path: 'echo', input: 'hi' },
    }),
  );
  await vi.waitFor(() =>
    expect(socket.responses()).toMatchObject([
      { id: 1, result: { type: 'data', data: 'hi' } },
    ]),
  );
});
