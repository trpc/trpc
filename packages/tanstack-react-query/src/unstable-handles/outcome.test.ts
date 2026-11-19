import { describe, expect, test, vi } from 'vitest';
import { createUnit, failed, ok, whenAll } from './outcome';

describe('createUnit', () => {
  test("a listener that throws doesn't keep the outcome from the others", async () => {
    const unit = createUnit<number>();
    const later = vi.fn();
    unit.onSettled(() => {
      throw new Error('listener threw');
    });
    unit.onSettled(later);
    expect(() => unit.settle(ok(1))).toThrow('listener threw');
    expect(later).toHaveBeenCalledExactlyOnceWith(ok(1));
    expect(await unit.outcome).toEqual(ok(1));
  });
});

describe('whenAll', () => {
  test('a unit that failed is reported while an earlier one is still pending', () => {
    const first = createUnit<number>();
    const second = createUnit<number>();
    const run = vi.fn();
    whenAll(
      new Map([
        ['first', first],
        ['second', second],
      ]),
      run,
    );
    second.settle(failed('second failed'));
    expect(run).toHaveBeenCalledExactlyOnceWith(failed('second failed'));
    first.settle(ok(1));
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('the data of every unit is reported once the last one has it', () => {
    const first = createUnit<number>();
    const second = createUnit<number>();
    const run = vi.fn();
    whenAll(
      new Map([
        ['first', first],
        ['second', second],
      ]),
      run,
    );
    second.settle(ok(2));
    expect(run).not.toHaveBeenCalled();
    first.settle(ok(1));
    expect(run).toHaveBeenCalledExactlyOnceWith(
      ok(
        new Map([
          ['second', 2],
          ['first', 1],
        ]),
      ),
    );
  });
});
