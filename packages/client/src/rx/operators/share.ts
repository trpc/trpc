import { MonoTypeOperatorFunction, Observer, Unsubscribable } from '../types';

/* eslint-disable @typescript-eslint/no-empty-interface */
interface ShareConfig {}
export function share<TValue, TError>(
  _opts?: ShareConfig,
): MonoTypeOperatorFunction<TValue, TError> {
  return (originalObserver) => {
    let refCount = 0;
    let running = false;
    let subscription: Unsubscribable | null = null;
    const observers: Partial<Observer<TValue, TError>>[] = [];

    function startIfNeeded() {
      if (running) {
        return;
      }
      running = true;
      subscription = originalObserver.subscribe({
        next(value) {
          for (const observer of observers) {
            observer.next?.(value);
          }
        },
        error(error) {
          for (const observer of observers) {
            observer.error?.(error);
          }
        },
        complete() {
          for (const observer of observers) {
            observer.complete?.();
          }
        },
      });
    }
    function resetIfNeeded() {
      if (!running) {
        return;
      }
      // "resetOnRefCountZero"
      if (refCount === 0 && subscription) {
        subscription.unsubscribe();
      }
    }

    return {
      subscribe(observer) {
        refCount++;
        observers.push(observer);
        startIfNeeded();
        return {
          unsubscribe() {
            refCount--;
            resetIfNeeded();
            const index = observers.findIndex((v) => v === observer);
            if (index > -1) {
              observers.splice(index);
            }
          },
        };
      },
    };
  };
}
