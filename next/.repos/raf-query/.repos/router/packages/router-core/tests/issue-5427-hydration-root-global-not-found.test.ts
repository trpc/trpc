import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { dehydrateMatch } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'

function createRouter(initialEntry: string, isServer: boolean) {
  const rootRoute = new BaseRootRoute({
    notFoundComponent: () => 'Root not found',
  })
  const notFoundRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/404',
    component: () => 'Not found route',
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([notFoundRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    isServer,
  })

  return { rootRoute, router }
}

function createLayoutRouter(initialEntry: string, isServer: boolean) {
  const rootRoute = new BaseRootRoute({})
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    id: '_layout',
    notFoundComponent: () => 'Layout not found',
  })
  const notFoundRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/404',
  })
  const notFoundIndexRoute = new BaseRoute({
    getParentRoute: () => notFoundRoute,
    path: '/',
  })
  const agentsRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/agents',
  })
  const skillAgentRoute = new BaseRoute({
    getParentRoute: () => agentsRoute,
    path: '/skill-agent',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      layoutRoute.addChildren([
        notFoundRoute.addChildren([notFoundIndexRoute]),
        agentsRoute.addChildren([skillAgentRoute]),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    isServer,
  })

  return { layoutRoute, router }
}

describe('issue #5427: root-only global not-found hydration', () => {
  test('resolves the client URL when the dehydrated /404 lane has a child match', async () => {
    const { router: serverRouter } = createRouter('/404', true)
    await serverRouter.load()

    const bootstrap: TsrSsrGlobal = {
      router: {
        manifest: { routes: {} },
        dehydratedData: {},
        matches: serverRouter.state.matches.map(dehydrateMatch),
      },
      h: () => {},
      e: () => {},
      c: () => {},
      p: () => {},
      buffer: [],
    }
    const previousBootstrap = window.$_TSR
    window.$_TSR = bootstrap
    onTestFinished(() => {
      window.$_TSR = previousBootstrap
    })

    const { rootRoute, router } = createRouter('/missing', false)

    await hydrate(router)
    await vi.waitFor(() => {
      expect(router.state.resolvedLocation?.pathname).toBe('/missing')
    })

    expect(router.state.matches).toHaveLength(1)
    expect(router.state.matches[0]).toMatchObject({
      routeId: rootRoute.id,
      _notFound: true,
    })
  })

  test('resolves a fuzzy client URL capped by an ancestor layout boundary', async () => {
    const { router: serverRouter } = createLayoutRouter('/404', true)
    await serverRouter.load()
    expect(serverRouter.state.matches).toHaveLength(4)

    const bootstrap: TsrSsrGlobal = {
      router: {
        manifest: { routes: {} },
        dehydratedData: {},
        matches: serverRouter.state.matches.map(dehydrateMatch),
      },
      h: () => {},
      e: () => {},
      c: () => {},
      p: () => {},
      buffer: [],
    }
    const previousBootstrap = window.$_TSR
    window.$_TSR = bootstrap
    onTestFinished(() => {
      window.$_TSR = previousBootstrap
    })

    const { layoutRoute, router } = createLayoutRouter('/agents/missing', false)

    await hydrate(router)

    expect(router.state.resolvedLocation?.pathname).toBe('/agents/missing')
    expect(router.state.matches).toHaveLength(3)
    expect(router.state.matches[1]).toMatchObject({
      routeId: layoutRoute.id,
      _notFound: true,
    })
  })
})
