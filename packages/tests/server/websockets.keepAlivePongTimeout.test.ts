// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import {
  createDeferred,
  makeResource,
} from '@trpc/server/unstable-core-do-not-import';
import type WebSocket from 'ws';

// https://github.com/trpc/trpc/issues/6562
test('a keepAlive pong timeout reconnects without waiting for the closing handshake', async () => {
  const t = initTRPC.create();
  const gate = createDeferred<void>();
  const subscriptionStarts = vi.fn();
  const router = t.router({
    greeting: t.procedure.query(() => 'hello'),
    pending: t.procedure.query(async () => {
      await gate.promise;
      return 'done';
    }),
    onStart: t.procedure.subscription(() =>
      observable<number>((emit) => {
        subscriptionStarts();
        emit.next(subscriptionStarts.mock.calls.length);
      }),
    ),
  });

  const onClose = vi.fn();
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: {
      lazy: { enabled: false, closeMs: 0 },
      retryDelayMs: () => 0,
      keepAlive: { enabled: true, intervalMs: 50, pongTimeoutMs: 50 },
      onClose,
    },
  });
  const serverSockets: WebSocket[] = [];
  ctx.wss.on('connection', (ws) => serverSockets.push(ws));
  using _cleanup = makeResource({}, () => {
    gate.resolve();
    for (const ws of serverSockets) ws.terminate();
  });

  const onData = vi.fn();
  const sub = ctx.client.onStart.subscribe(undefined, { onData });
  await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
  const query = ctx.client.pending.query();
  query.catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 10));

  // An unresponsive server: no pong, and no reply to the closing handshake,
  // which `ws` would wait 30s for.
  serverSockets[0]!.pause();

  await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(2), {
    timeout: 1_000,
  });
  await expect(query).rejects.toMatchObject({ name: 'TRPCClientError' });
  expect(serverSockets).toHaveLength(2);
  expect(onClose).toHaveBeenCalledTimes(1);

  // The old socket's own `close` event arrives once the server answers.
  const oldSocket = serverSockets[0]!;
  const oldSocketClosed = new Promise((resolve) =>
    oldSocket.once('close', resolve),
  );
  oldSocket.resume();
  await oldSocketClosed;
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(await ctx.client.greeting.query()).toBe('hello');
  expect(serverSockets).toHaveLength(2);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(subscriptionStarts).toHaveBeenCalledTimes(2);

  sub.unsubscribe();
});
