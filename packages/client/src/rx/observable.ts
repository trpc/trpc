import { pipeFromArray } from './util/pipe';
import { Observable, Observer, OperatorFunction, TeardownLogic } from './types';

export type inferObservableValue<TObservable extends Observable<any, any>> =
  TObservable extends Observable<infer TValue, any> ? TValue : never;

export function observable<TValue, TError = unknown>(
  subscribe: (observer: Observer<TValue, TError>) => TeardownLogic,
): Observable<TValue, TError> {
  const self: Observable<TValue, TError> = {
    subscribe(observer) {
      function unsubscribe() {
        if (typeof teardown === 'function') {
          teardown();
        } else if (teardown) {
          teardown.unsubscribe();
        }
      }
      const teardown = subscribe({
        next(value) {
          observer.next?.(value);
        },
        error(err) {
          // TODO maybe unsubscribe or prevent further calls?
          observer.error?.(err);
        },
        complete() {
          observer.complete?.();
          // TODO maybe unsubscribe or prevent further calls?
          // unsubscribe();
        },
      });
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
