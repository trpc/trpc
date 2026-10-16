import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/vue'
import { createMemoryHistory } from '@tanstack/history'
import { createControlledPromise, notFound } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const outletWarning = (
  component: 'pendingComponent' | 'errorComponent' | 'notFoundComponent',
) =>
  `Warning: An <Outlet /> was rendered inside a ${component}. <Outlet /> should only be rendered inside a route component.`

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('does not warn when Outlet is rendered inside a route component', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <span>Root route</span>
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <span>Index route</span>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Index route')).toBeInTheDocument()
  expect(warn).not.toHaveBeenCalled()
})

test('warns when Outlet is rendered inside a pendingComponent', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const pending = createControlledPromise<void>()
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <span>Index route</span>,
  })
  const pendingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/pending',
    loader: () => pending,
    pendingMs: 0,
    pendingComponent: () => (
      <>
        <span>Pending route</span>
        <Outlet />
      </>
    ),
    component: () => <span>Resolved route</span>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pendingRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  await screen.findByText('Index route')

  const navigation = router.navigate({ to: '/pending' })
  expect(await screen.findByText('Pending route')).toBeInTheDocument()
  pending.resolve()
  await navigation

  expect(warn).toHaveBeenCalledWith(outletWarning('pendingComponent'))
})

test('warns when Outlet is rendered inside an errorComponent', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => {
      throw new Error('Loader failed')
    },
    errorComponent: () => (
      <>
        <span>Error route</span>
        <Outlet />
      </>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Error route')).toBeInTheDocument()
  expect(warn).toHaveBeenCalledWith(outletWarning('errorComponent'))
})

test.each([new Error('Loader failed'), false, 0, '', null, undefined])(
  'warns with the current component after a fallback transition with %s',
  async (error) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pending = createControlledPromise<void>()
    const FallbackComponent = (props: { error?: unknown }) => (
      <>
        <span>{'error' in props ? 'Error route' : 'Pending route'}</span>
        <Outlet />
      </>
    )
    const rootRoute = createRootRoute({ component: Outlet })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <span>Index route</span>,
    })
    const transitionRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/transition',
      loader: () => pending,
      pendingMs: 0,
      pendingComponent: FallbackComponent,
      errorComponent: FallbackComponent,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, transitionRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)
    await screen.findByText('Index route')

    const navigation = router.navigate({ to: '/transition' })
    expect(await screen.findByText('Pending route')).toBeInTheDocument()
    pending.reject(error)
    await navigation

    expect(await screen.findByText('Error route')).toBeInTheDocument()
    expect(warn).toHaveBeenCalledWith(outletWarning('pendingComponent'))
    expect(warn).toHaveBeenCalledWith(outletWarning('errorComponent'))
  },
)

test('warns when Outlet is rendered inside a notFoundComponent', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <span>Index route</span>,
  })
  const notFoundRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/not-found',
    component: () => {
      throw notFound()
    },
    notFoundComponent: () => (
      <>
        <span>Not found route</span>
        <Outlet />
      </>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, notFoundRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  await screen.findByText('Index route')
  await router.navigate({ to: '/not-found' })

  expect(await screen.findByText('Not found route')).toBeInTheDocument()
  expect(warn).toHaveBeenCalledWith(outletWarning('notFoundComponent'))
})
