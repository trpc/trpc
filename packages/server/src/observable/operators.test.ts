import { EventEmitter } from 'events';
import { observable } from './observable';
import {
  distinctUntilChanged,
  distinctUntilDeepChanged,
  map,
  share,
} from './operators';
import type { Observer } from './types';

interface SubscriptionEvents<TOutput> {
  data: (data: TOutput) => void;
}

declare interface CustomEventEmitter<TOutput> {
  on<U extends keyof SubscriptionEvents<TOutput>>(
    event: U,
    listener: SubscriptionEvents<TOutput>[U],
  ): this;

  once<U extends keyof SubscriptionEvents<TOutput>>(
    event: U,
    listener: SubscriptionEvents<TOutput>[U],
  ): this;

  emit<U extends keyof SubscriptionEvents<TOutput>>(
    event: U,
    ...args: Parameters<SubscriptionEvents<TOutput>[U]>
  ): boolean;
}
class CustomEventEmitter<TOutput>
  extends EventEmitter
  implements CustomEventEmitter<TOutput> {}

function createControlledSource(
  teardown?: () => void,
  onResubscribe?: (observer: Observer<number, Error>) => void,
) {
  const sourceObservers: Observer<number, Error>[] = [];
  return {
    observable: observable<number, Error>((observer) => {
      sourceObservers.push(observer);
      if (sourceObservers.length > 1) {
        onResubscribe?.(observer);
      }
      return teardown;
    }),
    get observer() {
      const observer = sourceObservers[sourceObservers.length - 1];
      if (!observer) {
        throw new Error('source has not been subscribed');
      }
      return observer;
    },
    get subscriptions() {
      return sourceObservers.length;
    },
  };
}

function terminate(
  observer: Observer<number, Error>,
  event: 'complete' | 'error',
  error: Error,
) {
  if (event === 'error') {
    observer.error(error);
  } else {
    observer.complete();
  }
}

test('map', () => {
  type EventShape = { num: number };
  const ee = new CustomEventEmitter<EventShape>();
  const eventObservable = observable<EventShape, unknown>((observer) => {
    const callback = (data: EventShape) => {
      observer.next(data);
    };
    ee.on('data', callback);

    return () => {
      ee.off('data', callback);
    };
  });
  const pipeCalls = vi.fn();
  const piped = eventObservable.pipe(
    map((...args) => {
      pipeCalls(...args);
      const [value] = args;
      return value.num;
    }),
  );

  const next = vi.fn();
  const subscription = piped.subscribe({
    next(value) {
      expectTypeOf<number>(value);
      next(value);
    },
  });
  expect(next).not.toHaveBeenCalled();
  ee.emit('data', { num: 1 });
  ee.emit('data', { num: 2 });
  expect(next).toHaveBeenCalledTimes(2);
  expect(next.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        1,
      ],
      Array [
        2,
      ],
    ]
  `);
  expect(pipeCalls.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "num": 1,
        },
        0,
      ],
      Array [
        Object {
          "num": 2,
        },
        1,
      ],
    ]
  `);

  expect(ee.listeners('data')).toHaveLength(1);
  subscription.unsubscribe();
  expect(ee.listeners('data')).toHaveLength(0);
});

test('share', () => {
  const obs = share()(
    observable<number, Error>((observer) => {
      observer.next(1);
    }),
  );

  {
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();

    // oxlint-disable-next-line no-var
    var subscription1 = obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(1);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
    expect(next.mock.calls[0]![0]).toBe(1);
  }

  {
    // subscribe again - it's shared so should not propagate any results
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();
    // oxlint-disable-next-line no-var
    var subscription2 = obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(0);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
  }

  subscription1.unsubscribe();
  subscription2.unsubscribe();
  // now it should be reset so we can do a new subscription
  {
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();
    const subscription3 = obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(1);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
    expect(next.mock.calls[0]![0]).toBe(1);
    subscription3.unsubscribe();
  }
});

test('share delivers values to remaining subscribers after self-unsubscription', () => {
  const teardown = vi.fn();
  const source = createControlledSource(teardown);
  const shared = source.observable.pipe(share());

  const firstNext = vi.fn(() => first.unsubscribe());
  const secondNext = vi.fn();
  const first = shared.subscribe({ next: firstNext });
  const second = shared.subscribe({ next: secondNext });

  source.observer.next(1);
  source.observer.next(2);

  expect(firstNext.mock.calls).toEqual([[1]]);
  expect(secondNext.mock.calls).toEqual([[1], [2]]);
  expect(teardown).not.toHaveBeenCalled();

  second.unsubscribe();
  expect(teardown).toHaveBeenCalledTimes(1);
});

test('share does not repeat a value for a replacement subscription', () => {
  const source = createControlledSource();
  const shared = source.observable.pipe(share());

  const next = vi.fn(() => {
    // Bound a reentrant delivery bug so the test fails instead of looping.
    if (next.mock.calls.length < 3) {
      subscription.unsubscribe();
      subscription = shared.subscribe({ next });
    }
  });
  let subscription = shared.subscribe({ next });

  source.observer.next(1);

  expect(next.mock.calls).toEqual([[1]]);
  subscription.unsubscribe();
});

test('share skips a subscriber cancelled by an earlier subscriber', () => {
  const source = createControlledSource();
  const shared = source.observable.pipe(share());

  const first = shared.subscribe({ next: () => second.unsubscribe() });
  const secondNext = vi.fn();
  const second = shared.subscribe({ next: secondNext });
  const thirdNext = vi.fn();
  const third = shared.subscribe({ next: thirdNext });

  source.observer.next(1);

  expect(secondNext).not.toHaveBeenCalled();
  expect(thirdNext.mock.calls).toEqual([[1]]);

  first.unsubscribe();
  third.unsubscribe();
});

test.each(['complete', 'error'] as const)(
  'share delivers %s to every subscriber',
  (event) => {
    const teardown = vi.fn();
    const source = createControlledSource(teardown);
    const shared = source.observable.pipe(share());

    const first = vi.fn();
    const second = vi.fn();
    shared.subscribe({ complete: first, error: first });
    shared.subscribe({ complete: second, error: second });
    expect(source.subscriptions).toBe(1);

    const error = new Error('source failed');
    terminate(source.observer, event, error);

    const expectedCalls = event === 'error' ? [[error]] : [[]];
    expect(first.mock.calls).toEqual(expectedCalls);
    expect(second.mock.calls).toEqual(expectedCalls);
    expect(teardown).toHaveBeenCalledTimes(1);

    const next = vi.fn();
    const subscription = shared.subscribe({ next });
    expect(source.subscriptions).toBe(2);
    source.observer.next(2);
    expect(next.mock.calls).toEqual([[2]]);
    subscription.unsubscribe();
    expect(teardown).toHaveBeenCalledTimes(2);
  },
);

test.each(['complete', 'error'] as const)(
  'share notifies subscribers of %s in subscription order before tearing down the source',
  (event) => {
    const calls: string[] = [];
    const source = createControlledSource(() => calls.push('teardown'));
    const shared = source.observable.pipe(share());

    for (const name of ['first', 'second', 'third']) {
      shared.subscribe({
        complete: () => calls.push(`${name}:complete`),
        error: () => calls.push(`${name}:error`),
      });
    }

    terminate(source.observer, event, new Error('source failed'));

    expect(calls).toEqual([
      `first:${event}`,
      `second:${event}`,
      `third:${event}`,
      'teardown',
    ]);
  },
);

test.each(['complete', 'error'] as const)(
  'share tears down the source when a %s callback throws',
  (event) => {
    const teardown = vi.fn();
    const source = createControlledSource(teardown);
    const shared = source.observable.pipe(share());

    const callbackError = new Error('callback failed');
    shared.subscribe({
      complete() {
        throw callbackError;
      },
      error() {
        throw callbackError;
      },
    });

    expect(() =>
      terminate(source.observer, event, new Error('source failed')),
    ).toThrow(callbackError);
    expect(teardown).toHaveBeenCalledTimes(1);
  },
);

test.each(['complete', 'error'] as const)(
  'share starts a new source for a subscriber added during %s',
  (event) => {
    const source = createControlledSource();
    const shared = source.observable.pipe(share());

    const lateNext = vi.fn();
    shared.subscribe({
      complete() {
        shared.subscribe({ next: lateNext });
      },
      error() {
        shared.subscribe({ next: lateNext });
      },
    });

    expect(source.subscriptions).toBe(1);

    terminate(source.observer, event, new Error('source failed'));

    expect(source.subscriptions).toBe(2);

    source.observer.next(1);
    expect(lateNext.mock.calls).toEqual([[1]]);
  },
);

test.each(['complete', 'error'] as const)(
  'share skips a subscriber cancelled by an earlier subscriber during %s',
  (event) => {
    const source = createControlledSource();
    const shared = source.observable.pipe(share());

    const cancel = () => second.unsubscribe();
    shared.subscribe({ complete: cancel, error: cancel });
    const secondTerminal = vi.fn();
    const second = shared.subscribe({
      complete: secondTerminal,
      error: secondTerminal,
    });

    terminate(source.observer, event, new Error('source failed'));

    expect(secondTerminal).not.toHaveBeenCalled();
  },
);

test.each(['complete', 'error'] as const)(
  'share keeps a source restarted during %s from erroring the old subscribers',
  (event) => {
    const restartError = new Error('restarted source failed');
    const source = createControlledSource(undefined, (observer) =>
      observer.error(restartError),
    );
    const shared = source.observable.pipe(share());

    const calls: unknown[][] = [];
    const resubscribe = () => {
      shared.subscribe({ error: (err) => calls.push(['late', err]) });
    };
    shared.subscribe({ complete: resubscribe, error: resubscribe });
    shared.subscribe({
      complete: () => calls.push(['second', 'complete']),
      error: (err) => calls.push(['second', err]),
    });

    const error = new Error('source failed');
    terminate(source.observer, event, error);

    expect(source.subscriptions).toBe(2);
    expect(calls).toEqual([
      ['late', restartError],
      ['second', event === 'error' ? error : 'complete'],
    ]);
  },
);

test.each(['complete', 'error'] as const)(
  'share keeps a source restarted during %s from emitting to the old subscribers',
  (event) => {
    const source = createControlledSource(undefined, (observer) =>
      observer.next(2),
    );
    const shared = source.observable.pipe(share());

    const calls: unknown[][] = [];
    const nested: ReturnType<typeof shared.subscribe>[] = [];
    const resubscribe = () => {
      nested.push(
        shared.subscribe({ next: (value) => calls.push(['late', value]) }),
      );
    };
    shared.subscribe({ complete: resubscribe, error: resubscribe });
    shared.subscribe({
      next: (value) => calls.push(['second', value]),
      complete: () => calls.push(['second', event]),
      error: () => calls.push(['second', event]),
    });

    terminate(source.observer, event, new Error('source failed'));

    expect(source.subscriptions).toBe(2);
    expect(calls).toEqual([
      ['late', 2],
      ['second', event],
    ]);

    for (const subscription of nested) {
      subscription.unsubscribe();
    }
  },
);

test('distinctUntilChanged', () => {
  const source = observable<number, never>((observer) => {
    observer.next(1);
    observer.next(1);
    observer.next(2);
    observer.next(2);
    observer.next(3);
    observer.next(1);
  });

  const results: number[] = [];
  const distinctObs = source.pipe(distinctUntilChanged());

  distinctObs.subscribe({
    next: (value) => results.push(value),
  });
  expect(results).toEqual([1, 2, 3, 1]);
});

test('distinctUntilDeepChanged', () => {
  const source = observable<{ a: number; b: { c: string } }, never>(
    (observer) => {
      // Emitting the first value with a = 1 and b.c = 'x'
      observer.next({ a: 1, b: { c: 'x' } });
      // Emitting the same value again to test distinctUntilDeepChanged
      observer.next({ a: 1, b: { c: 'x' } });
      // Emitting a new value with a = 2 and b.c = 'x'
      observer.next({ a: 2, b: { c: 'x' } });
      // Emitting a value with a = 2 and b.c = 'y' to test deep change detection
      observer.next({ a: 2, b: { c: 'y' } });
      // Emitting the same value again to test distinctUntilDeepChanged
      observer.next({ a: 2, b: { c: 'y' } });
      // Emitting the same value with properties in a different order to test deep equality
      observer.next({ b: { c: 'y' }, a: 2 });
      // Emitting the first value again to test if it's considered distinct after a deep change
      observer.next({ a: 1, b: { c: 'x' } });
    },
  );

  const results: { a: number; b: { c: string } }[] = [];
  const distinctObs = source.pipe(distinctUntilDeepChanged());

  distinctObs.subscribe({
    next: (value) => results.push(value),
  });

  expect(results).toEqual([
    { a: 1, b: { c: 'x' } },
    { a: 2, b: { c: 'x' } },
    { a: 2, b: { c: 'y' } },
    { a: 1, b: { c: 'x' } },
  ]);
});

/**
 * The first `terminatingStarts` source subscriptions emit `event` synchronously,
 * later ones synchronously emit their start number and stay open
 */
function createSyncTerminatingSharedSource(
  event: 'complete' | 'error',
  terminatingStarts: number,
) {
  let starts = 0;
  const teardown = vi.fn();
  const shared = observable<number, Error>((observer) => {
    starts++;
    if (starts > terminatingStarts) {
      observer.next(starts);
    } else if (event === 'error') {
      observer.error(new Error('source failed'));
    } else {
      observer.complete();
    }
    return teardown;
  }).pipe(share());

  return {
    shared,
    teardown,
    getStarts: () => starts,
  };
}

test.each(['complete', 'error'] as const)(
  'share tears down a source started by a subscriber during a synchronous %s',
  (event) => {
    const { shared, teardown, getStarts } = createSyncTerminatingSharedSource(
      event,
      1,
    );

    const next = vi.fn();
    const nested: ReturnType<typeof shared.subscribe>[] = [];
    const resubscribe = () => {
      nested.push(shared.subscribe({ next }));
    };
    shared.subscribe({ complete: resubscribe, error: resubscribe });

    expect(getStarts()).toBe(2);
    expect(next.mock.calls).toEqual([[2]]);

    for (const subscription of nested) {
      subscription.unsubscribe();
    }
    expect(teardown).toHaveBeenCalledTimes(2);
  },
);

test.each(['complete', 'error'] as const)(
  'share does not attach a subscriber to a source that terminated synchronously during %s',
  (event) => {
    const { shared, teardown, getStarts } = createSyncTerminatingSharedSource(
      event,
      2,
    );

    const lateNext = vi.fn();
    const nested: ReturnType<typeof shared.subscribe>[] = [];
    const resubscribe = () => {
      // The second source also terminates synchronously
      nested.push(shared.subscribe({}));
      nested.push(shared.subscribe({ next: lateNext }));
    };
    shared.subscribe({ complete: resubscribe, error: resubscribe });

    expect(getStarts()).toBe(3);
    expect(lateNext.mock.calls).toEqual([[3]]);

    for (const subscription of nested) {
      subscription.unsubscribe();
    }
    expect(teardown).toHaveBeenCalledTimes(3);
  },
);

test('share joins a source that is still starting for a subscriber added during a synchronous next', () => {
  const teardown = vi.fn();
  const sourceObservers: Observer<number, Error>[] = [];
  const shared = observable<number, Error>((observer) => {
    sourceObservers.push(observer);
    observer.next(1);
    return teardown;
  }).pipe(share());

  const lateNext = vi.fn();
  const subscriptions: ReturnType<typeof shared.subscribe>[] = [];
  let resubscribed = false;
  subscriptions.push(
    shared.subscribe({
      next() {
        if (!resubscribed) {
          resubscribed = true;
          subscriptions.push(shared.subscribe({ next: lateNext }));
        }
      },
    }),
  );

  expect(sourceObservers).toHaveLength(1);

  for (const observer of sourceObservers) {
    observer.next(2);
  }
  expect(lateNext.mock.calls).toEqual([[2]]);

  for (const subscription of subscriptions) {
    subscription.unsubscribe();
  }
  expect(teardown).toHaveBeenCalledTimes(1);
});

test('share starts the source again after a synchronous next callback throws', () => {
  let starts = 0;
  const shared = observable<number, Error>((observer) => {
    starts++;
    observer.next(starts);
  }).pipe(share());

  const callbackError = new Error('callback failed');
  let thrown = false;
  expect(() =>
    shared.subscribe({
      next() {
        if (!thrown) {
          thrown = true;
          throw callbackError;
        }
      },
    }),
  ).toThrow(callbackError);

  const next = vi.fn();
  const subscription = shared.subscribe({ next });
  expect(starts).toBe(2);
  expect(next.mock.calls).toEqual([[2]]);
  subscription.unsubscribe();
});
