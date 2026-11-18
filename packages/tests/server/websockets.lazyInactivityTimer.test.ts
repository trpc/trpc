import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
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
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([0, 10_000])(
    'does not poll, and closes closeMs after it ends (closeMs: %i)',
    async (closeMs) => {
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

      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      // Re-arming while the subscription is open would poll every closeMs.
      await vi.advanceTimersByTimeAsync(100_000);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // The server ends it, so its `stopped` is the last message.
      end.resolve();
      await completed.promise;
      if (closeMs > 0) {
        await vi.advanceTimersByTimeAsync(closeMs - 1);
        expect(ws.readyState).toBe(WebSocket.OPEN);
      }
      await vi.advanceTimersByTimeAsync(1);
      expect(ws.readyState).not.toBe(WebSocket.OPEN);
    },
  );
});
