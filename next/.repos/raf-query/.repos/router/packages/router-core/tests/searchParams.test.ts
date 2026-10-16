import { describe, expect, test, vi } from 'vitest'
import {
  defaultParseSearch,
  defaultStringifySearch,
  parseSearchWith,
  stringifySearchWith,
} from '../src'

describe('Search Params serialization and deserialization', () => {
  /*
   * JSON-compatible objects can be serialized into a string,
   * and then deserialized back into the original object.
   */
  test.each([
    [{}, ''],
    [{ foo: '' }, '?foo='],
    [{ foo: 'bar' }, '?foo=bar'],
    [{ foo: 'bar baz' }, '?foo=bar+baz'],
    [{ foo: 123 }, '?foo=123'],
    [{ foo: '123' }, '?foo=%22123%22'],
    [{ foo: true }, '?foo=true'],
    [{ foo: 'true' }, '?foo=%22true%22'],
    [{ foo: null }, '?foo=null'],
    [{ foo: 'null' }, '?foo=%22null%22'],
    [{ foo: 'undefined' }, '?foo=undefined'],
    [{ foo: {} }, '?foo=%7B%7D'],
    [{ foo: '{}' }, '?foo=%22%7B%7D%22'],
    [{ foo: [] }, '?foo=%5B%5D'],
    [{ foo: '[]' }, '?foo=%22%5B%5D%22'],
    [{ foo: [1, 2, 3] }, '?foo=%5B1%2C2%2C3%5D'],
    [{ foo: '1,2,3' }, '?foo=1%2C2%2C3'],
    [{ foo: { bar: 'baz' } }, '?foo=%7B%22bar%22%3A%22baz%22%7D'],
    [{ 0: 1 }, '?0=1'],
    [{ 'foo=bar': 1 }, '?foo%3Dbar=1'],
    [{ '{}': 1 }, '?%7B%7D=1'],
    [{ '': 1 }, '?=1'],
    [{ '=': '=' }, '?%3D=%3D'],
    [{ '=': '', '': '=' }, '?%3D=&=%3D'],
    [{ 'foo=2&bar': 3 }, '?foo%3D2%26bar=3'],
    [{ 'foo?': 1 }, '?foo%3F=1'],
    [{ foo: 'bar=' }, '?foo=bar%3D'],
    [{ foo: '2&bar=3' }, '?foo=2%26bar%3D3'],
  ])('isomorphism %j', (input, expected) => {
    const str = defaultStringifySearch(input)
    expect(str).toEqual(expected)
    expect(defaultParseSearch(str)).toEqual(input)
  })

  test('undefined values are removed during stringification', () => {
    const str = defaultStringifySearch({ foo: 'bar', bar: undefined })
    expect(str).toEqual('?foo=bar')
    expect(defaultParseSearch(str)).toEqual({ foo: 'bar' })
  })

  test.each([
    'false',
    '-1',
    '"quoted"',
    ' true ',
    'true ',
    'false\t',
    'null\r\n',
    '\tfalse',
    '\nnull',
    '\r1',
    '   ',
    '雪',
    '"雪"',
  ])('preserves JSON-compatible string %j as a string', (value) => {
    const str = defaultStringifySearch({ value })
    expect(defaultParseSearch(str)).toEqual({ value })
  })

  test('uses custom parsers for ordinary strings', () => {
    const stringify = stringifySearchWith(JSON.stringify, (value) => {
      if (value === 'word') {
        return value
      }
      throw new Error('not parseable')
    })

    expect(stringify({ value: 'word' })).toEqual('?value=%22word%22')
  })

  test('skips JSON.parse for strings that cannot be JSON', () => {
    const parseSpy = vi.spyOn(JSON, 'parse')
    try {
      const stringify = stringifySearchWith(JSON.stringify, JSON.parse)

      expect(
        stringify({
          empty: '',
          filter: 'foo',
          future: 'future',
          name: 'name',
          notification: 'new',
          tab: 'tabular',
          topic: 'topic',
          unicode: '雪',
        }),
      ).toEqual(
        '?empty=&filter=foo&future=future&name=name&notification=new&tab=tabular&topic=topic&unicode=%E9%9B%AA',
      )
      expect(
        stringify({ file: '.env', path: '/products', positive: '+1' }),
      ).toEqual('?file=.env&path=%2Fproducts&positive=%2B1')
      expect(parseSpy).not.toHaveBeenCalled()
    } finally {
      parseSpy.mockRestore()
    }
  })

  test('parse skips JSON.parse for strings that cannot begin valid JSON', () => {
    const parseSpy = vi.spyOn(JSON, 'parse')
    try {
      const parse = parseSearchWith(JSON.parse)
      expect(parse('?empty=&filter=foo&tab=specs&sort=newest')).toEqual({
        empty: '',
        filter: 'foo',
        tab: 'specs',
        sort: 'newest',
      })
      expect(parse('?file=.env&path=/products')).toEqual({
        file: '.env',
        path: '/products',
      })
      expect(parseSpy).not.toHaveBeenCalled()
      expect(parse('?value=%7B%7D')).toEqual({ value: {} })
      expect(parseSpy).toHaveBeenCalledExactlyOnceWith('{}')
    } finally {
      parseSpy.mockRestore()
    }
  })

  test('parse still parses strings that pass the jsonStart guard', () => {
    expect(defaultParseSearch('?n=123&flag=true&obj={"a":1}&arr=[1]')).toEqual({
      n: 123,
      flag: true,
      obj: { a: 1 },
      arr: [1],
    })
  })

  test('parse applies the guard only when the parser is JSON.parse', () => {
    const upperCaseParser = (str: string) => str.toUpperCase()
    const parse = parseSearchWith(upperCaseParser)

    // A non-JSON parser is invoked even for values the jsonStart
    // regex would reject.
    expect(parse('?foo=bar&filter=available')).toEqual({
      foo: 'BAR',
      filter: 'AVAILABLE',
    })
  })

  test.each([
    ['null', null],
    [' true ', true],
    ['\tfalse', false],
    ['\nnull', null],
    ['\r1', 1],
    ['1e2', 100],
    ['-0', -0],
    ['0.0', 0],
    ['"雪"', '雪'],
    [' {"nested":[true,null]} ', { nested: [true, null] }],
    [' [1,"two"] ', [1, 'two']],
    ['', ''],
    [' \t\r\n', ' \t\r\n'],
    ['favorite', 'favorite'],
    ['nullish', 'nullish'],
    ['travel', 'travel'],
    ['true_value', 'true_value'],
    ['{', '{'],
    ['[', '['],
    ['"', '"'],
    ['-', '-'],
    ['01', '01'],
    ['1e', '1e'],
    ['+1', '+1'],
    ['雪', '雪'],
    ['\u00a0null', '\u00a0null'],
    ['\ufefftrue', '\ufefftrue'],
  ])(
    'parses decoded value %j without changing fallback behavior',
    (value, expected) => {
      const search = new URLSearchParams({ value }).toString()
      expect(defaultParseSearch(search)).toEqual({ value: expected })
      expect(defaultParseSearch(`?${search}`)).toEqual({ value: expected })
    },
  )

  test('custom parsers receive every string, preserve failures, and skip decoded non-strings', () => {
    const parser = vi.fn((value: string) => {
      if (value === 'invalid') {
        throw new Error('not parseable')
      }
      return { parsed: value }
    })
    const parse = parseSearchWith(parser)
    expect(
      parse(
        '?empty=&word=hello&bad=invalid&json=null&n=1&b=true&tag=foo&tag=%7B%7D',
      ),
    ).toEqual({
      empty: { parsed: '' },
      word: { parsed: 'hello' },
      bad: 'invalid',
      json: { parsed: 'null' },
      n: 1,
      b: true,
      tag: ['foo', '{}'],
    })
    expect(parser.mock.calls).toEqual([[''], ['hello'], ['invalid'], ['null']])
  })

  test('preserves repeated JSON-looking values as decoded arrays', () => {
    expect(
      defaultParseSearch('?value=null&value=%7B%7D&value=%5B%5D&value=1'),
    ).toEqual({
      value: ['null', '{}', '[]', 1],
    })
  })

  test('[edge case] self-reference serializes to "object Object"', () => {
    const obj = {} as any
    obj.self = obj
    const str = defaultStringifySearch(obj)
    expect(str).toEqual('?self=%5Bobject+Object%5D')
    expect(defaultParseSearch(str)).toEqual({ self: '[object Object]' })
  })

  /*
   * It is able to parse strings that could not have come
   * from the serializer.
   *
   * This can be useful because search params can be manipulated
   * by human users.
   */
  test.each([
    ['?foo={}', { foo: {} }],
    ['?foo=[]', { foo: [] }],
    ['?foo=1,2,3', { foo: '1,2,3' }],
    ['?foo={"bar":"baz"}', { foo: { bar: 'baz' } }],
    ['?foo=1&foo=2', { foo: [1, 2] }],
    ['?foo=""', { foo: '' }],
    ['?foo=""""', { foo: '""""' }],
    ['?foo=()', { foo: '()' }],
    ['?foo=[{}]', { foo: [{}] }],
  ])('alien deserialization %s', (input, expected) => {
    const obj = defaultParseSearch(input)
    expect(obj).toEqual(expected)
    expect(defaultStringifySearch(obj)).not.toBe(input)
  })

  /*
   * It can serialize stuff that really shouldn't be passed as input.
   * But just in case, this test serves as documentation of "what would happen"
   * if you did.
   */
  test('[edge case] inputs that are not primitive objects', () => {
    expect(defaultStringifySearch(new Number(99))).toEqual('')
    expect(defaultStringifySearch({ foo: new Number(99) })).toEqual('?foo=99')
    expect(defaultStringifySearch(new String('foo'))).toEqual('?0=f&1=o&2=o')
    expect(defaultStringifySearch(new Promise(() => {}))).toEqual('')
    expect(defaultStringifySearch({ foo: new Promise(() => {}) })).toEqual(
      '?foo=%7B%7D',
    )
    expect(defaultStringifySearch([1])).toEqual('?0=1')
    const date = new Date('2024-11-18')
    expect(defaultStringifySearch(date)).toEqual('')
    expect(defaultStringifySearch({ foo: date })).toEqual(
      '?foo=%222024-11-18T00%3A00%3A00.000Z%22',
    )
  })
})
