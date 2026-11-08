import { fakeTimersResource } from '@trpc/server/__tests__/fakeTimersResource';
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

  const subRef: { current?: { unsubscribe: () => void } } = {};
  subRef.current = subject.subscribe({
    next(value) {
      first.push(value);
      subRef.current?.unsubscribe();
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

  const secondSubRef: { current?: { unsubscribe: () => void } } = {};
  const secondNext = vi.fn();

  subject.subscribe({
    next() {
      secondSubRef.current?.unsubscribe();
    },
  });
  secondSubRef.current = subject.subscribe({ next: secondNext });

  subject.next(1);

  expect(secondNext).toHaveBeenCalledTimes(1);
  expect(secondNext).toHaveBeenCalledWith(0);
});

describe('a throwing observer', () => {
  test('next() still notifies the later observers, and rethrows the error asynchronously', () => {
    using _timers = fakeTimersResource();
    const subject = behaviorSubject(0);
    const error = new Error('observer failed');
    subject.subscribe({
      next(value) {
        if (value === 1) throw error;
      },
    });
    const second = vi.fn();
    subject.subscribe({ next: second });

    expect(() => subject.next(1)).not.toThrow();
    expect(second.mock.calls).toEqual([[0], [1]]);
    expect(subject.get()).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    expect(() => vi.runAllTimers()).toThrow(error);
  });

  test('next() rethrows each observer error separately', () => {
    using _timers = fakeTimersResource();
    const subject = behaviorSubject(0);
    const errors = [new Error('first failed'), new Error('second failed')];
    for (const error of errors) {
      subject.subscribe({
        next(value) {
          if (value === 1) throw error;
        },
      });
    }
    const last = vi.fn();
    subject.subscribe({ next: last });

    expect(() => subject.next(1)).not.toThrow();
    expect(last).toHaveBeenLastCalledWith(1);
    expect(vi.getTimerCount()).toBe(2);
    expect(() => vi.advanceTimersToNextTimer()).toThrow(errors[0]);
    expect(() => vi.advanceTimersToNextTimer()).toThrow(errors[1]);
  });
});
