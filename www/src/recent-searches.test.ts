import { describe, expect, it } from '@effect/vitest';

import { parseRecent, withRecent } from './recent-searches.ts';

describe('parseRecent', () => {
  it('reads the stored ids', () => {
    expect(parseRecent('["a","b#c"]')).toEqual(['a', 'b#c']);
  });

  it('reads nothing, or anything else, as none', () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent('{')).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent('["a",1,null]')).toEqual(['a']);
  });
});

describe('withRecent', () => {
  it('puts the id first, once', () => {
    expect(withRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(withRecent([], 'a')).toEqual(['a']);
  });

  it('keeps the newest six', () => {
    expect(withRecent(['1', '2', '3', '4', '5', '6'], '7')).toEqual([
      '7',
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
  });
});
