import { expect, test, vi } from 'vitest';
import type { IterableToReadableStreamValue } from './readableStreamFrom';
import { readableStreamFrom } from './readableStreamFrom';

test('creates readable stream from async iterable', async () => {
  const values = [1, 2, 3];
  async function* generator() {
    for (const value of values) {
      yield value;
    }
    return 'done';
  }

  const stream = readableStreamFrom(generator());

  expectTypeOf(stream).toEqualTypeOf<
    ReadableStream<IterableToReadableStreamValue<number, string>>
  >();
  const reader = stream.getReader();
  for (const expected of values) {
    const result = await reader.read();
    expect(result.done).toBe(false);
    expect(result.value).toEqual({
      type: 'yield',
      value: expected,
    });
  }

  const result = await reader.read();
  expect(result.value).toEqual({
    type: 'return',
    value: 'done',
  });
  expect(result.done).toBe(false);

  const finalResult = await reader.read();
  expect(finalResult.value).toBeUndefined();
  expect(finalResult.done).toBe(true);
});

test('calls return on iterator when stream is cancelled', async () => {
  const returnMock = vi.fn();
  async function* generator() {
    try {
      while (true) {
        yield 1;
      }
    } finally {
      returnMock();
      return 'cancelled';
    }
  }

  const stream = readableStreamFrom(generator());
  const reader = stream.getReader();

  // Read one value to start the stream
  const result = await reader.read();
  expect(result.value).toEqual({
    type: 'yield',
    value: 1,
  });

  // Cancel the stream
  await reader.cancel();

  expect(returnMock).toHaveBeenCalled();
});

test('handles cleanup error gracefully', async () => {
  let ended = false;
  async function* generator() {
    try {
      while (true) {
        yield 1;
      }
    } finally {
      ended = true;
      throw new Error('Cleanup error');
    }
  }

  const stream = readableStreamFrom(generator());
  const reader = stream.getReader();

  // Read one value to start the stream
  const result = await reader.read();
  expect(result.value).toEqual({
    type: 'yield',
    value: 1,
  });

  // Cancel the stream
  await reader.cancel();

  expect(ended).toBe(true);
});
