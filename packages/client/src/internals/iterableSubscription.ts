import type {
  Observable,
  Observer,
  Unsubscribable,
} from '@trpc/server/observable';
import { observable, observableToAsyncIterable } from '@trpc/server/observable';
import type { OperationResultEnvelope } from '../links/types';

/**
 * What `subscribe()` returns when it's called without callbacks. Iterate it
 * once with `for await`, or call `unsubscribe()` to stop it. The loop yields
 * the data that arrives after it starts; leaving the loop early unsubscribes.
 * @see https://trpc.io/docs/client/vanilla/setup#5-use-subscriptions
 */
export interface TRPCSubscription<TValue>
  extends Unsubscribable, AsyncIterable<TValue> {}

type End = (observer: Observer<unknown, unknown>) => void;

/**
 * Starts a subscription for one `for await` loop at a time to consume.
 * @internal
 */
export function iterableSubscription(
  request$: Observable<OperationResultEnvelope<unknown, unknown>, unknown>,
  signal: AbortSignal | undefined,
): TRPCSubscription<unknown> {
  let consumer: Observer<unknown, unknown> | null = null;
  // replayed to a loop that starts after the subscription ended, which
  // would otherwise wait forever
  let ended: End | null = null;

  const end = (fn: End) => {
    if (!ended) {
      ended = fn;
      if (consumer) {
        fn(consumer);
      }
    }
  };

  const subscription = request$.subscribe({
    next({ result }) {
      if (result.type === 'data' || result.type === undefined) {
        consumer?.next(result.data);
      }
    },
    error: (error) => end((observer) => observer.error(error)),
    complete: () => end((observer) => observer.complete()),
  });
  const unsubscribe = () => {
    subscription.unsubscribe();
    end((observer) => observer.complete());
  };

  const data$ = observable<unknown, unknown>((observer) => {
    if (ended) {
      ended(observer);
      return;
    }
    if (signal?.aborted) {
      observer.complete();
      return;
    }
    consumer = observer;
    const onAbort = () => observer.complete();
    signal?.addEventListener('abort', onAbort, { once: true });
    return () => {
      // cleared first so whatever the link emits while it tears down is dropped
      consumer = null;
      signal?.removeEventListener('abort', onAbort);
      unsubscribe();
    };
  });

  return {
    unsubscribe,
    [Symbol.asyncIterator]() {
      if (consumer) {
        throw new Error('A subscription can only be iterated by one loop');
      }
      // `observableToAsyncIterable`'s signal doesn't end a pending `next()`,
      // so `signal` is handled above instead
      return observableToAsyncIterable(data$, new AbortController().signal)[
        Symbol.asyncIterator
      ]();
    },
  };
}
