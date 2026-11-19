import { describe, expect, test, vi } from 'vitest';
import { createUnit, failed, ok, whenAll } from './outcome';

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
