import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { AnyRouteMatch } from '../src'
import type { ServerManifest } from '../src/manifest'
import type { TsrSsrGlobal } from '../src/ssr/types'

const testManifest: ServerManifest = { routes: {} }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('hydration reconstructs every match context before ancestor head reads the lane', async () => {
  const serverBeforeLoad = vi.fn(() => ({
    user: 'server authenticated user',
  }))
  const serverRootRoute = new BaseRootRoute({})
  const serverChildRoute = new BaseRoute({
    getParentRoute: () => serverRootRoute,
    path: '/child',
    beforeLoad: serverBeforeLoad,
  })
  const serverRouter = createTestRouter({
    routeTree: serverRootRoute.addChildren([serverChildRoute]),
    history: createMemoryHistory({ initialEntries: ['/child'] }),
    isServer: true,
  })

  const bootstrap = await dehydrateToBootstrap(serverRouter, testManifest)

  expect(serverBeforeLoad).toHaveBeenCalledTimes(1)
  expect(serverRouter.state.matches.at(-1)?.context).toMatchObject({
    user: 'server authenticated user',
  })
  let childContextSeenByRootHead: unknown
  const rootHead = vi.fn(({ matches }: { matches: Array<AnyRouteMatch> }) => {
    childContextSeenByRootHead = matches[1]?.context
    return { meta: [{ title: 'hydrated' }] }
  })
  const clientBeforeLoad = vi.fn(() => ({ user: 'client fallback' }))
  const rootRoute = new BaseRootRoute({
    head: rootHead,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    beforeLoad: clientBeforeLoad,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/child'] }),
    isServer: false,
  })

  vi.stubGlobal('window', { $_TSR: bootstrap })

  await hydrate(router)

  expect(childContextSeenByRootHead).toMatchObject({
    user: 'server authenticated user',
  })
  expect(clientBeforeLoad).not.toHaveBeenCalled()
  expect(rootHead).toHaveBeenCalledTimes(1)
  expect(router.state.location.pathname).toBe('/child')
  expect(router.state.resolvedLocation?.pathname).toBe('/child')
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: childRoute.id,
    context: { user: 'server authenticated user' },
  })
  expect(router.state.matches[0]?.meta).toEqual([{ title: 'hydrated' }])
})
