import { EventEmitter, on } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { TRPCClientError } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import { initTRPC, tracked } from '@trpc/server';
import {
  createDeferred,
  makeAsyncResource,
} from '@trpc/server/unstable-core-do-not-import';
import { WebSocket } from 'ws';
import { z } from 'zod';

/**
 * A server-requested reconnect is make-before-break: subscriptions stay on the
 * old socket until the new one is open and has sent its connectionParams, then
 * move with their `lastEventId`.
 */
function setup(opts: {
  connectionParams: (attempt: number) => Promise<Record<string, string>>;
}) {
  const t = initTRPC.create();
  const ee = new EventEmitter();
  const events: number[] = [];
  const subscribedFrom = vi.fn<(lastEventId: string | null) => void>();
  const router = t.router({
    events: t.procedure
      .input(z.object({ lastEventId: z.string().nullish() }).optional())
      .subscription(async function* (subOpts) {
        subscribedFrom(subOpts.input?.lastEventId ?? null);
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

  return makeAsyncResource(
    Object.assign(ctx, {
      onOpen,
      states,
      subscribedFrom,
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

test('a subscription keeps receiving on the old socket while the new one fails to open', async () => {
  let failParams = true;
  const attempts = vi.fn();
  await using ctx = setup({
    connectionParams: async (attempt) => {
      attempts();
      if (attempt > 1 && failParams) throw new Error('token unavailable');
      return {};
    },
  });
  const data: number[] = [];
  const sub = ctx.client.events.subscribe(undefined, {
    onData: (envelope) => data.push(envelope.data),
  });
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1]));

  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => {
    expect(attempts.mock.calls.length).toBeGreaterThan(2);
  });
  expect(ctx.subscribedFrom).toHaveBeenCalledTimes(1);
  ctx.push();
  await vi.waitFor(() => expect(data).toEqual([1, 2]));
  expect(ctx.wsClient.connectionState.get().state).toBe('pending');

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
