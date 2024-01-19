import type {
  Observable,
  Observer,
  OperatorFunction,
  TeardownLogic,
  UnaryFunction,
} from './types';

function identity<TType>(x: TType): TType {
  return x;
}

/** @public */
export type inferObservableValue<TObservable> = TObservable extends Observable<
  infer TValue,
  unknown
>
  ? TValue
  : never;

/** @public */
export function isObservable(x: unknown): x is Observable<unknown, unknown> {
  return typeof x === 'object' && x !== null && 'subscribe' in x;
}

/** @public */
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
      return pipeFromArray(operations)(self) as any;
    },
  };
  return self;
}

function pipeFromArray<TSource, TReturn>(
  fns: UnaryFunction<TSource, TReturn>[],
): UnaryFunction<TSource, TReturn> {
  if (fns.length === 0) {
    return identity as UnaryFunction<any, any>;
  }

  if (fns.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return fns[0]!;
  }

  return function piped(input: TSource): TReturn {
    return fns.reduce(
      (prev: any, fn: UnaryFunction<TSource, TReturn>) => fn(prev),
      input as any,
    );
  };
}

class ObservableAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObservableAbortError';
    Object.setPrototypeOf(this, ObservableAbortError.prototype);
  }
}

/** @internal */
export function observableToPromise<TValue>(
  observable: Observable<TValue, unknown>,
) {
  let abort: () => void;
  const promise = new Promise<TValue>((resolve, reject) => {
    let isDone = false;
    function onDone() {
      if (isDone) {
        return;
      }
      isDone = true;
      reject(new ObservableAbortError('This operation was aborted.'));
      obs$.unsubscribe();
    }
    const obs$ = observable.subscribe({
      next(data) {
        isDone = true;
        resolve(data);
        onDone();
      },
      error(data) {
        isDone = true;
        reject(data);
        onDone();
      },
      complete() {
        isDone = true;
        onDone();
      },
    });
    abort = onDone;
  });
  return {
    promise,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    abort: abort!,
  };
}
