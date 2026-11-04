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
          try {
            observer.error?.(err);
          } finally {
            unsubscribe();
          }
        },
        complete() {
          if (isDone) {
            return;
          }
          isDone = true;
          try {
            observer.complete?.();
          } finally {
            unsubscribe();
          }
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
 * Turns an observable into an async iterable, like Node's `events.on()`.
 * Values wait in a queue until `next()` reads them. An error rejects the
 * `next()` after the queued values, once. Completion, `return()` and aborting
 * `signal` unsubscribe and end every pending `next()` with `{ done: true }`;
 * anything the observable sends after that is ignored.
 *
 * If unsubscribing throws, `return()` rejects with the error, and completion
 * or an error from the observable rethrows it. On abort, it rejects the
 * `next()` after the queued values instead, as an error would.
 * @internal
 */
export function observableToAsyncIterable<TValue>(
  observable: Observable<TValue, unknown>,
  signal: AbortSignal,
): AsyncIterableIterator<TValue> {
  const values: TValue[] = [];
  const pending: {
    resolve: (result: IteratorResult<TValue>) => void;
    reject: (cause: unknown) => void;
  }[] = [];
  let error: { cause: unknown } | null = null;
  let finished = false;
  let subscription: Unsubscribable | null = null;

  /** Unsubscribes once, and returns what the teardown threw. */
  function unsubscribe(): { cause: unknown } | null {
    if (finished) {
      return null;
    }
    finished = true;
    signal.removeEventListener('abort', abort);
    try {
      subscription?.unsubscribe();
      return null;
    } catch (cause) {
      return { cause };
    }
  }
  /** Settles every pending `next()`: the first with `error` if there is one. */
  function settle() {
    const first = error ? pending.shift() : undefined;
    if (error && first) {
      const { cause } = error;
      error = null;
      first.reject(cause);
    }
    for (const promise of pending.splice(0)) {
      promise.resolve({ value: undefined, done: true });
    }
  }
  function finish() {
    const failure = unsubscribe();
    settle();
    if (failure) {
      throw failure.cause;
    }
  }
  function abort() {
    const failure = unsubscribe();
    if (failure) {
      error = failure;
    }
    settle();
  }

  subscription = observable.subscribe({
    next(value) {
      if (finished) {
        return;
      }
      const promise = pending.shift();
      if (promise) {
        promise.resolve({ value, done: false });
      } else {
        values.push(value);
      }
    },
    error(cause) {
      if (finished) {
        return;
      }
      error = { cause };
      finish();
    },
    complete: finish,
  });
  if (finished) {
    subscription.unsubscribe();
  } else if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener('abort', abort, { once: true });
  }

  const iterator: AsyncIterableIterator<TValue> = {
    [Symbol.asyncIterator]() {
      return iterator;
    },
    async next() {
      if (values.length > 0) {
        return { value: values.shift() as TValue, done: false };
      }
      if (error) {
        const { cause } = error;
        error = null;
        throw cause;
      }
      if (finished) {
        return { value: undefined, done: true };
      }
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    },
    async return() {
      values.length = 0;
      error = null;
      finish();
      return { value: undefined, done: true };
    },
  };
  return iterator;
}
