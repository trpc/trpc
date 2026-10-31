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
    // True while `source.subscribe` runs, so subscribers added by a synchronous
    // `next` join the starting source instead of starting another one
    let isConnecting = false;
    let observers = new Set<Partial<Observer<TValue, TError>>>();

    function startIfNeeded() {
      if (subscription || isConnecting) {
        return;
      }
      isConnecting = true;
      let isDone = false;
      let sourceSubscription: Unsubscribable;
      try {
        sourceSubscription = source.subscribe({
          next(value) {
            notify(observers, (observer) => observer.next?.(value));
          },
          error(error) {
            isDone = true;
            terminate((observer) => observer.error?.(error));
          },
          complete() {
            isDone = true;
            terminate((observer) => observer.complete?.());
          },
        });
      } finally {
        isConnecting = false;
      }
      // A synchronous terminal event fires before `subscribe` returns, and its
      // callbacks may already have started a new source
      if (isDone) {
        sourceSubscription.unsubscribe();
      } else {
        subscription = sourceSubscription;
      }
    }
    function notify(
      targets: Set<Partial<Observer<TValue, TError>>>,
      callback: (observer: Partial<Observer<TValue, TError>>) => void,
    ) {
      for (const observer of [...targets]) {
        if (targets.has(observer)) {
          callback(observer);
        }
      }
    }
    function terminate(
      callback: (observer: Partial<Observer<TValue, TError>>) => void,
    ) {
      // Cleared before notifying so a subscriber added during the callback
      // starts a fresh source whose events reach only the observers that
      // joined it; the old source is torn down only after every observer has
      // been notified, mirroring subscription order.
      const _sub = subscription;
      const terminatedObservers = observers;
      subscription = null;
      observers = new Set();
      isConnecting = false;
      try {
        notify(terminatedObservers, callback);
      } finally {
        _sub?.unsubscribe();
      }
    }
    function resetSource() {
      const _sub = subscription;
      subscription = null;
      _sub?.unsubscribe();
    }
    function resetIfNeeded() {
      // "resetOnRefCountZero"
      if (refCount === 0 && subscription) {
        resetSource();
      }
    }

    return observable((subscriber) => {
      refCount++;

      const subscriberObservers = observers;
      subscriberObservers.add(subscriber);
      startIfNeeded();
      return {
        unsubscribe() {
          refCount--;
          resetIfNeeded();

          subscriberObservers.delete(subscriber);
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
