/* eslint-disable @typescript-eslint/no-empty-function */
import { observable } from '../../client/src/observable';
import { retryLink } from '../../client/src/links';

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
