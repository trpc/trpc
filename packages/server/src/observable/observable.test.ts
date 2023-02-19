import { observable, share, tap } from '.';

test('vanilla observable - complete()', () => {
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    observer.complete();
  });

  const next = vi.fn();
  const error = vi.fn();
  const complete = vi.fn();
  obs.subscribe({
    next,
    error,
    complete,
  });
  expect(next.mock.calls).toHaveLength(1);
  expect(complete.mock.calls).toHaveLength(1);
  expect(error.mock.calls).toHaveLength(0);
  expect(next.mock.calls[0]![0]!).toBe(1);
});

test('vanilla observable - unsubscribe()', () => {
  const obs$ = observable<number, Error>((observer) => {
    observer.next(1);
  });

  const next = vi.fn();
  const error = vi.fn();
  const complete = vi.fn();
  const sub = obs$.subscribe({
    next,
    error,
    complete,
  });
  sub.unsubscribe();
  expect(next.mock.calls).toHaveLength(1);
  expect(complete.mock.calls).toHaveLength(0);
  expect(error.mock.calls).toHaveLength(0);
  expect(next.mock.calls[0]![0]!).toBe(1);
});

test('pipe - combine operators', () => {
  const taps = {
    next: vi.fn(),
    complete: vi.fn(),
    error: vi.fn(),
  };
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
  }).pipe(
    // operators:
    share(),
    tap(taps),
  );
  {
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();
    obs.subscribe({
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
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();
    obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(0);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
  }

  expect({
    next: taps.next.mock.calls,
    error: taps.error.mock.calls,
    complete: taps.complete.mock.calls,
  }).toMatchInlineSnapshot(`
    Object {
      "complete": Array [],
      "error": Array [],
      "next": Array [
        Array [
          1,
        ],
      ],
    }
  `);
});
