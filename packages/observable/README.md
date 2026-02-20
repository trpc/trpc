# @trpc/observable

Standalone observable utilities for [tRPC](https://trpc.io).

This package provides a lightweight observable implementation used by both `@trpc/server` and `@trpc/client`, allowing you to build custom links and work with observables without pulling in the entire server package.

## Installation

```bash
npm install @trpc/observable
```

## Usage

```typescript
import { observable } from '@trpc/observable';

const obs = observable<number, Error>((observer) => {
  observer.next(1);
  observer.next(2);
  observer.complete();
});

obs.subscribe({
  next: (value) => console.log(value),
  error: (err) => console.error(err),
  complete: () => console.log('done'),
});
```

## Exports

- `observable` — Create an observable
- `isObservable` — Type guard for observables
- `observableToPromise` — Convert an observable to a promise (resolves with the first value)
- `observableToAsyncIterable` — Convert an observable to an async iterable
- `map`, `share`, `tap`, `distinctUntilChanged`, `distinctUntilDeepChanged` — Operators
- `behaviorSubject` — A stateful observable (BehaviorSubject)
- Types: `Observable`, `Observer`, `Unsubscribable`, `UnsubscribeFn`, `TeardownLogic`, `BehaviorSubject`, `ReadonlyBehaviorSubject`
