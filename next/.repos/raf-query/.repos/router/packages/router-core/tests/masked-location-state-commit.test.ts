import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('masked location remnants in history state', () => {
  test('a same-href navigation clears an expired mask from history state', async () => {
    const makeRoutes = () => {
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const realRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/real',
      })
      const prettyRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/pretty',
      })
      return rootRoute.addChildren([indexRoute, realRoute, prettyRoute])
    }
    const history = createMemoryHistory({ initialEntries: ['/'] })

    const router1 = createTestRouter({
      routeTree: makeRoutes(),
      history,
      unmaskOnReload: true,
    })
    await router1.load()
    await router1.navigate({ to: '/real', mask: { to: '/pretty' } })
    expect(history.location.state.__tempLocation).toBeDefined()

    // A fresh router over the same history models a page reload: the
    // per-session temp key no longer matches, so the mask has expired and the
    // literal URL resolves.
    const router2 = createTestRouter({
      routeTree: makeRoutes(),
      history,
      unmaskOnReload: true,
    })
    await router2.load()
    expect(router2.state.location.pathname).toBe('/pretty')

    // Navigating to the same href must still commit so the expired mask
    // payload is dropped from history state, matching pre-lane behavior.
    await router2.navigate({ to: '/pretty' })
    expect(history.location.state.__tempLocation).toBeUndefined()
  })
})
