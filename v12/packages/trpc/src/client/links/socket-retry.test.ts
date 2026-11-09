import {
  createTrpcClient,
  retryLink,
  routerType,
  wsLink,
} from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { ScriptedWebSocket } from '../../fixtures/scripted-websocket.ts';
import { expect, test } from 'vite-plus/test';

// `retryLink` sends a retry with the operation it was given, so with the
// same id as the attempt it replaces.

const t = initTrpc();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

test('retryLink over wsLink retries a query and a subscription that failed (trpc/trpc#7889)', async () => {
  const calls = { query: 0, subscription: 0 };
  const router = t.router({
    flaky: t.procedure.query(() => {
      if (++calls.query === 1) throw new Error('flaky');
      return 'ok';
    }),
    onEvent: t.procedure.subscription(async function* () {
      if (++calls.subscription === 1) {
        yield 1;
        throw new Error('flaky');
      }
      yield 2;
    }),
  });
  await using server = await createTestServer({ router });
  await using link = wsLink({ url: server.wsUrl, keepAlive: false });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      retryLink({ retry: (opts) => opts.attempt < 3, delay: () => 0 }),
      link,
    ],
  });
  expect(await client.flaky.query()).toBe('ok');
  expect(await collect(client.onEvent.subscribe())).toEqual([1, 2]);
  expect(calls).toEqual({ query: 2, subscription: 2 });
});

test("a retry doesn't get the frames still arriving for the attempt it replaces (trpc/trpc#7892)", async () => {
  const router = {
    ticks: t.procedure.subscription(async function* () {
      yield 0;
    }),
  };
  ScriptedWebSocket.opened = [];
  await using link = wsLink({
    url: 'ws://scripted',
    WebSocket: ScriptedWebSocket as unknown as typeof WebSocket,
    keepAlive: false,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      retryLink({ retry: (opts) => opts.attempt < 2, delay: () => 0 }),
      link,
    ],
  });
  const events = collect(client.ticks.subscribe());
  while (!ScriptedWebSocket.opened[0]) await sleep(1);
  const ws = ScriptedWebSocket.opened[0];
  const first = await ws.request('ticks');
  // An event the client can't read fails the first attempt, which
  // retryLink retries.
  ws.receive({ id: first.id, type: 'event', body: null });
  while (ws.sent.filter((m) => m.type === 'request').length < 2) {
    await sleep(1);
  }
  const retry = ws.sent.filter((m) => m.type === 'request')[1]!;
  // Sent before the server read the first attempt's abort.
  ws.receive({ id: first.id, type: 'event', body: { json: 1 } });
  ws.receive({ id: first.id, type: 'done' });
  ws.receive({ id: retry.id, type: 'event', body: { json: 2 } });
  ws.receive({ id: retry.id, type: 'done' });
  expect(await events).toEqual([2]);
  expect(ws.sent.map((m) => m.type)).toEqual([
    'init',
    'request',
    'abort',
    'request',
  ]);
});
