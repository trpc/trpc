/* eslint-disable @typescript-eslint/no-empty-function */
import { waitFor } from '@testing-library/dom';
import { dataLoader } from '../../client/src/internals/dataLoader';

test('basic', async () => {
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
  {
    const $result = await Promise.all([
      loader.load(1).promise,
      loader.load(2).promise,
    ]);
    expect($result).toEqual([2, 3]);
    expect(validateFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenNthCalledWith(1, [1, 2]);
    validateFn.mockClear();
    fetchFn.mockClear();
  }
  {
    // some time between calls
    const res1 = loader.load(3);
    await new Promise((resolve) => setTimeout(resolve, 1));
    const res2 = loader.load(4);

    const $result = await Promise.all([res1.promise, res2.promise]);

    expect($result).toEqual([4, 5]);
    expect(validateFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenNthCalledWith(1, [3]);
    expect(fetchFn).toHaveBeenNthCalledWith(2, [4]);
  }
});

test('cancellation', async () => {
  const fetchFn = jest.fn();
  const validateFn = jest.fn();
  const cancelFn = jest.fn();
  const loader = dataLoader<number, number>({
    validate: (keys) => {
      validateFn(keys);
      const sum = keys.reduce((acc, key) => acc + key, 0);
      return sum < 10;
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
  {
    // immediate, before it's actually executed
    const res1 = loader.load(1);
    const res2 = loader.load(2);

    res1.cancel();
    res2.cancel();

    expect(fetchFn).toHaveBeenCalledTimes(0);
    expect(validateFn).toHaveBeenCalledTimes(0);
    expect(cancelFn).toHaveBeenCalledTimes(0);
    fetchFn.mockClear();
    validateFn.mockClear();
    cancelFn.mockClear();
  }
  {
    // after some time
    const res1 = loader.load(2);
    const res2 = loader.load(3);

    await new Promise((resolve) => setTimeout(resolve, 1));

    res1.cancel();
    res2.cancel();

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(validateFn).toHaveBeenCalledTimes(2);
      expect(cancelFn).toHaveBeenCalledTimes(1);
    });
    fetchFn.mockClear();
    validateFn.mockClear();
    cancelFn.mockClear();
  }
  {
    const res1 = loader.load(10);

    res1.cancel();

    expect(fetchFn).toHaveBeenCalledTimes(0);
    expect(validateFn).toHaveBeenCalledTimes(0);
    expect(cancelFn).toHaveBeenCalledTimes(0);
  }
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

test('validation', async () => {
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
  {
    const $result = await Promise.all([
      loader.load(1).promise,
      loader.load(9).promise,
      loader.load(0).promise,
    ]);
    expect($result).toEqual([2, 10, 1]);
    expect(validateFn).toHaveBeenCalledTimes(3);
    expect(validateFn).toHaveBeenNthCalledWith(1, [1]);
    expect(validateFn).toHaveBeenNthCalledWith(2, [1, 9]);
    expect(validateFn).toHaveBeenNthCalledWith(3, [9, 0]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenNthCalledWith(1, [1]);
    expect(fetchFn).toHaveBeenNthCalledWith(2, [9, 0]);
    validateFn.mockClear();
    fetchFn.mockClear();
  }
  {
    const $result = await Promise.all([
      loader.load(2).promise,
      loader.load(11).promise,
      loader.load(3).promise,
      loader.load(4).promise,
      loader.load(5).promise,
      loader.load(1).promise,
    ]);
    expect($result).toEqual([3, 12, 4, 5, 6, 2]);
    expect(validateFn).toHaveBeenCalledTimes(6);
    expect(validateFn).toHaveBeenNthCalledWith(1, [2]);
    expect(validateFn).toHaveBeenNthCalledWith(2, [2, 11]);
    expect(validateFn).toHaveBeenNthCalledWith(3, [11, 3]);
    expect(validateFn).toHaveBeenNthCalledWith(4, [3, 4]);
    expect(validateFn).toHaveBeenNthCalledWith(5, [3, 4, 5]);
    expect(validateFn).toHaveBeenNthCalledWith(6, [5, 1]);
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(fetchFn).toHaveBeenNthCalledWith(1, [2]);
    expect(fetchFn).toHaveBeenNthCalledWith(2, [11]);
    expect(fetchFn).toHaveBeenNthCalledWith(3, [3, 4]);
    expect(fetchFn).toHaveBeenNthCalledWith(4, [5, 1]);
    validateFn.mockClear();
    fetchFn.mockClear();
  }
  {
    const $result = await Promise.all([
      loader.load(13).promise,
      loader.load(6).promise,
      loader.load(14).promise,
    ]);
    expect($result).toEqual([14, 7, 15]);
    expect(validateFn).toHaveBeenCalledTimes(3);
    expect(validateFn).toHaveBeenNthCalledWith(1, [13]);
    expect(validateFn).toHaveBeenNthCalledWith(2, [6]);
    expect(validateFn).toHaveBeenNthCalledWith(3, [6, 14]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn).toHaveBeenNthCalledWith(1, [13]);
    expect(fetchFn).toHaveBeenNthCalledWith(2, [6]);
    expect(fetchFn).toHaveBeenNthCalledWith(3, [14]);
  }
});
