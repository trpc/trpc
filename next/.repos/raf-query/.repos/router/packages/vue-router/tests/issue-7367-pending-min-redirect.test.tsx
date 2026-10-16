import { cleanup, render, screen } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  vi.useRealTimers()
})

test('a compatible SPA redirect preserves the acknowledged pending minimum', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const redirectReady = createControlledPromise<void>()
  let shouldRedirect = true

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="pending">loading</div>,
    beforeLoad: async () => {
      if (shouldRedirect) {
        shouldRedirect = false
        await redirectReady
        throw redirect({ to: '/welcome', replace: true })
      }
    },
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const welcomeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/welcome',
    component: () => <div data-testid="welcome-page">Welcome</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, welcomeRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  try {
    render(<RouterProvider router={router} />)
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
    expect(screen.getByTestId('pending')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(25)
    redirectReady.resolve()
    await vi.advanceTimersByTimeAsync(74)
    await nextTick()
    expect(screen.getByTestId('pending')).toBeInTheDocument()
    expect(screen.queryByTestId('welcome-page')).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(5)
    await nextTick()
    expect(screen.getByTestId('welcome-page')).toBeInTheDocument()
  } finally {
    redirectReady.resolve()
    await vi.advanceTimersByTimeAsync(1_000)
    await nextTick()
  }
})

test('an incompatible SPA redirect does not inherit the pending minimum', async () => {
  const redirectReady = createControlledPromise<void>()
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="index-page">Index</div>,
  })
  const sourceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/source',
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="pending">loading</div>,
    beforeLoad: async () => {
      await redirectReady
      throw redirect({ to: '/welcome', replace: true })
    },
  })
  const welcomeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/welcome',
    component: () => <div data-testid="welcome-page">Welcome</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, sourceRoute, welcomeRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('index-page')).toBeVisible()
  vi.useFakeTimers()
  vi.setSystemTime(0)

  const navigation = router.navigate({ to: '/source' })
  try {
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
    expect(screen.getByTestId('pending')).toBeVisible()

    await vi.advanceTimersByTimeAsync(25)
    redirectReady.resolve()
    await vi.advanceTimersByTimeAsync(5)
    await navigation
    await nextTick()

    expect(Date.now()).toBeLessThan(100)
    expect(screen.getByTestId('welcome-page')).toBeVisible()
    expect(screen.queryByTestId('index-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  } finally {
    redirectReady.resolve()
    await vi.advanceTimersByTimeAsync(1_000)
    await navigation
  }
})
