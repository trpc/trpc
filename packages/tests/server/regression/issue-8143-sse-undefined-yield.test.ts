import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';

test('subscription yielding undefined over httpSubscriptionLink', async () => {
  const t = initTRPC.create();
  const router = t.router({
    signal: t.procedure.subscription(async function* () {
      yield 1;
      yield undefined;
      yield 3;
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpSubscriptionLink',
  });

  const onData = vi.fn();
  const onError = vi.fn();
  const onComplete = vi.fn();
  const subscription = ctx.client.signal.subscribe(undefined, {
    onData,
    onError,
    onComplete,
  });

  // Wait for the stream to end either way, so a parse error fails the test
  // with that error instead of a timeout
  await vi.waitFor(() => {
    expect(onComplete.mock.calls.length + onError.mock.calls.length).toBe(1);
  });
  subscription.unsubscribe();

  expect(onError.mock.calls[0]?.[0]).toBeUndefined();
  expect(onData.mock.calls).toEqual([[1], [undefined], [3]]);
});
