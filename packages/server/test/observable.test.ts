/* eslint-disable @typescript-eslint/no-empty-function */
import { observableSubject } from '../../client/src/internals/observable';
test('basic', () => {
  const value = observableSubject(5);
  expect(value.get()).toBe(5);

  const callback = jest.fn();
  value.subscribe(callback);
  value.set(10);
  expect(callback).toHaveBeenCalledWith(10);
});
