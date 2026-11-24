import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC, tracked } from '@trpc/server';
import { z } from 'zod';

/**
 * A subscription that yields an event without an id after a tracked event
 * used to lose its `lastEventId` over `wsLink`, so the resubscribe after a
 * reconnect couldn't resume after the tracked event. `httpSubscriptionLink`
 * and `retryLink` keep the last tracked id.
 * @see https://github.com/trpc/trpc/issues/8198
 */
test('wsLink resumes from the last tracked id after an untracked event', async () => {
  const subscribeCalls = vi.fn<(lastEventId: string | undefined) => void>();
  const t = initTRPC.create();
  const router = t.router({
    events: t.procedure
      .input(z.object({ lastEventId: z.string().optional() }).optional())
      .subscription(async function* (opts) {
        subscribeCalls(opts.input?.lastEventId);
        if (opts.input?.lastEventId === undefined) {
          yield tracked('1', 'tracked');
          yield 'untracked';
        }
        await new Promise((resolve) =>
          opts.signal?.addEventListener('abort', resolve),
        );
      }),
  });
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wsClient: {
      lazy: {
        enabled: false,
        closeMs: 0,
      },
      retryDelayMs: () => 10,
    },
  });

  const onData = vi.fn();
  const sub = ctx.client.events.subscribe(undefined, { onData });
  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(2);
  });

  ctx.destroyConnections();

  await vi.waitFor(() => {
    expect(subscribeCalls.mock.calls).toEqual([[undefined], ['1']]);
  });
  sub.unsubscribe();
});
