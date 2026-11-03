import type { Observer, Unsubscribable } from '@trpc/server/observable';
import { observable, observableToAsyncIterable } from '@trpc/server/observable';

/**
 * What `subscribe()` returns. Call `unsubscribe()` to stop it, or iterate
 * it once with `for await`. The loop yields the data that arrives after it
 * starts; leaving the loop early unsubscribes.
 * @see https://trpc.io/docs/client/vanilla/setup#5-use-subscriptions
 */
export interface TRPCSubscription<TValue>
  extends Unsubscribable, AsyncIterable<TValue> {}

type End<TValue> = (observer: Observer<TValue, unknown>) => void;

/**
 * Feeds a subscription's data to one `for await` loop at a time.
 * @internal
 */
export function createIterableSubscription<TValue>(opts: {
  signal: AbortSignal | undefined;
  unsubscribe: () => void;
}) {
  let consumer: Observer<TValue, unknown> | null = null;
  // replayed to a loop that starts after the subscription ended, which
  // would otherwise wait forever
  let ended: End<TValue> | null = null;

  const end = (fn: End<TValue>) => {
    if (!ended) {
      ended = fn;
      if (consumer) {
        fn(consumer);
      }
    }
  };
  const unsubscribe = () => {
    opts.unsubscribe();
    end((observer) => observer.complete());
  };

  const data$ = observable<TValue, unknown>((observer) => {
    if (ended) {
      ended(observer);
      return;
    }
    if (opts.signal?.aborted) {
      observer.complete();
      return;
    }
    consumer = observer;
    const onAbort = () => observer.complete();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    return () => {
      // cleared first so whatever the link emits while it tears down is dropped
      consumer = null;
      opts.signal?.removeEventListener('abort', onAbort);
      unsubscribe();
    };
  });

  const subscription: TRPCSubscription<TValue> = {
    unsubscribe,
    [Symbol.asyncIterator]() {
      if (consumer) {
        throw new Error('A subscription can only be iterated by one loop');
      }
      // `observableToAsyncIterable`'s signal doesn't end a pending `next()`,
      // so `opts.signal` is handled above instead
      return observableToAsyncIterable(data$, new AbortController().signal)[
        Symbol.asyncIterator
      ]();
    },
  };

  return {
    next: (value: TValue) => consumer?.next(value),
    error: (error: unknown) => end((observer) => observer.error(error)),
    complete: () => end((observer) => observer.complete()),
    subscription,
  };
}
