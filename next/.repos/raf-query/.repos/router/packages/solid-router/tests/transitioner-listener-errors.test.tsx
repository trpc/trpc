import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, onTestFinished, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('a throwing load-event listener cannot interrupt route hooks or later navigations', async () => {
  const lifecycle: Array<string> = []
  const listenerError = new Error('onLoad listener failed')

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index route</div>,
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    onEnter: () => lifecycle.push('enter:/first'),
    component: () => <div>First route</div>,
  })
  const secondRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    onEnter: () => lifecycle.push('enter:/second'),
    component: () => <div>Second route</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Index route')).toBeInTheDocument()

  const unsubscribers = [
    router.subscribe('onLoad', (event) => {
      if (event.toLocation.pathname === '/first') {
        lifecycle.push('throw:/first')
        throw listenerError
      }
    }),
    router.subscribe('onLoad', (event) => {
      if (event.toLocation.pathname !== '/') {
        lifecycle.push(`load:${event.toLocation.pathname}`)
      }
    }),
  ]
  onTestFinished(() => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe()
    }
  })

  await router.navigate({ to: '/first' })
  expect(await screen.findByText('First route')).toBeInTheDocument()
  expect(screen.queryByText('Index route')).not.toBeInTheDocument()
  expect(lifecycle).toEqual(['enter:/first', 'throw:/first', 'load:/first'])

  await router.navigate({ to: '/second' })
  expect(await screen.findByText('Second route')).toBeInTheDocument()
  expect(screen.queryByText('First route')).not.toBeInTheDocument()
  expect(lifecycle).toEqual([
    'enter:/first',
    'throw:/first',
    'load:/first',
    'enter:/second',
    'load:/second',
  ])
})
