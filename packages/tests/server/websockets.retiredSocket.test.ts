import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import {
  createDeferred,
  makeAsyncResource,
} from '@trpc/server/unstable-core-do-not-import';

/**
 * A socket the server asked to replace is retired: it answers the requests
 * already sent on it and nothing else reaches the client from it.
 */
function setup() {
  const release = createDeferred<void>();
  const executions = vi.fn();
  const onOpen = vi.fn();
  const retryDelayMs = vi.fn((_attemptIndex: number) => 0);
  const t = initTRPC.create();
  const router = t.router({
    greeting: t.procedure.query(() => 'hello'),
    held: t.procedure.query(async () => {
      executions();
      await release.promise;
      return 'released';
    }),
    charge: t.procedure.mutation(async () => {
      executions();
      await release.promise;
      return 'charged';
    }),
  });
  const ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: { lazy: { enabled: false, closeMs: 0 }, retryDelayMs, onOpen },
  });
  return makeAsyncResource(
    Object.assign(ctx, { release, executions, onOpen, retryDelayMs }),
    async () => {
      release.resolve();
      for (const ws of ctx.wss.clients) ws.resume();
      await ctx.wsClient.close();
    },
  );
}

// https://github.com/trpc/trpc/pull/7910#pullrequestreview-5776991146
test('a mutation in flight is not executed a second time on the replacement', async () => {
  await using ctx = setup();
  await vi.waitFor(() => expect(ctx.onOpen).toHaveBeenCalledTimes(1));
  const result = ctx.client.charge.mutate();
  await vi.waitFor(() => expect(ctx.executions).toHaveBeenCalledTimes(1));

  // the old server is slow to answer the closing handshake
  const oldServerSocket = [...ctx.wss.clients][0]!;
  oldServerSocket.pause();
  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(ctx.onOpen).toHaveBeenCalledTimes(2));
  expect(await ctx.client.greeting.query()).toBe('hello');

  expect(ctx.executions).toHaveBeenCalledTimes(1);
  oldServerSocket.resume();
  ctx.release.resolve();
  expect(await result).toBe('charged');
  expect(ctx.executions).toHaveBeenCalledTimes(1);
});

test("a retired socket's connection-level frames don't reach the client, its answers do", async () => {
  await using ctx = setup();
  await vi.waitFor(() => expect(ctx.onOpen).toHaveBeenCalledTimes(1));
  const held = ctx.client.held.query();
  await vi.waitFor(() => expect(ctx.executions).toHaveBeenCalledTimes(1));

  const oldServerSocket = [...ctx.wss.clients][0]!;
  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => expect(ctx.onOpen).toHaveBeenCalledTimes(2));
  expect(ctx.retryDelayMs.mock.calls).toEqual([[0]]);

  // A late rejection used to make the replacement's next reconnect carry on
  // with the backoff, and a late reconnect notice used to retire the
  // replacement.
  oldServerSocket.send(
    JSON.stringify({
      id: null,
      error: { message: 'late', code: -32001, data: { code: 'UNAUTHORIZED' } },
    }),
  );
  oldServerSocket.send(JSON.stringify({ id: null, method: 'reconnect' }));
  expect(await ctx.client.greeting.query()).toBe('hello');

  ctx.release.resolve();
  expect(await held).toBe('released');
  await vi.waitFor(() => expect(ctx.wss.clients.size).toBe(1));
  expect(ctx.onOpen).toHaveBeenCalledTimes(2);

  // drop the healthy replacement from the server side
  for (const ws of ctx.wss.clients) ws.close();
  await vi.waitFor(() => expect(ctx.onOpen).toHaveBeenCalledTimes(3));
  expect(ctx.retryDelayMs.mock.calls).toEqual([[0], [0]]);
});
