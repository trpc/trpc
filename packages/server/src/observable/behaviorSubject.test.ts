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

test('next() notifies every observer when one unsubscribes inside next', () => {
  const subject = behaviorSubject(0);

  const first: number[] = [];
  const second: number[] = [];

  let sub: { unsubscribe: () => void } | undefined;
  sub = subject.subscribe({
    next(value) {
      first.push(value);
      sub?.unsubscribe();
    },
  });
  subject.subscribe({
    next(value) {
      second.push(value);
    },
  });

  subject.next(1);

  expect(first).toEqual([0, 1]);
  expect(second).toEqual([0, 1]);
});

test('next() skips an observer cancelled by an earlier observer', () => {
  const subject = behaviorSubject(0);

  let secondSub: { unsubscribe: () => void } | undefined;
  const secondNext = vi.fn();

  subject.subscribe({
    next() {
      secondSub?.unsubscribe();
    },
  });
  secondSub = subject.subscribe({ next: secondNext });

  subject.next(1);

  expect(secondNext).toHaveBeenCalledTimes(1);
  expect(secondNext).toHaveBeenCalledWith(0);
});
