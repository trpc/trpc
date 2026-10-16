import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * https://github.com/TanStack/router/issues/6351
 *
 * A fuzzy (unmatched-URL) 404 must be attributed to the nearest matched
 * ancestor that can actually render it: the deepest matched route with
 * children that defines a `notFoundComponent`. Attributing it to the
 * deepest matched route with children regardless of whether it has a
 * `notFoundComponent` skips pathless-layout/ancestor `notFoundComponent`s
 * and makes the framework fall back to `defaultNotFoundComponent`.
 *
 * When no matched route defines a `notFoundComponent`, the previous
 * behavior (deepest matched route with children) is preserved, and
 * `notFoundMode: 'root'` still attributes the 404 to the root route.
 * This Core suite asserts boundary ownership; rendered fallback output needs
 * framework-level coverage.
 */

function setup(opts: {
  layoutNotFoundComponent?: () => unknown
  agentsNotFoundComponent?: () => unknown
  agentsContext?: () => Record<string, never>
  agentsBeforeLoad?: () => Record<string, never>
  agentsLoader?: () => null
  notFoundMode?: 'fuzzy' | 'root'
  isServer?: boolean
}) {
  const rootRoute = new BaseRootRoute({})
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    id: '_authenticated',
    notFoundComponent: opts.layoutNotFoundComponent,
  })
  const agentsRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/agents',
    notFoundComponent: opts.agentsNotFoundComponent,
    context: opts.agentsContext,
    beforeLoad: opts.agentsBeforeLoad,
    loader: opts.agentsLoader,
  })
  const skillAgentRoute = new BaseRoute({
    getParentRoute: () => agentsRoute,
    path: '/skill-agent',
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      layoutRoute.addChildren([agentsRoute.addChildren([skillAgentRoute])]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/agents/skill-agen'] }),
    notFoundMode: opts.notFoundMode,
    isServer: opts.isServer,
  })

  return { router, rootRoute, layoutRoute, agentsRoute }
}

function _notFoundRouteIds(router: {
  state: { matches: Array<{ routeId: string; _notFound?: boolean }> }
}) {
  return router.state.matches
    .filter((match) => match._notFound)
    .map((match) => match.routeId)
}

describe('issue #6351: fuzzy notFound honors pathless layout boundaries', () => {
  test('lands on the pathless layout when the deeper route has no boundary', async () => {
    const { router, rootRoute, layoutRoute, agentsRoute } = setup({
      layoutNotFoundComponent: () => 'layout not found',
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/agents/skill-agen')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      layoutRoute.id,
      agentsRoute.id,
    ])
    expect(_notFoundRouteIds(router)).toEqual([layoutRoute.id])
  })

  test('boundary-enabled control: prefers the deeper matched route', async () => {
    const { router, agentsRoute } = setup({
      layoutNotFoundComponent: () => 'layout not found',
      agentsNotFoundComponent: () => 'agents not found',
    })

    await router.load()

    expect(_notFoundRouteIds(router)).toEqual([agentsRoute.id])
  })

  test.each(['client', 'server'] as const)(
    'fuzzy ancestor 404 skips hidden descendant lifecycle callbacks on the %s',
    async (environment) => {
      const context = vi.fn(() => ({}))
      const beforeLoad = vi.fn(() => ({}))
      const loader = vi.fn(() => null)
      const { router } = setup({
        layoutNotFoundComponent: () => 'layout not found',
        agentsContext: context,
        agentsBeforeLoad: beforeLoad,
        agentsLoader: loader,
        notFoundMode: 'fuzzy',
        isServer: environment === 'server',
      })

      await router.load()

      expect(context).not.toHaveBeenCalled()
      expect(beforeLoad).not.toHaveBeenCalled()
      expect(loader).not.toHaveBeenCalled()
    },
  )
})

describe('generic global notFound attribution controls', () => {
  test('fuzzy mode falls back to the deepest matched route with children when no boundary exists', async () => {
    const { router, agentsRoute } = setup({})

    await router.load()

    expect(_notFoundRouteIds(router)).toEqual([agentsRoute.id])
  })

  test('root mode attributes the notFound to root even when a layout boundary exists', async () => {
    const { router, rootRoute } = setup({
      layoutNotFoundComponent: () => 'layout not found',
      notFoundMode: 'root',
    })

    await router.load()

    expect(_notFoundRouteIds(router)).toEqual([rootRoute.id])
  })
})
