import {
  createTrpcClient,
  routerType,
  safe,
  wsLink,
} from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
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
  const socket = async (i = 0) => {
    while (!ScriptedWebSocket.opened[i]) await sleep(1);
    return ScriptedWebSocket.opened[i];
  };
  return { link, client, socket };
};

test('frames the link cannot read are skipped; answers for other ids are ignored', async () => {
  const connection = connect();
  const hello = connection.client.hello.query();
  const ws = await connection.socket();
  const response = await ws.request('hello');
  ws.receive(new Uint8Array([9, 9, 9]).buffer);
  ws.receive(new Blob(['{}']));
  ws.receive('not json');
  ws.receive({ id: response.id + 1, type: 'result', body: { json: 'other' } });
  ws.receive({ id: response.id, type: 'result', body: { json: 'hello' } });
  expect(await hello).toBe('hello');
  await connection.link.close();
});

test('an error body the serializer cannot read fails the calls as a bad response', async () => {
  const connection = connect();
  const hello = safe(connection.client.hello.query());
  const ws = await connection.socket();
  await ws.request('hello');
  ws.receive({ id: null, type: 'error', body: null });
  expect((await hello).error).toMatchObject({
    code: 'BAD_RESPONSE',
    message: 'Invalid error message',
  });
  await connection.link.close();
});

test('a subscription that heard nothing reconnects after the default delay; stray chunks are ignored', async () => {
  const connection = connect({ reconnect: { attempts: 1 } });
  const events: unknown[] = [];
  const done = (async () => {
    for await (const value of connection.client.ticks.subscribe())
      events.push(value);
  })();
  const first = await connection.socket(0);
  await first.request('ticks');
  const started = Date.now();
  first.close();
  const second = await connection.socket(1);
  expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  const { id } = await second.request('ticks');
  second.receive({ id, type: 'chunk', chunk: [0, 0, { json: 1 }] });
  second.receive({ id, type: 'event', body: { json: 7 } });
  second.receive({ id, type: 'done' });
  await done;
  expect(events).toEqual([7]);
  await connection.link.close();
});

test('an abort after the socket started closing is not sent', async () => {
  const connection = connect({ reconnect: { attempts: 0 } });
  const controller = new AbortController();
  const hello = safe(
    connection.client.hello.query(undefined, { signal: controller.signal }),
  );
  const ws = await connection.socket();
  await ws.request('hello');
  ws.readyState = 2;
  controller.abort();
  await hello;
  expect(ws.sent.map((m) => m.type)).toEqual(['init', 'request']);
  await connection.link.close();
});

test('a time option Duration cannot decode throws when the link is made', () => {
  expect(() => wsLink({ url: 'ws://x', idleTimeout: 'soon' as never })).toThrow(
    'Invalid Input: soon',
  );
  expect(() =>
    wsLink({ url: 'ws://x', keepAlive: { interval: '1 fortnight' as never } }),
  ).toThrow('Invalid Input: 1 fortnight');
});

test('keepAlive pings every interval, and a connection silent for timeout after a ping is dropped', async () => {
  ScriptedWebSocket.opened = [];
  const pings: number[] = [];
  let answering = true;
  class PingTimingSocket extends ScriptedWebSocket {
    override send(data: string) {
      super.send(data);
      if (this.sent.at(-1)!.type !== 'ping') return;
      pings.push(Date.now());
      if (answering) queueMicrotask(() => this.receive({ type: 'pong' }));
    }
  }
  const link = wsLink({
    url: 'ws://scripted',
    WebSocket: PingTimingSocket as unknown as typeof WebSocket,
    keepAlive: { interval: 40, timeout: 400 },
    reconnect: { attempts: 0 },
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  const ticks = (async () => {
    for await (const _ of client.ticks.subscribe());
  })().catch((error: unknown) => error);
  while (pings.length < 4) await sleep(5);
  const gaps = pings.slice(1).map((at, i) => at - pings[i]!);
  for (const gap of gaps) {
    expect(gap).toBeGreaterThanOrEqual(30);
    expect(gap).toBeLessThan(200);
  }

  const ws = ScriptedWebSocket.opened[0]!;
  expect(ws.readyState).toBe(1);
  answering = false;
  const silentFrom = pings.length;
  expect(await ticks).toMatchObject({ code: 'NETWORK_ERROR' });
  expect(ws.readyState).toBe(3);
  expect(Date.now() - pings[silentFrom]!).toBeGreaterThanOrEqual(390);
  await link.close();
});

test('a WebSocket that throws when constructed fails the call as a lost connection', async () => {
  const link = wsLink({
    url: 'ws://scripted',
    WebSocket: class {
      constructor() {
        throw new SyntaxError('Invalid URL');
      }
    } as unknown as typeof WebSocket,
    keepAlive: false,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  expect((await safe(client.hello.query())).error).toMatchObject({
    code: 'NETWORK_ERROR',
  });
  await link.close();
});
