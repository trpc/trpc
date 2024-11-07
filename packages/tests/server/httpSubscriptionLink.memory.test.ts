import { EventEmitter, on } from 'node:events';
import { routerToServerAndClientNew } from './___testHelpers';
import { unstable_httpSubscriptionLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { sleep } from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';

const ctx = konn()
  .beforeEach(() => {
    const ee = new EventEmitter();
    const t = initTRPC.create({
      experimental: {
        sseSubscriptions: {
          maxDurationMs: 1000,
          ping: { enabled: true, intervalMs: 200 },
        },
      },
    });

    const router = t.router({
      onData: t.procedure.subscription(({ signal }) =>
        on(ee as any, 'data', { signal }),
      ),
    });

    const opts = routerToServerAndClientNew(router, {
      server: {},
      client(opts) {
        return {
          links: [unstable_httpSubscriptionLink({ url: opts.httpUrl })],
        };
      },
    });

    return { ...opts, ee };
  })
  .afterEach(async (opts) => {
    await opts.close?.();
  })
  .done();

describe('http subscription memory', () => {
  it('should free data after each iteration (#6156)', async () => {
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

    function emitData(): WeakRef<never[]> {
      const data: never[] = [];
      const ref = new WeakRef(data);
      ctx.ee.emit('data', data);
      return ref;
    }
  });
});
