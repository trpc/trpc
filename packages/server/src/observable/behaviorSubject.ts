import { observable } from './observable';
import type { Observable, Observer } from './types';

export interface BehaviorSubject<TValue> extends Observable<TValue, never> {
  observable: Observable<TValue, never>;
  next: (value: TValue) => void;
  get: () => TValue;
}

export interface ReadonlyBehaviorSubject<TValue> extends Omit<
  BehaviorSubject<TValue>,
  'next'
> {}

/**
 * @internal
 * An observable that maintains and provides a "current value" to subscribers
 * @see https://www.learnrxjs.io/learn-rxjs/subjects/behaviorsubject
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
        observer.next(nextValue);
      }
    }
  };

  obs.get = () => value;

  return obs;
}
