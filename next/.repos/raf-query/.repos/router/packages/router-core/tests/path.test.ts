import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compileDecodeCharMap,
  exactPathTest,
  hasMissingPathParams,
  interpolatePath,
  removeTrailingSlash,
  resolvePath,
  trimPathLeft,
} from '../src/path'
import {
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  findSingleMatch,
  getParamNames,
  parseSegments,
} from '../src/new-process-route-tree'
import { createSieveCache } from '../src/sieve-cache'
import {
  createTestPathInterpolator as createPathInterpolator,
  parseTestPathname as parsePathname,
  processTestRouteTree as processRouteTree,
} from './routerTestUtils'
import type { SegmentKind } from '../src/new-process-route-tree'

afterEach(() => vi.restoreAllMocks())

describe.each([false, true])(
  'pathname interpolation (server: %s)',
  (server) => {
    it.each([
      { path: '/', params: {}, expected: '/' },
      { path: '/users/', params: {}, expected: '/users/' },
      { path: '/users/$id', params: { id: '123' }, expected: '/users/123' },
      { path: '/users/$id', params: { id: 0 }, expected: '/users/0' },
      { path: '/users/$id', params: {}, expected: '/users/undefined' },
      {
        path: '/users/$id',
        params: { id: 'a/b?#@+' },
        expected: '/users/a%2Fb%3F%23%40%2B',
      },
      {
        path: '/users/$id',
        params: { id: 'cafe\u0301' },
        expected: '/users/cafe%CC%81',
        normalized: '/users/cafe\u0301',
      },
      {
        path: '/users/{$id}.json',
        params: { id: '123' },
        expected: '/users/123.json',
      },
      { path: '/posts/{-$category}', params: {}, expected: '/posts' },
      {
        path: '/posts/{-$category}',
        params: { category: undefined },
        expected: '/posts',
      },
      {
        path: '/posts/{-$category}',
        params: { category: '' },
        expected: '/posts/',
      },
      {
        path: '/posts/{-$category}',
        params: { category: 'news' },
        expected: '/posts/news',
      },
      {
        path: '/posts/prefix{-$category}suffix',
        params: { category: 'news' },
        expected: '/posts/prefixnewssuffix',
      },
      {
        path: '/files/$',
        params: { _splat: 'a b/c+d' },
        expected: '/files/a%20b/c%2Bd',
        normalized: '/files/a b/c%2Bd',
      },
      {
        path: '/files/prefix{$}suffix',
        params: { _splat: 'a/b' },
        expected: '/files/prefixa/bsuffix',
      },
      { path: '/files/$', params: { _splat: '' }, expected: '/files' },
      { path: '/files/$', params: { _splat: 0 }, expected: '/files/0' },
      {
        path: '/files/prefix{$}.txt',
        params: { _splat: 0 },
        expected: '/files/prefix0.txt',
      },
      {
        path: '/$id/$id/',
        params: { id: '123' },
        expected: '/123/123/',
      },
    ])(
      'interpolates $path with $params',
      ({ path, params, expected, normalized }) => {
        const interpolate = createPathInterpolator({ isServer: server })
        const options = { path, params, server }
        const segments = parseSegments(false, { fullPath: path }, 0)
        expect(interpolatePath(path, segments, params)).toBe(expected)
        expect(interpolate(options)).toBe(normalized ?? expected)
        expect(interpolate({ ...options, params: { ...params } })).toBe(
          normalized ?? expected,
        )
      },
    )

    it('formats non-string values on every call', () => {
      const interpolate = createPathInterpolator({ isServer: server })
      const toString = vi.fn(() => 'one two')
      const options = {
        path: '/users/$id',
        params: { id: { toString } },
        server,
      }
      expect(interpolate(options)).toBe('/users/one two')
      expect(toString).toHaveBeenCalledOnce()
      toString.mockReturnValue('next value')
      expect(interpolate(options)).toBe('/users/next value')
      expect(toString).toHaveBeenCalledTimes(2)
    })

    it('separates results between fixed encoding configurations', () => {
      const allowAt = createPathInterpolator({
        isServer: server,
        pathParamsAllowedCharacters: ['@'],
      })
      const allowPlus = createPathInterpolator({
        isServer: server,
        pathParamsAllowedCharacters: ['+'],
      })
      const standard = createPathInterpolator({ isServer: server })
      const options = {
        path: '/users/$id',
        params: { id: '@+' },
        server,
      }
      expect(allowAt(options)).toBe('/users/@%2B')
      expect(allowPlus(options)).toBe('/users/%40+')
      expect(standard(options)).toBe('/users/%40%2B')
      expect(allowAt(options)).toBe('/users/@%2B')
    })

    it('keeps each router encoding independent across templates', () => {
      const allowAt = createPathInterpolator({
        isServer: server,
        pathParamsAllowedCharacters: ['@'],
      })
      const allowPlus = createPathInterpolator({
        isServer: server,
        pathParamsAllowedCharacters: ['+'],
      })
      const standard = createPathInterpolator({ isServer: server })
      for (const [interpolate, encoded] of [
        [allowAt, '@%2B'],
        [allowPlus, '%40+'],
        [standard, '%40%2B'],
        [allowAt, '@%2B'],
      ] as const) {
        for (const prefix of ['/users/', '/teams/']) {
          const path = prefix + '$id'
          const options = { path, params: { id: '@+' }, server }
          expect(interpolate(options)).toBe(prefix + encoded)
        }
      }
    })

    it('does not confuse parameter boundaries', () => {
      const interpolate = createPathInterpolator({ isServer: server })
      const options = { path: '/$first/$second', server }
      const first = { first: 'a:b', second: 'c' }
      const second = { first: 'a', second: 'b:c' }

      expect(interpolate({ ...options, params: first })).toBe('/a%3Ab/c')
      expect(interpolate({ ...options, params: second })).toBe('/a/b%3Ac')
      expect(interpolate({ ...options, params: first })).toBe('/a%3Ab/c')
    })

    it('keeps templates separate when parameter values are equal', () => {
      const interpolate = createPathInterpolator({ isServer: server })
      const params = { id: '123' }

      expect(interpolate({ path: '/users/$id', params })).toBe('/users/123')
      expect(interpolate({ path: '/posts/$id', params })).toBe('/posts/123')
      expect(interpolate({ path: '/users/$id', params })).toBe('/users/123')
    })

    it('formats optional params from their current values', () => {
      const interpolate = createPathInterpolator({ isServer: server })
      const path = '/posts/{-$category}/$id'
      const inputs = [
        { params: { id: 'one' }, expected: '/posts/one' },
        {
          params: { id: 'one', category: 'news' },
          expected: '/posts/news/one',
        },
        {
          params: { id: 'one', category: undefined },
          expected: '/posts/one',
        },
        { params: { id: 'one', category: '' }, expected: '/posts//one' },
        {
          params: { id: 'one', category: 'updates' },
          expected: '/posts/updates/one',
        },
      ]

      for (const { params, expected } of [...inputs, ...inputs]) {
        const options = { path, params, server }
        expect(interpolate(options)).toBe(expected)
      }
    })

    it('uses the canonical splat value instead of its legacy alias', () => {
      const interpolate = createPathInterpolator({
        isServer: server,
        pathParamsAllowedCharacters: ['@'],
      })
      const options = {
        path: '/files/$',
        params: { _splat: 'docs/@guide', '*': 'ignored' },
        server,
      }

      expect(interpolate(options)).toBe('/files/docs/@guide')
      expect(
        interpolate({
          ...options,
          params: { _splat: 'docs/@guide', '*': 'changed' },
        }),
      ).toBe('/files/docs/@guide')
    })

    it('collects used params for splats but not missing optionals', () => {
      const usedParams: Record<string, unknown> = Object.create(null)
      interpolatePath(
        '/posts/{-$category}',
        parseSegments(false, { fullPath: '/posts/{-$category}' }, 0),
        {},
        undefined,
        usedParams,
      )
      expect(usedParams).toEqual({})
      interpolatePath(
        '/files/$',
        parseSegments(false, { fullPath: '/files/$' }, 0),
        { _splat: 'docs/guide' },
        undefined,
        usedParams,
      )
      expect(usedParams).toEqual({
        _splat: 'docs/guide',
        '*': 'docs/guide',
      })
      expect(Object.getPrototypeOf(usedParams)).toBeNull()
    })

    it.each([
      {
        params: { id: 'one two', _splat: 'docs/file name' },
        path: '/root/prefixone%20twosuffix/files/docs/file%20name.txt',
        used: {
          id: 'one two',
          _splat: 'docs/file name',
          '*': 'docs/file name',
        },
        missing: false,
      },
      {
        params: { id: '', language: '', _splat: '' },
        path: '/root/prefixsuffix//files/.txt',
        used: { id: '', language: '', _splat: '', '*': '' },
        missing: true,
      },
      {
        params: {},
        path: '/root/prefixundefinedsuffix/files/.txt',
        used: { id: undefined, _splat: undefined, '*': undefined },
        missing: true,
      },
    ])(
      'keeps mixed segment metadata in one pass for $params',
      ({ params, path, used, missing }) => {
        const template = '/root/prefix{$id}suffix/{-$language}/files/{$}.txt'
        const segments = parseSegments(false, { fullPath: template }, 0)
        const usedParams: Record<string, unknown> = Object.create(null)
        expect(
          interpolatePath(template, segments, params, undefined, usedParams),
        ).toBe(path)
        expect(getParamNames(segments)).toEqual(['id', 'language', '_splat'])
        expect(usedParams).toEqual(used)
        expect(hasMissingPathParams(segments, params)).toBe(missing)
        expect(interpolatePath(template, segments, params)).toBe(path)
      },
    )

    it.each([
      {
        path: '/$first/$second',
        params: { second: 'two' },
        pathname: '/undefined/two',
        usedParams: { first: undefined, second: 'two' },
        missing: true,
      },
      {
        path: '/$first/$second',
        params: { first: undefined, second: 'two' },
        pathname: '/undefined/two',
        usedParams: { first: undefined, second: 'two' },
        missing: false,
      },
      {
        path: '/{-$first}/$second',
        params: { second: 'two' },
        pathname: '/two',
        usedParams: { second: 'two' },
        missing: false,
      },
      {
        path: '/$first/{-$second}',
        params: {},
        pathname: '/undefined',
        usedParams: { first: undefined },
        missing: true,
      },
      {
        path: '/$first/prefix{$}suffix',
        params: { first: 'one' },
        pathname: '/one/prefixsuffix',
        usedParams: { first: 'one', _splat: undefined, '*': undefined },
        missing: true,
      },
    ])(
      'preserves missing-param metadata for $path with $params',
      ({ path, params, pathname, usedParams, missing }) => {
        const segments = parseSegments(false, { fullPath: path }, 0)
        const collectedParams: Record<string, unknown> = Object.create(null)
        expect(
          interpolatePath(path, segments, params, undefined, collectedParams),
        ).toBe(pathname)
        expect(collectedParams).toEqual(usedParams)
        expect(hasMissingPathParams(segments, params)).toBe(missing)
      },
    )

    it('tracks a splat that was empty when the template was first used', () => {
      const interpolate = createPathInterpolator({ isServer: server })
      for (const _splat of ['', 'docs/guide', '', 'docs/reference']) {
        const options = {
          path: '/files/prefix{$}suffix',
          params: { _splat },
          server,
        }
        expect(interpolate(options)).toBe(`/files/prefix${_splat}suffix`)
      }
    })

    it('does not retain incomplete metadata when the first interpolation throws', () => {
      const interpolate = createPathInterpolator({ isServer: server })
      const options = { path: '/$first/$second', server }

      expect(() =>
        interpolate({
          ...options,
          params: { first: '\uD800', second: 'one' },
        }),
      ).toThrow(URIError)

      for (const second of ['two', 'three', 'two']) {
        expect(
          interpolate({ ...options, params: { first: 'valid', second } }),
        ).toBe(`/valid/${second}`)
      }
    })
  },
)

describe.each([{ basepath: '/' }, { basepath: '/app' }, { basepath: '/app/' }])(
  'removeTrailingSlash with basepath $basepath',
  ({ basepath }) => {
    it('should remove trailing slash if present', () => {
      const input = 'https://example.com/'
      const expectedOutput = 'https://example.com'
      const result = removeTrailingSlash(input, basepath)
      expect(result).toBe(expectedOutput)
    })
    it('should not modify the string if no trailing slash present', () => {
      const input = 'https://example.com'
      const result = removeTrailingSlash(input, basepath)
      expect(result).toBe(input)
    })
    it('should handle empty string', () => {
      const input = ''
      const result = removeTrailingSlash(input, basepath)
      expect(result).toBe(input)
    })
    it('should handle strings with only a slash', () => {
      const input = '/'
      const result = removeTrailingSlash(input, basepath)
      expect(result).toBe(input)
    })
    it('should handle strings with multiple slashes', () => {
      const input = 'https://example.com/path/to/resource/'
      const expectedOutput = 'https://example.com/path/to/resource'
      const result = removeTrailingSlash(input, basepath)
      expect(result).toBe(expectedOutput)
    })
  },
)

describe.each([{ basepath: '/' }, { basepath: '/app' }, { basepath: '/app/' }])(
  'exactPathTest with basepath $basepath',
  ({ basepath }) => {
    it('should return true when two paths are exactly the same', () => {
      const path1 = 'some-path/additional-path'
      const path2 = 'some-path/additional-path'
      const result = exactPathTest(path1, path2, basepath)
      expect(result).toBe(true)
    })
    it('should return true when two paths are the same with or without trailing slash', () => {
      const path1 = 'some-path/additional-path'
      const path2 = 'some-path/additional-path/'
      const result = exactPathTest(path1, path2, basepath)
      expect(result).toBe(true)
    })
    it('should return true when two paths are the same with or without trailing slash 2', () => {
      const path1 = 'some-path/additional-path'
      const path2 = 'some-path/additional-path/'
      const result = exactPathTest(path1, path2, basepath)
      expect(result).toBe(true)
    })
    it('should return false when two paths are different', () => {
      const path1 = 'some-path/additional-path/'
      const path2 = 'some-path2/additional-path/'
      const result = exactPathTest(path1, path2, basepath)
      expect(result).toBe(false)
    })
    it('should return true when both paths are just a slash', () => {
      const path1 = '/'
      const path2 = '/'
      const result = exactPathTest(path1, path2, basepath)
      expect(result).toBe(true)
    })
  },
)

describe('resolvePath', () => {
  describe.each([
    ['/', '/', '/'],
    ['/', '/a', '/a'],
    ['/', 'a/', '/a'],
    ['/', '/a/b', '/a/b'],
    ['/a', 'b', '/a/b'],
    ['/a', '', '/'],
    ['/a', '.well-known', '/a/.well-known'],
    ['/a', '/absolute', '/absolute'],
    ['/', 'a/b', '/a/b'],
    ['/', './a/b', '/a/b'],
    ['/a/b/c', 'd', '/a/b/c/d'],
    ['/a/b/c', './d', '/a/b/c/d'],
    ['/a/b/c', './../d', '/a/b/d'],
    ['/a/b/c/d', './../d', '/a/b/c/d'],
    ['/a/b/c', '../../d', '/a/d'],
    ['/a/b/c', '../d', '/a/b/d'],
    ['/a/b/c', '..', '/a/b'],
    ['/a/b/c', '../..', '/a'],
    ['/a/b/c', '../../..', '/'],
    ['/a/b/c/', '../../..', '/'],
    ['/a//b', '../../c', '/c'],
    ['/a///b', '../c', '/a/c'],
    ['/', '../javascript:alert(1)', '/javascript:alert(1)'],
    ['/posts', '../../data:text/html,test', '/data:text/html,test'],
  ])('resolves correctly', (a, b, eq) => {
    it(`${a} to ${b} === ${eq}`, () => {
      expect(resolvePath(a, b)).toEqual(eq)
    })
    it(`${a}/ to ${b} === ${eq} (trailing slash)`, () => {
      expect(resolvePath(a + '/', b)).toEqual(eq)
    })
    it(`${a}/ to ${b}/ === ${eq} (trailing slash + trailing slash)`, () => {
      expect(resolvePath(a + '/', b + '/')).toEqual(eq)
    })
  })

  it('normalizes repeated slashes when resolving the base path', () => {
    expect(resolvePath('/a//b', '.')).toBe('/a/b')
  })

  describe('trailingSlash', () => {
    describe(`'always'`, () => {
      it('keeps trailing slash', () => {
        expect(resolvePath('/a/b/c', 'd/', 'always')).toBe('/a/b/c/d/')
      })
      it('adds trailing slash', () => {
        expect(resolvePath('/a/b/c', 'd', 'always')).toBe('/a/b/c/d/')
      })
    })
    describe(`'never'`, () => {
      it('removes trailing slash', () => {
        expect(resolvePath('/a/b/c', 'd/', 'never')).toBe('/a/b/c/d')
      })
      it('does not add trailing slash', () => {
        expect(resolvePath('/a/b/c', 'd', 'never')).toBe('/a/b/c/d')
      })
    })
    describe(`'preserve'`, () => {
      it('keeps trailing slash', () => {
        expect(resolvePath('/a/b/c', 'd/', 'preserve')).toBe('/a/b/c/d/')
      })
      it('does not add trailing slash', () => {
        expect(resolvePath('/a/b/c', 'd', 'preserve')).toBe('/a/b/c/d')
      })
    })

    it.each([
      ['always', '/a//b', '/a/b/'],
      ['never', '/a//b///', '/a/b'],
      ['preserve', '/a//b///', '/a/b/'],
    ] as const)(
      "normalizes repeated slashes with trailingSlash '%s'",
      (trailingSlash, to, expected) => {
        expect(resolvePath('/', to, trailingSlash)).toBe(expected)
      },
    )
  })

  describe.each([{ base: '/' }, { base: '/nested' }])(
    'param routes w/ base=$base',
    ({ base }) => {
      describe('wildcard (prefix + suffix)', () => {
        it.each([
          { name: 'regular top-level', to: '/$' },
          { name: 'regular nested', to: '/params/wildcard/$' },
          { name: 'with top-level prefix', to: '/prefix{$}' },
          { name: 'with nested prefix', to: '/params/wildcard/prefix{$}' },
          { name: 'with top-level suffix', to: '/{$}suffix' },
          { name: 'with nested suffix', to: '/params/wildcard/{$}suffix' },
          {
            name: 'with top-level prefix + suffix',
            to: '/prefix{$}suffix',
          },
          {
            name: 'with nested prefix + suffix',
            to: '/params/wildcard/prefix{$}suffix',
          },
        ])('$name', ({ to }) => {
          const candidate = base + trimPathLeft(to)
          expect(resolvePath(base, candidate, 'never')).toEqual(candidate)
        })
      })

      describe('named (prefix + suffix)', () => {
        it.each([
          { name: 'regular top-level', to: '/$foo' },
          { name: 'regular nested', to: '/params/named/$foo' },
          { name: 'with top-level prefix', to: '/prefix{$foo}' },
          { name: 'with nested prefix', to: '/params/named/prefix{$foo}' },
          { name: 'with top-level suffix', to: '/{$foo}suffix' },
          { name: 'with nested suffix', to: '/params/named/{$foo}suffix' },
          {
            name: 'with top-level prefix + suffix',
            to: '/prefix{$foo}suffix',
          },
          {
            name: 'with nested prefix + suffix',
            to: '/params/named/prefix{$foo}suffix',
          },
        ])('$name', ({ to }) => {
          const candidate = base + trimPathLeft(to)
          expect(resolvePath(base, candidate, 'never')).toEqual(candidate)
        })
      })
    },
  )

  it('preserves explicit route-template param syntax', () => {
    expect(resolvePath('/{$language}', '.')).toBe('/{$language}')

    expect(resolvePath('/{$language}/posts', '../{$language}')).toBe(
      '/{$language}/{$language}',
    )
  })

  it('caches route-template paths without changing param syntax', () => {
    const cache = createSieveCache<string, string>(10)
    const set = vi.spyOn(cache, 'set')

    expect(resolvePath('/', '{$id}', undefined, cache)).toBe('/{$id}')
    expect(resolvePath('/', '$id', undefined, cache)).toBe('/$id')
    expect(resolvePath('/', '{$id}', undefined, cache)).toBe('/{$id}')
    expect(resolvePath('/', '$id', undefined, cache)).toBe('/$id')
    expect(set).toHaveBeenCalledTimes(2)
  })
})

describe('interpolatePath', () => {
  it.each(['value', '', undefined])(
    'stops interpolation at a bare splat with value %s',
    (_splat) => {
      const params = {
        _splat,
        get ignored() {
          throw new Error('A bare splat consumes the rest of the template')
        },
      }
      const segments = parseSegments(
        false,
        { fullPath: '/files/$/$ignored' },
        0,
      )
      const used: Record<string, unknown> = Object.create(null)
      expect(
        interpolatePath('/files/$/$ignored', segments, params, undefined, used),
      ).toBe(_splat ? '/files/value' : '/files')
      expect(getParamNames(segments)).toEqual(['_splat'])
      expect(used).toEqual({ _splat, '*': _splat })
    },
  )

  it.each([
    { path: '/', expected: '/' },
    { path: '/about/', expected: '/about/' },
  ])('preserves static paths: $path', ({ path, expected }) => {
    const params = {
      get unused() {
        throw new Error('Static paths must not read params')
      },
    }
    const segments = parseSegments(false, { fullPath: path }, 0)
    const decoder = vi.fn()
    const usedParams: Record<string, unknown> = Object.create(null)
    expect(interpolatePath(path, segments, params, decoder, usedParams)).toBe(
      expected,
    )
    expect(usedParams).toEqual({})
    expect(getParamNames(segments)).toEqual([])
    expect(hasMissingPathParams(segments, params)).toBe(false)
    expect(decoder).not.toHaveBeenCalled()
  })

  it.each([
    {
      path: '/users/$id',
      params: {},
      expected: '/users/undefined',
      missing: true,
    },
    {
      path: '/users/$id',
      params: { id: 'one' },
      expected: '/users/one',
      missing: false,
    },
    {
      path: '/posts/{-$category}',
      params: {},
      expected: '/posts',
      missing: false,
    },
    { path: '/files/$', params: {}, expected: '/files', missing: true },
  ])(
    'collects only missing status for $path',
    ({ path, params, expected, missing }) => {
      const segments = parseSegments(false, { fullPath: path }, 0)
      expect(interpolatePath(path, segments, params)).toBe(expected)
      expect(hasMissingPathParams(segments, params)).toBe(missing)
    },
  )

  describe('regular usage', () => {
    it.each([
      {
        name: 'should interpolate the path',
        path: '/users/$id',
        params: { id: '123' },
        result: '/users/123',
      },
      {
        name: 'should interpolate the path',
        path: '/users/$id',
        params: { id: '123_' },
        result: '/users/123_',
      },
      {
        name: 'should interpolate the path with multiple params',
        path: '/users/$id/$name',
        params: { id: '123', name: 'tanner' },
        result: '/users/123/tanner',
      },
      {
        name: 'should interpolate the path with multiple params',
        path: '/users/$id/$name',
        params: { id: '123_', name: 'tanner' },
        result: '/users/123_/tanner',
      },
      {
        name: 'should interpolate the path with extra params',
        path: '/users/$id',
        params: { id: '123', name: 'tanner' },
        result: '/users/123',
      },
      {
        name: 'should interpolate the path with missing params',
        path: '/users/$id/$name',
        params: { id: '123' },
        result: '/users/123/undefined',
      },
      {
        name: 'should interpolate the path with missing params and extra params',
        path: '/users/$id',
        params: { name: 'john' },
        result: '/users/undefined',
      },
      {
        name: 'should interpolate the path with the param being a number',
        path: '/users/$id',
        params: { id: 123 },
        result: '/users/123',
      },
      {
        name: 'should interpolate the path with the param being a falsey number',
        path: '/users/$id',
        params: { id: 0 },
        result: '/users/0',
      },
      {
        name: 'should interpolate the path with the splat param being a falsey number',
        path: '/users/$',
        params: { _splat: 0 },
        result: '/users/0',
      },
      {
        name: 'should interpolate the path with URI component encoding',
        path: '/users/$id',
        params: { id: '?#@john+smith' },
        result: '/users/%3F%23%40john%2Bsmith',
      },
      {
        name: 'should interpolate the path without URI encoding characters in decodeCharMap',
        path: '/users/$id',
        params: { id: '?#@john+smith' },
        result: '/users/%3F%23@john+smith',
        decoder: compileDecodeCharMap(['@', '+']),
      },
      {
        name: 'should interpolate the path with the splat param at the end',
        path: '/users/$',
        params: { _splat: '123' },
        result: '/users/123',
      },
      {
        name: 'should interpolate the path with a single named path param and the splat param at the end',
        path: '/users/$username/$',
        params: { username: 'seancassiere', _splat: '123' },
        result: '/users/seancassiere/123',
      },
      {
        name: 'should interpolate the path with 2 named path params with the splat param at the end',
        path: '/users/$username/$id/$',
        params: { username: 'seancassiere', id: '123', _splat: '456' },
        result: '/users/seancassiere/123/456',
      },
      {
        name: 'should interpolate the path with multiple named path params with the splat param at the end',
        path: '/$username/settings/$repo/$id/$',
        params: {
          username: 'sean-cassiere',
          repo: 'my-repo',
          id: '123',
          _splat: '456',
        },
        result: '/sean-cassiere/settings/my-repo/123/456',
      },
      {
        name: 'should interpolate the path with the splat param containing slashes',
        path: '/users/$',
        params: { _splat: 'sean/cassiere' },
        result: '/users/sean/cassiere',
      },
    ])('$name', ({ path, params, decoder, result }) => {
      const segments = parseSegments(false, { fullPath: path }, 0)
      expect(interpolatePath(path, segments, params, decoder)).toBe(result)
    })
  })

  describe('preserve trailing slash', () => {
    it.each([
      {
        path: '/',
        params: {},
        result: '/',
      },
      {
        path: '/a/b/',
        params: {},
        result: '/a/b/',
      },
      {
        path: '/a/$id/',
        params: { id: '123' },
        result: '/a/123/',
      },
      {
        path: '/a/{-$id}/',
        params: { id: '123' },
        result: '/a/123/',
      },
    ])(
      'should preserve trailing slash for $path',
      ({ path, params, result }) => {
        const segments = parseSegments(false, { fullPath: path }, 0)
        expect(interpolatePath(path, segments, params)).toBe(result)
      },
    )
  })

  describe('wildcard (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        to: '/$',
        params: { _splat: 'bar/foo/me' },
        result: '/bar/foo/me',
      },
      {
        name: 'regular curly braces',
        to: '/{$}',
        params: { _splat: 'bar/foo/me' },
        result: '/bar/foo/me',
      },
      {
        name: 'with prefix',
        to: '/prefix{$}',
        params: { _splat: 'bar' },
        result: '/prefixbar',
      },
      {
        name: 'with suffix',
        to: '/{$}-suffix',
        params: { _splat: 'bar' },
        result: '/bar-suffix',
      },
      {
        name: 'with prefix + suffix',
        to: '/prefix{$}-suffix',
        params: { _splat: 'bar' },
        result: '/prefixbar-suffix',
      },
    ])('$name', ({ to, params, result }) => {
      const segments = parseSegments(false, { fullPath: to }, 0)
      expect(interpolatePath(to, segments, params)).toBe(result)
    })
  })

  describe('splat params with special characters', () => {
    it.each([
      {
        name: 'should encode spaces in splat param',
        path: '/$',
        params: { _splat: 'file name.pdf' },
        result: '/file%20name.pdf',
      },
      {
        name: 'should preserve parentheses in splat param (RFC 3986 unreserved)',
        path: '/$',
        params: { _splat: 'file(1).pdf' },
        result: '/file(1).pdf',
      },
      {
        name: 'should encode brackets in splat param',
        path: '/$',
        params: { _splat: 'file[1].pdf' },
        result: '/file%5B1%5D.pdf',
      },
      {
        name: 'should encode spaces in nested splat param paths',
        path: '/$',
        params: { _splat: 'folder/sub folder/file name.pdf' },
        result: '/folder/sub%20folder/file%20name.pdf',
      },
      {
        name: 'should encode spaces and brackets but preserve parentheses',
        path: '/$',
        params: { _splat: 'docs/file (copy) [2].pdf' },
        result: '/docs/file%20(copy)%20%5B2%5D.pdf',
      },
      {
        name: 'should encode hash in splat param',
        path: '/$',
        params: { _splat: 'page#section' },
        result: '/page%23section',
      },
      {
        name: 'should handle splat param with prefix and special characters',
        path: '/files/prefix{$}',
        params: { _splat: 'my file.pdf' },
        result: '/files/prefixmy%20file.pdf',
      },
      {
        name: 'should encode plus signs in splat param',
        path: '/$',
        params: { _splat: 'file+name.pdf' },
        result: '/file%2Bname.pdf',
      },
      {
        name: 'should encode equals signs in splat param',
        path: '/$',
        params: { _splat: 'query=value' },
        result: '/query%3Dvalue',
      },
    ])('$name', ({ path, params, result }) => {
      const segments = parseSegments(false, { fullPath: path }, 0)
      expect(interpolatePath(path, segments, params)).toBe(result)
    })
  })

  describe('named params (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        to: '/$foo',
        params: { foo: 'bar' },
        result: '/bar',
      },
      {
        name: 'regular curly braces',
        to: '/{$foo}',
        params: { foo: 'bar' },
        result: '/bar',
      },
      {
        name: 'with prefix',
        to: '/prefix{$bar}',
        params: { bar: 'baz' },
        result: '/prefixbaz',
      },
      {
        name: 'with suffix',
        to: '/{$foo}.suffix',
        params: { foo: 'bar' },
        result: '/bar.suffix',
      },
      {
        name: 'with suffix',
        to: '/{$foo}.suffix',
        params: { foo: 'bar_' },
        result: '/bar_.suffix',
      },
      {
        name: 'with prefix and suffix',
        to: '/prefix{$param}.suffix',
        params: { param: 'foobar' },
        result: '/prefixfoobar.suffix',
      },
    ])('$name', ({ to, params, result }) => {
      const segments = parseSegments(false, { fullPath: to }, 0)
      expect(interpolatePath(to, segments, params)).toBe(result)
    })
  })

  describe('should handle missing _splat parameter for', () => {
    it.each([
      {
        name: 'basic splat route',
        path: '/hello/$',
        params: {},
        expectedResult: '/hello',
      },
      {
        name: 'splat route with prefix',
        path: '/hello/prefix{$}',
        params: {},
        expectedResult: '/hello/prefix',
      },
      {
        name: 'splat route with suffix',
        path: '/hello/{$}suffix',
        params: {},
        expectedResult: '/hello/suffix',
      },
      {
        name: 'splat route with prefix and suffix',
        path: '/hello/prefix{$}suffix',
        params: {},
        expectedResult: '/hello/prefixsuffix',
      },
      {
        name: 'splat route with empty splat',
        path: '/hello/$',
        params: {
          _splat: '',
        },
        expectedResult: '/hello',
      },
      {
        name: 'splat route with undefined splat',
        path: '/hello/$',
        params: {
          _splat: undefined,
        },
        expectedResult: '/hello',
      },
    ])('$name', ({ path, params, expectedResult }) => {
      const segments = parseSegments(false, { fullPath: path }, 0)
      expect(interpolatePath(path, segments, params)).toBe(expectedResult)
      expect(hasMissingPathParams(segments, params)).toBe(true)
    })
  })

  describe('resolvePath + interpolatePath', () => {
    it.each(['never', 'preserve', 'always'] as const)(
      'trailing slash: %s',
      (trailingSlash) => {
        const tail = trailingSlash === 'always' ? '/' : ''
        const defaultedFromPath = '/'
        const fromPath = resolvePath(defaultedFromPath, '.', trailingSlash)
        const nextTo = resolvePath(fromPath, '/splat/$', trailingSlash)
        const nextParams = { _splat: '' }
        const interpolatedNextTo = interpolatePath(
          nextTo,
          parseSegments(false, { fullPath: nextTo }, 0),
          nextParams,
        )
        expect(interpolatedNextTo).toBe(`/splat${tail}`)
      },
    )
  })
})

describe('matchPathname', () => {
  const { processedTree } = processRouteTree({
    id: '__root__',
    isRoot: true,
    fullPath: '/',
    path: '/',
  })
  const matchPathname = (
    from: string,
    options: { to: string; caseSensitive?: boolean; fuzzy?: boolean },
  ) => {
    const match = findSingleMatch(
      options.to,
      options.caseSensitive ?? false,
      options.fuzzy ?? false,
      from,
      processedTree,
    )
    const result = match ? match.rawParams : undefined
    if (options.to && !result) return
    return result ?? {}
  }
  describe('path param(s) matching', () => {
    it.each([
      {
        name: 'should not match since `to` does not match the input',
        input: '/',
        matchingOptions: {
          to: '/users',
        },
        expectedMatchedParams: undefined,
      },
      {
        name: 'should match since `to` matches the input',
        input: '/users',
        matchingOptions: {
          to: '/users',
        },
        expectedMatchedParams: {},
      },
      {
        name: 'should match and return the named path params',
        input: '/users/123',
        matchingOptions: {
          to: '/users/$id',
        },
        expectedMatchedParams: { id: '123' },
      },
      {
        name: 'should match and return the splat param',
        input: '/users/123',
        matchingOptions: {
          to: '/users/$',
        },
        expectedMatchedParams: {
          '*': '123',
          _splat: '123',
        },
      },
      {
        name: 'should match and return the named path and splat params',
        input: '/users/123/456',
        matchingOptions: {
          to: '/users/$id/$',
        },
        expectedMatchedParams: {
          id: '123',
          '*': '456',
          _splat: '456',
        },
      },
      {
        name: 'should match and return the multiple named path params and splat param',
        input: '/sean-cassiere/settings/my-repo/123/456',
        matchingOptions: {
          to: '/$username/settings/$repo/$id/$',
        },
        expectedMatchedParams: {
          username: 'sean-cassiere',
          repo: 'my-repo',
          id: '123',
          '*': '456',
          _splat: '456',
        },
      },
      {
        name: 'should match and return the splat params when multiple subsequent segments are present',
        input: '/docs/tanner/sean/manuel',
        matchingOptions: {
          to: '/docs/$',
        },
        expectedMatchedParams: {
          '*': 'tanner/sean/manuel',
          _splat: 'tanner/sean/manuel',
        },
      },
    ])('$name', ({ input, matchingOptions, expectedMatchedParams }) => {
      expect(matchPathname(input, matchingOptions)).toStrictEqual(
        toNullObj(expectedMatchedParams),
      )
    })
  })

  describe('wildcard (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        input: '/docs/foo/bar',
        matchingOptions: {
          to: '/docs/$',
        },
        expectedMatchedParams: {
          '*': 'foo/bar',
          _splat: 'foo/bar',
        },
      },
      {
        name: 'regular curly braces',
        input: '/docs/foo/bar',
        matchingOptions: {
          to: '/docs/{$}',
        },
        expectedMatchedParams: {
          '*': 'foo/bar',
          _splat: 'foo/bar',
        },
      },
      {
        name: 'with prefix',
        input: '/docs/prefixbar/baz',
        matchingOptions: {
          to: '/docs/prefix{$}',
        },
        expectedMatchedParams: {
          '*': 'bar/baz',
          _splat: 'bar/baz',
        },
      },
      {
        name: 'with suffix',
        input: '/docs/bar/baz.suffix',
        matchingOptions: {
          to: '/docs/{$}.suffix',
        },
        expectedMatchedParams: {
          '*': 'bar/baz',
          _splat: 'bar/baz',
        },
      },
      {
        name: 'with prefix + suffix',
        input: '/docs/prefixbar/baz-suffix',
        matchingOptions: {
          to: '/docs/prefix{$}-suffix',
        },
        expectedMatchedParams: {
          '*': 'bar/baz',
          _splat: 'bar/baz',
        },
      },
    ])('$name', ({ input, matchingOptions, expectedMatchedParams }) => {
      expect(matchPathname(input, matchingOptions)).toStrictEqual(
        toNullObj(expectedMatchedParams),
      )
    })
  })

  describe('named params (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        input: '/docs/foo',
        matchingOptions: {
          to: '/docs/$bar',
        },
        expectedMatchedParams: {
          bar: 'foo',
        },
      },
      {
        name: 'regular',
        input: '/docs/foo_',
        matchingOptions: {
          to: '/docs/$bar',
        },
        expectedMatchedParams: {
          bar: 'foo_',
        },
      },
      {
        name: 'regular curly braces',
        input: '/docs/foo',
        matchingOptions: {
          to: '/docs/{$bar}',
        },
        expectedMatchedParams: {
          bar: 'foo',
        },
      },
      {
        name: 'with prefix',
        input: '/docs/prefixfoo_',
        matchingOptions: {
          to: '/docs/prefix{$bar}',
        },
        expectedMatchedParams: {
          bar: 'foo_',
        },
      },
      {
        name: 'with prefix',
        input: '/docs/prefixfoo',
        matchingOptions: {
          to: '/docs/prefix{$bar}',
        },
        expectedMatchedParams: {
          bar: 'foo',
        },
      },
      {
        name: 'with suffix',
        input: '/docs/foo.suffix',
        matchingOptions: {
          to: '/docs/{$bar}.suffix',
        },
        expectedMatchedParams: {
          bar: 'foo',
        },
      },
      {
        name: 'with prefix + suffix',
        input: '/docs/prefixfoobar-suffix',
        matchingOptions: {
          to: '/docs/prefix{$param}-suffix',
        },
        expectedMatchedParams: {
          param: 'foobar',
        },
      },
    ])('$name', ({ input, matchingOptions, expectedMatchedParams }) => {
      expect(matchPathname(input, matchingOptions)).toStrictEqual(
        toNullObj(expectedMatchedParams),
      )
    })
  })
})

describe('parsePathname', () => {
  type ParsePathnameTestScheme = Array<{
    name: string
    to: string | undefined
    expected: Array<PathSegment>
  }>

  type PathSegment = {
    type: SegmentKind
    value: string
    prefixSegment?: string
    suffixSegment?: string
  }

  describe('regular usage', () => {
    it.each([
      {
        name: 'should handle pathname being undefined',
        to: undefined,
        expected: [],
      },
      {
        name: 'should handle pathname being empty',
        to: '',
        expected: [],
      },
      {
        name: 'should handle pathname at root',
        to: '/',
        expected: [{ type: SEGMENT_TYPE_PATHNAME, value: '' }],
      },
      {
        name: 'should handle pathname with a single segment',
        to: '/foo',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
        ],
      },
      {
        name: 'should handle pathname with multiple segments',
        to: '/foo/bar/baz',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'bar' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'baz' },
        ],
      },
      {
        name: 'should handle pathname with a trailing slash',
        to: '/foo/',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
        ],
      },
      {
        name: 'should handle named params',
        to: '/foo/$bar',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_PARAM, value: 'bar' },
        ],
      },
      {
        name: 'should handle named params at the root',
        to: '/$bar',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PARAM, value: 'bar' },
        ],
      },
      {
        name: 'should handle named params followed by a segment',
        to: '/foo/$bar/baz',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_PARAM, value: 'bar' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'baz' },
        ],
      },
      {
        name: 'should handle multiple named params',
        to: '/foo/$bar/$baz/qux/$quux',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_PARAM, value: 'bar' },
          { type: SEGMENT_TYPE_PARAM, value: 'baz' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'qux' },
          { type: SEGMENT_TYPE_PARAM, value: 'quux' },
        ],
      },
      {
        name: 'should handle splat params',
        to: '/foo/$',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'foo' },
          { type: SEGMENT_TYPE_WILDCARD, value: '$' },
        ],
      },
      {
        name: 'should handle splat params at the root',
        to: '/$',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_WILDCARD, value: '$' },
        ],
      },
    ] satisfies ParsePathnameTestScheme)('$name', ({ to, expected }) => {
      const result = parsePathname(to)
      expect(result).toEqual(expected)
    })
  })

  describe('wildcard (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        to: '/$',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_WILDCARD, value: '$' },
        ],
      },
      {
        name: 'regular curly braces',
        to: '/{$}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_WILDCARD, value: '$' },
        ],
      },
      {
        name: 'with prefix (regular text)',
        to: '/foo{$}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_WILDCARD,
            value: '$',
            prefixSegment: 'foo',
          },
        ],
      },
      {
        name: 'with prefix + followed by special character',
        to: '/foo.{$}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_WILDCARD,
            value: '$',
            prefixSegment: 'foo.',
          },
        ],
      },
      {
        name: 'with suffix',
        to: '/{$}-foo',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_WILDCARD,
            value: '$',
            suffixSegment: '-foo',
          },
        ],
      },
      {
        name: 'with prefix + suffix',
        to: '/foo{$}-bar',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_WILDCARD,
            value: '$',
            prefixSegment: 'foo',
            suffixSegment: '-bar',
          },
        ],
      },
      {
        name: 'with prefix + followed by special character and a segment',
        to: '/foo.{$}/bar',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_WILDCARD,
            value: '$',
            prefixSegment: 'foo.',
            suffixSegment: '/bar',
          },
        ],
      },
    ] satisfies ParsePathnameTestScheme)('$name', ({ to, expected }) => {
      const result = parsePathname(to)
      expect(result).toEqual(expected)
    })
  })

  describe('named params (prefix + suffix)', () => {
    it.each([
      {
        name: 'regular',
        to: '/$bar',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PARAM, value: 'bar' },
        ],
      },
      {
        name: 'regular curly braces',
        to: '/{$bar}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PARAM, value: 'bar' },
        ],
      },
      {
        name: 'with prefix (regular text)',
        to: '/foo{$bar}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: 'bar',
            prefixSegment: 'foo',
          },
        ],
      },
      {
        name: 'with prefix + followed by special character',
        to: '/foo.{$bar}',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: 'bar',
            prefixSegment: 'foo.',
          },
        ],
      },
      {
        name: 'with suffix',
        to: '/{$bar}.foo',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: 'bar',
            suffixSegment: '.foo',
          },
        ],
      },
      {
        name: 'with suffix + started by special character',
        to: '/{$bar}.foo',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: 'bar',
            suffixSegment: '.foo',
          },
        ],
      },
      {
        name: 'with suffix + started by special character and followed by segment',
        to: '/{$bar}.foo/baz',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: 'bar',
            suffixSegment: '.foo',
          },
          { type: SEGMENT_TYPE_PATHNAME, value: 'baz' },
        ],
      },
      {
        name: 'with suffix + prefix',
        to: '/foo{$bar}.baz',
        expected: [
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          {
            type: SEGMENT_TYPE_PARAM,
            value: 'bar',
            prefixSegment: 'foo',
            suffixSegment: '.baz',
          },
        ],
      },
    ] satisfies ParsePathnameTestScheme)('$name', ({ to, expected }) => {
      const result = parsePathname(to)
      expect(result).toEqual(expected)
    })
  })
})

function toNullObj<T>(obj: T): T {
  if (typeof obj === 'object') return Object.assign(Object.create(null), obj)
  return obj
}
