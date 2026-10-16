import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { ServerManifest } from '../src/manifest'

const testManifest: ServerManifest = { routes: {} }

// This terminal-prefix case is an internal hydration protocol invariant, not
// an issue #7635 reproduction. The user-visible same-route navigation
// regression is covered in react-router, where the rendered boundary and
// document title can be observed directly.
describe('hydrated terminal error prefix', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('adopts the terminal prefix without running omitted child work', async () => {
    const serverError = new Error('App beforeLoad failed')
    const serverBeforeLoad = vi.fn(() => {
      throw serverError
    })
    const serverChildLoader = vi.fn(() => ({ child: 'server data' }))
    const serverRootRoute = new BaseRootRoute({})
    const serverAppRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/app',
      beforeLoad: serverBeforeLoad,
      errorComponent: () => 'App error',
    })
    const serverChildRoute = new BaseRoute({
      getParentRoute: () => serverAppRoute,
      path: '/child',
      loader: serverChildLoader,
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverAppRoute.addChildren([serverChildRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/app/child'] }),
      isServer: true,
    })

    const bootstrap = await dehydrateToBootstrap(serverRouter, testManifest)

    expect(serverBeforeLoad).toHaveBeenCalledTimes(1)
    expect(serverChildLoader).not.toHaveBeenCalled()
    expect(serverRouter.state.matches.map((match) => match.routeId)).toEqual([
      serverRootRoute.id,
      serverAppRoute.id,
      serverChildRoute.id,
    ])
    expect(serverRouter.state.matches[1]).toMatchObject({
      routeId: serverAppRoute.id,
      status: 'error',
      error: serverError,
    })
    const transportedError = bootstrap.router?.matches.at(-1)?.e
    expect(transportedError).not.toBe(serverError)
    expect(transportedError).toMatchObject({
      name: serverError.name,
      message: serverError.message,
    })

    const appHead = vi.fn(({ match }: any) => ({
      meta: [{ title: match.error ? 'App error title' : 'App success title' }],
    }))
    const childHead = vi.fn(() => ({
      meta: [{ title: 'Child success title' }],
    }))
    const childLoader = vi.fn(() => ({ child: 'data' }))

    const rootRoute = new BaseRootRoute({})
    const appRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/app',
      head: appHead,
      errorComponent: () => 'App error',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => appRoute,
      path: '/child',
      loader: childLoader,
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([appRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/app/child'] }),
      isServer: false,
    })

    // Route matching confirms that the location has a child suffix which the
    // terminal server payload omits.
    const matches = router.matchRoutes(router.stores.location.get())
    expect(matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      appRoute.id,
      childRoute.id,
    ])
    mockWindow.$_TSR = bootstrap

    await hydrate(router)

    // Hydration reconstructs the full matched branch while adopting only the
    // terminal prefix represented by the payload.
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      appRoute.id,
      childRoute.id,
    ])
    expect(router.state.matches[2]?.status).toBe('pending')

    const committedApp = router.state.matches.find(
      (match) => match.routeId === appRoute.id,
    )
    expect(router.state.location.pathname).toBe('/app/child')
    expect(router.state.isLoading).toBe(false)
    expect(committedApp?.status).toBe('error')
    expect(committedApp?.error).toBe(transportedError)

    // No callback for the omitted suffix may run while adopting the prefix.
    expect(childLoader).not.toHaveBeenCalled()
    expect(childHead).not.toHaveBeenCalled()

    // Core projects the error match's metadata; document ownership is covered
    // by the framework-level test.
    expect(appHead).toHaveBeenCalledOnce()
    expect(appHead).toHaveBeenCalledWith(
      expect.objectContaining({
        match: expect.objectContaining({
          routeId: appRoute.id,
          status: 'error',
          error: transportedError,
        }),
      }),
    )
    expect(committedApp?.meta).toEqual([{ title: 'App error title' }])
  })
  it.each(['error', 'notFound'] as const)(
    'preserves hydrated %s lifecycle membership through invalidation',
    async (fallback) => {
      let failed = true
      const childEnter = vi.fn()
      const childStay = vi.fn()
      const childLeave = vi.fn()
      const setup = (isServer: boolean) => {
        const rootRoute = new BaseRootRoute({})
        const appRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/app',
          errorComponent: () => null,
          notFoundComponent: () => null,
          beforeLoad: () => {
            if (failed) {
              throw fallback === 'error' ? new Error('unavailable') : notFound()
            }
          },
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => appRoute,
          path: 'child',
          onEnter: childEnter,
          onStay: childStay,
          onLeave: childLeave,
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([
            appRoute.addChildren([childRoute]),
          ]),
          history: createMemoryHistory({ initialEntries: ['/app/child'] }),
          isServer,
        })
      }
      const server = setup(true)
      const client = setup(false)
      try {
        mockWindow.$_TSR = await dehydrateToBootstrap(server, testManifest)
        await hydrate(client)
        expect(client.state.matches).toHaveLength(3)
        await client.invalidate()
        expect(childEnter).not.toHaveBeenCalled()
        expect(childStay).not.toHaveBeenCalled()
        expect(childLeave).not.toHaveBeenCalled()
        failed = false
        await client.invalidate()
        expect(childEnter).toHaveBeenCalledOnce()
        expect(childStay).not.toHaveBeenCalled()
        expect(childLeave).not.toHaveBeenCalled()
      } finally {
        server.history.destroy()
        client.history.destroy()
      }
    },
  )
})
