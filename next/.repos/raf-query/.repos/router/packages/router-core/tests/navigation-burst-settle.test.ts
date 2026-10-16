import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A superseded navigation resolves only once the router has settled on a
 * transaction nobody replaced. A burst of same-tick navigations used to make
 * every superseded waiter re-poll `router._tx` on each successor's
 * completion, which was quadratic in microtask work and kept every
 * superseded transaction alive until the router went idle. The waiters now
 * share one memoized settle chain per transaction; this pins the observable
 * contract that the chain preserves.
 */
describe('same-tick navigation burst', () => {
  test('every superseded navigate() resolves after the router settles on the last one', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const itemRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$id',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, itemRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const unsubscribe = router.history.subscribe(router.load)

    try {
      // Location and status observed by each navigation when it resolved.
      const observed: Array<[pathname: string, status: string]> = []
      const burst = Array.from({ length: 25 }, (_, index) =>
        router
          .navigate({ to: '/items/$id', params: { id: String(index) } })
          .then(() => {
            observed.push([router.state.location.pathname, router.state.status])
          }),
      )

      await Promise.all(burst)

      expect(router.state.location.pathname).toBe('/items/24')
      expect(router.state.status).toBe('idle')
      // No navigation resolves before the router settled on the winner.
      expect(observed).toHaveLength(25)
      expect(new Set(observed.map(([pathname]) => pathname))).toEqual(
        new Set(['/items/24']),
      )
      expect(new Set(observed.map(([, status]) => status))).toEqual(
        new Set(['idle']),
      )
      expect(router.state.matches.map((m) => m.status)).toEqual([
        'success',
        'success',
      ])
    } finally {
      unsubscribe()
    }
  })
})
