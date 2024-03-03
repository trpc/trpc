import { observable } from './observable';
import type {
  MonoTypeOperatorFunction,
  Observer,
  OperatorFunction,
  Unsubscribable,
} from './types';

export function map<TValueBefore, TError, TValueAfter>(
  project: (value: TValueBefore, index: number) => TValueAfter,
): OperatorFunction<TValueBefore, TError, TValueAfter, TError> {
  return (originalObserver) => {
    return observable((sub) => {
      let index = 0;
      const subscription = originalObserver.subscribe({
        next(value) {
          sub.next(project(value, index++));
        },
        error(error) {
          sub.error(error);
        },
        complete() {
          sub.complete();
        },
      });
      return subscription;
    });
  };
}

interface ShareConfig {}
export function share<TValue, TError>(
  _opts?: ShareConfig,
): MonoTypeOperatorFunction<TValue, TError> {
  return (originalObserver) => {
    let refCount = 0;

    let subscription: Unsubscribable | null = null;
    const observers: Partial<Observer<TValue, TError>>[] = [];

    function startIfNeeded() {
      if (subscription) {
        return;
      }
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
      // "resetOnRefCountZero"
      if (refCount === 0 && subscription) {
        const _sub = subscription;
        subscription = null;
        _sub.unsubscribe();
      }
    }

    return observable((sub) => {
      refCount++;

      observers.push(sub);
      startIfNeeded();
      return {
        unsubscribe() {
          refCount--;
          resetIfNeeded();

          const index = observers.findIndex((v) => v === sub);

          if (index > -1) {
            observers.splice(index, 1);
          }
        },
      };
    });
  };
}

export function tap<TValue, TError>(
  observer: Partial<Observer<TValue, TError>>,
): MonoTypeOperatorFunction<TValue, TError> {
  return (originalObserver) => {
    return observable((sub) => {
      const subscription = originalObserver.subscribe({
        next(value) {
          observer.next?.(value);
          sub.next(value);
        },
        error(error) {
          observer.error?.(error);
          sub.error(error);
        },
        complete() {
          observer.complete?.();
          sub.complete();
        },
      });
      return subscription;
    });
  };
}
