import { describe, expect, it, vi } from '@effect/vitest';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';

import {
  parseRecent,
  readRecent,
  rememberRecent,
  withRecent,
  writeRecent,
} from './recent-searches.ts';

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

/** `storage` as the global localStorage, until disposed. */
function stubStorage(storage: Partial<Storage>) {
  vi.stubGlobal('localStorage', storage);
  return makeResource({}, () => vi.unstubAllGlobals());
}

describe('rememberRecent', () => {
  it("keeps each version's list apart", () => {
    const stored = new Map<string, string>();
    using _storage = stubStorage({
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => stored.delete(key),
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    rememberRecent('v11', 'client/links');
    rememberRecent('v10', 'server/routers');
    rememberRecent('v11', 'client/links#batching');
    expect(readRecent('v11')).toEqual([
      'client/links#batching',
      'client/links',
    ]);
    expect(readRecent('v10')).toEqual(['server/routers']);
  });

  it('reads none where storage throws', () => {
    using _storage = stubStorage({
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(readRecent('v11')).toEqual([]);
  });

  it("doesn't throw where storage won't write", () => {
    const denied = () => {
      throw new Error('denied');
    };
    using _storage = stubStorage({
      getItem: () => null,
      removeItem: denied,
      setItem: denied,
    });
    expect(() => rememberRecent('v11', 'client/links')).not.toThrow();
    expect(() => writeRecent('v11', [])).not.toThrow();
  });
});
