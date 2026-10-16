import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * When the serial beforeLoad phase records a failure, retained ancestor
 * prefix loaders belong to the foreground failure lane: a stale ancestor
 * must reload in the foreground commit rather than being deferred into a
 * background batch that the boundary trim would discard.
 */

describe('serial failure keeps ancestor reloads in the foreground lane', () => {
  test('a stale ancestor reloads with fresh data when a child beforeLoad fails', async () => {
    let parentRuns = 0
    let shouldFail = false

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      staleTime: 0,
      loader: () => `parent run ${++parentRuns}`,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      errorComponent: {},
      beforeLoad: () => {
        if (shouldFail) {
          throw new Error('child beforeLoad failed')
        }
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()
    expect(parentRuns).toBe(1)

    await router.navigate({ to: '/' })
    shouldFail = true
    await router.navigate({ to: '/parent/child' })

    const parentMatch = router.state.matches.find(
      (match) => match.routeId === parentRoute.id,
    )
    const childMatch = router.state.matches.find(
      (match) => match.routeId === childRoute.id,
    )

    // The child committed its serial failure...
    expect(childMatch?.status).toBe('error')
    // ...and the stale parent reloaded in the SAME foreground lane: fresh
    // loaderData is committed with the failure, not deferred to a discarded
    // background batch.
    expect(parentRuns).toBe(2)
    expect(parentMatch?.loaderData).toBe('parent run 2')
    expect(parentMatch?.status).toBe('success')
  })
})
