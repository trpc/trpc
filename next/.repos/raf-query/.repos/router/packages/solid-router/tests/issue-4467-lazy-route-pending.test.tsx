import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('a lazy pending component does not restart an acknowledged minimum', async () => {
  const loader = createControlledPromise<void>()
  const lazyPageOptions = createLazyRoute('/page')({
    pendingComponent: () => <p role="status">Loading lazy page</p>,
    component: () => <h1>Page</h1>,
  })
  const lazyOptions = createControlledPromise<typeof lazyPageOptions>()
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Index page</h1>,
  })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    loader: () => loader,
  }).lazy(() => lazyOptions)
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 100,
    defaultPendingComponent: () => <p role="status">Loading default</p>,
  })

  render(() => <RouterProvider router={router} />)
  expect(
    await screen.findByRole('heading', { name: 'Index page' }),
  ).toBeInTheDocument()
  vi.useFakeTimers()
  vi.setSystemTime(0)

  const navigation = router.navigate({ to: '/page' })
  let settled = false
  void navigation.then(() => {
    settled = true
  })
  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByRole('status')).toHaveTextContent('Loading default')

    await vi.advanceTimersByTimeAsync(25)
    lazyOptions.resolve(lazyPageOptions)
    loader.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByRole('status')).toHaveTextContent('Loading lazy page')

    await vi.advanceTimersByTimeAsync(74)
    expect(screen.getByRole('status')).toHaveTextContent('Loading lazy page')

    await vi.advanceTimersByTimeAsync(5)
    await Promise.resolve()
    expect(settled).toBe(true)
    await navigation
    expect(screen.getByRole('heading', { name: 'Page' })).toBeInTheDocument()
    expect(Date.now()).toBeLessThan(125)
  } finally {
    lazyOptions.resolve(lazyPageOptions)
    loader.resolve()
    await vi.advanceTimersByTimeAsync(1_000)
    await navigation
  }
})
