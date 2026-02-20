/**
 * Re-exports from @trpc/observable for backward compatibility.
 * Prefer importing from '@trpc/observable' directly.
 */
export {
  behaviorSubject,
  type BehaviorSubject,
  distinctUntilChanged,
  distinctUntilDeepChanged,
  type inferObservableValue,
  isObservable,
  map,
  observable,
  type Observable,
  observableToAsyncIterable,
  observableToPromise,
  type Observer,
  type ReadonlyBehaviorSubject,
  share,
  tap,
  type TeardownLogic,
  type Unsubscribable,
  type UnsubscribeFn,
} from '@trpc/observable';
