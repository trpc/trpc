import { Cause, Effect, Exit, Fiber, Stream } from 'effect';
import { expect, test } from 'vite-plus/test';
import {
  interruptSignal,
  reportTeardown,
  returnUnawaited,
  toAsyncIterable,
} from './effects.ts';

const tracked = () => {
  const state = { started: 0, closed: 0 };
  const stream = Stream.concat(
    Stream.make(1),
    Stream.never as Stream.Stream<number>,
  ).pipe(
    Stream.onStart(Effect.sync(() => state.started++)),
    Stream.ensuring(Effect.sync(() => state.closed++)),
  );
  return { state, stream };
};

test('an abort ends a pending next() and closes the stream', async () => {
  const source = tracked();
  const controller = new AbortController();
  const iterator = toAsyncIterable(source.stream, controller.signal)[
    Symbol.asyncIterator
  ]();
  expect(await iterator.next()).toEqual({ done: false, value: 1 });
  const pending = iterator.next();
  controller.abort();
  expect(await pending).toEqual({ done: true, value: undefined });
  expect(await iterator.next()).toEqual({ done: true, value: undefined });
  expect(source.state.closed).toBe(1);
});

const settle = (promise: Promise<unknown>) =>
  promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );

/** Emits `values` in one chunk, then waits; its finalizer dies. */
const failingTeardown = (...values: number[]) => {
  const teardown = new Error('teardown');
  const state = { closed: 0 };
  const stream = Stream.concat(
    Stream.fromArray(values),
    Stream.never as Stream.Stream<number>,
  ).pipe(
    Stream.ensuring(
      Effect.suspend(() => {
        state.closed++;
        return Effect.die(teardown);
      }),
    ),
  );
  return { state, stream, teardown };
};

test('an abort still yields the values already received', async () => {
  const source = tracked();
  const controller = new AbortController();
  const iterator = toAsyncIterable(
    Stream.concat(Stream.make(0), source.stream),
    controller.signal,
  )[Symbol.asyncIterator]();
  expect(await iterator.next()).toEqual({ done: false, value: 0 });
  await new Promise((resolve) => setTimeout(resolve));
  controller.abort();
  expect(await iterator.next()).toEqual({ done: false, value: 1 });
  expect(await iterator.next()).toEqual({ done: true, value: undefined });
  expect(source.state.closed).toBe(1);
});

test('an abort runs the finalizers before the queued values are read', async () => {
  const source = tracked();
  const controller = new AbortController();
  const iterator = toAsyncIterable(source.stream, controller.signal)[
    Symbol.asyncIterator
  ]();
  expect(await iterator.next()).toEqual({ done: false, value: 1 });
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve));
  expect(source.state.closed).toBe(1);
});

test('a finalizer that fails on abort rejects the next() after the queued values, once', async () => {
  const source = failingTeardown(1, 2);
  const controller = new AbortController();
  const iterator = toAsyncIterable(source.stream, controller.signal)[
    Symbol.asyncIterator
  ]();
  expect(await iterator.next()).toEqual({ done: false, value: 1 });
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve));
  expect(source.state.closed).toBe(1);
  expect(await iterator.next()).toEqual({ done: false, value: 2 });
  expect(await settle(iterator.next())).toEqual({ error: source.teardown });
  expect(await iterator.next()).toEqual({ done: true, value: undefined });
});

test('a finalizer that fails on abort rejects a pending next()', async () => {
  const source = failingTeardown(1);
  const controller = new AbortController();
  const iterator = toAsyncIterable(source.stream, controller.signal)[
    Symbol.asyncIterator
  ]();
  expect(await iterator.next()).toEqual({ done: false, value: 1 });
  const pending = settle(iterator.next());
  controller.abort();
  expect(await pending).toEqual({ error: source.teardown });
  expect(await iterator.next()).toEqual({ done: true, value: undefined });
});

test('a finalizer that fails on abort rejects return() when no next() read it', async () => {
  const source = failingTeardown(1);
  const controller = new AbortController();
  const iterator = toAsyncIterable(source.stream, controller.signal)[
    Symbol.asyncIterator
  ]();
  expect(await iterator.next()).toEqual({ done: false, value: 1 });
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve));
  expect(await settle(iterator.return!())).toEqual({ error: source.teardown });
});

test('a finalizer that fails on break is thrown from the loop', async () => {
  const source = failingTeardown(1, 2);
  const seen: unknown[] = [];
  const loop = async () => {
    for await (const value of toAsyncIterable(
      source.stream,
      new AbortController().signal,
    )) {
      seen.push(value);
      break;
    }
  };
  expect(await settle(loop())).toEqual({ error: source.teardown });
  expect(seen).toEqual([1]);
  expect(source.state.closed).toBe(1);
});

test('break drops the values not read yet', async () => {
  const state = { closed: 0 };
  const iterator = toAsyncIterable(
    Stream.concat(
      Stream.make(1, 2),
      Stream.never as Stream.Stream<number>,
    ).pipe(Stream.ensuring(Effect.sync(() => state.closed++))),
    new AbortController().signal,
  )[Symbol.asyncIterator]();
  expect(await iterator.next()).toEqual({ done: false, value: 1 });
  expect(await iterator.return!()).toEqual({ done: true, value: undefined });
  expect(await iterator.next()).toEqual({ done: true, value: undefined });
  expect(state.closed).toBe(1);
});

test('a failure rejects the next() after the queued values, once', async () => {
  const error = new Error('boom');
  const iterator = toAsyncIterable(
    Stream.concat(Stream.make(1, 2), Stream.fail(error)),
    new AbortController().signal,
  )[Symbol.asyncIterator]();
  expect(await iterator.next()).toEqual({ done: false, value: 1 });
  expect(await iterator.next()).toEqual({ done: false, value: 2 });
  expect(await settle(iterator.next())).toEqual({ error });
  expect(await iterator.next()).toEqual({ done: true, value: undefined });
});

test('an aborted signal never starts the stream', async () => {
  const source = tracked();
  const iterator = toAsyncIterable(source.stream, AbortSignal.abort())[
    Symbol.asyncIterator
  ]();
  expect(await iterator.next()).toEqual({ done: true, value: undefined });
  expect(source.state.started).toBe(0);
});

test('throw() closes the stream and rethrows', async () => {
  const source = tracked();
  const iterator = toAsyncIterable(source.stream, new AbortController().signal)[
    Symbol.asyncIterator
  ]();
  await iterator.next();
  const error = new Error('stop');
  await expect(iterator.throw?.(error)).rejects.toBe(error);
  expect(source.state.closed).toBe(1);
});

test('interruptSignal aborts once a wrapped effect is interrupted, not when it ends', async () => {
  const signals = await Effect.runPromise(
    Effect.gen(function* () {
      const done = yield* interruptSignal();
      yield* done.abortOnInterrupt(Effect.void);
      const failed = yield* interruptSignal();
      yield* Effect.exit(failed.abortOnInterrupt(Effect.fail('boom')));
      const interrupted = yield* interruptSignal();
      const fiber = yield* Effect.forkChild(
        interrupted.abortOnInterrupt(Effect.never),
      );
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);
      return [done, failed, interrupted].map((s) => s.signal.aborted);
    }),
  );
  expect(signals).toEqual([false, false, true]);
});

test('interruptSignal aborts once a wrapped stream is interrupted', async () => {
  const aborted = await Effect.runPromise(
    Effect.gen(function* () {
      const interrupt = yield* interruptSignal();
      const fiber = yield* Effect.forkChild(
        Stream.runDrain(interrupt.abortOnInterrupt(tracked().stream)),
      );
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);
      return interrupt.signal.aborted;
    }),
  );
  expect(aborted).toBe(true);
});

test('reportTeardown reports a finalizer that fails while the reader is interrupted handling a value', async () => {
  const source = failingTeardown(1);
  const reported: unknown[] = [];
  await Effect.gen(function* () {
    const reader = yield* Effect.forkChild(
      Stream.runForEach(
        reportTeardown(source.stream, (failure) =>
          reported.push(Cause.squash(failure)),
        ),
        () => Effect.never,
      ),
    );
    yield* Effect.sleep(10);
    yield* Fiber.interrupt(reader);
  }).pipe(Effect.runPromise);
  expect(source.state.closed).toBe(1);
  expect(reported).toEqual([source.teardown]);
});

test('reportTeardown reports a finalizer that fails when the reader ends the stream early', async () => {
  const source = failingTeardown(1, 2);
  const reported: unknown[] = [];
  const values = await reportTeardown(source.stream, (failure) =>
    reported.push(Cause.squash(failure)),
  ).pipe(Stream.take(1), Stream.runCollect, Effect.runPromise);
  expect(values).toEqual([1]);
  expect(reported).toEqual([source.teardown]);
});

test('reportTeardown leaves a failure the reader gets to the reader', async () => {
  const boom = new Error('boom');
  const reported: unknown[] = [];
  const exit = await reportTeardown(
    Stream.concat(Stream.make(1), Stream.die(boom)),
    (failure) => reported.push(failure),
  ).pipe(Stream.runCollect, Effect.runPromiseExit);
  expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(boom);
  expect(reported).toEqual([]);
});

test('returnUnawaited hands a generator that throws after return() to onLateFailure', async () => {
  const teardown = new Error('teardown');
  const late: unknown[] = [];
  let release = () => {};
  async function* source() {
    try {
      yield 1;
      await new Promise<void>((resolve) => (release = resolve));
    } finally {
      // oxlint-disable-next-line no-unsafe-finally
      throw teardown;
    }
  }
  const iterator = returnUnawaited(source(), (error) => late.push(error))[
    Symbol.asyncIterator
  ]();
  expect(await iterator.next()).toEqual({ done: false, value: 1 });
  const pending = iterator.next();
  pending.catch(() => {});
  expect(await iterator.return!()).toEqual({ done: true, value: undefined });
  release();
  await expect(pending).rejects.toBe(teardown);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(late).toEqual([teardown]);
});
