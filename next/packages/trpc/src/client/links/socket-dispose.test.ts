import { MessageChannel } from 'node:worker_threads';
import {
  createTrpcClient,
  experimental_messagePortLink,
  routerType,
  safe,
  wsLink,
  type MessagePortLike,
} from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { ScriptedWebSocket } from '../../fixtures/scripted-websocket.ts';
import { expect, test } from 'vite-plus/test';

const t = initTrpc();
const router = {
  hello: t.procedure.query(() => 'hello'),
  feed: t.procedure.subscription(async function* () {
    yield 0;
  }),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (check: () => boolean) => {
  while (!check()) await sleep(1);
};

const disposed = {
  code: 'CLIENT_CLOSED_REQUEST',
  message: 'The link was disposed',
};

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

const collect = (iterable: AsyncIterable<unknown>) => {
  const events: unknown[] = [];
  const done = safe(
    (async () => {
      for await (const value of iterable) events.push(value);
    })(),
  );
  return { events, done };
};

test('dispose() fails the calls in flight and every later one, and closes the socket for good', async () => {
  const c = connect();
  const query = safe(c.client.hello.query());
  const feed = collect(c.client.feed.subscribe());
  await until(() => ScriptedWebSocket.opened.length === 1);
  const socket = ScriptedWebSocket.opened[0]!;
  const sub = await socket.request('feed');
  socket.receive({ id: sub.id, type: 'event', body: { json: 1 } });
  await until(() => feed.events.length === 1);
  await socket.request('hello');

  await c.link.dispose();
  expect((await query).error).toMatchObject(disposed);
  expect((await feed.done).error).toMatchObject(disposed);
  expect(feed.events).toEqual([1]);
  expect(socket.readyState).toBe(3);

  expect((await safe(c.client.hello.query())).error).toMatchObject(disposed);
  expect((await collect(c.client.feed.subscribe()).done).error).toMatchObject(
    disposed,
  );
  await c.link.dispose();
  await c.link.close();
  expect(ScriptedWebSocket.opened).toHaveLength(1);
});

test('close() still only resets: the next call opens a new connection', async () => {
  const c = connect();
  const first = safe(c.client.hello.query());
  await until(() => ScriptedWebSocket.opened.length === 1);
  await ScriptedWebSocket.opened[0]!.request('hello');
  await c.link.close();
  expect((await first).error).toMatchObject({
    code: 'CLIENT_CLOSED_REQUEST',
    message: 'The link was closed',
  });

  const second = c.client.hello.query();
  await until(() => ScriptedWebSocket.opened.length === 2);
  const socket = ScriptedWebSocket.opened[1]!;
  const sent = await socket.request('hello');
  socket.receive({ id: sent.id, type: 'result', body: { json: 'again' } });
  expect(await second).toBe('again');
  await c.link.dispose();
});

test('dispose() fails a call waiting on a connection that is still opening', async () => {
  const c = connect({
    connectionParams: () => new Promise<never>(() => {}),
  });
  const query = safe(c.client.hello.query());
  const feed = collect(c.client.feed.subscribe());
  const stays = collect(
    c.client.feed.subscribe(undefined, { reconnect: false }),
  );
  await until(() => ScriptedWebSocket.opened.length === 1);
  await sleep(5);
  await c.link.dispose();
  expect((await query).error).toMatchObject(disposed);
  expect((await feed.done).error).toMatchObject(disposed);
  expect((await stays.done).error).toMatchObject(disposed);
  expect(ScriptedWebSocket.opened[0]!.readyState).toBe(3);
});

test('await using a socket link disposes it at the end of the block', async () => {
  const channel = new MessageChannel();
  const sent: { id: number; type: string }[] = [];
  channel.port2.on('message', (message) => sent.push(message));
  let client;
  {
    await using link = experimental_messagePortLink({ port: channel.port1 });
    client = createTrpcClient({
      router: routerType<typeof router>(),
      links: [link],
    });
    const hello = client.hello.query();
    await until(() => sent.some((m) => m.type === 'request'));
    const request = sent.find((m) => m.type === 'request')!;
    channel.port2.postMessage({
      id: request.id,
      type: 'result',
      body: { json: 'hi' },
    });
    expect(await hello).toBe('hi');
  }
  expect((await safe(client.hello.query())).error).toMatchObject(disposed);
  channel.port1.close();
});

test('a disposed message-port link leaves no listeners on its port', async () => {
  const answer =
    (port: { postMessage(message: unknown): void }) =>
    (message: { id: number; type: string }) => {
      if (message.type === 'request') {
        port.postMessage({
          id: message.id,
          type: 'result',
          body: { json: 'hi' },
        });
      }
    };

  const channel = new MessageChannel();
  channel.port2.on('message', answer(channel.port2));
  const node = experimental_messagePortLink({ port: channel.port1 });
  const viaNode = createTrpcClient({
    router: routerType<typeof router>(),
    links: [node],
  });
  expect(await viaNode.hello.query()).toBe('hi');
  expect(channel.port1.listenerCount('message')).toBe(1);
  expect(channel.port1.listenerCount('close')).toBe(1);
  await node.dispose();
  expect(channel.port1.listenerCount('message')).toBe(0);
  expect(channel.port1.listenerCount('close')).toBe(0);
  channel.port1.close();
  channel.port2.close();

  const listeners = new Map<string, Set<(event: { data: unknown }) => void>>();
  const reply = answer({
    postMessage: (data) => {
      for (const listener of listeners.get('message') ?? []) {
        listener({ data });
      }
    },
  });
  const web: MessagePortLike = {
    postMessage: (message) =>
      queueMicrotask(() => reply(message as { id: number; type: string })),
    addEventListener: (type, listener) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
  };
  const viaWeb = experimental_messagePortLink({ port: web });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [viaWeb],
  });
  expect(await client.hello.query()).toBe('hi');
  expect([...listeners.values()].map((set) => set.size)).toEqual([1, 1]);
  await viaWeb.dispose();
  expect([...listeners.values()].map((set) => set.size)).toEqual([0, 0]);
});
