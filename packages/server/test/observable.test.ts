/* eslint-disable @typescript-eslint/no-empty-function */
import {
  observableSubject,
  observableSubjectAsPromise,
} from '../../client/src/internals/observable';
test('basic', () => {
  const $value = observableSubject(5);
  expect($value.get()).toBe(5);

  const onNext = jest.fn();
  $value.subscribe({ onNext });
  $value.next(10);
  expect(onNext).toHaveBeenCalledWith(10);
});

test('toPromise', async () => {
  const $value = observableSubject(5);
  expect($value.get()).toBe(5);
  const { promise } = observableSubjectAsPromise($value);

  expect(await promise).toBe(5);
});
