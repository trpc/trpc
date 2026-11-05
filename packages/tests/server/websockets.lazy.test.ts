import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';

function setup(opts: {
  connectionParams: () => Promise<Record<string, string>>;
}) {
  const t = initTRPC.create();
  const router = t.router({
    sub: t.procedure.subscription(async function* () {
      yield 'never';
    }),
  });
  return testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: {
      lazy: { enabled: true, closeMs: 20 },
      retryDelayMs: () => 10,
      connectionParams: opts.connectionParams,
    },
  });
}

test('a lazy client closes a socket left with nothing to do while connectionParams are pending', async () => {
  const opened = createDeferred<void>();
  await using ctx = setup({
    connectionParams: () => {
      opened.resolve();
      return createDeferred<Record<string, string>>().promise;
    },
  });

  const subscription = ctx.client.sub.subscribe(undefined, { onData: vi.fn() });
  await opened.promise;
  await vi.waitFor(() => expect(ctx.wss.clients.size).toBe(1));
  subscription.unsubscribe();

  await vi.waitFor(() => {
    expect(ctx.wss.clients.size).toBe(0);
    expect(ctx.wsClient.connectionState.get().state).toBe('idle');
  });
});

test('a lazy client stops retrying a failed open once its last request ends', async () => {
  let attempts = 0;
  await using ctx = setup({
    connectionParams: async () => {
      attempts++;
      throw new Error('no params');
    },
  });

  const subscription = ctx.client.sub.subscribe(undefined, { onData: vi.fn() });
  await vi.waitFor(() => expect(attempts).toBeGreaterThanOrEqual(2));
  subscription.unsubscribe();
  // An attempt under way when the request ended may still fail.
  const ended = attempts + 1;

  await vi.waitFor(() => {
    expect(ctx.wsClient.connectionState.get().state).toBe('idle');
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(attempts).toBeLessThanOrEqual(ended);
  expect(ctx.wsClient.connectionState.get().state).toBe('idle');
});
