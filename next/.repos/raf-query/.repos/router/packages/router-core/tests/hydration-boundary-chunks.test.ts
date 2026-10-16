import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, isNotFound, notFound } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { ServerManifest } from '../src/manifest'

const testManifest: ServerManifest = { routes: {} }

describe('hydration route chunks below a server boundary', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('hydrates an error boundary without requiring its normal component chunk', async () => {
    const serverError = new Error('server beforeLoad failed')
    const serverBeforeLoad = vi.fn(() => {
      throw serverError
    })
    const serverRootRoute = new BaseRootRoute({})
    const serverAppRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/app',
      beforeLoad: serverBeforeLoad,
      errorComponent: () => null,
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([serverAppRoute]),
      history: createMemoryHistory({ initialEntries: ['/app'] }),
      isServer: true,
    })

    const bootstrap = await dehydrateToBootstrap(serverRouter, testManifest)

    expect(serverBeforeLoad).toHaveBeenCalledTimes(1)
    expect(serverRouter.state.location.pathname).toBe('/app')
    expect(serverRouter.state.matches.map((match) => match.routeId)).toEqual([
      serverRootRoute.id,
      serverAppRoute.id,
    ])
    expect(serverRouter.state.matches.at(-1)).toMatchObject({
      status: 'error',
      error: serverError,
    })
    const transportedError = bootstrap.router?.matches.at(-1)?.e
    expect(transportedError).not.toBe(serverError)
    expect(transportedError).toMatchObject({
      name: serverError.name,
      message: serverError.message,
    })

    const normalChunkError = new Error('normal component chunk unavailable')
    const normalComponentPreload = vi.fn(() => Promise.reject(normalChunkError))
    const errorComponentPreload = vi.fn(() => Promise.resolve())
    const clientBeforeLoad = vi.fn(() => {
      throw new Error('client beforeLoad should not run')
    })
    const NormalComponent = Object.assign(() => null, {
      preload: normalComponentPreload,
    })
    const ErrorComponent = Object.assign(() => null, {
      preload: errorComponentPreload,
    })

    const rootRoute = new BaseRootRoute({})
    const appRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/app',
      beforeLoad: clientBeforeLoad,
      component: NormalComponent,
      errorComponent: ErrorComponent,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([appRoute]),
      history: createMemoryHistory({ initialEntries: ['/app'] }),
      isServer: false,
    })
    mockWindow.$_TSR = bootstrap

    await expect(hydrate(router)).resolves.toBeUndefined()

    const appMatch = router.state.matches.find(
      (match) => match.routeId === appRoute.id,
    )
    expect(appMatch?.status).toBe('error')
    expect(appMatch?.error).toBe(transportedError)
    expect(appMatch?.error).toMatchObject({
      name: serverError.name,
      message: serverError.message,
    })
    expect(router.state.location.pathname).toBe('/app')
    expect(router.state.resolvedLocation?.pathname).toBe('/app')
    expect(clientBeforeLoad).not.toHaveBeenCalled()
    expect(normalComponentPreload).not.toHaveBeenCalled()
    expect(errorComponentPreload).toHaveBeenCalledTimes(1)
  })

  test.each([
    { ssr: undefined, hydratedStatus: 'notFound', resolved: true },
    {
      ssr: 'data-only' as const,
      hydratedStatus: 'pending',
      resolved: false,
    },
  ])(
    'hydrates an ancestor notFound boundary with ssr=$ssr without loading an omitted descendant chunk',
    async ({ ssr, hydratedStatus, resolved }) => {
      const serverRootRoute = new BaseRootRoute({})
      const serverParentRoute = new BaseRoute({
        getParentRoute: () => serverRootRoute,
        path: '/parent',
        ssr,
        notFoundComponent: () => 'not found',
      })
      const serverNotFound = notFound({ routeId: serverParentRoute.id })
      const serverChildLoader = vi.fn(() => {
        throw serverNotFound
      })
      const serverChildRoute = new BaseRoute({
        getParentRoute: () => serverParentRoute,
        path: '/child',
        loader: serverChildLoader,
      })
      const serverRouter = createTestRouter({
        routeTree: serverRootRoute.addChildren([
          serverParentRoute.addChildren([serverChildRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: true,
      })

      const bootstrap = await dehydrateToBootstrap(serverRouter, testManifest)

      expect(serverChildLoader).toHaveBeenCalledTimes(1)
      expect(serverRouter.state.matches.map((match) => match.routeId)).toEqual([
        serverRootRoute.id,
        serverParentRoute.id,
        serverChildRoute.id,
      ])
      expect(serverRouter.state.matches[1]?.status).toBe('notFound')
      expect(isNotFound(serverRouter.state.matches[1]?.error)).toBe(true)
      const childChunkError = new Error('omitted child chunk unavailable')
      const childComponentPreload = vi.fn(() => Promise.reject(childChunkError))
      const ChildComponent = Object.assign(() => null, {
        preload: childComponentPreload,
      })

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        ssr,
        notFoundComponent: () => 'not found',
      })
      const childLoader = vi.fn(() => {
        throw new Error('client child loader should not run')
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
        component: ChildComponent,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: false,
      })
      mockWindow.$_TSR = bootstrap

      await expect(hydrate(router)).resolves.toBeUndefined()

      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
        childRoute.id,
      ])
      expect(router.state.matches[1]?.status).toBe(hydratedStatus)
      expect(isNotFound(router.state.matches[1]?.error)).toBe(true)
      expect(router.state.matches[2]?.status).toBe('pending')
      expect(router.state.location.pathname).toBe('/parent/child')
      expect(router.state.resolvedLocation?.pathname).toBe(
        resolved ? '/parent/child' : undefined,
      )
      expect(childComponentPreload).not.toHaveBeenCalled()
      expect(childLoader).not.toHaveBeenCalled()

      if (ssr === 'data-only') {
        await router.load()

        expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
        expect(router.state.matches[1]?.status).toBe('notFound')
        expect(isNotFound(router.state.matches[1]?.error)).toBe(true)
        expect(childComponentPreload).not.toHaveBeenCalled()
        expect(childLoader).not.toHaveBeenCalled()
      }
    },
  )
})
