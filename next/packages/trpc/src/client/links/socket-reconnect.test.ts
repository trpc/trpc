import { MessageChannel } from 'node:worker_threads';
import {
  createTrpcClient,
  experimental_messagePortLink,
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
  bump: t.procedure.mutation(() => 1),
  feed: t.procedure.subscription(async function* () {
    yield 0;
  }),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (check: () => boolean) => {
  while (!check()) await sleep(1);
};

const connect = () => {
  ScriptedWebSocket.opened = [];
  const link = wsLink({
    url: 'ws://scripted',
    WebSocket: ScriptedWebSocket as unknown as typeof WebSocket,
    keepAlive: false,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  const socket = async (i: number) => {
    while (!ScriptedWebSocket.opened[i]) await sleep(1);
    return ScriptedWebSocket.opened[i];
  };
  return { link, client, socket };
};

const subscribe = (
  client: ReturnType<typeof connect>['client'],
  opts?: { reconnect: false },
) => {
  const events: unknown[] = [];
  const done = (async () => {
    for await (const value of client.feed.subscribe(undefined, opts))
      events.push(value);
  })();
  return { events, done: safe(done) };
};

const event = (id: number, n: number, eventId?: string) => ({
  id,
  type: 'event',
  body: { json: n },
  ...(eventId === undefined ? {} : { eventId }),
});

test('reconnect moves a tracked subscription to a new connection from the last event it handled: no gap, no duplicate', async () => {
  const c = connect();
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  // Delivered before `reconnect` but not handled yet: they count.
  old.receive(event(first.id, 1, '1'));
  old.receive(event(first.id, 2, '2'));
  old.receive({ type: 'reconnect' });
  // Still in transit on the old connection: dropped, the new one replays it.
  old.receive(event(first.id, 3, '3'));

  const next = await c.socket(1);
  const moved = await next.request('feed');
  expect(moved.lastEventId).toBe('2');
  expect(old.sent).toContainEqual({ id: first.id, type: 'abort' });
  next.receive(event(moved.id, 3, '3'));
  next.receive(event(moved.id, 4, '4'));
  next.receive({ id: moved.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1, 2, 3, 4]);
  await until(() => old.readyState === 3);
  expect(ScriptedWebSocket.opened).toHaveLength(2);
  await c.link.close();
});

test('a subscription without tracked event ids starts over on the new connection', async () => {
  const c = connect();
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive(event(first.id, 0));
  old.receive(event(first.id, 1));
  old.receive({ type: 'reconnect' });

  const next = await c.socket(1);
  const moved = await next.request('feed');
  expect(moved).not.toHaveProperty('lastEventId');
  next.receive(event(moved.id, 0));
  next.receive({ id: moved.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([0, 1, 0]);
  await c.link.close();
});

test('queries and mutations in flight finish on the old connection and are never sent again; new calls go to the new one', async () => {
  const c = connect();
  const hello = c.client.hello.query();
  const bump = c.client.bump.mutate();
  const old = await c.socket(0);
  const query = await old.request('hello');
  const mutation = await old.request('bump');
  old.receive({ type: 'reconnect' });

  const later = c.client.hello.query();
  const next = await c.socket(1);
  const sentLater = await next.request('hello');
  next.receive({ id: sentLater.id, type: 'result', body: { json: 'new' } });
  expect(await later).toBe('new');

  expect(old.readyState).toBe(1);
  old.receive({ id: query.id, type: 'result', body: { json: 'old' } });
  expect(await hello).toBe('old');
  expect(old.readyState).toBe(1);
  old.receive({ id: mutation.id, type: 'result', body: { json: 1 } });
  expect(await bump).toBe(1);
  await until(() => old.readyState === 3);

  const requests = (ws: ScriptedWebSocket) =>
    ws.sent.filter((m) => m.type !== 'init').map((m) => [m.type, m.path]);
  expect(requests(old)).toEqual([
    ['request', 'hello'],
    ['request', 'bump'],
  ]);
  expect(requests(next)).toEqual([['request', 'hello']]);
  await c.link.close();
});

test('a mutation in flight when the server closes the retired connection fails with NETWORK_ERROR, and is not sent again', async () => {
  const c = connect();
  const bump = safe(c.client.bump.mutate());
  const old = await c.socket(0);
  await old.request('bump');
  old.receive({ type: 'reconnect' });
  old.close();
  expect((await bump).error).toMatchObject({ code: 'NETWORK_ERROR' });
  expect(ScriptedWebSocket.opened).toHaveLength(1);
  await c.link.close();
});

test('a subscription made with { reconnect: false } stays on the old connection, and fails when it closes', async () => {
  const c = connect();
  const feed = subscribe(c.client, { reconnect: false });
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ type: 'reconnect' });
  old.receive(event(first.id, 1, '1'));
  await until(() => feed.events.length === 1);
  expect(old.readyState).toBe(1);
  old.close();
  expect((await feed.done).error).toMatchObject({ code: 'NETWORK_ERROR' });
  expect(ScriptedWebSocket.opened).toHaveLength(1);
  expect(old.sent.filter((m) => m.type === 'request')).toHaveLength(1);
  await c.link.close();
});

test('experimental_messagePortLink ignores reconnect: a port has nowhere to move', async () => {
  const channel = new MessageChannel();
  const sent: { id: number; type: string; path?: string }[] = [];
  channel.port2.on('message', (message) => sent.push(message));
  const link = experimental_messagePortLink({ port: channel.port1 });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  const feed = subscribe(client);
  await until(() => sent.some((m) => m.type === 'request'));
  const request = sent.find((m) => m.type === 'request')!;
  channel.port2.postMessage({ type: 'reconnect' });
  channel.port2.postMessage(event(request.id, 1, '1'));
  channel.port2.postMessage({ id: request.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1]);
  expect(sent.map((m) => m.type)).toEqual(['init', 'request']);
  await link.close();
  channel.port1.close();
});
