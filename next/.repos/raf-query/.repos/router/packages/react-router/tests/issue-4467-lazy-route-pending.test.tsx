import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'

import {
  Outlet,
  RouterProvider,
  createControlledPromise,
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

// https://github.com/TanStack/router/issues/4467
test('default pending component renders while lazy route options load', async () => {
  const rootRoute = createRootRoute({
    component: Outlet,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Index page</h1>,
  })
  const lazyPageOptions = createLazyRoute('/page')({
    component: () => <h1>Page</h1>,
  })
  const lazyOptions = createControlledPromise<typeof lazyPageOptions>()
  const loadLazyOptions = vi.fn(() => lazyOptions)
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
  }).lazy(loadLazyOptions)
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: () => <p role="status">Loading page</p>,
  })
  let navigationPromise: Promise<void> | undefined

  onTestFinished(async () => {
    await act(async () => {
      if (lazyOptions.status === 'pending') {
        lazyOptions.resolve(lazyPageOptions)
      }
      await navigationPromise
    })
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByRole('heading', { name: 'Index page' }),
  ).toBeInTheDocument()

  act(() => {
    navigationPromise = router.navigate({ to: '/page' })
  })

  expect(await screen.findByRole('status')).toHaveTextContent('Loading page')
  expect(
    screen.queryByRole('heading', { name: 'Page' }),
  ).not.toBeInTheDocument()
  expect(lazyOptions.status).toBe('pending')
  expect(loadLazyOptions).toHaveBeenCalledTimes(1)

  await act(async () => {
    lazyOptions.resolve(lazyPageOptions)
    await navigationPromise
  })

  expect(screen.getByRole('heading', { name: 'Page' })).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(loadLazyOptions).toHaveBeenCalledTimes(1)
})

test('a lazy pending component is offered while the eager loader is still pending', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Index page</h1>,
  })
  const loader = createControlledPromise<void>()
  const lazyPageOptions = createLazyRoute('/page')({
    pendingComponent: () => <p role="status">Loading lazy page</p>,
    component: () => <h1>Page</h1>,
  })
  const lazyOptions = createControlledPromise<typeof lazyPageOptions>()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    loader: () => loader,
  }).lazy(() => lazyOptions)
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: () => <p role="status">Loading default</p>,
  })
  let navigation: Promise<void> | undefined

  onTestFinished(async () => {
    await act(async () => {
      lazyOptions.resolve(lazyPageOptions)
      loader.resolve()
      await navigation
    })
  })

  render(<RouterProvider router={router} />)
  expect(
    await screen.findByRole('heading', { name: 'Index page' }),
  ).toBeInTheDocument()

  act(() => {
    navigation = router.navigate({ to: '/page' })
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Loading default')

  await act(async () => {
    lazyOptions.resolve(lazyPageOptions)
  })

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Loading lazy page',
  )
  expect(
    screen.queryByRole('heading', { name: 'Page' }),
  ).not.toBeInTheDocument()

  await act(async () => {
    loader.resolve()
    await navigation
  })

  expect(screen.getByRole('heading', { name: 'Page' })).toBeInTheDocument()
})

test('a lazy pending component does not restart an acknowledged minimum', async () => {
  const loader = createControlledPromise<void>()
  const lazyPageOptions = createLazyRoute('/page')({
    pendingComponent: () => <p role="status">Loading lazy page</p>,
    component: () => <h1>Page</h1>,
  })
  const lazyOptions = createControlledPromise<typeof lazyPageOptions>()
  const rootRoute = createRootRoute({ component: Outlet })
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

  render(<RouterProvider router={router} />)
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Loading default')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25)
      lazyOptions.resolve(lazyPageOptions)
      loader.resolve()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Loading lazy page')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(74)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Loading lazy page')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5)
      await Promise.resolve()
    })
    expect(settled).toBe(true)
    await navigation
    expect(screen.getByRole('heading', { name: 'Page' })).toBeInTheDocument()
    expect(Date.now()).toBeLessThan(125)
  } finally {
    lazyOptions.resolve(lazyPageOptions)
    loader.resolve()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
      await navigation
    })
  }
})
