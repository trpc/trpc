import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import {
  cleanPath,
  compileDecodeCharMap,
  hasMissingPathParams,
  interpolatePath,
} from '../src/path'
import * as routeTreeUtils from '../src/new-process-route-tree'
import { createTestRouter } from './routerTestUtils'

afterEach(() => vi.restoreAllMocks())

test.each([
  { path: '/static', params: {}, missing: false },
  { path: '/$id', params: {}, missing: true },
  { path: '/$id', params: { id: undefined }, missing: false },
  { path: '/$id', params: { id: '' }, missing: false },
  { path: '/{-$id}', params: {}, missing: false },
  { path: '/pre{-$id}suffix', params: { id: null }, missing: false },
  { path: '/files/$', params: {}, missing: true },
  { path: '/files/$', params: { _splat: null }, missing: true },
  { path: '/files/$', params: { _splat: '' }, missing: true },
  { path: '/files/{$}.txt', params: { _splat: 0 }, missing: false },
  { path: '/files/{$}.txt', params: { _splat: false }, missing: false },
  { path: '/files/$/ignored', params: { _splat: 'a/b' }, missing: false },
])(
  'preserves navigation availability for $path: $params',
  ({ path, params, missing }) => {
    const segments = routeTreeUtils.parseSegments(false, { fullPath: path }, 0)
    expect(hasMissingPathParams(segments, params)).toBe(missing)
  },
)

test('encodes splats equivalently without interpreting literal encoded separators', () => {
  const segments = routeTreeUtils.parseSegments(
    false,
    { fullPath: '/files/$' },
    0,
  )
  for (const allowed of [[], ['@', '+'], ['%'], ['/']]) {
    const decoder = compileDecodeCharMap(allowed)
    for (const value of [
      '/a//b/',
      'docs/a b/c+d?x#y',
      'literal%2F/100%/caf\u00e9',
      'folder/\u6f22\u5b57/file',
    ]) {
      const expected = value
        .split('/')
        .map((part) => decoder(encodeURIComponent(part)))
        .join('/')
      expect(
        interpolatePath('/files/$', segments, { _splat: value }, decoder),
      ).toBe(`/files/${expected}`)
    }
  }
})

describe.each([false, true])(
  'prepared route interpolation (server: %s)',
  (server) => {
    test.each([
      '/',
      '/static/path/',
      '/items/$id',
      '/$id/$id/',
      '/items/Pre{$id}Suffix/{-$lang}',
      '/items/Pre{-$id}Suffix/$lang',
      '/files/$',
      '/files/Pre{$}Suffix/',
      '/files/$/child',
      '/{-$lang}/files/{$}.txt',
      '//items//$id//',
      '/literal$dollar/{$id}/',
    ])('keeps substitution and metadata live for %s', (path) => {
      const root = new BaseRootRoute({})
      const route = new BaseRoute({ getParentRoute: () => root, path })
      const history = createMemoryHistory({ initialEntries: ['/'] })
      createTestRouter({
        routeTree: root.addChildren([route]),
        history,
        isServer: server,
        scrollRestoration: false,
      })
      history.destroy()
      // The reference is the standalone parse buildLocation uses for templates
      // without a processed route.
      const template = routeTreeUtils.parseSegments(
        false,
        { fullPath: cleanPath(path) },
        0,
      )
      const decoder = compileDecodeCharMap(['@', '+'])
      const inputs: Array<Record<string, unknown>> = [
        {},
        { id: '', lang: null, _splat: '' },
        { id: 'one /@+?', lang: 'en', _splat: 'docs/a b/100%' },
        { id: 0, lang: false, _splat: 0 },
        { id: 'next', lang: undefined, _splat: 'next/file' },
      ]
      for (const params of [...inputs, ...inputs]) {
        const expectedUsed = Object.create(null)
        const actualUsed = Object.create(null)
        const expected = interpolatePath(
          path,
          template,
          params,
          decoder,
          expectedUsed,
        )
        expect(
          route._interpolation
            ? interpolatePath(
                path,
                route._interpolation,
                params,
                decoder,
                actualUsed,
              )
            : path,
        ).toBe(expected)
        expect(actualUsed).toEqual(expectedUsed)
        expect(
          route._interpolation
            ? routeTreeUtils.getParamNames(route._interpolation)
            : [],
        ).toEqual(routeTreeUtils.getParamNames(template))
        expect(
          route._interpolation
            ? hasMissingPathParams(route._interpolation, params)
            : false,
        ).toBe(hasMissingPathParams(template, params))
      }
    })

    test('does not change prepared segments when an encoder throws', () => {
      const root = new BaseRootRoute({})
      const route = new BaseRoute({
        getParentRoute: () => root,
        path: '/$first/{-$second}',
      })
      const history = createMemoryHistory({ initialEntries: ['/'] })
      createTestRouter({
        routeTree: root.addChildren([route]),
        history,
        isServer: server,
        scrollRestoration: false,
      })
      history.destroy()
      const prepared = route._interpolation
      expect(prepared).toBeDefined()
      expect(() =>
        interpolatePath(route.fullPath, route._interpolation!, {
          first: '\uD800',
          second: 'two',
        }),
      ).toThrow(URIError)
      expect(route._interpolation).toBe(prepared)
      expect(
        interpolatePath(route.fullPath, route._interpolation!, {
          first: 'one',
          second: 'two',
        }),
      ).toBe('/one/two')
    })
  },
)

test('never reparses a processed route for first use, Link misses or match metadata', () => {
  const root = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => root,
    path: '/items/Pre{$id}Suffix/{-$lang}',
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter({
    routeTree: root.addChildren([route]),
    history,
    pathParamsAllowedCharacters: ['@'],
    scrollRestoration: false,
  })
  history.destroy()
  const prepared = route._interpolation
  expect(prepared).toBeDefined()
  const parse = vi.spyOn(routeTreeUtils, 'parseSegments')
  routeTreeUtils.parseSegments(
    false,
    { fullPath: '/unregistered-control/$id' },
    0,
  )
  expect(parse).toHaveBeenCalled()
  parse.mockClear()
  router.buildLocation({
    to: '/items/Pre{$id}Suffix/{-$lang}',
    params: { id: 'first' },
  })
  for (let id = 0; id < 256; id++) {
    expect(
      router.buildLocation({
        to: '/items/Pre{$id}Suffix/{-$lang}',
        params: { id: String(id), lang: 'en' },
      }).href,
    ).toBe(`/items/Pre${id}Suffix/en`)
    expect(
      router.matchRoutes(`/items/Pre${id}Suffix/en`, {}).at(-1)?._strictParams,
    ).toEqual({ id: String(id), lang: 'en' })
  }
  expect(
    router.buildLocation({
      to: '/items/Pre{$id}Suffix/{-$lang}',
      params: { id: '@last' },
    }).href,
  ).toBe('/items/Pre@lastSuffix')
  expect(route._interpolation).toBe(prepared)
  expect(parse).not.toHaveBeenCalled()
})

test.each([false, true])(
  'uses prepared segments for either trailing slash variant (server: %s)',
  (server) => {
    const root = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => root,
      path: '/files/pre{$}.txt/',
    })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    createTestRouter({
      routeTree: root.addChildren([route]),
      history,
      isServer: server,
      scrollRestoration: false,
    })
    history.destroy()
    const parse = vi.spyOn(routeTreeUtils, 'parseSegments')
    for (const path of [
      '/files/pre{$}.txt',
      '/files/pre{$}.txt/',
      '/files/pre{$}.txt',
    ]) {
      expect(
        interpolatePath(path, route._interpolation!, { _splat: 'a/b' }),
      ).toBe(path.endsWith('/') ? '/files/prea/b.txt//' : '/files/prea/b.txt')
    }
    expect(parse).not.toHaveBeenCalled()
  },
)

test.each([false, true])(
  'preserves inherited wildcard tails (server: %s)',
  (server) => {
    for (const path of ['/files/{$}.txt', '/{-$lang}/files/$', '/files/$']) {
      const root = new BaseRootRoute({})
      const parent = new BaseRoute({ getParentRoute: () => root, path })
      const child = new BaseRoute({
        getParentRoute: () => parent,
        path: '/child',
      })
      const history = createMemoryHistory({ initialEntries: ['/'] })
      createTestRouter({
        routeTree: root.addChildren([parent.addChildren([child])]),
        history,
        isServer: server,
        scrollRestoration: false,
      })
      history.destroy()
      const params = { _splat: 'a/b', lang: 'en' }
      expect(
        interpolatePath(child.fullPath, child._interpolation!, params),
      ).toBe(
        interpolatePath(
          child.fullPath,
          routeTreeUtils.parseSegments(false, { fullPath: child.fullPath }, 0),
          params,
        ),
      )
    }
  },
)
