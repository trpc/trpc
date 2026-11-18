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
});
