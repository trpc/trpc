import { EventEmitter } from 'stream';
import { observable, observableToAsyncIterable } from './observable';
import { share, tap } from './operators';

test('vanilla observable - complete()', () => {
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    observer.complete();
  });

  const next = vi.fn();
  const error = vi.fn();
  const complete = vi.fn();
  obs.subscribe({
    next,
    error,
    complete,
  });
  expect(next.mock.calls).toHaveLength(1);
  expect(complete.mock.calls).toHaveLength(1);
  expect(error.mock.calls).toHaveLength(0);
  expect(next.mock.calls[0]![0]).toBe(1);
});

test('vanilla observable - unsubscribe()', () => {
  const obs$ = observable<number, Error>((observer) => {
    observer.next(1);
  });

  const next = vi.fn();
  const error = vi.fn();
  const complete = vi.fn();
  const sub = obs$.subscribe({
    next,
    error,
    complete,
  });
  sub.unsubscribe();
  expect(next.mock.calls).toHaveLength(1);
  expect(complete.mock.calls).toHaveLength(0);
  expect(error.mock.calls).toHaveLength(0);
  expect(next.mock.calls[0]![0]).toBe(1);
});

test('pipe - combine operators', () => {
  const taps = {
    next: vi.fn(),
    complete: vi.fn(),
    error: vi.fn(),
  };
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
  }).pipe(
    // operators:
    share(),
    tap(taps),
  );
  {
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();
    obs.subscribe({
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
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();
    obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(0);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
  }

  expect({
    next: taps.next.mock.calls,
    error: taps.error.mock.calls,
    complete: taps.complete.mock.calls,
  }).toMatchInlineSnapshot(`
    Object {
      "complete": Array [],
      "error": Array [],
      "next": Array [
        Array [
          1,
        ],
      ],
    }
  `);
});

test('pipe twice', () => {
  const mockFns = () => {
    return {
      next: vi.fn(),
      complete: vi.fn(),
      error: vi.fn(),
    };
  };
  const pipe1 = mockFns();
  const pipe2 = mockFns();

  let complete: () => void;
  const obs = observable<number, Error>((observer) => {
    observer.next(1);

    complete = observer.complete;
  })
    .pipe(tap(pipe1))
    .pipe(tap(pipe2));

  {
    const end = mockFns();
    obs.subscribe(end);

    expect(pipe1.next.mock.calls).toHaveLength(1);
    expect(pipe2.next.mock.calls).toHaveLength(1);
    expect(pipe1.error.mock.calls).toHaveLength(0);
    expect(pipe2.error.mock.calls).toHaveLength(0);
    expect(pipe1.complete.mock.calls).toHaveLength(0);
    expect(pipe2.complete.mock.calls).toHaveLength(0);
    expect(end.next.mock.calls).toHaveLength(1);
    expect(end.error.mock.calls).toHaveLength(0);
    expect(end.complete.mock.calls).toHaveLength(0);

    complete!();
    expect(pipe1.complete.mock.calls).toHaveLength(1);
    expect(pipe2.complete.mock.calls).toHaveLength(1);
    expect(end.complete.mock.calls).toHaveLength(1);
  }
});

test('observableToAsyncIterable()', async () => {
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    observer.next(2);
    observer.complete();
  });

  const aggregate: unknown[] = [];
  for await (const value of observableToAsyncIterable(
    obs,
    new AbortController().signal,
  )) {
    aggregate.push(value);
  }
  expect(aggregate).toMatchInlineSnapshot(`
    Array [
      1,
      2,
    ]
  `);
});

test('observableToAsyncIterable() - doesnt hang', async () => {
  const ee = new EventEmitter();
  const obs = observable<number, Error>((observer) => {
    const onData = (data: number) => {
      observer.next(data);
    };
    ee.on('data', onData);
    return () => {
      ee.off('data', onData);
    };
  });

  setTimeout(() => {
    ee.emit('data', 1);
    ee.emit('data', 2);
    ee.emit('data', 3);
  }, 1);

  const aggregate: unknown[] = [];
  for await (const value of observableToAsyncIterable(
    obs,
    new AbortController().signal,
  )) {
    aggregate.push(value);
    if (aggregate.length === 3) {
      break;
    }
  }

  expect(ee.listenerCount('data')).toBe(0);
});

test('observableToAsyncIterable() - source emits during teardown', async () => {
  const ee = new EventEmitter();
  const obs = observable<number, Error>((observer) => {
    const onData = (data: number) => {
      observer.next(data);
    };
    ee.on('data', onData);
    return () => {
      ee.off('data', onData);
      // some sources emit a final `complete` when they are torn down,
      // this should not throw after the stream has been cancelled
      observer.complete();
    };
  });

  setTimeout(() => {
    ee.emit('data', 1);
  }, 1);

  const aggregate: unknown[] = [];
  for await (const value of observableToAsyncIterable(
    obs,
    new AbortController().signal,
  )) {
    aggregate.push(value);
    break;
  }

  expect(aggregate).toEqual([1]);
  expect(ee.listenerCount('data')).toBe(0);
});

test('observableToAsyncIterable() - source errors during teardown', async () => {
  const ee = new EventEmitter();
  const obs = observable<number, Error>((observer) => {
    const onData = (data: number) => {
      observer.next(data);
    };
    ee.on('data', onData);
    return () => {
      ee.off('data', onData);
      // some sources emit a final `error` when they are torn down,
      // this should not throw after the stream has been cancelled
      observer.error(new Error('teardown error'));
    };
  });

  setTimeout(() => {
    ee.emit('data', 1);
  }, 1);

  const aggregate: unknown[] = [];
  for await (const value of observableToAsyncIterable(
    obs,
    new AbortController().signal,
  )) {
    aggregate.push(value);
    break;
  }

  expect(aggregate).toEqual([1]);
  expect(ee.listenerCount('data')).toBe(0);
});

test('observableToAsyncIterable() - aborting the signal ends iteration', async () => {
  const ee = new EventEmitter();
  const obs = observable<number, Error>((observer) => {
    const onData = (data: number) => {
      observer.next(data);
    };
    ee.on('data', onData);
    return () => {
      ee.off('data', onData);
      // note: this source does not emit anything more once torn down
    };
  });

  const ac = new AbortController();
  setTimeout(() => {
    ee.emit('data', 1);
    ac.abort();
  }, 1);

  const aggregate: unknown[] = [];
  for await (const value of observableToAsyncIterable(obs, ac.signal)) {
    aggregate.push(value);
  }

  expect(aggregate).toEqual([1]);
  expect(ee.listenerCount('data')).toBe(0);
});

test('observableToAsyncIterable() - abort ignores source emissions during teardown', async () => {
  const ac = new AbortController();
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    return () => {
      observer.next(2);
      observer.error(new Error('teardown error'));
    };
  });

  const aggregate: unknown[] = [];
  for await (const value of observableToAsyncIterable(obs, ac.signal)) {
    aggregate.push(value);
    ac.abort();
  }

  expect(aggregate).toEqual([1]);
});

test('observableToAsyncIterable() - synchronous settlement does not attach an abort listener', async () => {
  const ac = new AbortController();
  const addEventListenerSpy = vi.spyOn(ac.signal, 'addEventListener');

  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    observer.complete();
  });

  const aggregate: unknown[] = [];
  for await (const value of observableToAsyncIterable(obs, ac.signal)) {
    aggregate.push(value);
  }

  expect(aggregate).toEqual([1]);
  expect(addEventListenerSpy).not.toHaveBeenCalled();

  ac.abort();
  expect(ac.signal.aborted).toBe(true);
});

test('observableToAsyncIterable() - pre-aborted signal does not subscribe', async () => {
  const subscribe = vi.fn();
  const obs = observable<number, Error>(() => {
    subscribe();
    return () => {
      // noop
    };
  });

  const ac = new AbortController();
  ac.abort();

  for await (const value of observableToAsyncIterable(obs, ac.signal)) {
    void value;
  }

  expect(subscribe).not.toHaveBeenCalled();
});

test('observableToAsyncIterable() - break unsubscribes without an abort signal', async () => {
  const teardown = vi.fn();
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    return teardown;
  });

  // a signal that is never aborted, mirroring the
  // `new AbortController().signal` fallback in `subscriptionAsIterable` -
  // teardown must be driven by the consumer stopping iteration
  const neverAbortedSignal = new AbortController().signal;

  const aggregate: unknown[] = [];
  for await (const value of observableToAsyncIterable(
    obs,
    neverAbortedSignal,
  )) {
    aggregate.push(value);
    break;
  }

  expect(aggregate).toEqual([1]);
  expect(teardown).toHaveBeenCalledTimes(1);
});

test('observableToAsyncIterable() - consumer cancel detaches the abort listener', async () => {
  const ac = new AbortController();
  const removeEventListenerSpy = vi.spyOn(ac.signal, 'removeEventListener');

  const teardown = vi.fn();
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    return teardown;
  });

  const aggregate: unknown[] = [];
  for await (const value of observableToAsyncIterable(obs, ac.signal)) {
    aggregate.push(value);
    break;
  }

  expect(aggregate).toEqual([1]);
  // the consumer cancelled iteration without aborting the signal, yet the
  // abort listener is detached and the subscription is torn down
  expect(removeEventListenerSpy).toHaveBeenCalled();
  expect(teardown).toHaveBeenCalledTimes(1);
  expect(ac.signal.aborted).toBe(false);
});
