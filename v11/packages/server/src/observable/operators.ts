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
  return (source) => {
    return observable((destination) => {
      let index = 0;
      const subscription = source.subscribe({
        next(value) {
          destination.next(project(value, index++));
        },
        error(error) {
          destination.error(error);
        },
        complete() {
          destination.complete();
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
  return (source) => {
    let refCount = 0;

    let subscription: Unsubscribable | null = null;
    const observers: Partial<Observer<TValue, TError>>[] = [];

    function startIfNeeded() {
      if (subscription) {
        return;
      }
      subscription = source.subscribe({
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

    return observable((subscriber) => {
      refCount++;

      observers.push(subscriber);
      startIfNeeded();
      return {
        unsubscribe() {
          refCount--;
          resetIfNeeded();

          const index = observers.findIndex((v) => v === subscriber);

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
  return (source) => {
    return observable((destination) => {
      return source.subscribe({
        next(value) {
          observer.next?.(value);
          destination.next(value);
        },
        error(error) {
          observer.error?.(error);
          destination.error(error);
        },
        complete() {
          observer.complete?.();
          destination.complete();
        },
      });
    });
  };
}

const distinctUnsetMarker = Symbol();
export function distinctUntilChanged<TValue, TError>(
  compare: (a: TValue, b: TValue) => boolean = (a, b) => a === b,
): MonoTypeOperatorFunction<TValue, TError> {
  return (source) => {
    return observable((destination) => {
      let lastValue: TValue | typeof distinctUnsetMarker = distinctUnsetMarker;

      return source.subscribe({
        next(value) {
          if (lastValue !== distinctUnsetMarker && compare(lastValue, value)) {
            return;
          }
          lastValue = value;
          destination.next(value);
        },
        error(error) {
          destination.error(error);
        },
        complete() {
          destination.complete();
        },
      });
    });
  };
}

const isDeepEqual = <T>(a: T, b: T): boolean => {
  if (a === b) {
    return true;
  }
  const bothAreObjects =
    a && b && typeof a === 'object' && typeof b === 'object';

  return (
    !!bothAreObjects &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([k, v]) => isDeepEqual(v, b[k as keyof T]))
  );
};
export function distinctUntilDeepChanged<
  TValue,
  TError,
>(): MonoTypeOperatorFunction<TValue, TError> {
  return distinctUntilChanged(isDeepEqual);
}
