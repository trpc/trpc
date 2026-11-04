import { EventEmitter, on } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import type { WSSHandlerOptions } from '@trpc/server/adapters/ws';
import { observable } from '@trpc/server/observable';

function factory() {
  const onError = vi.fn<NonNullable<WSSHandlerOptions<any>['onError']>>();
  const teardown = vi.fn(() => {
    throw new Error('observable teardown');
  });
  const generatorFinally = vi.fn();
  const ee = new EventEmitter();

  const t = initTRPC.create();
  const router = t.router({
    greeting: t.procedure.query(() => 'hello'),
    onObservable: t.procedure.subscription(() =>
      observable<number>((emit) => {
        emit.next(1);
        return teardown;
      }),
    ),
    onGenerator: t.procedure.subscription(async function* (opts) {
      try {
        yield 1;
        await new Promise((resolve) =>
          opts.signal?.addEventListener('abort', resolve),
        );
      } finally {
        generatorFinally();
        // oxlint-disable-next-line no-unsafe-finally
        throw new Error('generator cleanup');
      }
    }),
    onEvent: t.procedure.subscription(async function* (opts) {
      yield 1;
      // rejects with an AbortError on stop
      for await (const [value] of on(ee, 'value', { signal: opts.signal })) {
        yield value as number;
      }
    }),
  });

  const ctx = testServerAndClientResource(router, {
    wssServer: { onError },
    clientLink: 'wsLink',
  });
  return Object.assign(ctx, { onError, teardown, generatorFinally });
}

function errorMessages(onError: ReturnType<typeof factory>['onError']) {
  return onError.mock.calls.map(([opts]) => [opts.path, opts.error.message]);
}

describe('a subscription whose cleanup throws after the client stops it', () => {
  test('an observable teardown error is reported to onError', async () => {
    await using ctx = factory();
    const onData = vi.fn();
    const onError = vi.fn();
    const sub = ctx.client.onObservable.subscribe(undefined, {
      onData,
      onError,
    });
    await vi.waitFor(() => expect(onData).toHaveBeenCalledWith(1));

    sub.unsubscribe();

    await vi.waitFor(() => expect(ctx.teardown).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(errorMessages(ctx.onError)).toEqual([
        ['onObservable', 'observable teardown'],
      ]),
    );
    expect(onError).not.toHaveBeenCalled();
    expect(await ctx.client.greeting.query()).toBe('hello');
  });

  test('a generator cleanup error is reported to onError', async () => {
    await using ctx = factory();
    const onData = vi.fn();
    const sub = ctx.client.onGenerator.subscribe(undefined, { onData });
    await vi.waitFor(() => expect(onData).toHaveBeenCalledWith(1));

    sub.unsubscribe();

    await vi.waitFor(() => expect(ctx.generatorFinally).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(errorMessages(ctx.onError)).toEqual([
        ['onGenerator', 'generator cleanup'],
      ]),
    );
  });

  test('a teardown error on disconnect is reported to onError', async () => {
    await using ctx = factory();
    const onData = vi.fn();
    ctx.client.onObservable.subscribe(undefined, { onData });
    await vi.waitFor(() => expect(onData).toHaveBeenCalledWith(1));

    await ctx.wsClient.close();

    await vi.waitFor(() => expect(ctx.teardown).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(errorMessages(ctx.onError)).toEqual([
        ['onObservable', 'observable teardown'],
      ]),
    );
  });

  test('an AbortError from a stopped subscription is not reported', async () => {
    await using ctx = factory();
    const onData = vi.fn();
    const onComplete = vi.fn();
    const sub = ctx.client.onEvent.subscribe(undefined, {
      onData,
      onComplete,
    });
    await vi.waitFor(() => expect(onData).toHaveBeenCalledWith(1));

    sub.unsubscribe();

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(await ctx.client.greeting.query()).toBe('hello');
    expect(ctx.onError).not.toHaveBeenCalled();
  });
});
