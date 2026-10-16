import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute } from '../src'

afterEach(() => vi.restoreAllMocks())

function setup(isServer: boolean) {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const root = new BaseRootRoute({})
  const tenant = new BaseRoute({
    getParentRoute: () => root,
    path: '/$tenant',
  })
  const legacy = new BaseRoute({
    getParentRoute: () => tenant,
    path: '/404',
    loader: ({ params }) => params.tenant,
    staleTime: Infinity,
  })
  const history = createMemoryHistory({ initialEntries: ['/a/missing'] })
  const router = createTestRouter({
    routeTree: root.addChildren([tenant]),
    notFoundRoute: legacy,
    history,
    isServer,
    scrollRestoration: false,
  })
  return { router, history, legacy }
}

test.each([false, true])(
  'interpolates standalone fallback match IDs (server: %s)',
  (isServer) => {
    const { router, history, legacy } = setup(isServer)
    try {
      expect(legacy.originalIndex).toBe(99999999999)
      const first = router.matchRoutes('/a/missing', {}).at(-1)!
      const second = router.matchRoutes('/b/missing', {}).at(-1)!
      expect(first.routeId).toBe(legacy.id)
      expect(first.pathname).toBe('/a/404')
      expect(second.pathname).toBe('/b/404')
      expect(second.id).not.toBe(first.id)
      expect(second._strictParams).toEqual({ tenant: 'b' })
    } finally {
      history.destroy()
    }
  },
)

test('does not reuse fallback params or loader data across tenants', async () => {
  const { router, history, legacy } = setup(false)
  try {
    await router.load()
    const first = router.state.matches.find(
      (match) => match.routeId === legacy.id,
    )!
    expect(first.params).toEqual({ tenant: 'a' })
    expect(first.loaderData).toBe('a')
    await router.navigate({ href: '/b/missing' })
    const second = router.state.matches.find(
      (match) => match.routeId === legacy.id,
    )!
    expect(second.id).not.toBe(first.id)
    expect(second.params).toEqual({ tenant: 'b' })
    expect(second.loaderData).toBe('b')
  } finally {
    history.destroy()
  }
})

test('refreshes fallback segments when the route tree is replaced', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const root = new BaseRootRoute({})
  let parent: AnyRoute = new BaseRoute({
    getParentRoute: () => root,
    path: '/$tenant',
  })
  const legacy = new BaseRoute({
    getParentRoute: () => parent,
    path: '/404',
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter<AnyRoute>({
    routeTree: root.addChildren([parent]),
    notFoundRoute: legacy,
    history,
    scrollRestoration: false,
  })
  try {
    expect(router.matchRoutes('/a/missing', {}).at(-1)?.pathname).toBe('/a/404')
    const nextRoot = new BaseRootRoute({})
    parent = new BaseRoute({
      getParentRoute: () => nextRoot,
      path: '/$org',
    })
    router.update({ routeTree: nextRoot.addChildren([parent]) })
    const match = router.matchRoutes('/b/missing', {}).at(-1)!
    expect(match.pathname).toBe('/b/404')
    expect(match._strictParams).toEqual({ org: 'b' })
  } finally {
    history.destroy()
  }
})
