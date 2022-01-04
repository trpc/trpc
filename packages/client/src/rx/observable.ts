import { pipeFromArray } from './operators/pipe';
import { Observable, Observer, OperatorFunction, TeardownLogic } from './types';

// function triggerIfSet<TFunction extends (...args: any[]) => void>(
//   value: TFunction | undefined,
// ): TFunction {
//   return (...args) => {
//     if (value) {
//       value(...args);
//     }
//   };
// }

export function observable<TValue, TError>(
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

          // if (!teardown) {
          //   return;
          // }
          // if (typeof teardown === 'function') {
          //   teardown();
          //   return;
          // }
          // if ('unsubscribe' in teardown) {
          //   teardown.unsubscribe();
          //   return;
          // }
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
