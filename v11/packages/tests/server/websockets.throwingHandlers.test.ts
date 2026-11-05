import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC, tracked } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

/**
 * With `ws`, a throw in a `message` listener stops the socket from reading
 * frames while it stays open, so every later request on it hangs.
 */
const t = initTRPC.create();
const lastEventIds: (string | null)[] = [];
const router = t.router({
  greeting: t.procedure.query(() => 'hello'),
  numbers: t.procedure.subscription(() =>
    observable<number>((emit) => {
      emit.next(1);
      emit.next(2);
      return () => null;
    }),
  ),
  events: t.procedure
    .input(z.object({ lastEventId: z.string().nullish() }).nullish())
    .subscription(async function* (opts) {
      const lastEventId = opts.input?.lastEventId ?? null;
      lastEventIds.push(lastEventId);
      if (lastEventId === null) yield tracked('1', 1);
      await new Promise((resolve) => {
        opts.signal?.addEventListener('abort', resolve);
      });
    }),
});

function captureUncaught() {
  const uncaught: unknown[] = [];
  const onUncaught = (cause: unknown) => uncaught.push(cause);
  process.on('uncaughtException', onUncaught);
  return makeResource({ uncaught }, () => {
    process.off('uncaughtException', onUncaught);
  });
}

test('a throwing onData does not stop the socket from reading', async () => {
  using g = captureUncaught();
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
  });
  const onDataError = new Error('onData failed');
  const onData = vi.fn((value: number) => {
    if (value === 1) throw onDataError;
  });
  const onError = vi.fn();
  const sub = ctx.client.numbers.subscribe(undefined, { onData, onError });

  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(2);
  });
  expect(await ctx.client.greeting.query()).toBe('hello');
  await vi.waitFor(() => {
    expect(g.uncaught).toEqual([onDataError]);
  });
  expect(onError).not.toHaveBeenCalled();
  sub.unsubscribe();
});

test('a throwing onData still records the event id to resume from', async () => {
  using g = captureUncaught();
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
  });
  const onDataError = new Error('onData failed');
  const onData = vi.fn(() => {
    throw onDataError;
  });
  const sub = ctx.client.events.subscribe(undefined, { onData });

  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(1);
  });
  ctx.destroyConnections();
  await vi.waitFor(() => {
    expect(lastEventIds).toEqual([null, '1']);
  });
  expect(g.uncaught).toEqual([onDataError]);
  sub.unsubscribe();
});
