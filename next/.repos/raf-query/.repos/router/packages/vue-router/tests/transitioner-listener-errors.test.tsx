import { cleanup, render, screen } from '@testing-library/vue'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('a throwing load-event listener cannot interrupt later listeners, route hooks, or navigations', async () => {
  const firstOnEnter = vi.fn()
  const secondOnEnter = vi.fn()
  const listenerError = new Error('onLoad listener failed')
  const throwingOnLoad = vi.fn()
  const laterOnLoad = vi.fn()

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
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
  expect(await screen.findByText('Index route')).toBeTruthy()

  const unsubscribeThrowing = router.subscribe('onLoad', (event) => {
    throwingOnLoad(event.toLocation.pathname)
    if (event.toLocation.pathname === '/first') {
      throw listenerError
    }
  })
  const unsubscribeLater = router.subscribe('onLoad', (event) => {
    laterOnLoad(event.toLocation.pathname)
  })
  onTestFinished(() => {
    unsubscribeThrowing()
    unsubscribeLater()
  })

  await router.navigate({ to: '/first' })
  expect(await screen.findByText('First route')).toBeTruthy()
  expect(firstOnEnter).toHaveBeenCalledTimes(1)
  expect(throwingOnLoad.mock.calls).toEqual([['/first']])
  expect(laterOnLoad.mock.calls).toEqual([['/first']])

  await router.navigate({ to: '/second' })
  expect(await screen.findByText('Second route')).toBeTruthy()
  expect(firstOnEnter).toHaveBeenCalledTimes(1)
  expect(secondOnEnter).toHaveBeenCalledTimes(1)
  expect(throwingOnLoad.mock.calls).toEqual([['/first'], ['/second']])
  expect(laterOnLoad.mock.calls).toEqual([['/first'], ['/second']])
})
