import { EventEmitter, on } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { WebSocketClientOptions } from '@trpc/client';
import { retryLink, wsLink } from '@trpc/client';
import { initTRPC, tracked } from '@trpc/server';
import type { Encoder } from '@trpc/server/adapters/ws';
import { observable } from '@trpc/server/observable';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import WebSocket from 'ws';
import { z } from 'zod';

/**
 * A server's reconnect notice, against a real server: the old socket serves
 * until the new one is ready and has confirmed each subscription, and a new
 * socket that fails leaves the old one serving.
 */

/** Holds back frames `socket` sends that match, until released. */
function holdSent(socket: WebSocket, matches: (message: any) => boolean) {
  const held: (() => void)[] = [];
  let holding = true;
  const send = socket.send.bind(socket);
  socket.send = ((data: unknown, ...args: unknown[]) => {
    const text = String(data);
    const message =
      text === 'PING' || text === 'PONG' ? null : JSON.parse(text);
    if (holding && message !== null && matches(message)) {
      held.push(() => (send as any)(data, ...args));
      return;
    }
    (send as any)(data, ...args);
  }) as typeof socket.send;
  return {
    count: () => held.length,
    release() {
      holding = false;
      for (const frame of held.splice(0)) frame();
    },
  };
}

/** Every frame the client's sockets get, tagged with the socket's index. */
const clientFrames: string[] = [];
let clientSocketCount = 0;
class LoggingWebSocket extends WebSocket {
  constructor(...args: ConstructorParameters<typeof WebSocket>) {
    super(...args);
    const index = clientSocketCount++;
    this.addEventListener('message', ({ data }) => {
      // oxlint-disable-next-line typescript/no-base-to-string
      clientFrames.push(`${index}< ${String(data)}`);
    });
    const send = this.send.bind(this);
    this.send = ((data: unknown, ...rest: unknown[]) => {
      clientFrames.push(`${index}> ${String(data)}`);
      return (send as any)(data, ...rest);
    }) as typeof this.send;
    this.addEventListener('close', () => clientFrames.push(`${index} closed`));
  }
}
beforeEach(() => {
  clientFrames.length = 0;
  clientSocketCount = 0;
});

function setup(
  wsClient: Partial<WebSocketClientOptions> = {},
  extra: { encoder?: Encoder; links?: (wsClient: any) => any[] } = {},
) {
  const t = initTRPC.create();
  const ee = new EventEmitter();
  const log: number[] = [];
  const eventsSubscribed = vi.fn();
  const mutationRuns = vi.fn();
  let slow = createDeferred<string>();
  /** When set, a stopped `events` subscription's cleanup waits on it. */
  let cleanupGate: Promise<void> | null = null;
  const cleanupEntered = vi.fn();
  /** When set, the nth `events` call (1-based) throws before `started`. */
  let failSubscribeCall: number | null = null;
  let subscribeCalls = 0;
  let subscriptionGate: Promise<void> | null = null;
  const retry = { delayMs: 20 };
  let connectionParamsGate: Promise<void> | null = null;

  const router = t.router({
    greeting: t.procedure.query(() => 'hello'),
    slow: t.procedure.query(() => slow.promise),
    mut: t.procedure.mutation(async () => {
      mutationRuns();
      await slow.promise;
      return 'done';
    }),
    events: t.procedure
      .use(async (opts) => {
        subscribeCalls++;
        if (failSubscribeCall === subscribeCalls) {
          throw new Error('subscribe refused');
        }
        await subscriptionGate;
        return opts.next();
      })
      .input(z.object({ lastEventId: z.string().nullish() }).optional())
      .subscription(async function* (opts) {
        eventsSubscribed(opts.input?.lastEventId ?? null);
        let index = Number(opts.input?.lastEventId ?? 0);
        const pushed = on(ee, 'push', { signal: opts.signal });
        try {
          while (true) {
            while (index < log.length) {
              index++;
              yield tracked(String(index), log[index - 1]!);
            }
            await pushed.next();
          }
        } finally {
          cleanupEntered();
          await cleanupGate;
        }
      }),
    values: t.procedure
      .use(async (opts) => {
        await subscriptionGate;
        return opts.next();
      })
      .subscription(() =>
        observable<number>((emit) => {
          const onValue = (value: number) => emit.next(value);
          ee.on('value', onValue);
          return () => {
            ee.off('value', onValue);
          };
        }),
      ),
  });

  const ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: {
      lazy: { enabled: false, closeMs: 0 },
      retryDelayMs: () => retry.delayMs,
      WebSocket: LoggingWebSocket as any,
      connectionParams: async () => {
        await connectionParamsGate;
        return { token: 'ok' };
      },
      experimental_encoder: extra.encoder,
      ...wsClient,
    },
    wssServer: { experimental_encoder: extra.encoder } as any,
    ...(extra.links
      ? { client: ({ wsClient: c }: any) => ({ links: extra.links!(c) }) }
      : {}),
  });

  const received: {
    socket: WebSocket;
    id: unknown;
    method: unknown;
    path: unknown;
  }[] = [];
  const serverSockets: WebSocket[] = [];
  ctx.wss.on('connection', (socket) => {
    serverSockets.push(socket);
    socket.on('message', (data) => {
      // oxlint-disable-next-line typescript/no-base-to-string
      const text = data.toString();
      if (text === 'PING' || text === 'PONG') return;
      const json = text.startsWith('BINARY:') ? text.slice(7) : text;
      for (const message of [JSON.parse(json)].flat()) {
        if (message.method === 'connectionParams') continue;
        received.push({
          socket,
          id: message.id,
          method: message.method,
          path: message.params?.path,
        });
      }
    });
  });
  const receivedFor = (path: string) =>
    received.filter((request) => request.path === path);

  return {
    ctx,
    ee,
    retry,
    eventsSubscribed,
    mutationRuns,
    cleanupEntered,
    receivedFor,
    serverSockets,
    push(value: number) {
      log.push(value);
      ee.emit('push');
    },
    resolveSlow(value = 'slow') {
      slow.resolve(value);
      slow = createDeferred<string>();
    },
    holdConnectionParams() {
      const gate = createDeferred<void>();
      connectionParamsGate = gate.promise;
      return gate;
    },
    holdCleanup() {
      const gate = createDeferred<void>();
      cleanupGate = gate.promise;
      return gate;
    },
    holdSubscriptions() {
      const gate = createDeferred<void>();
      subscriptionGate = gate.promise;
      return gate;
    },
    failSubscribeCall(n: number) {
      failSubscribeCall = n;
    },
    async waitForOpen() {
      await vi.waitFor(() => {
        expect(ctx.wsClient.connection?.state).toBe('open');
      });
      return {
        oldClientSocket: ctx.wsClient.connection!.ws,
        oldServerSocket: serverSockets[0]!,
      };
    },
  };
}

function observe(seen: unknown[]) {
  const push = seen.push.bind(seen);
  seen.push = (...items: unknown[]) => {
    clientFrames.push(`seen ${items.map(String).join(',')}`);
    return push(...items);
  };
  return {
    onStarted: () => seen.push('started'),
    onStopped: () => seen.push('stopped'),
    onComplete: () => seen.push('complete'),
    onError: (error: any) => seen.push(`error: ${error?.message}`),
  };
}

describe('make before break', () => {
  test('the new socket lost after the move: the subscription is resent on the old socket with a fresh id, as that one still holds the stopped one', async () => {
    const h = setup();
    await using _ctx = h.ctx;
    await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    // keeps the old socket open after the move
    const slowQuery = h.ctx.client.slow.query();
    let cleanup: ReturnType<typeof h.holdCleanup> | undefined;
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      await vi.waitFor(() => expect(seen).toContain(1));
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(1));

      cleanup = h.holdCleanup();
      h.ctx.wssHandler.broadcastReconnectNotification();
      // the old socket got the stop, and its cleanup is pending
      await vi.waitFor(() => expect(h.cleanupEntered).toHaveBeenCalledTimes(1));
      const newServerSocket = h.serverSockets[1]!;
      expect(h.receivedFor('events')[1]!.socket).toBe(newServerSocket);

      h.retry.delayMs = 5_000;
      newServerSocket.terminate();
      // the subscription is sent again on the old socket, with a fresh id
      await vi.waitFor(() => expect(h.receivedFor('events')).toHaveLength(3));
      expect(
        h
          .receivedFor('events')
          .map((r) => [h.serverSockets.indexOf(r.socket), r.id]),
      ).toEqual([
        [0, 1],
        [1, 1],
        [0, 3],
      ]);
      await new Promise((r) => setTimeout(r, 100));
      h.push(2);
      await new Promise((r) => setTimeout(r, 100));
      expect([...seen]).toEqual(['started', 1, 'started', 2]);
    } finally {
      cleanup?.resolve();
      h.resolveSlow();
      await slowQuery.catch(() => null);
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test("the new socket lost after the move: the old socket's late `stopped` for the stopped subscription doesn't end the resent one", async () => {
    const h = setup();
    await using _ctx = h.ctx;
    const { oldServerSocket } = await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    const slowQuery = h.ctx.client.slow.query();
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      await vi.waitFor(() => expect(seen).toContain(1));
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(1));

      const stoppedFrames = holdSent(
        oldServerSocket,
        (m) => m.result?.type === 'stopped',
      );
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(stoppedFrames.count()).toBe(1));
      // The next replacement waits, so the subscription stays on the old socket.
      h.retry.delayMs = 5_000;
      h.serverSockets[1]!.terminate();
      // the subscription is sent again on the old socket
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(3),
      );
      expect(h.receivedFor('events')[2]!.socket).toBe(oldServerSocket);
      await new Promise((r) => setTimeout(r, 50));

      // the `stopped` for the instance stopped before the new socket was lost
      stoppedFrames.release();
      await new Promise((r) => setTimeout(r, 50));
      h.push(2);
      await new Promise((r) => setTimeout(r, 100));
      const snapshot = [...seen];
      expect(snapshot).toEqual(['started', 1, 'started', 2]);
    } finally {
      h.resolveSlow();
      await slowQuery.catch(() => null);
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test('a second reconnect notice mid-move, then the third socket lost while the second is open: the subscription is resent on the second with a fresh id', async () => {
    const h = setup();
    await using _ctx = h.ctx;
    await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    let gate: ReturnType<typeof h.holdSubscriptions> | undefined;
    let slowQuery: Promise<unknown> | undefined;
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      await vi.waitFor(() => expect(seen).toContain(1));

      gate = h.holdSubscriptions();
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(h.receivedFor('events')).toHaveLength(2));
      // B is the active socket now; a slow query keeps it open later
      slowQuery = h.ctx.client.slow.query().catch(() => null);
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(1));
      expect(h.receivedFor('slow')[0]!.socket).toBe(h.serverSockets[1]);

      // B -> C while the move to B is pending: it moves on to C at once,
      // and is stopped on B; A serves it until C confirms it
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(h.receivedFor('events')).toHaveLength(3));
      expect(h.receivedFor('events')[2]!.socket).toBe(h.serverSockets[2]);
      const stops = () =>
        clientFrames.filter((f) => f.includes('subscription.stop'));
      await vi.waitFor(() =>
        expect(stops()).toEqual(['1> {"id":1,"method":"subscription.stop"}']),
      );
      gate.resolve();
      await vi.waitFor(() =>
        expect(stops()).toEqual([
          '1> {"id":1,"method":"subscription.stop"}',
          '0> {"id":1,"method":"subscription.stop"}',
        ]),
      );

      h.retry.delayMs = 5_000;
      h.serverSockets[2]!.terminate();
      await vi.waitFor(() => expect(h.receivedFor('events')).toHaveLength(4));
      expect(
        h
          .receivedFor('events')
          .map((r) => [h.serverSockets.indexOf(r.socket), r.id]),
      ).toEqual([
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 3],
      ]);
      await new Promise((r) => setTimeout(r, 100));
      h.push(2);
      await new Promise((r) => setTimeout(r, 100));
      expect([...seen]).toEqual(['started', 1, 'started', 2]);
    } finally {
      gate?.resolve();
      h.resolveSlow();
      await slowQuery;
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test('the successor answers the resubscribe with an error: the subscriber gets it once, the old socket stops and closes', async () => {
    const h = setup();
    await using _ctx = h.ctx;
    const { oldClientSocket } = await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      await vi.waitFor(() => expect(seen).toContain(1));
      h.failSubscribeCall(2);
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() =>
        expect(seen.at(-1)).toBe('error: subscribe refused'),
      );
      await vi.waitFor(() =>
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED),
      );
      await vi.waitFor(() => expect(h.cleanupEntered).toHaveBeenCalledTimes(1));
      h.push(2);
      await new Promise((r) => setTimeout(r, 50));
      expect([...seen]).toEqual(['started', 1, 'error: subscribe refused']);
      expect(h.ctx.wsClient.connection?.state).toBe('open');
    } finally {
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test('unsubscribing mid-move stops it on both sockets, and the old socket closes', async () => {
    const h = setup();
    await using _ctx = h.ctx;
    const { oldClientSocket } = await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    let gate: ReturnType<typeof h.holdSubscriptions> | undefined;
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      await vi.waitFor(() => expect(seen).toContain(1));
      gate = h.holdSubscriptions();
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(h.receivedFor('events')).toHaveLength(2));
      sub.unsubscribe();
      await vi.waitFor(() =>
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED),
      );
      gate.resolve();
      await new Promise((r) => setTimeout(r, 50));
      h.push(2);
      await new Promise((r) => setTimeout(r, 50));
      expect([...seen]).toEqual(['started', 1, 'complete']);
      // the new socket's copy is stopped too
      expect(
        clientFrames.filter(
          (f) => f.startsWith('1> ') && f.includes('subscription.stop'),
        ),
      ).toHaveLength(1);
    } finally {
      gate?.resolve();
      await h.ctx.wsClient.close();
    }
  });

  test('close() mid-move with a query pending on the old socket resolves and closes every socket', async () => {
    const h = setup();
    await using _ctx = h.ctx;
    const { oldClientSocket } = await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    const gate = h.holdSubscriptions();
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(0),
      );
      gate.resolve();
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      const slow = h.ctx.client.slow.query();
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(1));
      const gate2 = h.holdSubscriptions();
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(h.receivedFor('events')).toHaveLength(2));
      const newClientSocket = h.ctx.wsClient.connection!.ws;
      expect(newClientSocket).not.toBe(oldClientSocket);
      const closing = h.ctx.wsClient.close();
      setTimeout(() => h.resolveSlow('late'), 50);
      await closing;
      expect(await slow).toBe('late');
      gate2.resolve();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
        expect(newClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      expect([...seen]).toEqual(['started', 'complete']);
      expect(h.ctx.wsClient.connectionState.get().state).toBe('idle');
    } finally {
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test('a mutation in flight on the new socket when it is lost fails once and runs once; the old socket serves again', async () => {
    const h = setup();
    await using _ctx = h.ctx;
    const { oldServerSocket } = await h.waitForOpen();
    const slow = h.ctx.client.slow.query();
    try {
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(1));
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(h.serverSockets).toHaveLength(2));
      await vi.waitFor(() =>
        expect(h.ctx.wsClient.connection!.ws).not.toBe(undefined),
      );
      await vi.waitFor(() =>
        expect(
          clientFrames.some((f) => f.startsWith('1>') || f === '1< PONG') ||
            h.ctx.wsClient.connection?.state === 'open',
        ).toBe(true),
      );
      const states: string[] = [];
      h.ctx.wsClient.connectionState.subscribe({
        next: ({ state }) => states.push(state),
      });
      // wait until the swap
      await vi.waitFor(async () => {
        await h.ctx.client.greeting.query();
        expect(h.receivedFor('greeting').at(-1)!.socket).toBe(
          h.serverSockets[1],
        );
      });
      const mutation = h.ctx.client.mut.mutate();
      mutation.catch(() => null);
      await vi.waitFor(() => expect(h.mutationRuns).toHaveBeenCalledOnce());
      expect(h.receivedFor('mut').at(-1)!.socket).toBe(h.serverSockets[1]);
      h.retry.delayMs = 5_000;
      h.serverSockets[1]!.terminate();
      await expect(mutation).rejects.toThrow();
      expect(await h.ctx.client.greeting.query()).toBe('hello');
      expect(h.receivedFor('greeting').at(-1)!.socket).toBe(oldServerSocket);
      await new Promise((r) => setTimeout(r, 100));
      expect(h.mutationRuns).toHaveBeenCalledOnce();
      expect(states.filter((s) => s === 'connecting')).toEqual([]);
    } finally {
      h.resolveSlow();
      await slow.catch(() => null);
      await h.ctx.wsClient.close();
    }
  });

  test('keepAlive pings on both sockets during an untracked move lose nothing', async () => {
    const h = setup({
      keepAlive: { enabled: true, intervalMs: 5, pongTimeoutMs: 1000 },
    });
    await using _ctx = h.ctx;
    const { oldClientSocket } = await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.values.subscribe(undefined, {
      onData: (v) => seen.push(v),
    });
    let gate: ReturnType<typeof h.holdSubscriptions> | undefined;
    try {
      await vi.waitFor(() => expect(h.ee.listenerCount('value')).toBe(1));
      h.ee.emit('value', 1);
      await vi.waitFor(() => expect(seen).toContain(1));
      gate = h.holdSubscriptions();
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(h.receivedFor('values')).toHaveLength(2));
      for (let i = 2; i <= 20; i++) {
        h.ee.emit('value', i);
        await new Promise((r) => setTimeout(r, 2));
      }
      gate.resolve();
      for (let i = 21; i <= 40; i++) {
        h.ee.emit('value', i);
        await new Promise((r) => setTimeout(r, 2));
      }
      await vi.waitFor(() =>
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED),
      );
      h.ee.emit('value', 41);
      await vi.waitFor(() => expect(seen).toContain(41));
      // at-least-once: nothing missing
      for (let i = 1; i <= 41; i++) expect(seen).toContain(i);
    } finally {
      gate?.resolve();
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test('a second reconnect while the old socket drains a slow query: tracked events once each, all extra sockets close', async () => {
    const h = setup();
    await using _ctx = h.ctx;
    await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    let slow: Promise<unknown> | undefined;
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      slow = h.ctx.client.slow.query();
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(1));
      h.ctx.wssHandler.broadcastReconnectNotification();
      h.push(2);
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(2),
      );
      h.push(3);
      h.ctx.wssHandler.broadcastReconnectNotification();
      h.push(4);
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(3),
      );
      h.push(5);
      h.resolveSlow();
      expect(await slow).toBe('slow');
      h.push(6);
      await vi.waitFor(() => expect(seen).toContain(6));
      await vi.waitFor(() => {
        const open = h.serverSockets.filter(
          (s) => s.readyState === WebSocket.OPEN,
        );
        expect(open).toHaveLength(1);
      });
      expect([...seen]).toEqual(['started', 1, 2, 3, 4, 5, 6]);
    } finally {
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test('server restart mid-handover: the subscription resumes once with no gap or duplicate', async () => {
    const h = setup();
    await using _ctx = h.ctx;
    await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    const slow = h.ctx.client.slow.query();
    let gate: ReturnType<typeof h.holdSubscriptions> | undefined;
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      await vi.waitFor(() => expect(seen).toContain(1));
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(1));
      gate = h.holdSubscriptions();
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(h.receivedFor('events')).toHaveLength(2));
      h.push(2);
      await vi.waitFor(() => expect(seen).toContain(2));
      // every socket dies at once
      for (const socket of h.serverSockets) socket.terminate();
      gate.resolve();
      await expect(slow).rejects.toThrow();
      await vi.waitFor(() =>
        expect(h.eventsSubscribed.mock.calls.length).toBeGreaterThanOrEqual(3),
      );
      h.push(3);
      await vi.waitFor(() => expect(seen).toContain(3));
      await new Promise((r) => setTimeout(r, 100));
      expect(seen.filter((x) => typeof x === 'number')).toEqual([1, 2, 3]);
      const open = h.serverSockets.filter(
        (s) => s.readyState === WebSocket.OPEN,
      );
      expect(open).toHaveLength(1);
    } finally {
      gate?.resolve();
      h.resolveSlow();
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test('lazy mode: a move, then unsubscribing, closes every socket and the client goes idle', async () => {
    const h = setup({ lazy: { enabled: true, closeMs: 50 } });
    await using _ctx = h.ctx;
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(2),
      );
      h.push(2);
      await vi.waitFor(() => expect(seen).toContain(2));
      await vi.waitFor(() =>
        expect(h.serverSockets[0]!.readyState).toBe(WebSocket.CLOSED),
      );
      sub.unsubscribe();
      await vi.waitFor(() => {
        for (const s of h.serverSockets)
          expect(s.readyState).toBe(WebSocket.CLOSED);
        expect(h.ctx.wsClient.connectionState.get().state).toBe('idle');
      });
      expect([...seen]).toEqual(['started', 1, 2, 'complete']);
      expect(await h.ctx.client.greeting.query()).toBe('hello');
    } finally {
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test('the new socket closing while its connectionParams are pending: the old socket keeps serving, with no `connecting`', async () => {
    const h = setup();
    await using _ctx = h.ctx;
    const { oldServerSocket, oldClientSocket } = await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    let params: ReturnType<typeof h.holdConnectionParams> | undefined;
    const states: string[] = [];
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      await vi.waitFor(() => expect(seen).toContain(1));
      h.ctx.wsClient.connectionState.subscribe({
        next: ({ state, error }) =>
          states.push(
            error
              ? `${state}: ${error.message} / ${(error.cause as any)?.cause?.message}`
              : state,
          ),
      });

      params = h.holdConnectionParams();
      h.ctx.wssHandler.broadcastReconnectNotification();
      // B is open on the server, its connectionParams aren't sent yet
      await vi.waitFor(() => expect(h.serverSockets).toHaveLength(2));
      h.retry.delayMs = 1_000;
      h.serverSockets[1]!.terminate();
      await vi.waitFor(() => expect(clientFrames).toContain('1 closed'));
      params.resolve();
      await new Promise((r) => setTimeout(r, 50));

      // the old socket is healthy, so it should keep serving
      expect(oldClientSocket.readyState).toBe(WebSocket.OPEN);
      const started = Date.now();
      expect(await h.ctx.client.greeting.query()).toBe('hello');
      const tookMs = Date.now() - started;
      expect({
        states: states.slice(1),
        greetingSocket: h.serverSockets.indexOf(
          h.receivedFor('greeting')[0]!.socket,
        ),
      }).toEqual({ states: [], greetingSocket: 0 });
      // It didn't wait out the backoff.
      expect(tookMs).toBeLessThan(h.retry.delayMs / 2);
      expect(oldServerSocket).toBeDefined();
    } finally {
      params?.resolve();
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test('the new socket closing while its connectionParams are pending, with nothing in flight: the old socket stays open and the state `pending`', async () => {
    const h = setup();
    await using _ctx = h.ctx;
    await h.waitForOpen();
    let params: ReturnType<typeof h.holdConnectionParams> | undefined;
    try {
      params = h.holdConnectionParams();
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(h.serverSockets).toHaveLength(2));
      h.serverSockets[1]!.terminate();
      await vi.waitFor(() => expect(clientFrames).toContain('1 closed'));
      params.resolve();
      await new Promise((r) => setTimeout(r, 300));
      expect({
        state: h.ctx.wsClient.connectionState.get().state,
        openServerSockets: h.serverSockets.filter(
          (s) => s.readyState === WebSocket.OPEN,
        ).length,
      }).toEqual({ state: 'pending', openServerSockets: 1 });
    } finally {
      params?.resolve();
      await h.ctx.wsClient.close();
    }
  });

  test('binary encoder: a tracked move gets every event once and the old socket closes', async () => {
    const binary: Encoder = {
      encode: (data) =>
        new TextEncoder().encode(`BINARY:${JSON.stringify(data)}`),
      decode: (data) => {
        const str =
          typeof data === 'string'
            ? data
            : new TextDecoder().decode(
                data instanceof ArrayBuffer ? new Uint8Array(data) : data,
              );
        return JSON.parse(str.startsWith('BINARY:') ? str.slice(7) : str);
      },
    };
    const h = setup({}, { encoder: binary });
    await using _ctx = h.ctx;
    const { oldClientSocket } = await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    let gate: ReturnType<typeof h.holdSubscriptions> | undefined;
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      await vi.waitFor(() => expect(seen).toContain(1));
      gate = h.holdSubscriptions();
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(h.receivedFor('events')).toHaveLength(2));
      h.push(2);
      h.push(3);
      await vi.waitFor(() => expect(seen).toContain(3));
      gate.resolve();
      h.push(4);
      await vi.waitFor(() => expect(seen).toContain(4));
      await vi.waitFor(() =>
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED),
      );
      h.push(5);
      await vi.waitFor(() => expect(seen).toContain(5));
      expect([...seen]).toEqual(['started', 1, 2, 3, 4, 5]);
    } finally {
      gate?.resolve();
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });

  test('retryLink: a query lost with the new socket is retried once on the old socket', async () => {
    const h = setup(
      {},
      {
        links: (c) => [
          retryLink({ retry: (o) => o.attempts < 3, retryDelayMs: () => 0 }),
          wsLink({ client: c }),
        ],
      },
    );
    await using _ctx = h.ctx;
    const { oldServerSocket } = await h.waitForOpen();
    const slow = h.ctx.client.slow.query();
    let second: Promise<unknown> | undefined;
    try {
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(1));
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => expect(h.serverSockets).toHaveLength(2));
      await vi.waitFor(async () => {
        expect(await h.ctx.client.greeting.query()).toBe('hello');
        expect(h.receivedFor('greeting').at(-1)!.socket).toBe(
          h.serverSockets[1],
        );
      });
      second = h.ctx.client.slow.query();
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(2));
      h.retry.delayMs = 5_000;
      h.serverSockets[1]!.terminate();
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(3));
      expect(h.receivedFor('slow')[2]!.socket).toBe(oldServerSocket);
      h.resolveSlow('done');
      expect(await slow).toBe('done');
      expect(await second).toBe('done');
      expect(h.receivedFor('slow')).toHaveLength(3);
    } finally {
      h.resolveSlow();
      await h.ctx.wsClient.close();
    }
  });

  test("new socket lost after the old one's `stopped` arrived: the resend on the old socket works", async () => {
    const h = setup();
    await using _ctx = h.ctx;
    await h.waitForOpen();
    const seen: unknown[] = [];
    const sub = h.ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    const slowQuery = h.ctx.client.slow.query();
    try {
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(1),
      );
      h.push(1);
      await vi.waitFor(() => expect(seen).toContain(1));
      await vi.waitFor(() => expect(h.receivedFor('slow')).toHaveLength(1));
      h.ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() =>
        expect(clientFrames).toContain(
          '0< {"id":1,"result":{"type":"stopped"}}',
        ),
      );
      h.retry.delayMs = 5_000;
      h.serverSockets[1]!.terminate();
      await vi.waitFor(() =>
        expect(h.eventsSubscribed).toHaveBeenCalledTimes(3),
      );
      await new Promise((r) => setTimeout(r, 50));
      h.push(2);
      await vi.waitFor(() => expect(seen).toContain(2));
      expect([...seen]).toEqual(['started', 1, 'started', 2]);
    } finally {
      h.resolveSlow();
      await slowQuery.catch(() => null);
      sub.unsubscribe();
      await h.ctx.wsClient.close();
    }
  });
});
