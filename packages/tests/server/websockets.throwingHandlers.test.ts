import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';

/**
 * With `ws`, a throw in a `message` listener stops the socket from reading
 * frames while it stays open, so every later request on it hangs.
 */
const t = initTRPC.create();
const router = t.router({
  greeting: t.procedure.query(() => 'hello'),
  numbers: t.procedure.subscription(() =>
    observable<number>((emit) => {
      emit.next(1);
      emit.next(2);
      return () => null;
    }),
  ),
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
