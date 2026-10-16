import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import * as routeTreeUtils from '../src/new-process-route-tree'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute, AnyRouter } from '../src'

const disposers: Array<() => void> = []

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubGlobal('__TSR_CACHE__', undefined)
})

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function createRoutes() {
  const root = new BaseRootRoute({})
  const item = new BaseRoute({
    getParentRoute: () => root,
    path: '/items/$id',
  })
  return { root, item, routeTree: root.addChildren([item]) }
}

function history() {
  const result = createMemoryHistory({ initialEntries: ['/'] })
  disposers.push(result.destroy)
  return result
}

test.each([false, true])(
  'builds canonical pathnames and encoded hrefs (server: %s)',
  (isServer) => {
    const { routeTree } = createRoutes()
    const router = createTestRouter({ routeTree, history: history(), isServer })
    for (const [id, pathname, href] of [
      ['one two', '/items/one two', '/items/one%20two'],
      ['caf\u00e9', '/items/caf\u00e9', '/items/caf%C3%A9'],
      ['a/b', '/items/a%2Fb', '/items/a%2Fb'],
      ['%2F', '/items/%252F', '/items/%252F'],
      ['a\\b', '/items/a%5Cb', '/items/a%5Cb'],
      ['a?b#c', '/items/a%3Fb%23c', '/items/a%3Fb%23c'],
      ['a\tb', '/items/a%09b', '/items/a%09b'],
    ] as const) {
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = router.buildLocation({
          to: '/items/$id',
          params: { id },
        })
        expect(result.pathname).toBe(pathname)
        expect(result.href).toBe(href)
      }
    }
  },
)

test('reuses server caches after request cleanup without sharing match state', async () => {
  const { routeTree, item, root } = createRoutes()
  const routers: Array<AnyRouter> = []
  const request = () =>
    createRequestHandler({
      request: new Request('http://localhost/'),
      createRouter: () => {
        const router = createTestRouter({ routeTree, isServer: true })
        routers.push(router)
        return router
      },
    })(({ router }) => {
      disposers.push(router.history.destroy)
      return new Response(
        router.buildLocation({
          to: '/items/$id',
          params: { id: 'one two' },
        }).href,
      )
    })

  expect(await (await request()).text()).toBe('/items/one%20two')
  const branch = item._branch
  const firstLocation = routers[0]!.latestLocation
  const lightweightResult = routers[0]!['lightweightCache'].get(firstLocation)
  expect(branch).toEqual([root, item])
  expect(lightweightResult).toBeDefined()

  expect(await (await request()).text()).toBe('/items/one%20two')
  expect(item._branch).toBe(branch)
  expect(routers[0]).not.toBe(routers[1])
  expect(routers[0]!.resolvePathCache).toBe(routers[1]!.resolvePathCache)
  expect(routers[0]!['lightweightCache']).not.toBe(
    routers[1]!['lightweightCache'],
  )
  expect(routers[1]!['lightweightCache'].get(firstLocation)).toBeUndefined()
  expect(routers[1]!.latestLocation).not.toBe(firstLocation)
  expect(routers[0]!._cache).not.toBe(routers[1]!._cache)
})

test.each([
  { mode: 'production', isServer: false },
  { mode: 'development', isServer: true },
])(
  'does not share router cache groups in $mode (server: $isServer)',
  ({ mode, isServer }) => {
    vi.stubEnv('NODE_ENV', mode)
    const first = createTestRouter({
      routeTree: createRoutes().routeTree,
      history: history(),
      isServer,
    })
    const second = createTestRouter({
      routeTree: createRoutes().routeTree,
      history: history(),
      isServer,
    })
    expect(first.resolvePathCache).not.toBe(second.resolvePathCache)
    expect(first['lightweightCache']).not.toBe(second['lightweightCache'])
    expect(globalThis.__TSR_CACHE__).toBeUndefined()
  },
)

test.each(['production', 'development'])(
  'refreshes server matching caches when case sensitivity changes in %s',
  (mode) => {
    vi.stubEnv('NODE_ENV', mode)
    const { root, item } = createRoutes()
    const strict = new BaseRoute({
      getParentRoute: () => root,
      path: '/strict',
      caseSensitive: true,
    })
    const relaxed = new BaseRoute({
      getParentRoute: () => root,
      path: '/relaxed',
      caseSensitive: false,
    })
    const router = createTestRouter({
      routeTree: root.addChildren([item, strict, relaxed]),
      history: history(),
      isServer: true,
      caseSensitive: false,
    })
    expect(router.getMatchedRoutes('/ITEMS/one')[2]).toBe(item)

    for (const caseSensitive of [true, false]) {
      router.buildLocation({
        to: '/items/$id',
        params: { id: 'one' },
        search: true,
      })
      const previousTree = router.processedTree
      const previousResolve = router.resolvePathCache
      const previousLightweight = router['lightweightCache']
      expect(previousTree.matchCache.get('/ITEMS/one')).toBeDefined()
      expect(previousLightweight.get(router.latestLocation)).toBeDefined()

      router.update({ caseSensitive })

      expect(router.processedTree).not.toBe(previousTree)
      expect(router.resolvePathCache).not.toBe(previousResolve)
      expect(router['lightweightCache']).not.toBe(previousLightweight)
      expect(router.getMatchedRoutes('/ITEMS/one')[2] === item).toBe(
        !caseSensitive,
      )
      expect(router.getMatchedRoutes('/items/one')[2]).toBe(item)
      expect(router.getMatchedRoutes('/STRICT')[2]).not.toBe(strict)
      expect(router.getMatchedRoutes('/strict')[2]).toBe(strict)
      expect(router.getMatchedRoutes('/RELAXED')[2]).toBe(relaxed)

      const currentTree = router.processedTree
      router.update({ caseSensitive })
      expect(router.processedTree).toBe(currentTree)
    }
  },
)

test.each([false, true])(
  'only reuses a server route tree with matching case sensitivity (cached: %s)',
  (caseSensitive) => {
    const { routeTree, item } = createRoutes()
    const createRouter = (sensitive: boolean) =>
      createTestRouter({
        routeTree,
        history: history(),
        isServer: true,
        caseSensitive: sensitive,
      })
    const first = createRouter(caseSensitive)
    expect(first.getMatchedRoutes('/ITEMS/one')[2] === item).toBe(
      !caseSensitive,
    )

    const same = createRouter(caseSensitive)
    expect(same.processedTree).toBe(first.processedTree)
    expect(same.resolvePathCache).toBe(first.resolvePathCache)

    const different = createRouter(!caseSensitive)
    expect(different.processedTree).not.toBe(first.processedTree)
    expect(different.resolvePathCache).not.toBe(first.resolvePathCache)
    expect(different.getMatchedRoutes('/ITEMS/one')[2] === item).toBe(
      caseSensitive,
    )
    expect(different.getMatchedRoutes('/items/one')[2]).toBe(item)

    const reused = createRouter(caseSensitive)
    expect(reused.processedTree).toBe(first.processedTree)
    for (const router of [first, same, reused]) {
      expect(router.getMatchedRoutes('/ITEMS/one')[2] === item).toBe(
        !caseSensitive,
      )
      expect(router.getMatchedRoutes('/items/one')[2]).toBe(item)
    }
  },
)

test('never accesses the server cache on the client', () => {
  const getCache = vi.fn(() => {
    throw new Error('Client read the server cache')
  })
  const setCache = vi.fn(() => {
    throw new Error('Client wrote the server cache')
  })
  Object.defineProperty(globalThis, '__TSR_CACHE__', {
    configurable: true,
    get: getCache,
    set: setCache,
  })
  const router = createTestRouter({
    routeTree: createRoutes().routeTree,
    history: history(),
    isServer: false,
    caseSensitive: false,
  })
  const processedTree = router.processedTree
  router.update({ caseSensitive: true })
  expect(router.processedTree).toBe(processedTree)
  router.update({ routeTree: createRoutes().routeTree })
  expect(getCache).not.toHaveBeenCalled()
  expect(setCache).not.toHaveBeenCalled()
})

test('keeps different route objects independent and resets derived caches when rebuilding', () => {
  vi.stubEnv('NODE_ENV', 'development')
  const firstTree = createRoutes()
  const secondTree = createRoutes()
  const first = createTestRouter({
    routeTree: firstTree.routeTree,
    history: history(),
  })
  const second = createTestRouter({
    routeTree: secondTree.routeTree,
    history: history(),
  })
  for (const router of [first, second]) {
    expect(
      router.buildLocation({ to: '/items/$id', params: { id: 'one' } }).href,
    ).toBe('/items/one')
  }
  expect(firstTree.item._branch).not.toBe(secondTree.item._branch)
  expect(firstTree.item._interpolation).not.toBe(secondTree.item._interpolation)

  const previousResolve = first.resolvePathCache
  const previousLightweight = first['lightweightCache']
  const previousBranch = firstTree.item._branch
  const previousInterpolation = firstTree.item._interpolation
  first.setRoutes(first.buildRouteTree())
  expect(first.resolvePathCache).not.toBe(previousResolve)
  expect(first['lightweightCache']).not.toBe(previousLightweight)
  expect(firstTree.item._branch).toBeUndefined()
  expect(firstTree.item._interpolation).not.toBe(previousInterpolation)
  expect([...firstTree.item._interpolation!]).toEqual([
    ...previousInterpolation!,
  ])
  expect(
    first.buildLocation({ to: '/items/$id', params: { id: 'one' } }).href,
  ).toBe('/items/one')
  expect(firstTree.item._branch).not.toBe(previousBranch)
})

test('refreshes branches and segments when an existing route is reparented', () => {
  vi.stubEnv('NODE_ENV', 'development')
  const root = new BaseRootRoute({})
  const left = new BaseRoute({ getParentRoute: () => root, path: '/left' })
  const right = new BaseRoute({ getParentRoute: () => root, path: '/right' })
  let parent: AnyRoute = left
  const child = new BaseRoute({
    getParentRoute: () => parent,
    path: '/child/$id',
  })
  const router = createTestRouter({
    routeTree: root.addChildren([left.addChildren([child]), right]),
    history: history(),
  })
  expect(
    router.buildLocation({ to: '/left/child/$id', params: { id: 'one two' } })
      .href,
  ).toBe('/left/child/one%20two')
  expect(child._branch).toEqual([root, left, child])
  const previousInterpolation = child._interpolation

  parent = right
  left.addChildren([])
  right.addChildren([child])
  router.setRoutes(router.buildRouteTree())
  expect(child._branch).toBeUndefined()
  expect(child._interpolation).not.toBe(previousInterpolation)
  expect(child.fullPath).toBe('/right/child/$id')
  expect(child._interpolation?.[0]).toBe('/right/child')
  const parse = vi.spyOn(routeTreeUtils, 'parseSegments')
  expect(
    router.buildLocation({ to: '/right/child/$id', params: { id: 'one two' } })
      .href,
  ).toBe('/right/child/one%20two')
  expect(child._branch).toEqual([root, right, child])
  expect(parse).not.toHaveBeenCalled()
})

test('uses updated callbacks with rebuilt segments in development', () => {
  vi.stubEnv('NODE_ENV', 'development')
  const { routeTree, item } = createRoutes()
  const router = createTestRouter({ routeTree, history: history() })
  expect(
    router.buildLocation({ to: '/items/$id', params: { id: 'one' } }).href,
  ).toBe('/items/one')
  const prepared = item._interpolation
  item.options.params = {
    stringify: ({ id }) => ({ id: `updated ${id}` }),
  }
  router.setRoutes(router.buildRouteTree())
  expect(item._interpolation).not.toBe(prepared)
  const parse = vi.spyOn(routeTreeUtils, 'parseSegments')
  expect(
    router.buildLocation({ to: '/items/$id', params: { id: 'one' } }).href,
  ).toBe('/items/updated%20one')
  expect(parse).not.toHaveBeenCalled()
})

test('uses fixed encodings and trailing-slash policies on independent routes', () => {
  const allowAt = createTestRouter({
    routeTree: createRoutes().routeTree,
    history: history(),
    isServer: true,
    trailingSlash: 'never',
    pathParamsAllowedCharacters: ['@'],
  })
  const allowPlus = createTestRouter({
    routeTree: createRoutes().routeTree,
    history: history(),
    isServer: true,
    trailingSlash: 'always',
    pathParamsAllowedCharacters: ['+'],
  })
  for (let round = 0; round < 3; round++) {
    expect(
      allowAt.buildLocation({ to: '/items/$id', params: { id: '@+' } })
        .pathname,
    ).toBe('/items/@%2B')
    expect(
      allowPlus.buildLocation({ to: '/items/$id', params: { id: '@+' } })
        .pathname,
    ).toBe('/items/%40+/')
  }
  const allowAtWithSlash = createTestRouter({
    routeTree: createRoutes().routeTree,
    history: history(),
    isServer: true,
    trailingSlash: 'always',
    pathParamsAllowedCharacters: ['@'],
  })
  expect(
    allowAtWithSlash.buildLocation({ to: '/items/$id', params: { id: '@+' } })
      .pathname,
  ).toBe('/items/@%2B/')
  expect(
    allowAt.buildLocation({ to: '/items/$id', params: { id: '@+' } }).pathname,
  ).toBe('/items/@%2B')
})

test('does not reparse a legacy fallback already registered in the tree', () => {
  const { routeTree, item } = createRoutes()
  const parse = vi.spyOn(routeTreeUtils, 'parseSegments')
  const router = createTestRouter({
    routeTree,
    notFoundRoute: item,
    history: history(),
  })
  expect(router.routesById[item.id]).toBe(item)
  expect(item._interpolation).toBeDefined()
  expect(parse).not.toHaveBeenCalled()
})

test('formats masked destinations without registered templates', () => {
  const { routeTree } = createRoutes()
  const router = createTestRouter({
    routeTree,
    history: history(),
    pathParamsAllowedCharacters: ['@'],
  })
  const build = () =>
    router.buildLocation({
      to: '/items/$id',
      params: { id: '@one' },
      mask: { to: '/pretty/$id', params: { id: '@one' } },
    })

  expect(build().maskedLocation?.pathname).toBe('/pretty/@one')
  expect(build().maskedLocation?.pathname).toBe('/pretty/@one')
})
