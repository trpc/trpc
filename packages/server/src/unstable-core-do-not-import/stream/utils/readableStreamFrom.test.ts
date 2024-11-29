import { expect, test, vi } from 'vitest';
import { readableStreamFrom } from './readableStreamFrom';

test('creates readable stream from async iterable', async () => {
  const values = [1, 2, 3];
  async function* generator() {
    for (const value of values) {
      yield value;
    }
  }

  const stream = readableStreamFrom(generator());

  expectTypeOf(stream).toEqualTypeOf<ReadableStream<number>>();
  const reader = stream.getReader();
  for (const expected of values) {
    const result = await reader.read();
    expect(result.done).toBe(false);
    expect(result.value).toEqual(expected);
  }

  const result = await reader.read();
  expect(result.value).toBeUndefined();
  expect(result.done).toBe(true);
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
    }
  }

  const stream = readableStreamFrom(generator());
  const reader = stream.getReader();

  // Read one value to start the stream
  const result = await reader.read();
  expect(result.value).toEqual(1);

  // Cancel the stream
  await reader.cancel();

  expect(returnMock).toHaveBeenCalled();
});

function overrideCancel<T>(stream: ReadableStream<T>) {
  const originalCancel = stream.cancel.bind(stream);

  const mock = vi.spyOn(stream, 'cancel').mockImplementation(originalCancel);

  return mock;
}

test('override cancel', async () => {
  const values = [1, 2, 3];
  async function* generator() {
    for (const value of values) {
      yield value;
    }
  }

  const stream = readableStreamFrom(generator());

  const mock = overrideCancel(stream);

  const reader = stream.getReader();
  const res: number[] = [];
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    res.push(result.value);
  }

  expect(res).toEqual(values);

  expect(mock).toHaveBeenCalled();
});
