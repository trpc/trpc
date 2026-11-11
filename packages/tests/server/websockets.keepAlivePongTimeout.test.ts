// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import {
  createDeferred,
  makeAsyncResource,
} from '@trpc/server/unstable-core-do-not-import';
import type { WebSocket, WebSocketServer } from 'ws';

const t = initTRPC.create();
const router = t.router({
  greeting: t.procedure.query(() => 'hello'),
  pending: t.procedure.query(() => new Promise<never>(() => null)),
  onStart: t.procedure.subscription(() =>
    observable<string>((emit) => {
      emit.next('started');
    }),
  ),
});

const wsClient = {
  lazy: { enabled: false, closeMs: 0 },
  keepAlive: { enabled: true, intervalMs: 50, pongTimeoutMs: 50 },
};

// A paused server socket is unresponsive: no pong, and no reply to the
// closing handshake, which `ws` would wait 30s for.
function trackServerSockets(
  ctx: { wss: WebSocketServer },
  pause: (index: number) => boolean,
) {
  const serverSockets: WebSocket[] = [];
  ctx.wss.on('connection', (ws) => {
    if (pause(serverSockets.length)) ws.pause();
    serverSockets.push(ws);
  });
  return serverSockets;
}

// https://github.com/trpc/trpc/issues/6562
test('a keepAlive pong timeout reconnects without waiting for the closing handshake', async () => {
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient,
  });
  const serverSockets = trackServerSockets(ctx, () => false);
  await using _cleanup = makeAsyncResource({}, async () => {
    for (const ws of serverSockets) ws.terminate();
  });

  expect(await ctx.client.greeting.query()).toBe('hello');
  serverSockets[0]!.pause();

  await vi.waitFor(() => expect(serverSockets).toHaveLength(2), {
    timeout: 1_000,
  });
});

test('a keepAlive pong timeout reconnects while connectionParams are still pending', async () => {
  const stalledParams = createDeferred<Record<string, string>>();
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: {
      ...wsClient,
      retryDelayMs: () => 0,
      connectionParams: vi
        .fn<() => Promise<Record<string, string>>>()
        .mockReturnValueOnce(stalledParams.promise)
        .mockResolvedValue({}),
    },
  });
  const serverSockets = trackServerSockets(ctx, (index) => index === 0);
  await using _cleanup = makeAsyncResource({}, async () => {
    stalledParams.resolve({});
    for (const ws of serverSockets) ws.terminate();
  });

  // Waits on the stalled attempt, so it needs that attempt given up on.
  const query = ctx.client.greeting.query();

  await vi.waitFor(() => expect(serverSockets).toHaveLength(2), {
    timeout: 1_000,
  });
  expect(await query).toBe('hello');
});

test('after a keepAlive pong timeout, the old socket is closed once and then ignored', async () => {
  const onClose = vi.fn();
  const onError = vi.fn();
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: { ...wsClient, onClose, onError },
  });
  const serverSockets: WebSocket[] = [];
  let subscriptionId: unknown;
  ctx.wss.on('connection', (ws) => {
    serverSockets.push(ws);
    ws.on('message', (raw) => {
      // oxlint-disable-next-line typescript/no-base-to-string
      const text = raw.toString();
      if (text.startsWith('{"id"')) subscriptionId ??= JSON.parse(text).id;
    });
  });
  await using _cleanup = makeAsyncResource({}, async () => {
    for (const ws of serverSockets) ws.terminate();
  });

  const onData = vi.fn();
  const sub = ctx.client.onStart.subscribe(undefined, { onData });
  await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
  const query = ctx.client.pending.query();
  query.catch(() => null);
  const [oldServerSocket] = serverSockets;
  const oldClientSocket = ctx.wsClient.connection!.ws as unknown as WebSocket;
  oldServerSocket!.pause();

  await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(2));
  await expect(query).rejects.toMatchObject({ name: 'TRPCClientError' });

  oldServerSocket!.send(
    JSON.stringify({
      id: subscriptionId,
      result: { type: 'data', data: 'late' },
    }),
  );
  oldClientSocket.emit('error', new Error('late error'));
  const oldSocketClosed = new Promise((resolve) =>
    oldServerSocket!.once('close', resolve),
  );
  oldServerSocket!.resume();
  await oldSocketClosed;
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(onData).toHaveBeenCalledTimes(2);
  expect(onError).not.toHaveBeenCalled();
  expect(onClose.mock.calls).toEqual([[{ code: 1006 }]]);
  sub.unsubscribe();
});

test('a server that never answers keeps the backoff growing across pong timeouts', async () => {
  const retryDelayMs = vi.fn((_attemptIndex: number) => 0);
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: { ...wsClient, retryDelayMs },
  });
  const serverSockets = trackServerSockets(ctx, () => true);
  await using _cleanup = makeAsyncResource({}, async () => {
    for (const ws of serverSockets) ws.terminate();
  });

  await vi.waitFor(
    () => expect(retryDelayMs.mock.calls.length).toBeGreaterThanOrEqual(3),
    { timeout: 1_000 },
  );
  expect(retryDelayMs.mock.calls.slice(0, 3)).toEqual([[1], [2], [3]]);
});
