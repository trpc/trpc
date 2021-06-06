/* eslint-disable @typescript-eslint/no-empty-function */
import { observable } from '../../client/src/observable';
import { chainer } from '../../client/src/links/core';
import { httpLink } from '../../client/src/links/httpLink';
import { retryLink } from '../../client/src/links/retryLink';
import {
  dataLoader,
  CancellablePromise,
} from '../../client/src/links/httpBatchLink';
import { routerToServerAndClient } from './_testHelpers';
import * as trpc from '../src';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { waitFor } from '@testing-library/dom';
test('basic', () => {
  const value = observable(5);
  expect(value.get()).toBe(5);

  const callback = jest.fn();
  value.subscribe({
    onNext: callback,
  });
  value.set(10);
  expect(callback).toHaveBeenCalledWith(10);
});

test('retrylink', () => {
  let attempts = 0;
  const configuredLink = retryLink({ attempts: 5 });

  const ctxLink = configuredLink();

  const prev = jest.fn();
  ctxLink({
    op: {
      type: 'query',
      input: null,
      path: '',
    },
    prev: prev,
    next: (_ctx, callback) => {
      attempts++;
      if (attempts < 4) {
        callback({
          ok: false,
          error: new Error('Some error'),
        });
      } else {
        callback({
          ok: true,
          data: 'succeeded on attempt ' + attempts,
        });
      }
    },
    onDestroy: () => {},
  });
  expect(prev).toHaveBeenCalledTimes(1);
  expect(prev.mock.calls[0][0].data).toBe('succeeded on attempt 4');
});

test('chainer ', async () => {
  let attempt = 0;
  const serverCall = jest.fn();
  const { port, close } = routerToServerAndClient(
    trpc.router().query('hello', {
      resolve() {
        attempt++;
        serverCall();
        if (attempt < 3) {
          throw new Error('Errr ' + attempt);
        }
        return 'world';
      },
    }),
  );

  const chain = [
    retryLink({ attempts: 3 })(),
    httpLink({
      fetch: fetch as any,
      AbortController,
      url: `http://localhost:${port}`,
    })(),
  ];

  const chainExec = chainer(chain);

  const result = chainExec.call({
    type: 'query',
    path: 'hello',
    input: null,
  });

  await waitFor(() => {
    const envelope = result.get();
    if (!envelope || !envelope.ok) {
      throw new Error();
    }
    expect(envelope.ok).toBeTruthy();
    expect(envelope.data).toBe('world');
  });

  expect(serverCall).toHaveBeenCalledTimes(3);

  close();
});

test('mock cache link has immediate result', () => {
  const chainExec = chainer([
    retryLink({ attempts: 3 })(),
    // mock cache link
    ({ prev }) => {
      prev({ ok: true, data: 'cached' });
    },
    httpLink({
      fetch: fetch as any,
      AbortController,
      url: `void`,
    })(),
  ]);
  const result = chainExec.call({} as any);
  expect(result.get()).toMatchObject({
    data: 'cached',
  });
});

test('cancel request', async () => {
  const onDestroyCall = jest.fn();

  const chainExec = chainer([
    ({ onDestroy }) => {
      onDestroy(() => {
        onDestroyCall();
      });
    },
  ]);

  const result = chainExec.call({
    type: 'query',
    path: 'hello',
    input: null,
  });

  result.abort();

  expect(onDestroyCall).toHaveBeenCalled();
});

describe('batching', () => {
  test('dataloader basic', async () => {
    const fetchManyCalled = jest.fn();
    const loader = dataLoader<number, number>({
      fetchMany(keys) {
        fetchManyCalled();
        const promise = new Promise<number[]>((resolve) => {
          resolve(keys.map((v) => v + 1));
        }) as CancellablePromise<number[]>;
        return promise;
      },
    });
    {
      const result = await Promise.all([loader.load(1), loader.load(2)]);
      expect(result).toEqual([2, 3]);
    }
    {
      const result = await Promise.all([loader.load(3), loader.load(4)]);
      expect(result).toEqual([4, 5]);
    }
    expect(fetchManyCalled).toHaveBeenCalledTimes(2);
  });

  test('dataloader cancellation', async () => {
    const fetchManyCalled = jest.fn();
    const cancelCalled = jest.fn();
    const loader = dataLoader<number, number>({
      fetchMany(keys) {
        fetchManyCalled();
        const promise = new Promise<number[]>((resolve) => {
          setTimeout(() => {
            resolve(keys.map((v) => v + 1));
          }, 10);
        }) as CancellablePromise<number[]>;
        promise.cancel = cancelCalled;
        return promise;
      },
    });

    {
      // immediate, before it's actually executed
      const promise1 = loader.load(1);
      const promise2 = loader.load(2);

      promise1.cancel();
      promise2.cancel();

      expect(cancelCalled).toHaveBeenCalledTimes(0);
    }
    {
      // after some time
      const promise1 = loader.load(2);
      const promise2 = loader.load(3);

      await new Promise((resolve) => setTimeout(resolve, 5));

      promise1.cancel();
      promise2.cancel();

      await waitFor(() => {
        expect(cancelCalled).toHaveBeenCalledTimes(1);
      });
    }
  });
});
