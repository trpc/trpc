import {
  createTrpcClient,
  routerType,
  safe,
  wsLink,
} from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { Schema } from 'effect';
import { ScriptedWebSocket } from '../../fixtures/scripted-websocket.ts';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, test } from 'vite-plus/test';

const t = initTrpc();
const router = t.router({
  feed: t.procedure.input(Schema.String).subscription(async function* (opts) {
    yield opts.input.length;
  }),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const drain = (iterable: AsyncIterable<unknown>) =>
  safe(
    (async () => {
      for await (const _ of iterable);
    })(),
  );

test('a subscription on a connection the server rejects fails with its error, without reconnecting (trpc/trpc#7833)', async () => {
  ScriptedWebSocket.opened = [];
  const link = wsLink({
    url: 'ws://scripted',
    WebSocket: ScriptedWebSocket as unknown as typeof WebSocket,
    keepAlive: false,
    reconnect: { attempts: 5, delay: () => 0 },
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  const result = drain(client.feed.subscribe('x'));
  while (!ScriptedWebSocket.opened[0]) await sleep(1);
  const ws = ScriptedWebSocket.opened[0];
  await ws.request('feed');
  ws.receive({ type: 'init', transformer: 'json' });
  ws.receive({
    id: null,
    type: 'error',
    body: { json: { error: { code: 'UNAUTHORIZED', message: 'No token' } } },
  });
  ws.close();
  expect((await result).error).toMatchObject({
    code: 'UNAUTHORIZED',
    message: 'No token',
  });
  await sleep(10);
  expect(ScriptedWebSocket.opened).toHaveLength(1);
  await link.close();
});

test('a subscription whose connections the server keeps closing runs out of reconnects', async () => {
  let opened = 0;
  await using server = await createTestServer({ router, maxPayload: 1000 });
  server.server.on('upgrade', () => opened++);
  const link = wsLink({
    url: server.wsUrl,
    keepAlive: false,
    reconnect: { attempts: 2, delay: () => 10 },
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  const result = await drain(client.feed.subscribe('x'.repeat(5000)));
  expect(result.error).toMatchObject({ code: 'NETWORK_ERROR' });
  expect(opened).toBe(3);
  await link.close();
});
