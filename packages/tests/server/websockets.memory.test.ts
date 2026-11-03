import { EventEmitter, on } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { wsLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import {
  createDeferred,
  sleep,
} from '@trpc/server/unstable-core-do-not-import';

function factory() {
  const ee = new EventEmitter();
  const t = initTRPC.create();

  const appRouter = t.router({
    onData: t.procedure.subscription(({ signal }) =>
      on(ee as any, 'data', { signal }),
    ),
  });

  const opts = testServerAndClientResource(appRouter, {
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
    await using ctx = factory();

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

  it('frees subscriptions stopped while active or during setup', async () => {
    const ee = new EventEmitter();
    const signals: WeakRef<AbortSignal>[] = [];
    let admission = createDeferred();
    let setupSignal: AbortSignal | undefined;
    const t = initTRPC.create();
    const subscribe = (opts: { signal?: AbortSignal }) => {
      assert(opts.signal, 'no signal received');
      signals.push(new WeakRef(opts.signal));
      return on(ee, 'data', { signal: opts.signal });
    };
    const appRouter = t.router({
      active: t.procedure.subscription(subscribe),
      slow: t.procedure
        .use(async (opts) => {
          setupSignal = opts.signal;
          await admission.promise;
          return opts.next();
        })
        .subscription(subscribe),
    });
    await using ctx = testServerAndClientResource(appRouter, {
      clientLink: 'wsLink',
      wsClient: { lazy: { enabled: false, closeMs: 0 } },
    });

    for (let i = 0; i < 50; i++) {
      const started = createDeferred();
      const subscription = ctx.client.active.subscribe(undefined, {
        onStarted: () => started.resolve(),
      });
      await started.promise;
      subscription.unsubscribe();
    }
    for (let i = 0; i < 20; i++) {
      admission = createDeferred();
      setupSignal = undefined;
      const subscription = ctx.client.slow.subscribe(undefined, {});
      await vi.waitFor(() => expect(setupSignal).toBeDefined());
      subscription.unsubscribe();
      await vi.waitFor(() => expect(setupSignal?.aborted).toBe(true));
      admission.resolve();
    }
    setupSignal = undefined;

    await vi.waitFor(() => expect(ee.listenerCount('data')).toBe(0));
    const gc = globalThis.gc;
    assert(gc, 'run with --expose-gc');
    await vi.waitFor(async () => {
      await sleep(0);
      gc();
      expect(signals.filter((ref) => ref.deref() !== undefined)).toEqual([]);
    });
    expect(signals).toHaveLength(70);
  });
});
