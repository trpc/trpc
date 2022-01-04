import { observable } from './observable';

test('smoke', () => {
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    observer.complete();
  });

  const next = jest.fn();
  const error = jest.fn();
  const complete = jest.fn();
  obs.subscribe({
    next,
    error,
    complete,
  });
  expect(next.mock.calls).toHaveLength(1);
  expect(complete.mock.calls).toHaveLength(1);
  expect(error.mock.calls).toHaveLength(0);
  expect(next.mock.calls[0][0]).toBe(1);
});
