import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';

test('a subscription that fails before it streams calls onError once', async () => {
  const t = initTRPC.create();
  const router = t.router({
    onEvent: t.procedure
      .use(() => {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in' });
      })
      .subscription(async function* () {
        yield 1;
      }),
  });
  await using ctx = testServerAndClientResource(router);

  const onError = vi.fn();
  const subscription = ctx.client.onEvent.subscribe(undefined, { onError });
  using _subscription = makeResource(subscription, () =>
    subscription.unsubscribe(),
  );

  await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  expect(onError.mock.calls[0]![0]).toBeInstanceOf(TRPCClientError);
  expect(onError.mock.calls[0]![0].data).toMatchObject({
    code: 'UNAUTHORIZED',
  });
  expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
  expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({
    path: 'onEvent',
    type: 'subscription',
    error: { code: 'UNAUTHORIZED' },
  });
});
