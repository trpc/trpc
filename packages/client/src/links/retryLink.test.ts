// @vitest-environment node
import { EventEmitter } from 'node:events';
import { observable } from '@trpc/server/observable';
import { createTRPCUntypedClient } from '../createTRPCUntypedClient';
import { TRPCClientError } from '../TRPCClientError';
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
  vi.useFakeTimers();
  try {
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
    const subscription = client.subscription('messages', undefined, {});
    expect(retry).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
    vi.runAllTimers();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
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
    vi.useFakeTimers();
    try {
      const cleanup = vi.fn();
      let attempts = 0;
      let fail: () => void = () => {
        throw new Error('Expected the first attempt to start');
      };
      const client = createTRPCUntypedClient({
        links: [
          retryLink({
            retry: () => {
              if (callback === 'retry') subscription.unsubscribe();
              return true;
            },
            retryDelayMs: () => {
              if (callback === 'retryDelayMs') subscription.unsubscribe();
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
      const subscription = client.subscription('messages', undefined, {});
      fail();
      expect(vi.getTimerCount()).toBe(0);
      vi.runAllTimers();
      expect(attempts).toBe(1);
      expect(cleanup).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  },
);
