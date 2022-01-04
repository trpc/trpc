import { OperatorFunction } from '../types';

export function error<TValue, TErrorBefore, TErrorAfter>(
  project: (error: TErrorBefore) => TErrorAfter,
): OperatorFunction<TValue, TErrorBefore, TValue, TErrorAfter> {
  return (originalObserver) => {
    return {
      subscribe(observer) {
        const subscription = originalObserver.subscribe({
          next(value) {
            observer.next?.(value);
          },
          error(error) {
            observer.error?.(project(error));
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
