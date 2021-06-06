/* eslint-disable @typescript-eslint/no-empty-function */
import { observable } from '../../client/src/observable';
import { httpLink, retryLink, chainer } from '../../client/src/links';
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
    onDone: () => {},
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
