import { pipeFromArray } from './util/pipe';
import { Observable, Observer, OperatorFunction, TeardownLogic } from './types';

export type inferObservableValue<TObservable extends Observable<any, any>> =
  TObservable extends Observable<infer TValue, any> ? TValue : never;

export function observable<TValue, TError = unknown>(
  subscribe: (observer: Observer<TValue, TError>) => TeardownLogic,
): Observable<TValue, TError> {
  const self: Observable<TValue, TError> = {
    subscribe(observer) {
      let teardownRef: TeardownLogic | null = null;
      let unsubbed = false;
      let teardownImmediate = false;
      function unsubscribe() {
        if (teardownRef === null) {
          teardownImmediate = true;
          return;
        }
        if (unsubbed) {
          return;
        }
        unsubbed = true;

        if (typeof teardownRef === 'function') {
          teardownRef();
        } else if (teardownRef) {
          teardownRef.unsubscribe();
        }
      }
      teardownRef = subscribe({
        next(value) {
          observer.next?.(value);
        },
        error(err) {
          observer.error?.(err);
          unsubscribe();
        },
        complete() {
          observer.complete?.();
          unsubscribe();
        },
      });
      if (teardownImmediate) {
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

/** @internal */
export function toPromise<TValue>(observable: Observable<TValue, unknown>) {
  let abort: () => void;
  const promise = new Promise<TValue | undefined>((resolve, reject) => {
    let value: TValue | undefined = undefined;
    const obs$ = observable.subscribe({
      next(data) {
        value = data;
      },
      error(data) {
        reject(data);
      },
      complete() {
        resolve(value);
      },
    });
    abort = () => {
      resolve(value);
      obs$.unsubscribe();
    };
  });
  return {
    promise,
    abort: abort!,
  };
}
