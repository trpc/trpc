import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  cleanup()
})

test('a throwing load-event listener cannot interrupt route hooks or later navigations', async () => {
  const firstOnEnter = vi.fn()
  const secondOnEnter = vi.fn()
  const listenerError = new Error('onLoad listener failed')
  const laterOnLoad = vi.fn()
  const loadedPaths: Array<string> = []

  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index route</div>,
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    onEnter: firstOnEnter,
    component: () => <div>First route</div>,
  })
  const secondRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    onEnter: secondOnEnter,
    component: () => <div>Second route</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Index route')).toBeInTheDocument()

  const unsubscribe = router.subscribe('onLoad', (event) => {
    if (event.toLocation.pathname === '/first') {
      throw listenerError
    }
  })
  const unsubscribeLater = router.subscribe('onLoad', (event) => {
    if (event.toLocation.pathname !== '/') {
      loadedPaths.push(event.toLocation.pathname)
      laterOnLoad(event)
    }
  })
  testCleanups.push(unsubscribe, unsubscribeLater)

  await act(() => router.navigate({ to: '/first' }))

  expect(screen.getByText('First route')).toBeInTheDocument()
  expect(loadedPaths).toEqual(['/first'])

  unsubscribe()
  await act(() => router.navigate({ to: '/second' }))

  expect(screen.getByText('Second route')).toBeInTheDocument()
  expect(firstOnEnter).toHaveBeenCalledTimes(1)
  expect(secondOnEnter).toHaveBeenCalledTimes(1)
  expect(laterOnLoad).toHaveBeenCalledTimes(2)
  expect(loadedPaths).toEqual(['/first', '/second'])
})
