import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A history blocker can discard a navigation commit AFTER
 * buildAndCommitLocation set router._pendingLocation (it is cleared a
 * microtask later). A continuation of the still-current in-flight load that
 * resumes inside that window must not treat the merely-built location as
 * ownership loss: a blocked commit never starts a replacement load, so
 * abandoning the pass would leave the router with status 'pending',
 * isLoading true, and a populated pending pool forever.
 */

describe('blocked navigation does not cancel the current load', () => {
  test('loader continuation resuming while a blocked navigation is built still commits', async () => {
    const loaderGate = createControlledPromise<string>()

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const slowRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/slow',
      loader: () => loaderGate,
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, slowRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    // Framework transitioners turn committed history changes into router
    // loads. A blocked commit never reaches this subscriber.
    const unsubscribe = router.history.subscribe(router.load)
    let unblock: (() => void) | undefined

    try {
      const navigation = router.navigate({ to: '/slow' })

      // Discard every later navigation commit. The blocker is async, so the
      // discarded commit still sets _pendingLocation for one microtask.
      unblock = router.history.block({ blockerFn: async () => true })

      // Same tick: settle the loader, then issue a navigation the blocker
      // discards. The loader continuation resumes inside the window where
      // _pendingLocation still points at /other.
      loaderGate.resolve('slow data')
      const blockedNavigation = router.navigate({ to: '/other' })

      await Promise.all([navigation, blockedNavigation])

      expect(router.state.location.pathname).toBe('/slow')
      expect(router.history.location.pathname).toBe('/slow')
      expect(
        router.state.matches.find((m) => m.routeId === slowRoute.id),
      ).toMatchObject({
        status: 'success',
        loaderData: 'slow data',
      })
    } finally {
      unblock?.()
      unsubscribe()
    }
  })
})
