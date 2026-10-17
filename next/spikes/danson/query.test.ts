import { describe, expect, test } from 'vite-plus/test';
import { fromSearch, toSearch } from './query.ts';
import { deserializers, serializers } from './std.ts';

const ser = { serializers };
const de = { deserializers };
const roundTrip = (v: unknown) => fromSearch(toSearch(v, ser), de);

describe('QP-C encoding', () => {
  test('proposal 11 example', () => {
    expect(
      toSearch(
        {
          id: 1,
          q: 'hello world',
          tags: ['a', 'b'],
          since: new Date('2026-10-09'),
          filter: { status: 'open', archived: false },
        },
        ser,
      ),
    ).toBe(
      'id=1&q=hello+world&tags[]=a&tags[]=b&since=$Date:2026-10-09T00:00:00.000Z&filter[status]=open&filter[archived]=false',
    );
  });

  test.each([
    ['true', 'v=%22true%22'],
    ['1', 'v=%221%22'],
    ['null', 'v=%22null%22'],
    ['[]', 'v=%22[]%22'],
    ['"q"', 'v=%22%5C%22q%5C%22%22'],
    ['$undefined', 'v=%22$undefined%22'],
    ['', 'v='],
    ['plain text', 'v=plain+text'],
  ])('ambiguous string %j is quoted', (value, expected) => {
    expect(toSearch({ v: value }, ser)).toBe(expected);
  });

  test('arrays of objects use indices, nested arrays nest', () => {
    expect(
      toSearch({ items: [{ n: 1 }, { n: 2 }], m: [[1, 2], []] }, ser),
    ).toBe('items[0][n]=1&items[1][n]=2&m[0][]=1&m[0][]=2&m[1]=[]');
  });

  test('custom types without a string value are encoded structurally', () => {
    expect(toSearch({ s: new Set([1]) }, ser)).toBe(
      's[_]=$&s[type]=Set&s[value][]=1',
    );
  });

  test.each([
    ['string root', 'hello'],
    ['array root', [1, 2]],
    ['numeric key', { 0: 'a' }],
    ['bracket key', { 'a[b]': 1 }],
    ['dollar key', { $x: 1 }],
  ])('falls back to $input for %s', (_, value) => {
    expect(toSearch(value, ser)).toMatch(/^\$input=/);
    expect(roundTrip(value)).toEqual(value);
  });

  test('falls back to $input for circular refs', () => {
    const a: Record<string, unknown> = {};
    a['self'] = a;
    expect(toSearch({ a }, ser)).toMatch(/^\$input=/);
  });
});

describe('QP-C round trip', () => {
  test.each(
    Object.entries({
      scalars: { a: 1, b: -2.5, c: true, d: null, e: 'x' },
      ambiguous: {
        a: 'true',
        b: '1',
        c: 'null',
        d: '',
        e: ' 1',
        f: '1e3',
        g: '{}',
      },
      dollar: { a: '$', b: '$undefined', c: '$Date:x', d: '$$' },
      specials: { u: undefined, n: NaN, i: -Infinity, z: -0, b: 2n ** 70n },
      std: {
        d: new Date(0),
        ds: [new Date(1), new Date(2)],
        m: new Map([['k', 1]]),
        s: new Set(['a']),
        url: new URL('https://x.dev/a?b=c'),
      },
      empty: { a: [], o: {}, deep: { a: [[]] } },
      nested: { a: { b: { c: [{ d: [1, { e: 'f' }] }] } } },
      unicode: { 'clé ü': 'Grüße 👋 & = ? #' },
    }),
  )('%s', (_, value) => {
    expect(roundTrip(value)).toEqual(value);
  });

  test('URLSearchParams-encoded form decodes the same', () => {
    const value = { tags: ['a', 'b'], f: { x: 'y z' } };
    const viaStd = new URLSearchParams([
      ...new URLSearchParams(toSearch(value, ser)),
    ]).toString();
    expect(viaStd).toBe('tags%5B%5D=a&tags%5B%5D=b&f%5Bx%5D=y+z');
    expect(fromSearch(viaStd, de)).toEqual(value);
  });
});

describe('QP-C decoding is strict', () => {
  test.each([
    ['malformed key', 'a]=1', 'Malformed key: a]'],
    ['prototype segment', 'a[__proto__][x]=1', 'Bad key segment'],
    ['non-contiguous index', 'a[0]=1&a[2]=2', 'Non-contiguous index'],
    ['object/array conflict', 'a[]=1&a[x]=2', 'Expected array index'],
  ])('%s', (_, search, message) => {
    expect(() => fromSearch(search, de)).toThrow(message);
  });
});
