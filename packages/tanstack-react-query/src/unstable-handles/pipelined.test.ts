import { describe, expect, test } from 'vitest';
import { sameCursor } from './pipelined';

describe('sameCursor', () => {
  test('a missing cursor is not `null`', () => {
    expect(sameCursor(undefined, null)).toBe(false);
    expect(sameCursor(null, null)).toBe(true);
    expect(sameCursor(undefined, undefined)).toBe(true);
  });

  test('equal bigint cursors are the same, which JSON has no form for', () => {
    expect(sameCursor(5n, 5n)).toBe(true);
    expect(sameCursor(5n, 6n)).toBe(false);
    expect(sameCursor(5n, 5)).toBe(false);
  });

  test('cursors that read alike in JSON are the same', () => {
    expect(sameCursor({ at: 1 }, { at: 1 })).toBe(true);
    expect(sameCursor({ at: 1 }, { at: 2 })).toBe(false);
  });

  test('a key whose value is `undefined` is not a missing key, which a transformer can tell apart', () => {
    expect(sameCursor({}, { at: undefined })).toBe(false);
    expect(sameCursor({ at: undefined }, {})).toBe(false);
    expect(sameCursor({ at: undefined }, { other: undefined })).toBe(false);
    expect(sameCursor({ at: undefined }, { at: undefined })).toBe(true);
    expect(sameCursor([{ at: undefined }], [{}])).toBe(false);
  });

  test('a date is not the string JSON writes for it, which a transformer can tell apart', () => {
    const at = new Date(0);
    expect(sameCursor(at, at.toISOString())).toBe(false);
    expect(sameCursor({ at }, { at: at.toISOString() })).toBe(false);
    expect(sameCursor(new Date(0), new Date(0))).toBe(true);
    expect(sameCursor(new Date(0), new Date(1))).toBe(false);
  });
});
