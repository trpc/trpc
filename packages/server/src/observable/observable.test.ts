import { EventEmitter } from 'stream';
import { observable, observableToAsyncIterable } from './observable';
import { share, tap } from './operators';
import type { Observer } from './types';

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

test('observableToAsyncIterable() - aborting ends a pending next()', async () => {
  const teardown = vi.fn();
  const obs = observable<number, Error>(() => teardown);
  const ac = new AbortController();
  const iterator = observableToAsyncIterable(obs, ac.signal)[
    Symbol.asyncIterator
  ]();

  const first = iterator.next();
  const second = iterator.next();
  ac.abort();

  const hung = new Promise((resolve) => setTimeout(resolve, 100, 'hung'));
  expect(await Promise.race([first, hung])).toEqual({
    value: undefined,
    done: true,
  });
  expect(await Promise.race([second, hung])).toEqual({
    value: undefined,
    done: true,
  });
  expect(teardown).toHaveBeenCalledTimes(1);
});

test('observableToAsyncIterable() - aborting still yields the queued values', async () => {
  const ac = new AbortController();
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    observer.next(2);
  });

  const iterable = observableToAsyncIterable(obs, ac.signal);
  ac.abort();

  const aggregate: number[] = [];
  for await (const value of iterable) {
    aggregate.push(value);
  }
  expect(aggregate).toEqual([1, 2]);
});

test('observableToAsyncIterable() - completing during teardown does not throw on break', async () => {
  // like `httpSubscriptionLink`, which completes when it is torn down
  const ee = new EventEmitter();
  const obs = observable<number, Error>((observer) => {
    const onData = (data: number) => observer.next(data);
    ee.on('data', onData);
    return () => {
      ee.off('data', onData);
      observer.complete();
    };
  });

  setTimeout(() => ee.emit('data', 1));

  const aggregate: number[] = [];
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

test('observableToAsyncIterable() - a throwing teardown still ends every pending next()', async () => {
  const obs = observable<number, Error>(() => () => {
    throw new Error('teardown');
  });
  const iterator = observableToAsyncIterable(obs, new AbortController().signal)[
    Symbol.asyncIterator
  ]();

  const first = iterator.next();
  const second = iterator.next();
  // the teardown error goes to whoever ended the iteration
  await expect(iterator.return!()).rejects.toThrowError('teardown');

  const hung = new Promise((resolve) => setTimeout(resolve, 100, 'hung'));
  expect(await Promise.race([first, hung])).toEqual({
    value: undefined,
    done: true,
  });
  expect(await Promise.race([second, hung])).toEqual({
    value: undefined,
    done: true,
  });
});

/** Runs `fn`, then waits a macrotask, and returns the uncaught exceptions and unhandled rejections. */
async function collectUncaught(fn: () => unknown) {
  const errors: unknown[] = [];
  const onError = (cause: unknown) => errors.push(cause);
  process.on('uncaughtException', onError);
  process.on('unhandledRejection', onError);
  try {
    await fn();
    await new Promise((resolve) => setTimeout(resolve));
  } finally {
    process.off('uncaughtException', onError);
    process.off('unhandledRejection', onError);
  }
  return errors;
}

test('observableToAsyncIterable() - a throwing teardown on abort rejects the next() after the queued values', async () => {
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    return () => {
      throw new Error('teardown');
    };
  });
  const ac = new AbortController();
  const iterator = observableToAsyncIterable(obs, ac.signal)[
    Symbol.asyncIterator
  ]();

  expect(await collectUncaught(() => ac.abort())).toEqual([]);

  expect(await iterator.next()).toEqual({ value: 1, done: false });
  await expect(iterator.next()).rejects.toThrowError('teardown');
  expect(await iterator.next()).toEqual({ value: undefined, done: true });
});

test('observableToAsyncIterable() - a throwing teardown on abort rejects the first pending next()', async () => {
  const obs = observable<number, Error>(() => () => {
    throw new Error('teardown');
  });
  const ac = new AbortController();
  const iterator = observableToAsyncIterable(obs, ac.signal)[
    Symbol.asyncIterator
  ]();
  const results = Promise.allSettled([iterator.next(), iterator.next()]);

  expect(await collectUncaught(() => ac.abort())).toEqual([]);

  expect(await results).toEqual([
    { status: 'rejected', reason: new Error('teardown') },
    { status: 'fulfilled', value: { value: undefined, done: true } },
  ]);
  expect(await iterator.next()).toEqual({ value: undefined, done: true });
});

test('observableToAsyncIterable() - a throwing teardown on break is thrown from the loop', async () => {
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    return () => {
      throw new Error('teardown');
    };
  });

  const aggregate: number[] = [];
  let thrown: unknown;
  const uncaught = await collectUncaught(async () => {
    try {
      for await (const value of observableToAsyncIterable(
        obs,
        new AbortController().signal,
      )) {
        aggregate.push(value);
        break;
      }
    } catch (cause) {
      thrown = cause;
    }
  });

  expect(uncaught).toEqual([]);
  expect(aggregate).toEqual([1]);
  expect(thrown).toEqual(new Error('teardown'));
});

function withThrowingTeardown() {
  let source!: Observer<number, Error>;
  const obs = observable<number, Error>((observer) => {
    source = observer;
    return () => {
      throw new Error('teardown');
    };
  });
  const iterator = observableToAsyncIterable(obs, new AbortController().signal);
  return { source, iterator };
}

test('observableToAsyncIterable() - a throwing teardown on completion is thrown to the source and ends the pending next()', async () => {
  {
    const { source, iterator } = withThrowingTeardown();
    const pending = iterator.next();

    expect(() => source.complete()).toThrowError('teardown');
    expect(await pending).toEqual({ value: undefined, done: true });
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  }
  {
    const { source, iterator } = withThrowingTeardown();
    source.next(1);

    expect(() => source.complete()).toThrowError('teardown');
    expect(await iterator.next()).toEqual({ value: 1, done: false });
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  }
});

test('observableToAsyncIterable() - a throwing teardown on error is thrown to the source, and the pending next() rejects with the error', async () => {
  {
    const { source, iterator } = withThrowingTeardown();
    const pending = iterator.next();

    expect(() => source.error(new Error('source'))).toThrowError('teardown');
    await expect(pending).rejects.toThrowError('source');
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  }
  {
    const { source, iterator } = withThrowingTeardown();
    source.next(1);

    expect(() => source.error(new Error('source'))).toThrowError('teardown');
    expect(await iterator.next()).toEqual({ value: 1, done: false });
    await expect(iterator.next()).rejects.toThrowError('source');
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  }
});

test('observableToAsyncIterable() - return() resolves after the source completed', async () => {
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    observer.complete();
  });
  const iterator = observableToAsyncIterable(obs, new AbortController().signal)[
    Symbol.asyncIterator
  ]();

  expect(await iterator.return!()).toEqual({ value: undefined, done: true });
  expect(await iterator.next()).toEqual({ value: undefined, done: true });
});

test('observableToAsyncIterable() - an error rejects the next next() once, after the queued values', async () => {
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    observer.error(new Error('boom'));
  });
  const iterator = observableToAsyncIterable(obs, new AbortController().signal)[
    Symbol.asyncIterator
  ]();

  expect(await iterator.next()).toEqual({ value: 1, done: false });
  await expect(iterator.next()).rejects.toThrowError('boom');
  expect(await iterator.next()).toEqual({ value: undefined, done: true });
});

test('observableToAsyncIterable() - an error rejects a pending next() and ends the others', async () => {
  let observer!: Observer<number, Error>;
  const obs = observable<number, Error>((o) => {
    observer = o;
  });
  const iterator = observableToAsyncIterable(obs, new AbortController().signal)[
    Symbol.asyncIterator
  ]();

  const first = iterator.next();
  const second = iterator.next();
  const third = iterator.next();
  observer.next(1);
  observer.error(new Error('boom'));

  expect(await first).toEqual({ value: 1, done: false });
  await expect(second).rejects.toThrowError('boom');
  expect(await third).toEqual({ value: undefined, done: true });
});
