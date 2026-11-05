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

const latch = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
};

/**
 * `connectionParams` that resolve at once for the first connection, and
 * wait for `release()` on the ones after it, so a test controls when a
 * successor is ready.
 */
const heldParams = () => {
  const gate = latch();
  let calls = 0;
  return {
    connectionParams: async () => {
      if (calls++ > 0) await gate.opened;
      return {};
    },
    release: gate.open,
  };
};

const connect = (
  opts: Pick<
    Parameters<typeof wsLink>[0],
    'connectionParams' | 'reconnect'
  > = {},
) => {
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
  const socket = async (i: number) => {
    while (!ScriptedWebSocket.opened[i]) await sleep(1);
    return ScriptedWebSocket.opened[i];
  };
  return { link, client, socket };
};

/** Takes a `wsLink` client, or an `experimental_messagePortLink` one without `reconnect`. */
const subscribe = (
  client: {
    feed: {
      subscribe(
        input?: undefined,
        opts?: { reconnect?: false },
      ): AsyncIterable<unknown>;
    };
  },
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

const abort = (id: number) => ({ id, type: 'abort' });
const requests = (ws: ScriptedWebSocket, path: string) =>
  ws.sent.filter((m) => m.type === 'request' && m.path === path);
const nth = async (ws: ScriptedWebSocket, path: string, n: number) => {
  await until(() => requests(ws, path).length > n);
  return requests(ws, path)[n]!;
};
/** The first socket other than `old` that `path` was sent on. */
const sentOnAnother = async (old: ScriptedWebSocket, path: string) => {
  const find = () =>
    ScriptedWebSocket.opened.find(
      (ws) => ws !== old && requests(ws, path).length > 0,
    );
  await until(() => find() !== undefined);
  return find()!;
};
/** `ws` sent its `init`, and the link has had a turn to switch to it. */
const ready = async (ws: ScriptedWebSocket) => {
  await until(() => ws.sent.some((m) => m.type === 'init'));
  await sleep(1);
};

test('reconnect moves a tracked subscription only once the new connection answers it: the old one delivers until then, and what the new one resends is dropped by id', async () => {
  const params = heldParams();
  const c = connect({ connectionParams: params.connectionParams });
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ id: first.id, type: 'started' });
  old.receive(event(first.id, 1, '1'));
  old.receive({ type: 'reconnect' });
  // The new connection waits for its connectionParams: the old one still delivers.
  old.receive(event(first.id, 2, '2'));
  await until(() => feed.events.length === 2);
  const next = await c.socket(1);

  params.release();
  const moved = await next.request('feed');
  expect(moved.lastEventId).toBe('2');
  // The new connection hasn't answered: the old one still delivers.
  old.receive(event(first.id, 3, '3'));
  await until(() => feed.events.length === 3);
  expect(old.sent).not.toContainEqual(abort(first.id));
  expect(old.readyState).toBe(1);

  next.receive({ id: moved.id, type: 'started' });
  await until(() => old.sent.some((m) => m.type === 'abort'));
  expect(old.sent).toContainEqual(abort(first.id));
  // Late on the old connection: dropped.
  old.receive(event(first.id, 4, '4'));
  // Resent from after '2': '3' was delivered already.
  next.receive(event(moved.id, 3, '3'));
  next.receive(event(moved.id, 4, '4'));
  next.receive(event(moved.id, 5, '5'));
  next.receive({ id: moved.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1, 2, 3, 4, 5]);
  await until(() => old.readyState === 3);
  expect(ScriptedWebSocket.opened).toHaveLength(2);
  await c.link.close();
});

test('after reconnect, new queries, mutations and subscriptions go on the old connection until the new one is open and its connectionParams resolved', async () => {
  const params = heldParams();
  const c = connect({ connectionParams: params.connectionParams });
  const warm = c.client.hello.query();
  const old = await c.socket(0);
  const q0 = await old.request('hello');
  old.receive({ id: q0.id, type: 'result', body: { json: 'warm' } });
  await warm;
  old.receive({ type: 'reconnect' });
  await c.socket(1);

  const hello = c.client.hello.query();
  const q1 = await nth(old, 'hello', 1);
  old.receive({ id: q1.id, type: 'result', body: { json: 'old' } });
  expect(await hello).toBe('old');
  const bump = c.client.bump.mutate();
  const m1 = await old.request('bump');
  old.receive({ id: m1.id, type: 'result', body: { json: 1 } });
  expect(await bump).toBe(1);
  const feed = subscribe(c.client);
  const s1 = await old.request('feed');
  old.receive({ id: s1.id, type: 'started' });
  old.receive(event(s1.id, 1, '1'));
  await until(() => feed.events.length === 1);
  // Nothing in flight, but the new connection isn't ready: the old one stays.
  expect(old.readyState).toBe(1);

  params.release();
  const next = await c.socket(1);
  const moved = await next.request('feed');
  expect(moved.lastEventId).toBe('1');
  next.receive({ id: moved.id, type: 'started' });
  const later = c.client.hello.query();
  const q2 = await next.request('hello');
  next.receive({ id: q2.id, type: 'result', body: { json: 'new' } });
  expect(await later).toBe('new');
  await until(() => old.readyState === 3);
  expect(requests(old, 'hello')).toHaveLength(2);
  next.receive({ id: moved.id, type: 'done' });
  await feed.done;
  await c.link.close();
});

test('a new connection that fails to open leaves the old one serving, and the link tries again', async () => {
  let calls = 0;
  let failing = true;
  const c = connect({
    connectionParams: () => {
      if (calls++ > 0 && failing) throw new Error('not yet');
      return {};
    },
    reconnect: { delay: () => 1 },
  });
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ id: first.id, type: 'started' });
  old.receive({ type: 'reconnect' });
  await until(() => calls >= 3);
  old.receive(event(first.id, 1, '1'));
  await until(() => feed.events.length === 1);
  const hello = c.client.hello.query();
  const q = await old.request('hello');
  old.receive({ id: q.id, type: 'result', body: { json: 'old' } });
  expect(await hello).toBe('old');
  expect(old.sent).not.toContainEqual(abort(first.id));

  failing = false;
  const next = await sentOnAnother(old, 'feed');
  const moved = requests(next, 'feed')[0]!;
  expect(moved.lastEventId).toBe('1');
  next.receive({ id: moved.id, type: 'started' });
  await until(() => old.readyState === 3);
  expect(old.sent).toContainEqual(abort(first.id));
  next.receive(event(moved.id, 2, '2'));
  next.receive({ id: moved.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1, 2]);
  await c.link.close();
});

test('a new connection lost before it answers: the subscription stays on the old one, which keeps delivering, until another answers', async () => {
  const third = latch();
  let calls = 0;
  const c = connect({
    connectionParams: async () => {
      if (calls++ === 2) await third.opened;
      return {};
    },
    reconnect: { delay: () => 0 },
  });
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ id: first.id, type: 'started' });
  old.receive(event(first.id, 1, '1'));
  old.receive({ type: 'reconnect' });
  const next = await c.socket(1);
  await next.request('feed');
  old.receive(event(first.id, 2, '2'));
  await until(() => feed.events.length === 2);

  next.close();
  old.receive(event(first.id, 3, '3'));
  await until(() => feed.events.length === 3);
  expect(old.sent).not.toContainEqual(abort(first.id));

  third.open();
  const again = await c.socket(2);
  const moved = await again.request('feed');
  expect(moved.lastEventId).toBe('3');
  again.receive({ id: moved.id, type: 'started' });
  await until(() => old.readyState === 3);
  again.receive(event(moved.id, 4, '4'));
  again.receive({ id: moved.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1, 2, 3, 4]);
  await c.link.close();
});

test('an old connection that closes before the new one is ready falls back to a normal reconnect', async () => {
  const params = heldParams();
  const c = connect({
    connectionParams: params.connectionParams,
    reconnect: { delay: () => 0 },
  });
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ id: first.id, type: 'started' });
  old.receive(event(first.id, 1, '1'));
  const hello = safe(c.client.hello.query());
  await old.request('hello');
  old.receive({ type: 'reconnect' });
  await c.socket(1);
  old.receive(event(first.id, 2, '2'));
  await until(() => feed.events.length === 2);
  old.close();
  expect((await hello).error).toMatchObject({ code: 'NETWORK_ERROR' });

  params.release();
  const next = await sentOnAnother(old, 'feed');
  const resumed = requests(next, 'feed')[0]!;
  expect(resumed.lastEventId).toBe('2');
  next.receive(event(resumed.id, 3, '3'));
  next.receive({ id: resumed.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1, 2, 3]);
  await c.link.close();
});

test('an old connection that closes mid-move leaves the subscription on the new one, which resends from before what the old one delivered', async () => {
  const c = connect();
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ id: first.id, type: 'started' });
  old.receive(event(first.id, 1, '1'));
  old.receive({ type: 'reconnect' });
  const next = await c.socket(1);
  const moved = await next.request('feed');
  old.receive(event(first.id, 2, '2'));
  await until(() => feed.events.length === 2);
  expect(old.sent).not.toContainEqual(abort(first.id));
  old.close();
  next.receive({ id: moved.id, type: 'started' });
  next.receive(event(moved.id, 2, '2'));
  next.receive(event(moved.id, 3, '3'));
  next.receive({ id: moved.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1, 2, 3]);
  expect(requests(next, 'feed')).toHaveLength(1);
  expect(ScriptedWebSocket.opened).toHaveLength(2);
  await c.link.close();
});

test("an error as the new connection's first answer fails the subscription and stops it on the old one", async () => {
  const c = connect();
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ id: first.id, type: 'started' });
  old.receive({ type: 'reconnect' });
  const next = await c.socket(1);
  const moved = await next.request('feed');
  expect(old.sent).not.toContainEqual(abort(first.id));
  next.receive({
    id: moved.id,
    type: 'error',
    body: { json: { error: { code: 'UNAUTHORIZED', message: 'expired' } } },
  });
  expect((await feed.done).error).toMatchObject({ code: 'UNAUTHORIZED' });
  expect(old.sent).toContainEqual(abort(first.id));
  await until(() => old.readyState === 3);
  await c.link.close();
});

test('a connection error on the new connection before it answers keeps the subscription on the old one', async () => {
  const third = latch();
  let calls = 0;
  const c = connect({
    connectionParams: async () => {
      if (calls++ === 2) await third.opened;
      return {};
    },
    reconnect: { delay: () => 0 },
  });
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ id: first.id, type: 'started' });
  old.receive({ type: 'reconnect' });
  old.receive({ type: 'reconnect' });
  const next = await c.socket(1);
  await next.request('feed');
  old.receive(event(first.id, 1, '1'));
  next.receive({
    id: null,
    type: 'error',
    body: { json: { error: { code: 'UNAUTHORIZED', message: 'No token' } } },
  });
  next.close();
  await until(() => feed.events.length === 1);
  expect(old.sent).not.toContainEqual(abort(first.id));

  third.open();
  const again = await c.socket(2);
  const moved = await again.request('feed');
  expect(moved.lastEventId).toBe('1');
  again.receive({ id: moved.id, type: 'started' });
  again.receive({ id: moved.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1]);
  expect(ScriptedWebSocket.opened).toHaveLength(3);
  await c.link.close();
});

test('a subscription the old connection ends while it moves ends there, and is stopped on the new one', async () => {
  const c = connect();
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ id: first.id, type: 'started' });
  old.receive({ type: 'reconnect' });
  const next = await c.socket(1);
  const moved = await next.request('feed');
  old.receive(event(first.id, 1, '1'));
  old.receive({ id: first.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1]);
  await until(() => next.sent.some((m) => m.type === 'abort'));
  expect(next.sent).toContainEqual(abort(moved.id));
  expect(old.sent).not.toContainEqual(abort(first.id));
  await c.link.close();
});

test("the new connection's first answer can be an event: it confirms the move, and a resent event is dropped with its deferred chunks", async () => {
  const c = connect();
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ type: 'reconnect' });
  const next = await c.socket(1);
  const moved = await next.request('feed');
  old.receive(event(first.id, 1, '1'));
  await until(() => feed.events.length === 1);
  next.receive({ ...event(moved.id, 1, '1'), deferred: 0 });
  next.receive({ id: moved.id, type: 'chunk', event: 0, chunk: [0, 0, 'x'] });
  next.receive({ id: moved.id, type: 'chunkEnd', event: 0 });
  next.receive(event(moved.id, 2, '2'));
  next.receive({ id: moved.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1, 2]);
  expect(old.sent).toContainEqual(abort(first.id));
  await c.link.close();
});

test('a new connection that is retired before it answers: the subscription moves on to the one after it', async () => {
  const third = latch();
  let calls = 0;
  const c = connect({
    connectionParams: async () => {
      if (calls++ === 2) await third.opened;
      return {};
    },
  });
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  const first = await old.request('feed');
  old.receive({ id: first.id, type: 'started' });
  old.receive(event(first.id, 1, '1'));
  old.receive({ type: 'reconnect' });
  const next = await c.socket(1);
  const second = await next.request('feed');
  old.receive(event(first.id, 2, '2'));
  await until(() => feed.events.length === 2);
  next.receive({ type: 'reconnect' });

  third.open();
  const last = await c.socket(2);
  const moved = await last.request('feed');
  expect(moved.lastEventId).toBe('2');
  await until(() => next.sent.some((m) => m.type === 'abort'));
  expect(next.sent).toContainEqual(abort(second.id));
  expect(old.sent).not.toContainEqual(abort(first.id));
  last.receive({ id: moved.id, type: 'started' });
  await until(() => old.readyState === 3 && next.readyState === 3);
  last.receive(event(moved.id, 3, '3'));
  last.receive({ id: moved.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([1, 2, 3]);
  await c.link.close();
});

test('close() during a move stops the new connection opening', async () => {
  const params = heldParams();
  const c = connect({ connectionParams: params.connectionParams });
  const feed = subscribe(c.client);
  const old = await c.socket(0);
  await old.request('feed');
  old.receive({ type: 'reconnect' });
  await c.socket(1);
  await c.link.close();
  expect((await feed.done).error).toMatchObject({
    code: 'CLIENT_CLOSED_REQUEST',
  });
  params.release();
  await sleep(5);
  expect(ScriptedWebSocket.opened[1]!.sent).toEqual([]);
  expect(ScriptedWebSocket.opened).toHaveLength(2);
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
  // Untracked: the old connection delivers until the new one answers, so
  // events can arrive twice, but none is missed.
  old.receive(event(first.id, 2));
  await until(() => feed.events.length === 3);
  next.receive({ id: moved.id, type: 'started' });
  old.receive(event(first.id, 3));
  next.receive(event(moved.id, 0));
  next.receive({ id: moved.id, type: 'done' });
  await feed.done;
  expect(feed.events).toEqual([0, 1, 2, 0]);
  await c.link.close();
});

test('queries and mutations in flight finish on the old connection and are never sent again; new calls go to the new one once it is ready', async () => {
  const c = connect();
  const hello = c.client.hello.query();
  const bump = c.client.bump.mutate();
  const old = await c.socket(0);
  const query = await old.request('hello');
  const mutation = await old.request('bump');
  old.receive({ type: 'reconnect' });

  const next = await c.socket(1);
  await ready(next);
  const later = c.client.hello.query();
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
  await sleep(5);
  for (const ws of ScriptedWebSocket.opened.slice(1)) {
    expect(requests(ws, 'bump')).toEqual([]);
  }
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
  expect(old.sent.filter((m) => m.type === 'request')).toHaveLength(1);
  for (const ws of ScriptedWebSocket.opened.slice(1)) {
    expect(requests(ws, 'feed')).toEqual([]);
  }
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
