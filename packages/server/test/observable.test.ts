/* eslint-disable @typescript-eslint/no-empty-function */
import { observableSubject } from '../../client/src/internals/observable';
test('basic', () => {
  const $value = observableSubject(5);
  expect($value.get()).toBe(5);

  const onNext = jest.fn();
  $value.subscribe({ onNext });
  $value.next(10);
  expect(onNext).toHaveBeenCalledWith(10);
});
