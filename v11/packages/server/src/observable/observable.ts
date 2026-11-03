import type { Result } from '../unstable-core-do-not-import';
import type {
  Observable,
  Observer,
  OperatorFunction,
  TeardownLogic,
  UnaryFunction,
  Unsubscribable,
} from './types';

/**
 * The type of the values an observable emits.
 * @public
 */
export type inferObservableValue<TObservable> =
  TObservable extends Observable<infer TValue, unknown> ? TValue : never;

/**
 * Whether a value is an observable: an object with `subscribe`.
 * @public
 */
export function isObservable(x: unknown): x is Observable<unknown, unknown> {
  return typeof x === 'object' && x !== null && 'subscribe' in x;
}

/**
 * Creates an observable. `subscribe` runs for each subscriber, and can
 * return a function that cleans up when it unsubscribes.
 * @example
 * ```ts
 * const ticks = observable<number>((observer) => {
 *   const timer = setInterval(() => observer.next(Date.now()), 1000);
 *   return () => clearInterval(timer);
 * });
 * ```
 * @see https://trpc.io/docs/client/links#creating-a-custom-link
 * @public
 */
export function observable<TValue, TError = unknown>(
  subscribe: (observer: Observer<TValue, TError>) => TeardownLogic,
): Observable<TValue, TError> {
  const self: Observable<TValue, TError> = {
    subscribe(observer) {
      let teardownRef: TeardownLogic | null = null;
      let isDone = false;
      let unsubscribed = false;
      let teardownImmediately = false;
      function unsubscribe() {
        if (teardownRef === null) {
          teardownImmediately = true;
          return;
        }
        if (unsubscribed) {
          return;
        }
        unsubscribed = true;

        if (typeof teardownRef === 'function') {
          teardownRef();
        } else if (teardownRef) {
          teardownRef.unsubscribe();
        }
      }
      teardownRef = subscribe({
        next(value) {
          if (isDone) {
            return;
          }
          observer.next?.(value);
        },
        error(err) {
          if (isDone) {
            return;
          }
          isDone = true;
          observer.error?.(err);
          unsubscribe();
        },
        complete() {
          if (isDone) {
            return;
          }
          isDone = true;
          observer.complete?.();
          unsubscribe();
        },
      });
      if (teardownImmediately) {
        unsubscribe();
      }
      return {
        unsubscribe,
      };
    },
    pipe(
      ...operations: OperatorFunction<any, any, any, any>[]
    ): Observable<any, any> {
      return operations.reduce(pipeReducer, self);
    },
  };
  return self;
}

function pipeReducer(prev: any, fn: UnaryFunction<any, any>) {
  return fn(prev);
}

/**
 * Resolves with an observable's first value. Rejects if it errors or
 * completes first. It doesn't unsubscribe after the first value.
 * @internal
 */
export function observableToPromise<TValue>(
  observable: Observable<TValue, unknown>,
) {
  const ac = new AbortController();
  const promise = new Promise<TValue>((resolve, reject) => {
    let isDone = false;
    function onDone() {
      if (isDone) {
        return;
      }
      isDone = true;
      obs$.unsubscribe();
    }
    ac.signal.addEventListener('abort', () => {
      reject(ac.signal.reason);
    });
    const obs$ = observable.subscribe({
      next(data) {
        isDone = true;
        resolve(data);
        onDone();
      },
      error(data) {
        reject(data);
      },
      complete() {
        ac.abort();
        onDone();
      },
    });
  });
  return promise;
}

/**
 * @internal
 */
function observableToReadableStream<TValue>(
  observable: Observable<TValue, unknown>,
  signal: AbortSignal,
): ReadableStream<Result<TValue>> {
  let unsub: Unsubscribable | null = null;

  const onAbort = () => {
    unsub?.unsubscribe();
    unsub = null;
    signal.removeEventListener('abort', onAbort);
  };

  return new ReadableStream<Result<TValue>>({
    start(controller) {
      unsub = observable.subscribe({
        next(data) {
          controller.enqueue({ ok: true, value: data });
        },
        error(error) {
          controller.enqueue({ ok: false, error });
          controller.close();
        },
        complete() {
          controller.close();
        },
      });

      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    },
    cancel() {
      onAbort();
    },
  });
}

/**
 * Turns an observable into an async iterable. Aborting `signal`
 * unsubscribes from the observable but doesn't end a pending `next()`.
 * @internal
 */
export function observableToAsyncIterable<TValue>(
  observable: Observable<TValue, unknown>,
  signal: AbortSignal,
): AsyncIterable<TValue> {
  const stream = observableToReadableStream(observable, signal);

  const reader = stream.getReader();
  const iterator: AsyncIterator<TValue> = {
    async next() {
      const value = await reader.read();
      if (value.done) {
        return {
          value: undefined,
          done: true,
        };
      }
      const { value: result } = value;
      if (!result.ok) {
        throw result.error;
      }
      return {
        value: result.value,
        done: false,
      };
    },
    async return() {
      await reader.cancel();
      return {
        value: undefined,
        done: true,
      };
    },
  };
  return {
    [Symbol.asyncIterator]() {
      return iterator;
    },
  };
}
