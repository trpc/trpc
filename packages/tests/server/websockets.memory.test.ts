import { EventEmitter, on } from 'node:events';
import { routerToServerAndClientNew } from './___testHelpers';
import { wsLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { sleep } from '@trpc/server/unstable-core-do-not-import';

function factory() {
  const ee = new EventEmitter();
  const t = initTRPC.create();

  const appRouter = t.router({
    onData: t.procedure.subscription(({ signal }) =>
      on(ee as any, 'data', { signal }),
    ),
  });

  const opts = routerToServerAndClientNew(appRouter, {
    wsClient: { retryDelayMs: () => 10 },
    client({ wsClient }) {
      return { links: [wsLink({ client: wsClient })] };
    },
    server: {},
    wssServer: { router: appRouter },
  });

  return { ...opts, ee };
}

describe('ws subscription memory', () => {
  it('should free data after each iteration (#6156)', async () => {
    const ctx = factory();

    const onStartedMock = vi.fn();
    const onDataLengthMock = vi.fn();
    const subscription = ctx.client.onData.subscribe(undefined, {
      onStarted() {
        onStartedMock();
      },
      onData(data) {
        expect(Array.isArray(data)).toBe(true);
        onDataLengthMock(data.length);
      },
    });

    await vi.waitFor(() => {
      expect(onStartedMock).toHaveBeenCalled();
    });

    const refs = [emitData(), emitData()];

    await vi.waitFor(() => {
      expect(onDataLengthMock).toHaveBeenCalledTimes(2);
    });

    await sleep(0);
    global.gc!();

    expect(refs[0]!.deref()).toBeUndefined();
    expect(refs[1]!.deref()).toBeUndefined();

    subscription.unsubscribe();

    await ctx.close();

    function emitData(): WeakRef<never[]> {
      const data: never[] = [];
      const ref = new WeakRef(data);
      ctx.ee.emit('data', data);
      return ref;
    }
  });
});
