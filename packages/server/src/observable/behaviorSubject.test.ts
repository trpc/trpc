import { behaviorSubject } from './behaviorSubject';

test('behaviorSubject', () => {
  const value = behaviorSubject(1);

  expect(value.get()).toBe(1);
  expectTypeOf(value.get()).toBeNumber();
  const onNext1 = vi.fn();
  const onNext2 = vi.fn();
  const sub = value.subscribe({
    next: onNext1,
  });

  expect(onNext1).toHaveBeenCalledWith(1);

  value.next(2);
  expect(onNext1).toHaveBeenCalledWith(2);

  const sub2 = value.subscribe({
    next: onNext2,
  });

  expect(onNext1).toHaveBeenCalledWith(2);
  sub.unsubscribe();

  value.next(3);
  expect(onNext1).not.toHaveBeenCalledWith(3);
  expect(onNext2).toHaveBeenCalledWith(3);

  sub2.unsubscribe();

  value.next(4);
  expect(onNext2).not.toHaveBeenCalledWith(4);
  expect(onNext1).not.toHaveBeenCalledWith(4);
});
