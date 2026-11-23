import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { retryLink, wsLink } from '@trpc/client';
import { initTRPC, tracked, TRPCError } from '@trpc/server';
import { z } from 'zod';

function factory() {
  const queryCalls = vi.fn();
  const subscriptionCalls = vi.fn<(lastEventId: number | undefined) => void>();

  const t = initTRPC.create();
  const appRouter = t.router({
    flaky: t.procedure.query(() => {
      queryCalls();
      if (queryCalls.mock.calls.length === 1) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
      return 'ok';
    }),
    onEvent: t.procedure
      .input(z.object({ lastEventId: z.coerce.number().optional() }).optional())
      .subscription(async function* (opts) {
        const lastEventId = opts.input?.lastEventId;
        subscriptionCalls(lastEventId);
        if (lastEventId === undefined) {
          yield tracked('1', 1);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }
        yield tracked(String(lastEventId + 1), lastEventId + 1);
        await new Promise((resolve) =>
          opts.signal?.addEventListener('abort', resolve),
        );
      }),
  });

  return Object.assign(
    testServerAndClientResource(appRouter, {
      client: ({ wsClient }) => ({
        links: [
          retryLink({ retry: (opts) => opts.attempts < 3 }),
          wsLink({ client: wsClient }),
        ],
      }),
    }),
    { queryCalls, subscriptionCalls },
  );
}

test('retryLink over wsLink retries a query that failed', async () => {
  await using ctx = factory();

  const result = await Promise.race([
    ctx.client.flaky.query(),
    new Promise((resolve) => setTimeout(() => resolve('timed out'), 2_000)),
  ]);

  expect(result).toBe('ok');
  expect(ctx.queryCalls).toHaveBeenCalledTimes(2);
});

test('retryLink over wsLink resumes a subscription after a server error', async () => {
  await using ctx = factory();

  const onData = vi.fn<(value: number) => void>();
  const onError = vi.fn();
  const onComplete = vi.fn();

  const sub = ctx.client.onEvent.subscribe(undefined, {
    onData: (envelope) => onData(envelope.data),
    onError,
    onComplete,
  });

  // after the error, retryLink resubscribes with lastEventId 1, and the
  // server yields 2
  await vi.waitFor(
    () => {
      expect(ctx.subscriptionCalls.mock.calls).toEqual([[undefined], [1]]);
      expect(onData.mock.calls).toEqual([[1], [2]]);
    },
    { timeout: 2_000 },
  );
  expect(onError).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();

  sub.unsubscribe();
});
