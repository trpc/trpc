import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { ServerManifest } from '../src/manifest'

const testManifest: ServerManifest = { routes: {} }

describe('hydrated stay match data preservation', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps server loader data while refreshing context on client navigation', async () => {
    const serverRootBeforeLoad = vi.fn(() => ({ auth: 'server' }))
    const serverRootLoader = vi.fn(() => ({ root: 'server' }))
    const serverARouteLoader = vi.fn(() => 'a server data')
    const serverRootRoute = new BaseRootRoute({
      beforeLoad: serverRootBeforeLoad,
      loader: serverRootLoader,
    })
    const serverARoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/a',
      ssr: false,
      loader: serverARouteLoader,
    })
    const serverBRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/b',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverARoute, serverBRoute]),
      history: createMemoryHistory({ initialEntries: ['/a'] }),
      isServer: true,
    })

    const bootstrap = await dehydrateToBootstrap(serverRouter, testManifest)

    expect(serverRootBeforeLoad).toHaveBeenCalledTimes(1)
    expect(serverRootLoader).toHaveBeenCalledTimes(1)
    expect(serverARouteLoader).not.toHaveBeenCalled()
    expect(serverRouter.state.matches[0]).toMatchObject({
      routeId: serverRootRoute.id,
      status: 'success',
      context: { auth: 'server' },
      loaderData: { root: 'server' },
    })
    const rootBeforeLoad = vi.fn(() => ({ auth: 'client' }))
    const rootLoader = vi.fn(() => ({ root: 'client' }))
    const history = createMemoryHistory({ initialEntries: ['/a'] })

    const rootRoute = new BaseRootRoute({
      beforeLoad: rootBeforeLoad,
      loader: rootLoader,
    })
    const aRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      ssr: false,
      loader: () => 'a client data',
    })
    const bRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/b',
      loader: () => 'b client data',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([aRoute, bRoute]),
      history,
      isServer: false,
    })

    mockWindow.$_TSR = bootstrap

    await hydrate(router)

    // Hydration adopts the server root before client loads can re-enter beforeLoad.
    expect(rootBeforeLoad).not.toHaveBeenCalled()
    expect(rootLoader).not.toHaveBeenCalled()
    expect(
      router.state.matches.find((m) => m.routeId === rootRoute.id),
    ).toMatchObject({
      context: { auth: 'server' },
      loaderData: { root: 'server' },
    })

    await router.load()

    expect(
      router.state.matches.find((m) => m.routeId === aRoute.id)?.loaderData,
    ).toBe('a client data')
    expect(router.state.location.pathname).toBe('/a')
    expect(router.state.resolvedLocation?.pathname).toBe('/a')
    expect(rootLoader).not.toHaveBeenCalled()
    expect(
      router.state.matches.find((m) => m.routeId === rootRoute.id),
    ).toMatchObject({
      context: { auth: 'server' },
      loaderData: { root: 'server' },
    })

    // The root stay match refreshes beforeLoad context without rerunning its loader.
    await router.navigate({ to: '/b' })

    expect(
      router.state.matches.find((m) => m.routeId === bRoute.id)?.loaderData,
    ).toBe('b client data')
    expect(router.state.location.pathname).toBe('/b')
    expect(router.state.resolvedLocation?.pathname).toBe('/b')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      bRoute.id,
    ])
    expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
    expect(rootLoader).not.toHaveBeenCalled()
    expect(
      router.state.matches.find((m) => m.routeId === rootRoute.id),
    ).toMatchObject({
      context: { auth: 'client' },
      loaderData: { root: 'server' },
    })
  })
})
