import { fakeTimersResource } from '@trpc/server/__tests__/fakeTimersResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { dataLoader } from '@trpc/client/internals/dataLoader';

describe('basic', () => {
  const fetchFn = vi.fn();
  const validateFn = vi.fn();
  const loader = dataLoader<number, number>({
    validate: () => {
      validateFn();
      return true;
    },
    fetch: (keys) => {
      fetchFn(keys);
      return new Promise((resolve) => {
        resolve(keys.map((v) => v + 1));
      });
    },
  });

  beforeEach(() => {
    fetchFn.mockClear();
    validateFn.mockClear();
  });

  test('no time between calls', async () => {
    const $result = await Promise.all([loader.load(1), loader.load(2)]);
    expect($result).toEqual([2, 3]);
    expect(validateFn.mock.calls.length).toMatchInlineSnapshot(`2`);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenNthCalledWith(1, [1, 2]);
  });

  test('time between calls', async () => {
    using fakeTimers = fakeTimersResource();
    const res1 = loader.load(3);
    await fakeTimers.advanceTimersByTimeAsync(0);

    const res2 = loader.load(4);
    await fakeTimers.advanceTimersByTimeAsync(0);

    const $result = await Promise.all([res1, res2]);

    expect($result).toEqual([4, 5]);
    expect(validateFn.mock.calls.length).toMatchInlineSnapshot(`2`);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenNthCalledWith(1, [3]);
    expect(fetchFn).toHaveBeenNthCalledWith(2, [4]);
  });
});

test('errors', async () => {
  const loader = dataLoader<number, number>({
    validate: () => true,
    fetch: () => {
      return new Promise((_resolve, reject) => {
        reject(new Error('Some error'));
      });
    },
  });

  const result1 = loader.load(1);
  const result2 = loader.load(2);

  await expect(result1).rejects.toMatchInlineSnapshot(`[Error: Some error]`);
  await expect(result2).rejects.toMatchInlineSnapshot(`[Error: Some error]`);
});

describe('validation', () => {
  const validateFn = vi.fn();
  const fetchFn = vi.fn();
  const loader = dataLoader<number, number>({
    validate: (keys) => {
      validateFn(keys);
      const sum = keys.reduce((acc, key) => acc + key, 0);
      return sum < 10;
    },
    fetch: (keys) => {
      fetchFn(keys);
      return new Promise((resolve) => {
        resolve(keys.map((v) => v + 1));
      });
    },
  });

  beforeEach(() => {
    fetchFn.mockClear();
    validateFn.mockClear();
  });

  test('1', async () => {
    const $result = await Promise.all([
      loader.load(1),
      loader.load(9),
      loader.load(0),
    ]);
    expect($result).toEqual([2, 10, 1]);
    expect(validateFn.mock.calls.length).toMatchInlineSnapshot(`4`);
  });

  test('2', async () => {
    const $result = await Promise.all([
      loader.load(2),
      loader.load(9),
      loader.load(3),
      loader.load(4),
      loader.load(5),
      loader.load(1),
    ]);
    expect($result).toMatchInlineSnapshot(`
      Array [
        3,
        10,
        4,
        5,
        6,
        2,
      ]
    `);
    expect(validateFn.mock.calls.length).toMatchInlineSnapshot(`9`);
    expect(fetchFn.mock.calls.length).toMatchInlineSnapshot(`4`);
  });

  test('too large', async () => {
    const $result = await waitError(loader.load(13));
    expect($result).toMatchInlineSnapshot(
      `[Error: Input is too big for a single dispatch]`,
    );
  });
});
