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
  const { client } = ctx;

  const onData = vi.fn();
  const onError = vi.fn();
  const onComplete = vi.fn();
  const subscription = client.signal.subscribe(undefined, {
    onData,
    onError,
    onComplete,
  });

  await vi.waitFor(
    () => {
      expect(onData).toHaveBeenCalledTimes(3);
    },
    {
      timeout: 5_000,
    },
  );
  expect(onData.mock.calls).toEqual([[1], [undefined], [3]]);
  expect(onError).not.toHaveBeenCalled();

  await vi.waitFor(
    () => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    },
    {
      timeout: 5_000,
    },
  );
  subscription.unsubscribe();
});
