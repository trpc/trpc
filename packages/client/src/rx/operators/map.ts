import { OperatorFunction } from '../types';

export function map<TValueBefore, TError, TValueAfter>(
  project: (value: TValueBefore, index: number) => TValueAfter,
): OperatorFunction<TValueBefore, TError, TValueAfter, TError> {
  return (originalObserver) => {
    return {
      subscribe(observer) {
        let index = 0;
        const subscription = originalObserver.subscribe({
          next(value) {
            observer.next?.(project(value, index++));
          },
          error(error) {
            observer.error?.(error);
          },
          complete() {
            observer.complete?.();
          },
        });
        return subscription;
      },
    };
  };
}
