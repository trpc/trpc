import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

// Existing Core projection coverage related to:
// https://github.com/TanStack/router/issues/4684
//
// When beforeLoad throws, head() must still execute for the retained lane —
// the root head owns global stylesheets/title that the errorComponent page
// depends on, and the failing route's own head can provide error-specific
// head content. Rendering those projections through HeadContent is a framework
// concern; this suite asserts the Core-owned match projections.
describe('#4684 existing Core behavior: head executes when beforeLoad throws', () => {
  const setup = (isServer: boolean) => {
    const beforeLoadError = new Error('beforeLoad failed')
    const rootHead = () => ({
      meta: [{ title: 'Root title' }],
      links: [{ rel: 'stylesheet', href: '/global.css' }],
    })
    const rootRoute = new BaseRootRoute({ head: rootHead })
    const failingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/fail',
      beforeLoad: () => {
        throw beforeLoadError
      },
      head: ({ match }) => ({
        meta: [{ title: match.error ? 'Error title' : 'Success title' }],
      }),
      errorComponent: () => 'error',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([failingRoute]),
      history: createMemoryHistory({ initialEntries: ['/fail'] }),
      isServer,
    })

    return { router, rootRoute, failingRoute, beforeLoadError }
  }

  test('server load projects root and failing-route heads for the error lane', async () => {
    const { router, rootRoute, failingRoute, beforeLoadError } = setup(true)

    const response = await loadServerResponse(router, '/fail')

    expect(response.status).toBe(500)

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRoute.id,
    )
    const failingMatch = router.state.matches.find(
      (match) => match.routeId === failingRoute.id,
    )
    expect(rootMatch?.meta).toEqual([{ title: 'Root title' }])
    expect(rootMatch?.links).toEqual([
      { rel: 'stylesheet', href: '/global.css' },
    ])
    expect(failingMatch?.status).toBe('error')
    expect(failingMatch?.error).toBe(beforeLoadError)
    expect(failingMatch?.meta).toEqual([{ title: 'Error title' }])
  })

  test('client load projects root and failing-route heads for the error lane', async () => {
    const { router, rootRoute, failingRoute, beforeLoadError } = setup(false)

    await router.load()

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRoute.id,
    )
    const failingMatch = router.state.matches.find(
      (match) => match.routeId === failingRoute.id,
    )
    expect(rootMatch?.meta).toEqual([{ title: 'Root title' }])
    expect(rootMatch?.links).toEqual([
      { rel: 'stylesheet', href: '/global.css' },
    ])
    expect(failingMatch?.status).toBe('error')
    expect(failingMatch?.error).toBe(beforeLoadError)
    expect(failingMatch?.meta).toEqual([{ title: 'Error title' }])
  })
})
