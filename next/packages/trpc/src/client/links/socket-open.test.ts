import {
  createTrpcClient,
  routerType,
  safe,
  wsLink,
} from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { Socket } from 'effect/socket';
import { ScriptedWebSocket } from '../../fixtures/scripted-websocket.ts';
import { expect, test } from 'vite-plus/test';

const t = initTrpc();
const router = {
  hello: t.procedure.query(() => 'hello'),
  ticks: t.procedure.subscription(async function* () {
    yield 0;
  }),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const connect = (opts: Partial<Parameters<typeof wsLink>[0]> = {}) => {
  ScriptedWebSocket.opened = [];
  const link = wsLink({
    url: 'ws://scripted',
    WebSocket: ScriptedWebSocket as unknown as typeof WebSocket,
    keepAlive: false,
    ...opts,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  return { link, client };
};

test('a connectionParams that throws fails a query with its error as the cause (trpc/trpc#7891)', async () => {
  const failure = new Error('token refresh failed');
  const connection = connect({
    connectionParams: () => {
      throw failure;
    },
  });
  const result = await safe(connection.client.hello.query());
  expect(result.error).toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'The connection could not be opened',
  });
  expect(result.error?.cause).toBe(failure);
  await connection.link.close();
});

test('a subscription whose connectionParams keeps rejecting fails, after its reconnects, with the last error as the cause (trpc/trpc#7891)', async () => {
  let attempt = 0;
  const connection = connect({
    reconnect: { attempts: 2, delay: () => 0 },
    connectionParams: async () => {
      throw new Error(`attempt ${++attempt} failed`);
    },
  });
  const events: unknown[] = [];
  const error = await (async () => {
    for await (const value of connection.client.ticks.subscribe())
      events.push(value);
  })().catch((error: { cause?: unknown }) => error);
  expect(events).toEqual([]);
  expect(attempt).toBe(3);
  expect(error).toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'The connection could not be opened',
  });
  expect(error?.cause).toEqual(new Error('attempt 3 failed'));
  await connection.link.close();
});

test('a subscription whose connectionParams throws once starts on the next connection', async () => {
  let attempt = 0;
  const connection = connect({
    reconnect: { attempts: 2, delay: () => 0 },
    connectionParams: () => {
      if (++attempt === 1) throw new Error('not yet');
      return { token: 'ok' };
    },
  });
  const events: unknown[] = [];
  const done = (async () => {
    for await (const value of connection.client.ticks.subscribe())
      events.push(value);
  })();
  while (!ScriptedWebSocket.opened[1]) await sleep(1);
  const ws = ScriptedWebSocket.opened[1];
  const request = await ws.request('ticks');
  expect(ws.sent[0]).toMatchObject({
    type: 'init',
    connectionParams: { token: 'ok' },
  });
  ws.receive({ id: request.id, type: 'event', body: { json: 7 } });
  ws.receive({ id: request.id, type: 'done' });
  await done;
  expect(events).toEqual([7]);
  await connection.link.close();
});

test('a WebSocket that throws when constructed fails the call with its error as the cause (trpc/trpc#7891)', async () => {
  const failure = new SyntaxError('Invalid URL');
  const connection = connect({
    WebSocket: class {
      constructor() {
        throw failure;
      }
    } as unknown as typeof WebSocket,
  });
  const result = await safe(connection.client.hello.query());
  expect(result.error).toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'The connection could not be opened',
  });
  const cause = result.error?.cause;
  expect(Socket.isSocketError(cause)).toBe(true);
  expect((cause as Socket.SocketError).reason).toEqual(
    new Socket.SocketOpenError({ kind: 'Unknown', cause: failure }),
  );
  await connection.link.close();
});
