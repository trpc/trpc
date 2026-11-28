// @vitest-environment node
import { EventEmitter } from 'node:events';
import { testServerAndClientResource } from '../__tests__/testClientResource';
import { fakeTimersResource } from '@trpc/server/__tests__/fakeTimersResource';
import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { createTRPCClient } from '../createTRPCClient';
import { createTRPCUntypedClient } from '../createTRPCUntypedClient';
import { routerType } from '../routerType';
import { TRPCClientError } from '../TRPCClientError';
import { httpBatchLink } from './httpBatchLink';
import { retryLink } from './retryLink';

describe.each([1, 3])('after %i retries', (failures) => {
  test.each([false, true])(
    'unsubscribes the active subscription (async errors: %s)',
    async (asyncErrors) => {
      const events = new EventEmitter();
      const cleanup = vi.fn<(attempt: number) => void>();
      const onData = vi.fn();
      const onError = vi.fn();
      let attempts = 0;
      const client = createTRPCUntypedClient({
        links: [
          retryLink({
            retry: (retryOptions) => retryOptions.attempts <= failures,
          }),
          () => () =>
            observable((observer) => {
              const attempt = ++attempts;
              if (attempt <= failures) {
                const fail = () => observer.error(new TRPCClientError('retry'));
                if (asyncErrors) {
                  queueMicrotask(fail);
                } else {
                  fail();
                }
                return () => cleanup(attempt);
              }
              const onMessage = (data: string) => {
                observer.next({ result: { data } });
              };
              events.on('message', onMessage);
              return () => {
                events.off('message', onMessage);
                cleanup(attempt);
              };
            }),
        ],
      });
      const subscription = client.subscription('messages', undefined, {
        onData,
        onError,
      });
      for (let i = 0; i < failures; i++) {
        await Promise.resolve();
      }
      expect(attempts).toBe(failures + 1);
      expect(cleanup).toHaveBeenCalledTimes(failures);
      expect(events.listenerCount('message')).toBe(1);
      events.emit('message', 'before unsubscribe');
      expect(onData).toHaveBeenCalledExactlyOnceWith('before unsubscribe');

      subscription.unsubscribe();
      subscription.unsubscribe();

      expect(events.listenerCount('message')).toBe(0);
      expect(cleanup).toHaveBeenCalledTimes(failures + 1);
      for (let attempt = 1; attempt <= failures + 1; attempt++) {
        expect(cleanup).toHaveBeenCalledWith(attempt);
      }
      events.emit('message', 'after unsubscribe');
      expect(onData).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  test.each(['complete', 'error'] as const)(
    'cleans up every attempt after a synchronous terminal %s',
    (outcome) => {
      const cleanup = vi.fn<(attempt: number) => void>();
      const onData = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();
      let attempts = 0;
      const client = createTRPCUntypedClient({
        links: [
          retryLink({
            retry: (retryOptions) => retryOptions.attempts <= failures,
          }),
          () => () =>
            observable((observer) => {
              const attempt = ++attempts;
              if (attempt <= failures || outcome === 'error') {
                observer.error(new TRPCClientError('retry'));
              } else {
                observer.next({ result: { data: 'done' } });
                observer.complete();
              }
              return () => cleanup(attempt);
            }),
        ],
      });
      const subscription = client.subscription('messages', undefined, {
        onData,
        onError,
        onComplete,
      });
      subscription.unsubscribe();
      expect(attempts).toBe(failures + 1);
      expect(cleanup).toHaveBeenCalledTimes(failures + 1);
      expect(onData).toHaveBeenCalledTimes(outcome === 'complete' ? 1 : 0);
      expect(onComplete).toHaveBeenCalledTimes(outcome === 'complete' ? 1 : 0);
      expect(onError).toHaveBeenCalledTimes(outcome === 'error' ? 1 : 0);
    },
  );
});

test('unsubscribing during the retry delay cancels the next attempt', () => {
  using timers = fakeTimersResource();
  const cleanup = vi.fn();
  const retry = vi.fn(() => true);
  const client = createTRPCUntypedClient({
    links: [
      retryLink({ retry, retryDelayMs: () => 100 }),
      () => () =>
        observable((observer) => {
          observer.error(new TRPCClientError('retry'));
          return cleanup;
        }),
    ],
  });
  const ac = new AbortController();
  client.subscription('messages', undefined, { signal: ac.signal });
  expect(retry).toHaveBeenCalledTimes(1);
  expect(cleanup).toHaveBeenCalledTimes(1);
  ac.abort();
  timers.runAllTimers();
  expect(retry).toHaveBeenCalledTimes(1);
  expect(cleanup).toHaveBeenCalledTimes(1);
});

test('unsubscribing from a synchronous retried result cleans up that attempt', () => {
  const events = new EventEmitter();
  const cleanup = vi.fn<(attempt: number) => void>();
  let attempts = 0;
  let fail: () => void = () => {
    throw new Error('Expected the first attempt to start');
  };
  const client = createTRPCUntypedClient({
    links: [
      retryLink({ retry: () => true }),
      () => () =>
        observable((observer) => {
          const attempt = ++attempts;
          if (attempt === 1) {
            fail = () => observer.error(new TRPCClientError('retry'));
            return () => cleanup(attempt);
          }
          const onMessage = (data: string) => {
            observer.next({ result: { data } });
          };
          events.on('message', onMessage);
          onMessage('retry result');
          return () => {
            events.off('message', onMessage);
            cleanup(attempt);
          };
        }),
    ],
  });
  const onData = vi.fn(() => subscription.unsubscribe());
  const subscription = client.subscription('messages', undefined, { onData });
  fail();
  expect(onData).toHaveBeenCalledExactlyOnceWith('retry result');
  expect(events.listenerCount('message')).toBe(0);
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(cleanup).toHaveBeenCalledWith(1);
  expect(cleanup).toHaveBeenCalledWith(2);
});

test.each(['retry', 'retryDelayMs'] as const)(
  'unsubscribing from %s does not schedule another attempt',
  (callback) => {
    using timers = fakeTimersResource();
    const cleanup = vi.fn();
    let attempts = 0;
    const ac = new AbortController();
    let fail: () => void = () => {
      throw new Error('Expected the first attempt to start');
    };
    const client = createTRPCUntypedClient({
      links: [
        retryLink({
          retry: () => {
            if (callback === 'retry') ac.abort();
            return true;
          },
          retryDelayMs: () => {
            if (callback === 'retryDelayMs') ac.abort();
            return 100;
          },
        }),
        () => () =>
          observable((observer) => {
            attempts++;
            fail = () => observer.error(new TRPCClientError('retry'));
            return cleanup;
          }),
      ],
    });
    client.subscription('messages', undefined, { signal: ac.signal });
    fail();
    expect(timers.getTimerCount()).toBe(0);
    timers.runAllTimers();
    expect(attempts).toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  },
);

function factory() {
  const flakyCalls = vi.fn();
  const t = initTRPC.create();
  const appRouter = t.router({
    flaky: t.procedure.input(z.string()).query((opts) => {
      flakyCalls();
      if (flakyCalls.mock.calls.length === 1) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
      return opts.input;
    }),
    onEvent: t.procedure.subscription(async function* () {
      yield 1;
    }),
  });
  return { appRouter, flakyCalls };
}
type AppRouter = ReturnType<typeof factory>['appRouter'];

test('`context.retry` replaces the link’s `retry` for that call', async () => {
  const { appRouter, flakyCalls } = factory();
  await using ctx = testServerAndClientResource(appRouter);
  const client = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      // never retry
      retryLink({ retry: () => false }),
      httpBatchLink({ url: ctx.httpUrl }),
    ],
  });

  await expect(client.flaky.query('a')).rejects.toMatchObject({
    data: { code: 'INTERNAL_SERVER_ERROR' },
  });
  expect(flakyCalls).toHaveBeenCalledTimes(1);

  flakyCalls.mockClear();
  const retry = vi.fn((opts: { attempts: number }) => opts.attempts < 3);
  expect(await client.flaky.query('b', { context: { retry } })).toBe('b');
  expect(flakyCalls).toHaveBeenCalledTimes(2);
  expect(retry).toHaveBeenCalledTimes(1);

  void (() => {
    void client.flaky.query('c', {
      context: {
        retry: (opts) => {
          expectTypeOf(opts.attempts).toEqualTypeOf<number>();
          return false;
        },
      },
    });
  });
});

test('a `context.retry` that isn’t a function is left to the link’s `retry`', async () => {
  // e.g. a flag the link's own `retry` reads, as apps did before
  // `context.retry` took a function
  const { appRouter, flakyCalls } = factory();
  await using ctx = testServerAndClientResource(appRouter);
  const client = createTRPCClient<AppRouter>({
    links: [
      retryLink({
        retry: (opts) =>
          opts.op.context['retry'] !== false && opts.attempts < 3,
      }),
      httpBatchLink({ url: ctx.httpUrl }),
    ],
  });

  await expect(
    client.flaky.query('a', { context: { retry: false } }),
  ).rejects.toMatchObject({ data: { code: 'INTERNAL_SERVER_ERROR' } });
  expect(flakyCalls).toHaveBeenCalledTimes(1);
});
