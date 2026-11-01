import { createServer, request as httpRequest } from 'node:http';
import { MessageChannel } from 'node:worker_threads';
import { NodeHttpServer } from '@effect/platform-node';
import { Context, type Duration, Effect, Exit, Layer, Scope } from 'effect';
import { HttpServer } from 'effect/http';
import { NetAddress } from 'effect/net';
import {
  createTrpcClient,
  experimental_messagePortLink,
  routerType,
  wsLink,
} from '@trpc12/trpc/client';
import { serve } from '@trpc12/trpc/http';
import { createFetchHandler, initTrpc, tracked } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, test } from 'vite-plus/test';

const t = initTrpc<{ ctx: { server: string } }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (check: () => boolean) => {
  while (!check()) await sleep(1);
};
const latch = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
};
const aborted = (signal: AbortSignal) =>
  new Promise<void>((resolve) =>
    signal.addEventListener('abort', () => resolve()),
  );

let gate = latch();
const state = {
  /** Calls of `held` and `bump` that started, on any server. */
  running: 0,
  bumps: 0,
  aborts: 0,
  /** The `lastEventId` each `feed` subscription started from, by server. */
  resumes: [] as string[],
};
/** The tracked feed's events, shared by every server: event `i` has id `i`. */
const log: number[] = [];
const listeners = new Set<() => void>();
const publish = (n: number) => {
  log.push(n);
  for (const listener of listeners) listener();
};

const reset = () => {
  gate = latch();
  state.running = state.bumps = state.aborts = 0;
  state.resumes = [];
  log.length = 0;
};

const router = t.router({
  whoami: t.procedure.query((opts) => opts.ctx.server),
  held: t.procedure.query(async (opts) => {
    state.running++;
    await Promise.race([gate.opened, aborted(opts.signal)]);
    if (opts.signal.aborted) state.aborts++;
    return opts.ctx.server;
  }),
  bump: t.procedure.mutation(async (opts) => {
    state.running++;
    state.bumps++;
    await gate.opened;
    return `${opts.ctx.server}:${state.bumps}`;
  }),
  feed: t.procedure.subscription(async function* (opts) {
    const { lastEventId } = opts;
    state.resumes.push(`${opts.ctx.server}:${lastEventId ?? '-'}`);
    let next = lastEventId === undefined ? 0 : Number(lastEventId) + 1;
    while (!opts.signal.aborted) {
      for (; next < log.length; next++) yield tracked(String(next), log[next]!);
      let wake!: () => void;
      await new Promise<void>((resolve) => {
        wake = resolve;
        listeners.add(wake);
        opts.signal.addEventListener('abort', () => resolve());
      }).finally(() => listeners.delete(wake));
    }
  }),
  /** Untracked: two events tagged with the server, then quiet. */
  count: t.procedure.subscription(async function* (opts) {
    yield `${opts.ctx.server}:0`;
    yield `${opts.ctx.server}:1`;
    await aborted(opts.signal);
  }),
});

const start = (server: string, drainTimeout: Duration.Input = '10 seconds') =>
  createTestServer({
    router,
    createContext: () => ({ server }),
    websocket: { drainTimeout },
  });

/** A WebSocket client that speaks the protocol by hand. */
async function raw(url: string) {
  const socket = new WebSocket(url);
  const messages: Record<string, unknown>[] = [];
  socket.addEventListener('message', (event) =>
    messages.push(JSON.parse(String(event.data))),
  );
  const closed = new Promise<CloseEvent>((resolve) =>
    socket.addEventListener('close', resolve),
  );
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  const send = (message: object) => socket.send(JSON.stringify(message));
  send({ type: 'init', version: '12' });
  const received = async (match: Record<string, unknown>) => {
    const matches = (m: Record<string, unknown>) =>
      Object.entries(match).every(([k, v]) => m[k] === v);
    await until(() => messages.some(matches));
    return messages.find(matches)!;
  };
  return { socket, messages, closed, send, received };
}

const settledFlag = (promise: Promise<unknown>) => {
  const flag = { settled: false };
  void promise.finally(() => (flag.settled = true));
  return flag;
};

test('drain() sends reconnect, lets the call in flight finish, and ends when the client closes', async () => {
  reset();
  await using server = await start('a');
  const client = await raw(server.wsUrl);
  client.send({ id: 1, type: 'request', method: 'query', path: 'held' });
  await until(() => state.running === 1);

  const drain = server.handler.drain({ timeout: '10 seconds' });
  const drained = settledFlag(drain);
  await client.received({ type: 'reconnect' });
  gate.open();
  expect(await client.received({ id: 1, type: 'result' })).toMatchObject({
    body: { json: 'a' },
  });
  await sleep(20);
  expect(drained.settled).toBe(false);
  client.socket.close(1000);
  await drain;
  expect(state.aborts).toBe(0);
});

test('at the drain timeout the server closes with 1012 and interrupts the calls left', async () => {
  reset();
  await using server = await start('a');
  const client = await raw(server.wsUrl);
  client.send({ id: 1, type: 'request', method: 'query', path: 'held' });
  await until(() => state.running === 1);

  const started = Date.now();
  await server.handler.drain({ timeout: 100 });
  const elapsed = Date.now() - started;
  expect(elapsed).toBeGreaterThanOrEqual(90);
  expect(elapsed).toBeLessThan(1000);
  expect((await client.closed).code).toBe(1012);
  expect(client.messages).toContainEqual({ type: 'reconnect' });
  await until(() => state.aborts === 1);
});

test('the default drain timeout is websocket.drainTimeout', async () => {
  reset();
  await using server = await start('a', '60 millis');
  const client = await raw(server.wsUrl);
  const started = Date.now();
  await server.handler.drain();
  expect(Date.now() - started).toBeLessThan(1000);
  expect((await client.closed).code).toBe(1012);
});

/** The status an upgrade request gets, when it isn't upgraded. */
const upgradeStatus = (url: string) =>
  new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(url.replace(/^ws/, 'http'), {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
      },
    });
    request.on('response', (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('upgrade', (_response, socket) => {
      socket.destroy();
      resolve(101);
    });
    request.on('error', reject);
    request.end();
  });

test('an upgrade during a drain gets a 503; after it, connections are served again', async () => {
  reset();
  await using server = await start('a');
  const open = await raw(server.wsUrl);
  const drain = server.handler.drain({ timeout: '10 seconds' });
  await open.received({ type: 'reconnect' });

  expect(await upgradeStatus(server.wsUrl)).toBe(503);

  open.socket.close(1000);
  await drain;
  const after = await raw(server.wsUrl);
  after.send({ id: 1, type: 'request', method: 'query', path: 'whoami' });
  expect(await after.received({ id: 1, type: 'result' })).toMatchObject({
    body: { json: 'a' },
  });
  after.socket.close(1000);
});

test('dispose() drains, then refuses connections for good', async () => {
  reset();
  const handler = createFetchHandler({
    router,
    createContext: () => ({ server: 'a' }),
  });
  const channel = new MessageChannel();
  const link = experimental_messagePortLink({ port: channel.port1 });
  handler.messagePort(channel.port2);
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  const held = client.held.query();
  await until(() => state.running === 1);

  // A port's client has nowhere to move: the drain waits for its calls.
  const dispose = handler.dispose();
  const disposed = settledFlag(dispose);
  await sleep(20);
  expect(disposed.settled).toBe(false);
  gate.open();
  expect(await held).toBe('a');
  await dispose;

  const late = new MessageChannel();
  const closed = new Promise<void>((resolve) =>
    late.port1.on('close', resolve),
  );
  handler.messagePort(late.port2);
  await closed;
  await link.close();
  channel.port1.close();
});

test('wsLink moves to the next server during a rolling deploy: calls in flight finish once, subscriptions resume without a gap or a duplicate', async () => {
  reset();
  await using a = await start('a');
  await using b = await start('b');
  let target = a.wsUrl;
  const upgrades = { a: 0, b: 0 };
  a.server.on('upgrade', () => upgrades.a++);
  b.server.on('upgrade', () => upgrades.b++);
  class Balanced extends WebSocket {
    constructor() {
      super(target);
    }
  }
  const link = wsLink({
    url: 'ws://balancer/trpc',
    WebSocket: Balanced,
    keepAlive: false,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });

  publish(0);
  publish(1);
  publish(2);
  const feed: number[] = [];
  const feedDone = (async () => {
    for await (const event of client.feed.subscribe()) {
      feed.push(event.data);
      if (feed.length === 6) return;
    }
  })();
  const counts: string[] = [];
  const countDone = (async () => {
    for await (const n of client.count.subscribe()) {
      counts.push(n);
      if (counts.length === 4) return;
    }
  })();
  await until(() => feed.length === 3 && counts.length === 2);
  const held = client.held.query();
  const bump = client.bump.mutate();
  await until(() => state.running === 2);

  target = b.wsUrl;
  const started = Date.now();
  const drain = a.handler.drain();
  const drained = settledFlag(drain);
  publish(3);
  // The subscriptions moving dials b, so the client heard `reconnect`.
  await until(() => upgrades.b === 1);
  expect(await client.whoami.query()).toBe('b');
  await until(() => feed.length === 4);
  publish(4);
  await until(() => counts.length === 4);

  expect(drained.settled).toBe(false);
  gate.open();
  expect(await held).toBe('a');
  expect(await bump).toBe('a:1');
  await drain;
  expect(Date.now() - started).toBeLessThan(2000);

  publish(5);
  await Promise.all([feedDone, countDone]);
  expect(feed).toEqual([0, 1, 2, 3, 4, 5]);
  expect(state.resumes[0]).toBe('a:-');
  expect(state.resumes.slice(1)).toEqual([expect.stringMatching(/^b:[23]$/)]);
  // Untracked: it starts over on the new server.
  expect(counts).toEqual(['a:0', 'a:1', 'b:0', 'b:1']);
  expect(state.bumps).toBe(1);
  expect(state.running).toBe(2);
  expect(upgrades).toEqual({ a: 1, b: 1 });
  await link.close();
});

test("releasing serve()'s layer drains first, so the server doesn't wait on open WebSockets", async () => {
  reset();
  const handler = createFetchHandler({
    router,
    createContext: () => ({ server: 'a' }),
  });
  const scope = Scope.makeUnsafe();
  const context = await Effect.runPromise(
    Layer.buildWithScope(
      serve(handler).pipe(
        Layer.provideMerge(
          NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
        ),
      ),
      scope,
    ),
  );
  const address = Context.get(context, HttpServer.HttpServer).address;
  if (NetAddress.isUnixPathAddress(address)) throw new Error('not TCP');
  const client = await raw(`ws://127.0.0.1:${address.port}/trpc`);
  void client
    .received({ type: 'reconnect' })
    .then(() => client.socket.close(1000));

  const started = Date.now();
  await Effect.runPromise(Scope.close(scope, Exit.void));
  expect(Date.now() - started).toBeLessThan(2000);
  expect(client.messages).toContainEqual({ type: 'reconnect' });
  expect((await client.closed).code).toBe(1000);
  await handler.dispose();
});
