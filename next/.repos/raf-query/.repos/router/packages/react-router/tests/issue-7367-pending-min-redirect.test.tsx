import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createControlledPromise } from '@tanstack/router-core'
import { afterEach, expect, test, vi } from 'vitest'

import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'
import { sleep } from './utils'

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  vi.useRealTimers()
})

// https://github.com/TanStack/router/issues/7367
// Root route shows a spinner immediately (pendingMs: 0) while beforeLoad
// decides where to send the user, keeps it up for pendingMinMs, and then
// redirects. This used to crash in MatchInnerImpl (white screen) because the
// redirected match was rendered/thrown after its loadPromise was cleared.
test('immediate pending spinner (pendingMs: 0 + pendingMinMs) with root beforeLoad redirect renders the target without render errors', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  let hasRedirected = false

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="pending">loading</div>,
    errorComponent: ({ error }) => (
      <pre data-testid="root-error">{String(error)}</pre>
    ),
    beforeLoad: async () => {
      await sleep(50)
      if (!hasRedirected) {
        hasRedirected = true
        throw redirect({ to: '/welcome', replace: true })
      }
    },
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="index-page">Index</div>,
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

  render(<RouterProvider router={router} />)

  // pendingMs: 0 — the spinner must show right away.
  expect(await screen.findByTestId('pending')).toBeInTheDocument()

  // The redirect must complete: the target renders, no error boundary output
  // and no render crash.
  expect(
    await screen.findByTestId('welcome-page', undefined, { timeout: 5_000 }),
  ).toBeInTheDocument()
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('root-error')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/welcome')
  expect(consoleError).not.toHaveBeenCalled()
})

test('a compatible SPA redirect preserves the acknowledged pending minimum', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const redirectReady = createControlledPromise<void>()
  let shouldRedirect = true

  const rootRoute = createRootRoute({
    component: Outlet,
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByTestId('pending')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25)
      redirectReady.resolve()
      await vi.advanceTimersByTimeAsync(74)
    })
    expect(screen.getByTestId('pending')).toBeInTheDocument()
    expect(screen.queryByTestId('welcome-page')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5)
    })
    expect(screen.getByTestId('welcome-page')).toBeInTheDocument()
  } finally {
    redirectReady.resolve()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    vi.useRealTimers()
  }
})

test('an incompatible SPA redirect does not inherit the pending minimum', async () => {
  const redirectReady = createControlledPromise<void>()
  const rootRoute = createRootRoute({ component: Outlet })
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByTestId('pending')).toBeVisible()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25)
      redirectReady.resolve()
      await vi.advanceTimersByTimeAsync(5)
      await navigation
    })

    expect(Date.now()).toBeLessThan(100)
    expect(screen.getByTestId('welcome-page')).toBeVisible()
    expect(screen.queryByTestId('index-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  } finally {
    redirectReady.resolve()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
      await navigation
    })
  }
})
