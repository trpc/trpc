import { describe, expect, test } from 'vitest';
import { sameValue } from './pipelined';

describe('sameValue', () => {
  test('a missing cursor is not `null`', () => {
    expect(sameValue(undefined, null)).toBe(false);
    expect(sameValue(null, null)).toBe(true);
    expect(sameValue(undefined, undefined)).toBe(true);
  });

  test('`-0` is not the cursor `0`, which a transformer can tell apart', () => {
    expect(sameValue(-0, 0)).toBe(false);
    expect(sameValue({ at: -0 }, { at: 0 })).toBe(false);
    expect(sameValue(-0, -0)).toBe(true);
    expect(sameValue(Number.NaN, Number.NaN)).toBe(true);
  });

  test('equal bigint cursors are the same, which JSON has no form for', () => {
    expect(sameValue(5n, 5n)).toBe(true);
    expect(sameValue(5n, 6n)).toBe(false);
    expect(sameValue(5n, 5)).toBe(false);
  });

  test('cursors that read alike in JSON are the same', () => {
    expect(sameValue({ at: 1 }, { at: 1 })).toBe(true);
    expect(sameValue({ at: 1 }, { at: 2 })).toBe(false);
  });

  test('a key whose value is `undefined` is not a missing key, which a transformer can tell apart', () => {
    expect(sameValue({}, { at: undefined })).toBe(false);
    expect(sameValue({ at: undefined }, {})).toBe(false);
    expect(sameValue({ at: undefined }, { other: undefined })).toBe(false);
    expect(sameValue({ at: undefined }, { at: undefined })).toBe(true);
    expect(sameValue([{ at: undefined }], [{}])).toBe(false);
  });

  test('a date is not the string JSON writes for it, which a transformer can tell apart', () => {
    const at = new Date(0);
    expect(sameValue(at, at.toISOString())).toBe(false);
    expect(sameValue({ at }, { at: at.toISOString() })).toBe(false);
    expect(sameValue(new Date(0), new Date(0))).toBe(true);
    expect(sameValue(new Date(0), new Date(1))).toBe(false);
  });

  test('a hole in an array cursor is not the value at that index, which a transformer can tell apart', () => {
    const holey = [, 2];
    expect(sameValue(holey, [1, 2])).toBe(false);
    expect(sameValue([1, 2], holey)).toBe(false);
    expect(sameValue(holey, [undefined, 2])).toBe(false);
    expect(sameValue(holey, [, 2])).toBe(true);
    expect(sameValue([1, 2], [1, 2])).toBe(true);
  });
});
