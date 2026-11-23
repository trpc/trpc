import { observable } from './observable';
import type { Observable, Observer } from './types';

/** An observable that holds a current value. */
export interface BehaviorSubject<TValue> extends Observable<TValue, never> {
  observable: Observable<TValue, never>;
  /**
   * Sets the value and sends it to subscribers, if it changed. A subscriber
   * that throws doesn't stop the others; its error is rethrown asynchronously.
   */
  next: (value: TValue) => void;
  /** The current value. */
  get: () => TValue;
}

/** A `BehaviorSubject` that can't be set. */
export interface ReadonlyBehaviorSubject<TValue> extends Omit<
  BehaviorSubject<TValue>,
  'next'
> {}

/**
 * Calls one of several observers. A throw would stop the caller from
 * notifying the rest, so it is rethrown asynchronously instead: it still
 * shows up as an uncaught exception.
 */
function callObserver(callback: () => void) {
  try {
    callback();
  } catch (error) {
    setTimeout(() => {
      throw error;
    });
  }
}

/**
 * Creates an observable that holds a current value. New subscribers get
 * it right away, unless it's `undefined`.
 * @internal
 */
export function behaviorSubject<TValue>(
  initialValue: TValue,
): BehaviorSubject<TValue> {
  let value: TValue = initialValue;

  const observerList = new Set<Observer<TValue, never>>();

  const addObserver = (observer: Observer<TValue, never>) => {
    if (value !== undefined) {
      observer.next(value);
    }
    observerList.add(observer);
  };
  const removeObserver = (observer: Observer<TValue, never>) => {
    observerList.delete(observer);
  };

  const obs = observable<TValue, never>((observer) => {
    addObserver(observer);
    return () => {
      removeObserver(observer);
    };
  }) as BehaviorSubject<TValue>;

  obs.next = (nextValue: TValue) => {
    if (value === nextValue) {
      return;
    }
    value = nextValue;
    // an observer can be removed while this loop is notifying it, and an
    // observer removed by an earlier callback must not be notified
    for (const observer of [...observerList]) {
      if (observerList.has(observer)) {
        callObserver(() => observer.next(nextValue));
      }
    }
  };

  obs.get = () => value;

  return obs;
}
