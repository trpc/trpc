import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, PathParamError } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue #4444: when a route's params.parse throws and one of its children is
 * lazily loaded, the router used to stay "pending" forever: the lazy child's
 * chunk was never requested, its match never settled, and framework
 * transitioners could never reach idle.
 *
 * Desired behavior: the param parse error is a serial failure — the failing
 * route commits status 'error' for its error boundary, descendants below the
 * boundary are trimmed out of the lane with their load promises settled, and
 * router.load() resolves with no match left pending.
 */
describe('issue #4444: param parse error on a route with a lazy child', () => {
  test('load settles, commits the error boundary, and leaves no match stuck pending', async () => {
    const rootRoute = new BaseRootRoute({})
    const langRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/lang/$lang',
      params: {
        parse: ({ lang }: { lang: string }) => {
          if (lang !== 'en') {
            throw new Error(`Unsupported language: ${lang}`)
          }
          return { lang }
        },
        stringify: ({ lang }: { lang: string }) => ({ lang }),
      },
      errorComponent: () => null,
    })
    const lazyChildRoute = new BaseRoute({
      getParentRoute: () => langRoute,
      path: '/lazy',
    })
    const lazyFn = vi.fn(() =>
      Promise.resolve({
        options: {
          id: lazyChildRoute.id,
          component: () => null,
        },
      }),
    )
    lazyChildRoute.lazy(lazyFn)

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        langRoute.addChildren([lazyChildRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/lang/es/lazy'] }),
    })

    // The reported bug: this load never reached a settled render state.
    await router.load()
    expect(router.state.status).toBe('idle')

    // The failing route commits the parse error for its error boundary…
    const langMatch = router.state.matches.find(
      (match) => match.routeId === langRoute.id,
    )
    expect(langMatch?.status).toBe('error')
    expect(langMatch?.error).toBeInstanceOf(PathParamError)

    // …while the structurally matched lazy child remains unresolved and hidden
    // below that boundary without starting its chunk.
    expect(
      router.state.matches.find((match) => match.routeId === lazyChildRoute.id),
    ).toMatchObject({ status: 'pending', isFetching: false })
    expect(lazyFn).not.toHaveBeenCalled()
    expect(router.state.isLoading).toBe(false)
  })
})
