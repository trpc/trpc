/* eslint-disable @typescript-eslint/no-empty-function */
import { waitError, waitMs } from '../___testHelpers';
import { dataLoader } from '../../../client/src/internals/dataLoader';

describe('basic', () => {
  const fetchFn = jest.fn();
  const validateFn = jest.fn();
  const loader = dataLoader<number, number>({
    validate: () => {
      validateFn();
      return true;
    },
    fetch: (keys) => {
      fetchFn(keys);
      const promise = new Promise<number[]>((resolve) => {
        resolve(keys.map((v) => v + 1));
      });
      return { promise, cancel: () => {} };
    },
  });

  beforeEach(() => {
    fetchFn.mockClear();
    validateFn.mockClear();
  });

  test('no time between calls', async () => {
    const $result = await Promise.all([
      loader.load(1).promise,
      loader.load(2).promise,
    ]);
    expect($result).toEqual([2, 3]);
    expect(validateFn.mock.calls.length).toMatchInlineSnapshot(`2`);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenNthCalledWith(1, [1, 2]);
  });

  test('time between calls', async () => {
    const res1 = loader.load(3);
    await waitMs(1);
    const res2 = loader.load(4);

    const $result = await Promise.all([res1.promise, res2.promise]);

    expect($result).toEqual([4, 5]);
    expect(validateFn.mock.calls.length).toMatchInlineSnapshot(`2`);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenNthCalledWith(1, [3]);
    expect(fetchFn).toHaveBeenNthCalledWith(2, [4]);
  });
});

describe('cancellation', () => {
  const fetchFn = jest.fn();
  const validateFn = jest.fn();
  const cancelFn = jest.fn();
  const loader = dataLoader<number, number>({
    validate: () => {
      return true;
    },
    fetch: (keys) => {
      fetchFn();
      const promise = new Promise<number[]>((resolve) => {
        setTimeout(() => {
          resolve(keys.map((v) => v + 1));
        }, 10);
      });
      return { promise, cancel: cancelFn };
    },
  });

  beforeEach(() => {
    fetchFn.mockClear();
    validateFn.mockClear();
    cancelFn.mockClear();
  });

  test('cancel immediately before it is executed', async () => {
    const res1 = loader.load(1);
    const res2 = loader.load(2);

    res1.cancel();
    res2.cancel();

    expect(fetchFn).toHaveBeenCalledTimes(0);
    expect(validateFn).toHaveBeenCalledTimes(0);
    expect(cancelFn).toHaveBeenCalledTimes(0);
    expect(await Promise.allSettled([res1.promise, res2.promise]))
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "reason": [Error: Aborted],
          "status": "rejected",
        },
        Object {
          "reason": [Error: Aborted],
          "status": "rejected",
        },
      ]
    `);
  });

  test('cancel after some time', async () => {
    const res1 = loader.load(2);
    const res2 = loader.load(3);

    await waitMs(1);

    res1.cancel();
    res2.cancel();

    expect(await Promise.allSettled([res1.promise, res2.promise]))
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "status": "fulfilled",
          "value": 3,
        },
        Object {
          "status": "fulfilled",
          "value": 4,
        },
      ]
    `);
  });

  test('cancel only a single request', async () => {
    const res1 = loader.load(2);
    const res2 = loader.load(3);

    res2.cancel();

    expect(cancelFn).toHaveBeenCalledTimes(0);

    expect(await Promise.allSettled([res1.promise, res2.promise]))
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "status": "fulfilled",
          "value": 3,
        },
        Object {
          "reason": [Error: Aborted],
          "status": "rejected",
        },
      ]
    `);
  });
});

test('errors', async () => {
  const loader = dataLoader<number, number>({
    validate: () => true,
    fetch: () => {
      const promise = new Promise<number[]>((_resolve, reject) => {
        reject(new Error('Some error'));
      });
      return { promise, cancel: () => {} };
    },
  });

  const result1 = loader.load(1);
  const result2 = loader.load(2);

  await expect(result1.promise).rejects.toMatchInlineSnapshot(
    `[Error: Some error]`,
  );
  await expect(result2.promise).rejects.toMatchInlineSnapshot(
    `[Error: Some error]`,
  );
});

describe('validation', () => {
  const validateFn = jest.fn();
  const fetchFn = jest.fn();
  const loader = dataLoader<number, number>({
    validate: (keys) => {
      validateFn(keys);
      const sum = keys.reduce((acc, key) => acc + key, 0);
      return sum < 10;
    },
    fetch: (keys) => {
      fetchFn(keys);
      const promise = new Promise<number[]>((resolve) => {
        resolve(keys.map((v) => v + 1));
      });
      return { promise, cancel: () => {} };
    },
  });

  beforeEach(() => {
    fetchFn.mockClear();
    validateFn.mockClear();
  });

  test('1', async () => {
    const $result = await Promise.all([
      loader.load(1).promise,
      loader.load(9).promise,
      loader.load(0).promise,
    ]);
    expect($result).toEqual([2, 10, 1]);
    expect(validateFn.mock.calls.length).toMatchInlineSnapshot(`4`);
  });

  test('2', async () => {
    const $result = await Promise.all([
      loader.load(2).promise,
      loader.load(9).promise,
      loader.load(3).promise,
      loader.load(4).promise,
      loader.load(5).promise,
      loader.load(1).promise,
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
    const $result = await waitError(loader.load(13).promise);
    expect($result).toMatchInlineSnapshot(
      `[Error: Input is too big for a single dispatch]`,
    );
  });
});
