import { act } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
  vi.clearAllMocks()
  cleanup()
})

// Ported from PR #7051. A forced-pending reload must keep showing its pending
// fallback until fresh content commits instead of exposing the error boundary.
test('invalidate({ forcePending: true }) keeps rendering the pending fallback instead of the error boundary', async () => {
  const history = createMemoryHistory({
    initialEntries: ['/force-pending'],
  })
  const errorComponentRendered = vi.fn()
  let shouldSuspendReload = false
  const reloadGate = createControlledPromise<void>()

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })

  const forcePendingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/force-pending',
    pendingMs: 0,
    pendingMinMs: 10,
    loader: async () => {
      if (shouldSuspendReload) {
        await reloadGate
      }

      return 'done'
    },
    component: () => (
      <div data-testid="force-pending-route">
        {forcePendingRoute.useLoaderData()}
      </div>
    ),
    pendingComponent: () => (
      <div data-testid="force-pending-fallback">Pending...</div>
    ),
    errorComponent: ({ error }) => {
      errorComponentRendered(error)
      return <div data-testid="force-pending-error">{String(error)}</div>
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([forcePendingRoute]),
    history,
  })

  render(<RouterProvider router={router} />)

  await act(() => router.load())
  expect(await screen.findByTestId('force-pending-route')).toHaveTextContent(
    'done',
  )

  shouldSuspendReload = true
  let invalidation!: Promise<void>
  act(() => {
    invalidation = router.invalidate({ forcePending: true })
  })

  expect(
    await screen.findByTestId('force-pending-fallback'),
  ).toBeInTheDocument()
  expect(errorComponentRendered).not.toHaveBeenCalled()
  expect(screen.queryByTestId('force-pending-error')).not.toBeInTheDocument()

  act(() => {
    reloadGate.resolve()
  })

  await act(() => invalidation)
  expect(await screen.findByTestId('force-pending-route')).toHaveTextContent(
    'done',
  )
  expect(screen.queryByTestId('force-pending-fallback')).not.toBeInTheDocument()
  expect(screen.queryByTestId('force-pending-error')).not.toBeInTheDocument()
  expect(errorComponentRendered).not.toHaveBeenCalled()
  expect(router.state.location.pathname).toBe('/force-pending')
  expect(router.state.status).toBe('idle')
})

test('regular navigation keeps the current pending fallback while its loader is aborted', async () => {
  const firstLoaderAborted = createControlledPromise<void>()
  const secondLoaderStarted = createControlledPromise<void>()
  const secondLoaderGate = createControlledPromise<void>()
  const firstErrorComponentRendered = vi.fn()
  let firstSignal: AbortSignal | undefined

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="home-page">Home page</div>,
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    pendingMs: 0,
    loader: async ({ abortController }) => {
      firstSignal = abortController.signal
      await new Promise<void>((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            firstLoaderAborted.resolve()
            reject(new DOMException('Aborted', 'AbortError'))
          },
          { once: true },
        )
      })
      return 'first'
    },
    component: () => (
      <div data-testid="first-page">{firstRoute.useLoaderData()}</div>
    ),
    pendingComponent: () => (
      <div data-testid="first-pending">Pending first route</div>
    ),
    errorComponent: ({ error }) => {
      firstErrorComponentRendered(error)
      return <div data-testid="first-error">{String(error)}</div>
    },
  })
  const secondRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    loader: async () => {
      secondLoaderStarted.resolve()
      await secondLoaderGate
      return 'second'
    },
    component: () => (
      <div data-testid="second-page">{secondRoute.useLoaderData()}</div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPreload: false,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('home-page')).toBeInTheDocument()

  act(() => {
    void router.navigate({ to: '/first' })
  })
  expect(await screen.findByTestId('first-pending')).toBeInTheDocument()
  expect(firstSignal?.aborted).toBe(false)

  let secondNavigation!: Promise<void>
  act(() => {
    secondNavigation = router.navigate({ to: '/second' })
  })
  await act(async () => {
    await Promise.all([firstLoaderAborted, secondLoaderStarted])
  })

  expect(firstSignal?.aborted).toBe(true)
  expect(screen.getByTestId('first-pending')).toBeInTheDocument()
  expect(screen.queryByTestId('first-error')).not.toBeInTheDocument()
  expect(firstErrorComponentRendered).not.toHaveBeenCalled()
  expect(router.state.location.pathname).toBe('/second')
  expect(router.state.status).toBe('pending')

  act(() => {
    secondLoaderGate.resolve()
  })
  await act(() => secondNavigation)

  expect(await screen.findByTestId('second-page')).toHaveTextContent('second')
  expect(screen.queryByTestId('first-pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('first-error')).not.toBeInTheDocument()
  expect(firstErrorComponentRendered).not.toHaveBeenCalled()
  expect(router.state.location.pathname).toBe('/second')
  expect(router.state.status).toBe('idle')
})
