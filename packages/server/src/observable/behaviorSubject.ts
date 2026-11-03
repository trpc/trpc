import { observable } from './observable';
import type { Observable, Observer } from './types';

/** An observable that holds a current value. */
export interface BehaviorSubject<TValue> extends Observable<TValue, never> {
  observable: Observable<TValue, never>;
  /** Sets the value and sends it to subscribers, if it changed. */
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
 * Creates an observable that holds a current value. New subscribers get
 * it right away, unless it's `undefined`.
 * @internal
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
