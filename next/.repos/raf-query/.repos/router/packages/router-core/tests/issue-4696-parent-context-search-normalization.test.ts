import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

// Existing-behavior coverage for https://github.com/TanStack/router/issues/4696
test('#4696 existing behavior: normalized child search keeps reused parent context', async () => {
  const rootLoader = vi.fn(
    ({ context }: { context: Record<string, unknown> }) => context,
  )
  const dashboardBeforeLoad = vi.fn(
    ({ context }: { context: Record<string, unknown> }) => {
      if (!context.isAuthenticated) {
        throw new Error('Authentication context was lost')
      }
    },
  )
  const rootRoute = new BaseRootRoute({
    beforeLoad: async () => {
      await Promise.resolve()
      return {
        initialData: {
          user: { email: 'mr.user@gmail.com', role: 'user' },
        },
        initializationError: undefined,
        isAuthenticated: true,
        isAdmin: false,
      }
    },
    loader: rootLoader,
  })
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const dashboardRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    validateSearch: () => ({ page: 0 }),
    beforeLoad: dashboardBeforeLoad,
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, dashboardRoute]),
    history,
  })

  await router.load()
  expect(rootLoader).toHaveBeenCalledTimes(1)
  expect(rootLoader.mock.calls[0]?.[0].context).toMatchObject({
    isAuthenticated: true,
  })
  expect(router.state.location.pathname).toBe('/')
  router.update({
    history: createMemoryHistory({
      initialEntries: ['/dashboard?page=0'],
    }),
  })
  await router.load()
  expect(router.state.location.pathname).toBe('/dashboard')
  expect(rootLoader).toHaveBeenCalledTimes(1)
  expect(dashboardBeforeLoad).toHaveBeenCalledTimes(1)
  expect(dashboardBeforeLoad).toHaveBeenLastCalledWith(
    expect.objectContaining({
      context: expect.objectContaining({ isAuthenticated: true }),
    }),
  )
  expect(
    router.state.matches.find((match) => match.routeId === rootRoute.id)
      ?.loaderData,
  ).toMatchObject({ isAuthenticated: true })

  dashboardBeforeLoad.mockClear()
  router.update({
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  })
  await router.load()

  expect(dashboardBeforeLoad).toHaveBeenCalledTimes(1)
  expect(dashboardBeforeLoad).toHaveBeenLastCalledWith(
    expect.objectContaining({
      context: expect.objectContaining({ isAuthenticated: true }),
    }),
  )
  expect(rootLoader).toHaveBeenCalledTimes(1)
  expect(router.state.location.pathname).toBe('/dashboard')
  const rootMatch = router.state.matches.find(
    (match) => match.routeId === rootRoute.id,
  )
  const dashboardMatch = router.state.matches.find(
    (match) => match.routeId === dashboardRoute.id,
  )
  expect(rootMatch?.loaderData).toMatchObject({
    isAuthenticated: true,
    isAdmin: false,
  })
  expect(dashboardMatch).toMatchObject({
    status: 'success',
    search: { page: 0 },
    searchError: undefined,
  })
})
