import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('a child fallback revealed after a fresh ancestor loader keeps its own pendingMinMs', async () => {
  vi.useFakeTimers()

  const parentLoader = createControlledPromise<void>()
  const childLoader = createControlledPromise<void>()
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: () => parentLoader,
    component: () => <Outlet />,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div>Child pending</div>,
    loader: () => childLoader,
    component: () => <div>Child content</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
  })

  await router.load()
  render(<RouterProvider router={router} />)
  expect(screen.getByText('Index')).toBeInTheDocument()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/parent/child' })
    await vi.advanceTimersByTimeAsync(25)
  })

  expect(screen.queryByText('Child pending')).not.toBeInTheDocument()

  await act(async () => {
    parentLoader.resolve()
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByText('Child pending')).toBeInTheDocument()
  expect(screen.queryByText('Child content')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(25)
    childLoader.resolve()
    await Promise.resolve()
  })

  // The minimum is measured from the child's first visible frame, not from
  // the navigation start or the ancestor's completion.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(74)
  })
  expect(screen.getByText('Child pending')).toBeInTheDocument()
  expect(screen.queryByText('Child content')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
    await navigation
  })
  expect(screen.queryByText('Child pending')).not.toBeInTheDocument()
  expect(screen.getByText('Child content')).toBeInTheDocument()
})

test('advancing from a parent loader to a parallel child loader does not restart pendingMs', async () => {
  vi.useFakeTimers()

  const parentLoader = createControlledPromise<void>()
  const childLoader = createControlledPromise<void>()
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: () => parentLoader,
    component: Outlet,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    pendingMs: 1_000,
    pendingMinMs: 0,
    pendingComponent: () => <div>Child pending</div>,
    loader: () => childLoader,
    component: () => <div>Child content</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  render(<RouterProvider router={router} />)

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/parent/child' })
    await vi.advanceTimersByTimeAsync(900)
  })
  expect(screen.queryByText('Child pending')).not.toBeInTheDocument()

  await act(async () => {
    parentLoader.resolve()
    await vi.advanceTimersByTimeAsync(99)
  })
  expect(screen.queryByText('Child pending')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(screen.getByText('Child pending')).toBeInTheDocument()

  await act(async () => {
    childLoader.resolve()
    await navigation
  })
  expect(screen.getByText('Child content')).toBeInTheDocument()
})
