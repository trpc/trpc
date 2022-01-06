import { pipeFromArray } from './util/pipe';
import { Observable, Observer, OperatorFunction, TeardownLogic } from './types';

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

export function toPromise<TObservable extends Observable<TValue, any>, TValue>(
  observable: TObservable,
) {
  let abort: () => void;
  const promise = new Promise<TValue>((resolve, reject) => {
    let completed = false;
    const obs$ = observable.subscribe({
      next(data) {
        completed = true;
        resolve(data);
      },
      error(data) {
        completed = true;
        reject(data);
      },
    });
    abort = () => {
      if (!completed) {
        reject(new Error('Aborted'));
      }
      completed = true;
      obs$.unsubscribe();
    };
  });
  return {
    promise,
    abort: abort!,
  };
}
