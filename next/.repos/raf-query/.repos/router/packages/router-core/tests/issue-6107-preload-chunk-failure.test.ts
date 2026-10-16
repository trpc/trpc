import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue #6107: going offline and hovering a link (preload intent) made the
 * failed dynamic import surface as an unhandled rejection in the console, and
 * the error never reached the route's error component.
 *
 * Desired behavior:
 * - a preload whose lazy chunk rejects resolves non-fatally, and
 * - the failed chunk is evicted, so the subsequent real navigation retries
 *   the import and commits the chunk error onto the match (status 'error'),
 *   which is what framework error components render.
 */
describe('issue #6107: failed dynamic import of a lazy route chunk', () => {
  test('preloadRoute failure is non-fatal and navigation retries and commits the chunk error', async () => {
    const chunkError = new TypeError(
      'Failed to fetch dynamically imported module: /assets/posts.lazy-abc123.js',
    )
    const lazyRoute = vi.fn(() => Promise.reject(chunkError))
    const rootRoute = new BaseRootRoute({})
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
    }).lazy(lazyRoute)

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    await router.preloadRoute({ to: '/posts' })
    expect(lazyRoute).toHaveBeenCalled()
    const lazyCallsAfterPreload = lazyRoute.mock.calls.length

    await router.navigate({ to: '/posts' })
    const postsMatch = router.state.matches.find(
      (match) => match.routeId === postsRoute.id,
    )
    expect(lazyRoute.mock.calls.length).toBeGreaterThan(lazyCallsAfterPreload)
    expect(postsMatch?.status).toBe('error')
    expect(postsMatch?.error).toBe(chunkError)
  })
})
