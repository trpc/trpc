import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';

test('close() stops a subscription on the server while a query keeps the socket open', async () => {
  const t = initTRPC.create();
  const subscribed = createDeferred<void>();
  const stopped = createDeferred<void>();
  const pendingStarted = createDeferred<void>();
  const pending = createDeferred<string>();
  const router = t.router({
    pending: t.procedure.query(() => {
      pendingStarted.resolve();
      return pending.promise;
    }),
    sub: t.procedure.subscription(async function* ({ signal }) {
      subscribed.resolve();
      await new Promise((resolve) =>
        signal!.addEventListener('abort', resolve, { once: true }),
      );
      stopped.resolve();
      yield 'never';
    }),
  });
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
  });

  const completed = vi.fn();
  const subscription = ctx.client.sub.subscribe(undefined, {
    onComplete: completed,
  });
  await subscribed.promise;
  const query = ctx.client.pending.query();
  await pendingStarted.promise;

  const closed = ctx.wsClient.close();
  expect(completed).toHaveBeenCalledOnce();
  await stopped.promise;

  pending.resolve('done');
  expect(await query).toBe('done');
  await closed;
  subscription.unsubscribe();
});
