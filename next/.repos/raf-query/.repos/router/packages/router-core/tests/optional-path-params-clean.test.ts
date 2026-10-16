import { describe, expect, it } from 'vitest'
import { interpolatePath } from '../src/path'
import {
  parseTestPathname as parsePathname,
  processTestRouteTree as processRouteTree,
} from './routerTestUtils'
import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  findSingleMatch,
  parseSegments,
} from '../src/new-process-route-tree'

describe('Optional Path Parameters - Clean Comprehensive Tests', () => {
  describe('Optional Dynamic Parameters {-$param}', () => {
    describe('parsePathname', () => {
      it('should parse single optional dynamic param', () => {
        const result = parsePathname('/posts/{-$category}')
        expect(result).toEqual([
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'posts' },
          { type: SEGMENT_TYPE_OPTIONAL_PARAM, value: 'category' },
        ])
      })

      it('should parse multiple optional dynamic params', () => {
        const result = parsePathname('/posts/{-$category}/{-$slug}')
        expect(result).toEqual([
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'posts' },
          { type: SEGMENT_TYPE_OPTIONAL_PARAM, value: 'category' },
          { type: SEGMENT_TYPE_OPTIONAL_PARAM, value: 'slug' },
        ])
      })

      it('should handle prefix/suffix with optional dynamic params', () => {
        const result = parsePathname('/api/v{-$version}/data')
        expect(result).toEqual([
          { type: SEGMENT_TYPE_PATHNAME, value: '' },
          { type: SEGMENT_TYPE_PATHNAME, value: 'api' },
          {
            type: SEGMENT_TYPE_OPTIONAL_PARAM,
            value: 'version',
            prefixSegment: 'v',
            suffixSegment: undefined,
          },
          { type: SEGMENT_TYPE_PATHNAME, value: 'data' },
        ])
      })
    })

    describe('interpolatePath', () => {
      it('should interpolate optional dynamic params when present', () => {
        const path = '/posts/{-$category}'
        const segments = parseSegments(false, { fullPath: path }, 0)
        expect(interpolatePath(path, segments, { category: 'tech' })).toBe(
          '/posts/tech',
        )
      })

      it('should omit optional dynamic params when missing', () => {
        const path = '/posts/{-$category}'
        const segments = parseSegments(false, { fullPath: path }, 0)
        expect(interpolatePath(path, segments, {})).toBe('/posts')
      })

      it('should handle multiple optional dynamic params', () => {
        const path = '/posts/{-$category}/{-$slug}'
        const segments = parseSegments(false, { fullPath: path }, 0)
        expect(
          interpolatePath(path, segments, { category: 'tech', slug: 'hello' }),
        ).toBe('/posts/tech/hello')
        expect(interpolatePath(path, segments, { category: 'tech' })).toBe(
          '/posts/tech',
        )
        expect(interpolatePath(path, segments, {})).toBe('/posts')
      })

      it('should handle mixed required and optional dynamic params', () => {
        const path = '/posts/{-$category}/user/$id'
        const segments = parseSegments(false, { fullPath: path }, 0)
        expect(
          interpolatePath(path, segments, { category: 'tech', id: '123' }),
        ).toBe('/posts/tech/user/123')
        expect(interpolatePath(path, segments, { id: '123' })).toBe(
          '/posts/user/123',
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
      it('should match optional dynamic params when present', () => {
        const result = matchPathname('/posts/tech', {
          to: '/posts/{-$category}',
        })
        expect(result).toEqual({ category: 'tech' })
      })

      it('should match optional dynamic params when absent', () => {
        const result = matchPathname('/posts', {
          to: '/posts/{-$category}',
        })
        expect(result).toEqual({})
      })

      it('should handle multiple optional dynamic params', () => {
        const result1 = matchPathname('/posts/tech/hello', {
          to: '/posts/{-$category}/{-$slug}',
        })
        expect(result1).toEqual({ category: 'tech', slug: 'hello' })

        const result2 = matchPathname('/posts/tech', {
          to: '/posts/{-$category}/{-$slug}',
        })
        expect(result2).toEqual({ category: 'tech' })

        const result3 = matchPathname('/posts', {
          to: '/posts/{-$category}/{-$slug}',
        })
        expect(result3).toEqual({})
      })

      it('should handle mixed required and optional dynamic params', () => {
        const result1 = matchPathname('/posts/tech/user/123', {
          to: '/posts/{-$category}/user/$id',
        })
        expect(result1).toEqual({ category: 'tech', id: '123' })

        const result2 = matchPathname('/posts/user/123', {
          to: '/posts/{-$category}/user/$id',
        })
        expect(result2).toEqual({ id: '123' })
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle optional params with wildcards', () => {
      const path = '/docs/{-$version}/$'
      const segments = parseSegments(false, { fullPath: path }, 0)
      expect(
        interpolatePath(path, segments, {
          version: 'v1',
          _splat: 'guide/intro',
        }),
      ).toBe('/docs/v1/guide/intro')
      expect(interpolatePath(path, segments, { _splat: 'guide/intro' })).toBe(
        '/docs/guide/intro',
      )
    })

    it('should work with complex patterns', () => {
      const pattern = '/app/{-$env}/api/{-$version}/users/$id/{-$tab}'
      const segments = parseSegments(false, { fullPath: pattern }, 0)

      // All params provided
      expect(
        interpolatePath(pattern, segments, {
          env: 'prod',
          version: 'v2',
          id: '123',
          tab: 'settings',
        }),
      ).toBe('/app/prod/api/v2/users/123/settings')

      // Only required param
      expect(interpolatePath(pattern, segments, { id: '123' })).toBe(
        '/app/api/users/123',
      )

      // Mix of optional and required
      expect(
        interpolatePath(pattern, segments, {
          env: 'dev',
          id: '456',
          tab: 'profile',
        }),
      ).toBe('/app/dev/api/users/456/profile')
    })
  })
})
