import { EventEmitter, on } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { TRPCClientError } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import { initTRPC, tracked } from '@trpc/server';
import {
  createDeferred,
  makeAsyncResource,
  makeResource,
} from '@trpc/server/unstable-core-do-not-import';
import { WebSocket } from 'ws';
import { z } from 'zod';

/**
 * A server-requested reconnect is make-before-break. Until the new socket is
 * open and has sent its connectionParams, the old one serves everything, new
 * requests included. Then each subscription is sent on the new socket with
 * its `lastEventId`, and stopped on the old one once the new one has started
 * it.
 */
function setup(opts: {
  connectionParams: (attempt: number) => Promise<Record<string, string>>;
}) {
  const t = initTRPC.create();
  const ee = new EventEmitter();
  const events: number[] = [];
  const subscribedFrom = vi.fn<(lastEventId: string | null) => void>();
  /** The server-side signal of each `events` subscription, in order. */
  const signals: AbortSignal[] = [];
  let setupGate: Promise<void> | null = null;
  const setupHeld = vi.fn();
  /** Holds back the next subscription's setup, and so its `started`. */
  async function heldSetup() {
    const gate = setupGate;
    setupGate = null;
    if (gate) {
      setupHeld();
      await gate;
    }
  }
  const router = t.router({
    greeting: t.procedure.query(() => 'hello'),
    echo: t.procedure.input(z.string()).mutation(({ input }) => input),
    /** Untracked, and listening before its setup is held. */
    values: t.procedure.subscription(async ({ signal }) => {
      const values = on(ee, 'value', { signal });
      await heldSetup();
      return values;
    }),
    events: t.procedure
      .input(z.object({ lastEventId: z.string().nullish() }).optional())
      .use(async (mwOpts) => {
        await heldSetup();
        return mwOpts.next();
      })
      .subscription(async function* (subOpts) {
        subscribedFrom(subOpts.input?.lastEventId ?? null);
        assert(subOpts.signal);
        signals.push(subOpts.signal);
        let sent = Number(subOpts.input?.lastEventId ?? 0);
        const pushes = on(ee, 'push', { signal: subOpts.signal });
        while (true) {
          while (sent < events.length) {
            sent++;
            yield tracked(String(sent), sent);
          }
          await pushes.next();
        }
      }),
  });

  let attempt = 0;
  const onOpen = vi.fn();
  const states: TRPCConnectionState<TRPCClientError<any>>['state'][] = [];
  const ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: {
      lazy: { enabled: false, closeMs: 0 },
      retryDelayMs: () => 10,
      onOpen,
      connectionParams: () => opts.connectionParams(++attempt),
    },
  });
  ctx.wsClient.connectionState.subscribe({
    next: (state) => states.push(state.state),
  });
  /** The server socket each request came on, by path. */
  const received: { socket: WebSocket; path: unknown }[] = [];
  ctx.wss.on('connection', (socket) => {
    socket.on('message', (raw) => {
      // oxlint-disable-next-line typescript/no-base-to-string
      const text = raw.toString();
      if (text === 'PING' || text === 'PONG') return;
      for (const message of [JSON.parse(text)].flat()) {
        if (message.method === 'connectionParams') continue;
        received.push({ socket, path: message.params?.path });
      }
    });
  });

  return makeAsyncResource(
    Object.assign(ctx, {
      onOpen,
      states,
      ee,
      subscribedFrom,
      signals,
      setupHeld,
      socketsFor: (path: string) =>
        received
          .filter((request) => request.path === path)
          .map((request) => request.socket),
      holdNextSetup() {
        const gate = createDeferred<void>();
        setupGate = gate.promise;
        return gate;
      },
      push() {
        events.push(events.length + 1);
        ee.emit('push');
      },
      latest: () => events.length,
    }),
    () => ctx.wsClient.close(),
  );
}

function consecutive(length: number) {
  return Array.from({ length }, (_, index) => index + 1);
}

test('a subscription keeps receiving on the old socket while the new one waits on connectionParams', async () => {
  const paramsGate = createDeferred<void>();
  await using ctx = setup({
    connectionParams: async (attempt) => {
      if (attempt > 1) await paramsGate.promise;
      return {};
    },
  });
  const data: number[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onData: (envelope) => data.push(envelope.data),
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1]));
  const oldSocket = ctx.wsClient.connection!.ws;

  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(ctx.onOpen).toHaveBeenCalledTimes(2));
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1, 2]));

  paramsGate.resolve();
  await vi.waitFor(() => {
    expect(oldSocket.readyState).toBe(WebSocket.CLOSED);
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1, 2, 3]));
  expect(ctx.subscribedFrom.mock.calls).toEqual([[null], ['2']]);
  sub.unsubscribe();
});

test('a subscription keeps receiving on the old socket while the new one fails to open, and the 3rd failure in a row shows', async () => {
  let failParams = true;
  let failures = 0;
  await using ctx = setup({
    connectionParams: async (attempt) => {
      if (attempt > 1 && failParams) {
        failures++;
        throw new Error(`token unavailable ${failures}`);
      }
      return {};
    },
  });
  const data: number[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onData: (envelope) => data.push(envelope.data),
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1]));
  const shown: { failures: number; error: unknown }[] = [];
  ctx.wsClient.connectionState.subscribe({
    next: (state) => {
      if (failures > 0) shown.push({ failures, error: state.error });
    },
  });

  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(shown.length).toBeGreaterThan(0));
  expect(shown[0]).toEqual({
    failures: 3,
    error: expect.objectContaining({
      message: 'Initialization error',
      cause: expect.objectContaining({
        cause: expect.objectContaining({ message: 'token unavailable 3' }),
      }),
    }),
  });
  expect(ctx.subscribedFrom).toHaveBeenCalledTimes(1);
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1, 2]));
  // New requests go on the old socket meanwhile.
  expect(await ctx.client.greeting.query()).toBe('hello');

  failParams = false;
  await vi.waitFor(() => {
    expect(ctx.subscribedFrom.mock.calls).toEqual([[null], ['2']]);
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1, 2, 3]));
  sub.unsubscribe();
});

test('a moved subscription gets every event exactly once', async () => {
  await using ctx = setup({ connectionParams: async () => ({}) });
  const data: number[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onData: (envelope) => data.push(envelope.data),
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1]));

  // The old server socket stops reading, so it neither sees the client's
  // `subscription.stop` nor finishes closing, and keeps sending events.
  const [oldServerSocket] = ctx.wss.clients;
  assert(oldServerSocket);
  oldServerSocket.pause();
  const pushing = setInterval(() => ctx.push(), 2);
  try {
    ctx.wssHandler.broadcastReconnectNotification();
    await vi.waitFor(() => expect(ctx.subscribedFrom).toHaveBeenCalledTimes(2));
    const moved = data.length;
    await vi.waitFor(() => expect(data.length).toBeGreaterThan(moved + 3));
  } finally {
    clearInterval(pushing);
    oldServerSocket.resume();
  }
  await vi.waitFor(() => expect(ctx.wss.clients.size).toBe(1));
  ctx.push();
  await vi.waitFor(() => expect(data.at(-1)).toBe(ctx.latest()));
  expect(data).toEqual(consecutive(ctx.latest()));
  sub.unsubscribe();
});

test('subscribers see no second started and no connecting state when a subscription moves', async () => {
  await using ctx = setup({ connectionParams: async () => ({}) });
  const onStarted = vi.fn();
  const onConnectionStateChange = vi.fn();
  const data: number[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onStarted,
    onConnectionStateChange,
    onData: (envelope) => data.push(envelope.data),
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1]));
  ctx.states.length = 0;
  onConnectionStateChange.mockClear();

  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(ctx.subscribedFrom).toHaveBeenCalledTimes(2));
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1, 2]));

  expect(onStarted).toHaveBeenCalledTimes(1);
  expect(ctx.states).toEqual([]);
  expect(onConnectionStateChange).not.toHaveBeenCalled();
  sub.unsubscribe();
});

test('a subscription moved before its started arrived still reports onStarted once', async () => {
  const t = initTRPC.create();
  const ee = new EventEmitter();
  const firstSetup = createDeferred<void>();
  const firstSetupEntered = createDeferred<void>();
  let calls = 0;
  const router = t.router({
    events: t.procedure
      .use(async (opts) => {
        if (++calls === 1) {
          firstSetupEntered.resolve();
          await firstSetup.promise;
        }
        return opts.next();
      })
      .subscription(({ signal }) => on(ee, 'push', { signal })),
  });
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: { retryDelayMs: () => 10 },
  });
  using _firstSetup = makeResource({}, () => firstSetup.resolve());

  const onStarted = vi.fn();
  const data: unknown[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onStarted,
    onData: (value) => data.push(value),
  });
  await firstSetupEntered.promise;

  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(calls).toBe(2));
  await vi.waitFor(() => expect(ee.listenerCount('push')).toBe(1));
  ee.emit('push', 'after the move');
  await vi.waitFor(() => expect(data).toEqual([['after the move']]));
  expect(onStarted).toHaveBeenCalledTimes(1);
  sub.unsubscribe();
});

test('a moved subscription is stopped on the old socket while that socket still drains', async () => {
  const t = initTRPC.create();
  const ee = new EventEmitter();
  const held = createDeferred<string>();
  const heldRunning = createDeferred<void>();
  const signals: AbortSignal[] = [];
  const router = t.router({
    held: t.procedure.query(() => {
      heldRunning.resolve();
      return held.promise;
    }),
    events: t.procedure.subscription(({ signal }) => {
      assert(signal);
      signals.push(signal);
      return on(ee, 'push', { signal });
    }),
  });
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: { retryDelayMs: () => 10 },
  });
  using _held = makeResource({}, () => held.resolve('released'));
  const sub = ctx.client.events.subscribe(undefined, { onData: vi.fn() });
  await vi.waitFor(() => expect(signals).toHaveLength(1));
  const query = ctx.client.held.query();
  await heldRunning.promise;
  const [oldServerSocket] = ctx.wss.clients;
  assert(oldServerSocket);

  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(signals).toHaveLength(2));
  await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true));
  expect(oldServerSocket.readyState).toBe(WebSocket.OPEN);
  expect(signals[1]?.aborted).toBe(false);

  held.resolve('released');
  expect(await query).toBe('released');
  await vi.waitFor(() =>
    expect(oldServerSocket.readyState).toBe(WebSocket.CLOSED),
  );
  sub.unsubscribe();
});

test('queries, mutations and subscriptions made while the new socket opens go on the old one', async () => {
  const paramsGate = createDeferred<void>();
  await using ctx = setup({
    connectionParams: async (attempt) => {
      if (attempt > 1) await paramsGate.promise;
      return {};
    },
  });
  using _paramsGate = makeResource({}, () => paramsGate.resolve());
  await vi.waitFor(() => expect(ctx.wsClient.connection?.state).toBe('open'));
  const oldSocket = ctx.wsClient.connection!.ws;
  const [oldServerSocket] = ctx.wss.clients;
  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(ctx.onOpen).toHaveBeenCalledTimes(2));

  expect(await ctx.client.greeting.query()).toBe('hello');
  expect(await ctx.client.echo.mutate('hi')).toBe('hi');
  const onStarted = vi.fn();
  const data: number[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onStarted,
    onData: (envelope) => data.push(envelope.data),
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1]));
  for (const path of ['greeting', 'echo', 'events']) {
    expect(ctx.socketsFor(path)).toEqual([oldServerSocket]);
  }

  // The new subscription moves with the rest.
  paramsGate.resolve();
  await vi.waitFor(() => expect(oldSocket.readyState).toBe(WebSocket.CLOSED));
  expect(ctx.subscribedFrom.mock.calls).toEqual([[null], ['1']]);
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1, 2]));
  expect(onStarted).toHaveBeenCalledTimes(1);
  sub.unsubscribe();
});

test('a subscription is stopped on the old socket only once the new one has started it', async () => {
  await using ctx = setup({ connectionParams: async () => ({}) });
  const onStarted = vi.fn();
  const data: number[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onStarted,
    onData: (envelope) => data.push(envelope.data),
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1]));
  const [oldServerSocket] = ctx.wss.clients;
  assert(oldServerSocket);
  const newSetup = ctx.holdNextSetup();
  using _newSetup = makeResource({}, () => newSetup.resolve());

  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(ctx.setupHeld).toHaveBeenCalledTimes(1));
  // The new socket has the subscription but hasn't started it, so the old
  // one still serves it.
  ctx.push();
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1, 2, 3]));
  expect(ctx.signals[0]?.aborted).toBe(false);

  // The new socket resends events 2 and 3, which are dropped.
  newSetup.resolve();
  await vi.waitFor(() => expect(ctx.signals[0]?.aborted).toBe(true));
  ctx.push();
  await vi.waitFor(() => expect(data.at(-1)).toBe(4));
  expect(data).toEqual([1, 2, 3, 4]);
  expect(ctx.subscribedFrom.mock.calls).toEqual([[null], ['1']]);
  expect(onStarted).toHaveBeenCalledTimes(1);
  await vi.waitFor(() =>
    expect(oldServerSocket.readyState).toBe(WebSocket.CLOSED),
  );
  sub.unsubscribe();
});

test('the old socket closing while the new one opens falls back to a normal reconnect', async () => {
  const paramsGate = createDeferred<void>();
  await using ctx = setup({
    connectionParams: async (attempt) => {
      if (attempt > 1) await paramsGate.promise;
      return {};
    },
  });
  using _paramsGate = makeResource({}, () => paramsGate.resolve());
  const onStarted = vi.fn();
  const data: number[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onStarted,
    onData: (envelope) => data.push(envelope.data),
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1]));
  const [oldServerSocket] = ctx.wss.clients;
  assert(oldServerSocket);
  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(ctx.onOpen).toHaveBeenCalledTimes(2));
  ctx.states.length = 0;

  oldServerSocket.terminate();
  await vi.waitFor(() => expect(ctx.states).toEqual(['connecting']));
  // Nothing serves requests until the new socket is ready.
  const greeting = ctx.client.greeting.query();
  ctx.push();
  paramsGate.resolve();
  expect(await greeting).toBe('hello');
  await vi.waitFor(() => expect(data).toEqual([1, 2]));
  expect(ctx.socketsFor('greeting')).not.toContain(oldServerSocket);
  expect(ctx.subscribedFrom.mock.calls).toEqual([[null], ['1']]);
  expect(onStarted).toHaveBeenCalledTimes(2);
  sub.unsubscribe();
});

test('the old socket closing while a subscription moves leaves it on the new one with no gap or duplicate', async () => {
  await using ctx = setup({ connectionParams: async () => ({}) });
  const onStarted = vi.fn();
  const data: number[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onStarted,
    onData: (envelope) => data.push(envelope.data),
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1]));
  const [oldServerSocket] = ctx.wss.clients;
  assert(oldServerSocket);
  const newSetup = ctx.holdNextSetup();
  using _newSetup = makeResource({}, () => newSetup.resolve());
  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(ctx.setupHeld).toHaveBeenCalledTimes(1));
  ctx.push();
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1, 2, 3]));
  ctx.states.length = 0;

  oldServerSocket.terminate();
  ctx.push();
  newSetup.resolve();
  await vi.waitFor(() => expect(data.at(-1)).toBe(4));
  expect(data).toEqual([1, 2, 3, 4]);
  expect(ctx.subscribedFrom.mock.calls).toEqual([[null], ['1']]);
  expect(onStarted).toHaveBeenCalledTimes(1);
  expect(ctx.states).toEqual([]);
  sub.unsubscribe();
});

test('a new socket lost before it starts a subscription leaves the subscription on the old one', async () => {
  await using ctx = setup({ connectionParams: async () => ({}) });
  const onStarted = vi.fn();
  const data: number[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onStarted,
    onData: (envelope) => data.push(envelope.data),
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1]));
  const [oldServerSocket] = ctx.wss.clients;
  assert(oldServerSocket);
  const lostSetup = ctx.holdNextSetup();
  using _lostSetup = makeResource({}, () => lostSetup.resolve());
  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(ctx.setupHeld).toHaveBeenCalledTimes(1));
  ctx.states.length = 0;

  const nextSetup = ctx.holdNextSetup();
  using _nextSetup = makeResource({}, () => nextSetup.resolve());
  const lostServerSocket = [...ctx.wss.clients].find(
    (socket) => socket !== oldServerSocket,
  );
  assert(lostServerSocket);
  lostServerSocket.terminate();
  await vi.waitFor(() => expect(ctx.setupHeld).toHaveBeenCalledTimes(2));
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1, 2]));
  expect(ctx.signals[0]?.aborted).toBe(false);

  nextSetup.resolve();
  await vi.waitFor(() =>
    expect(oldServerSocket.readyState).toBe(WebSocket.CLOSED),
  );
  ctx.push();
  await vi.waitFor(() => expect(data.at(-1)).toBe(3));
  expect(data).toEqual([1, 2, 3]);
  expect(ctx.subscribedFrom.mock.calls).toEqual([[null], ['1']]);
  expect(onStarted).toHaveBeenCalledTimes(1);
  expect(ctx.states).toEqual([]);
  sub.unsubscribe();
});

test('an untracked subscription gets an event published while both sockets listen twice, and misses none', async () => {
  await using ctx = setup({ connectionParams: async () => ({}) });
  const data: unknown[] = [];
  const sub = ctx.client.values.subscribe(undefined, {
    onData: (value) => data.push(value),
  });
  await vi.waitFor(() => expect(ctx.ee.listenerCount('value')).toBe(1));
  const newSetup = ctx.holdNextSetup();
  using _newSetup = makeResource({}, () => newSetup.resolve());
  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(ctx.setupHeld).toHaveBeenCalledTimes(1));

  // The new socket listens, but hasn't started the subscription.
  ctx.ee.emit('value', 1);
  await vi.waitFor(() => expect(data).toEqual([[1]]));
  newSetup.resolve();
  await vi.waitFor(() => expect(data).toEqual([[1], [1]]));
  await vi.waitFor(() => expect(ctx.ee.listenerCount('value')).toBe(1));
  ctx.ee.emit('value', 2);
  await vi.waitFor(() => expect(data).toEqual([[1], [1], [2]]));
  sub.unsubscribe();
});
