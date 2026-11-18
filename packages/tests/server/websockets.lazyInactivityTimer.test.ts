import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import { fakeTimersResource } from '@trpc/server/__tests__/fakeTimersResource';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import { WebSocket } from 'ws';

function createRouter(end: Promise<void>) {
  const t = initTRPC.create();
  return t.router({
    sub: t.procedure.subscription(async function* () {
      yield 'started';
      await end;
    }),
  });
}

describe('lazy wsClient while a subscription is open', () => {
  test.each([0, 10_000])(
    'does not poll, and closes closeMs after it ends (closeMs: %i)',
    async (closeMs) => {
      using fakeTimers = fakeTimersResource();
      const end = createDeferred<void>();
      await using ctx = testServerAndClientResource(createRouter(end.promise), {
        clientLink: 'wsLink',
        wsClient: { lazy: { enabled: true, closeMs } },
      });

      const onData = vi.fn();
      const completed = createDeferred<void>();
      ctx.client.sub.subscribe(undefined, {
        onData,
        onComplete: () => completed.resolve(),
      });
      await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
      const ws = ctx.wsClient.connection!.ws as unknown as WebSocket;

      using setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      // Re-arming while the subscription is open would poll every closeMs.
      await fakeTimers.advanceTimersByTimeAsync(100_000);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // The server ends it, so its `stopped` is the last message.
      end.resolve();
      await completed.promise;
      if (closeMs > 0) {
        await fakeTimers.advanceTimersByTimeAsync(closeMs - 1);
        expect(ws.readyState).toBe(WebSocket.OPEN);
      }
      await fakeTimers.advanceTimersByTimeAsync(1);
      expect(ws.readyState).not.toBe(WebSocket.OPEN);
    },
  );
});
