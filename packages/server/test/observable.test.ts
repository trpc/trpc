/* eslint-disable @typescript-eslint/no-empty-function */
import { observable } from '../../client/src/observable';
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
