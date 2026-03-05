import { observable } from './observable';
import type { Observable, Observer } from './types';

export interface BehaviorSubject<TValue> extends Observable<TValue, never> {
  observable: Observable<TValue, never>;
  next: (value: TValue) => void;
  get: () => TValue;
}

export interface ReadonlyBehaviorSubject<TValue>
  extends Omit<BehaviorSubject<TValue>, 'next'> {}

/**
 * @internal
 * An observable that maintains and provides a "current value" to subscribers
 * @see https://www.learnrxjs.io/learn-rxjs/subjects/behaviorsubject
 */
export function behaviorSubject<TValue>(
  initialValue: TValue,
): BehaviorSubject<TValue> {
  let value: TValue = initialValue;

  const observerList: Observer<TValue, never>[] = [];

  const addObserver = (observer: Observer<TValue, never>) => {
    if (value !== undefined) {
      observer.next(value);
    }
    observerList.push(observer);
  };
  const removeObserver = (observer: Observer<TValue, never>) => {
    observerList.splice(observerList.indexOf(observer), 1);
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
    for (const observer of observerList) {
      observer.next(nextValue);
    }
  };

  obs.get = () => value;

  return obs;
}
