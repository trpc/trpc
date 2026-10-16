import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

const path = '/parent/child?name=Alice&__proto__=%7B%22isAdmin%22%3Atrue%7D'

function createRouteTree() {
  const rootRoute = new BaseRootRoute()
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: ({ search }): Record<string, unknown> => search,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: ({ context }) => ({
      name: context.name,
      access: context.isAdmin ? 'admin' : 'visitor',
    }),
  })

  return {
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    childRoute,
  }
}

test('search-derived ancestor context does not grant inherited properties to a client loader', async () => {
  const { routeTree, childRoute } = createRouteTree()
  const router = createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: false,
  })

  await router.load()

  expect(
    router.state.matches.find((match) => match.routeId === childRoute.id)
      ?.loaderData,
  ).toEqual({ name: 'Alice', access: 'visitor' })
})

test('search-derived ancestor context does not grant inherited properties to an SSR loader', async () => {
  const { routeTree, childRoute } = createRouteTree()
  const router = createTestRouter({ routeTree, isServer: true })

  const response = await loadServerResponse(router, path)

  expect(response.status).toBe(200)
  expect(
    router.state.matches.find((match) => match.routeId === childRoute.id)
      ?.loaderData,
  ).toEqual({ name: 'Alice', access: 'visitor' })
})
