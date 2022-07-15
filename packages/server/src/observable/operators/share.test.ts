/* eslint-disable no-var */
import { observable } from '../observable';
import { share } from './share';

test('share', () => {
  const obs = share()(
    observable<number, Error>((observer) => {
      observer.next(1);
    }),
  );

  {
    const next = jest.fn();
    const error = jest.fn();
    const complete = jest.fn();
    var subscription1 = obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(1);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
    expect(next.mock.calls[0]![0]!).toBe(1);
  }

  {
    // subscribe again - it's shared so should not propagate any results
    const next = jest.fn();
    const error = jest.fn();
    const complete = jest.fn();
    var subscription2 = obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(0);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
  }

  subscription1.unsubscribe();
  subscription2.unsubscribe();
  // now it should be reset so we can do a new subscription
  {
    const next = jest.fn();
    const error = jest.fn();
    const complete = jest.fn();
    var subscription3 = obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(1);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
    expect(next.mock.calls[0]![0]!).toBe(1);
    subscription3.unsubscribe();
  }
});
