import { pipeFromArray } from './util/pipe';
import { Observable, Observer, OperatorFunction, TeardownLogic } from './types';

export function observable<TValue, TError = unknown>(
  subscribe: (observer: Observer<TValue, TError>) => TeardownLogic,
): Observable<TValue, TError> {
  const self: Observable<TValue, TError> = {
    subscribe(observer) {
      const teardown = subscribe({
        next(value) {
          observer.next?.(value);
        },
        error(err) {
          observer.error?.(err);
        },
        complete() {
          observer.complete?.();
        },
      });
      return {
        unsubscribe() {
          teardown?.();
        },
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
