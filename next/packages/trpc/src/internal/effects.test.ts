import { Effect, Stream } from 'effect';
import { expect, test } from 'vite-plus/test';
import { toAsyncIterable } from './effects.ts';

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
