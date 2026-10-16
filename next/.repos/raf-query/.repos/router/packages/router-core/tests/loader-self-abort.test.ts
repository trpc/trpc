import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test.each([false, true])(
  'a loader can fulfill after aborting its controller with isServer=%s',
  async (isServer) => {
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: ({ abortController }) => {
        abortController.abort()
        return 'accepted data'
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer,
    })

    if (isServer) {
      expect((await loadServerResponse(router, '/page')).status).toBe(200)
    } else {
      await router.load()
    }

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      loaderData: 'accepted data',
    })
  },
)

test.each([false, true])(
  'a loader rejection remains an error after aborting its controller with isServer=%s',
  async (isServer) => {
    const failure = new Error('loader failed after aborting its controller')
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: ({ abortController }) => {
        abortController.abort()
        throw failure
      },
      errorComponent: () => null,
      onError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer,
    })

    if (isServer) {
      expect((await loadServerResponse(router, '/page')).status).toBe(500)
    } else {
      await router.load()
    }

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'error',
      error: failure,
    })
    expect(onError).toHaveBeenCalledWith(failure)
  },
)
