import type { MonoTypeOperatorFunction, Observer } from '../types';

export function tap<TValue, TError>(
  observer: Partial<Observer<TValue, TError>>,
): MonoTypeOperatorFunction<TValue, TError> {
  return (originalObserver) => {
    return {
      subscribe(observer2) {
        return originalObserver.subscribe({
          next(v) {
            observer.next?.(v);
            observer2.next?.(v);
          },
          error(v) {
            observer.error?.(v);
            observer2.error?.(v);
          },
          complete() {
            observer.complete?.();
            observer2.complete?.();
          },
        });
      },
    };
  };
}
