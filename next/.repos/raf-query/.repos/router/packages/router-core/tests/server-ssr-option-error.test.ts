import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

/**
 * A functional ssr() option is user route code in the server serial phase.
 * If it throws an ordinary error, the route must not be committed as a
 * successful 200 response with missing loader data. It follows the same
 * renderable route-error lifecycle as beforeLoad and loader failures.
 */
describe('server functional ssr() errors', () => {
  test.each(['sync', 'async'] as const)(
    'commits a %s failure with route context and returns 500',
    async (failureMode) => {
      const boom = new Error('feature flag lookup failed')
      const loader = vi.fn(() => 'reports data')
      const onError = vi.fn()
      const beforeLoad = vi.fn()

      const rootRoute = new BaseRootRoute({
        context: () => ({ rootContext: true }),
        beforeLoad: () => ({ rootBeforeLoadContext: true }),
      })
      const reportsRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/reports',
        context: ({ context }) => ({
          reportsContext: context.rootBeforeLoadContext,
        }),
        ssr: () => {
          if (failureMode === 'sync') {
            throw boom
          }
          return Promise.reject(boom)
        },
        beforeLoad,
        loader,
        onError,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([reportsRoute]),
        history: createMemoryHistory({ initialEntries: ['/reports'] }),
        isServer: true,
        context: { routerContext: true },
      })

      const response = await loadServerResponse(router, '/reports')

      const reportsMatch = router.state.matches.find(
        (match) => match.routeId === reportsRoute.id,
      )
      expect(loader).not.toHaveBeenCalled()
      expect(beforeLoad).not.toHaveBeenCalled()
      expect(response.status).toBe(500)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(boom)
      expect(reportsMatch).toMatchObject({
        status: 'error',
        error: boom,
        context: {
          routerContext: true,
          rootContext: true,
          rootBeforeLoadContext: true,
          reportsContext: true,
        },
      })
    },
  )

  test('retains inherited renderability and loads the lazy error boundary', async () => {
    const boom = new Error('SSR policy failed')
    const errorBoundaryPreload = vi.fn(() => Promise.resolve())
    const ErrorBoundary = Object.assign(() => null, {
      preload: errorBoundaryPreload,
    })
    const rootRoute = new BaseRootRoute({})
    const reportsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/reports',
      ssr: async () => {
        await Promise.resolve()
        throw boom
      },
    })
    const lazy = vi.fn(() =>
      Promise.resolve({
        options: {
          id: reportsRoute.id,
          errorComponent: ErrorBoundary,
        },
      }),
    )
    reportsRoute.lazy(lazy as any)
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([reportsRoute]),
      history: createMemoryHistory({ initialEntries: ['/reports'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/reports')

    expect(response.status).toBe(500)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: reportsRoute.id,
      status: 'error',
      error: boom,
      ssr: true,
    })
    expect(lazy).toHaveBeenCalledTimes(1)
    expect(errorBoundaryPreload).toHaveBeenCalledTimes(1)
  })

  test('does not run route context after an SSR policy redirect', async () => {
    const context = vi.fn(() => ({ reportsContext: true }))
    const loader = vi.fn(() => 'reports data')
    const rootRoute = new BaseRootRoute({})
    const reportsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/reports',
      ssr: () => {
        throw redirect({ to: '/target' })
      },
      context,
      loader,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([reportsRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/reports'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/reports')

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/target')
    expect(context).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()
  })

  test('preserves the SSR policy failure when route context also throws', async () => {
    const policyError = new Error('SSR policy failed')
    const contextError = new Error('route context failed')
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const reportsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/reports',
      ssr: () => {
        throw policyError
      },
      context: () => {
        throw contextError
      },
      onError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([reportsRoute]),
      history: createMemoryHistory({ initialEntries: ['/reports'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/reports')

    expect(response.status).toBe(500)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: reportsRoute.id,
      status: 'error',
      error: policyError,
    })
    expect(onError).toHaveBeenCalledWith(policyError)
    expect(onError).not.toHaveBeenCalledWith(contextError)
  })
})
