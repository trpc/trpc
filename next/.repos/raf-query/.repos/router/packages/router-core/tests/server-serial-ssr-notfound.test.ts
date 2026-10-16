import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

/**
 * A notFound thrown from a route's ssr() option happens during the serial
 * phase, before beforeLoad has run for that route and its descendants. It
 * must cap the loader prefix like a beforeLoad notFound: the throwing route
 * and its descendants must not run their loaders (their context is
 * incomplete and their ssr status unresolved), and the response must be a
 * 404 — a descendant loader failure must not be able to turn the outcome
 * into a 200/500.
 */

function setupRouter() {
  const loaderCalls: Array<string> = []

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    notFoundComponent: () => null,
    ssr: () => {
      throw notFound()
    },
    loader: () => {
      loaderCalls.push('parent')
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: () => {
      loaderCalls.push('child')
      throw new Error('child loader failed')
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    isServer: true,
  })

  return { router, rootRoute, parentRoute, childRoute, loaderCalls }
}

describe('server serial ssr() notFound', () => {
  test('caps the loader prefix at the boundary and sets 404', async () => {
    const { router, rootRoute, parentRoute, childRoute, loaderCalls } =
      setupRouter()

    const response = await loadServerResponse(router, '/parent/child')

    const parentMatch = router.state.matches.find(
      (item) => item.routeId === parentRoute.id,
    )
    expect(loaderCalls).toEqual([])
    expect(response.status).toBe(404)
    expect(parentMatch?.status).toBe('notFound')
    expect(parentMatch?.error).toEqual(
      expect.objectContaining({ isNotFound: true }),
    )
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
      childRoute.id,
    ])
    expect(router.state.matches[1]?.status).toBe('notFound')
  })
})
