import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { AnyRouter } from '../src'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  const pendingCleanups = testCleanups
    .splice(0)
    .reverse()
    .map((testCleanup) => testCleanup())
  if (vi.isFakeTimers()) {
    await vi.runAllTimersAsync()
  }
  await Promise.allSettled(pendingCleanups)
  cleanup()
  vi.useRealTimers()
})

test.each(['child', 'root'] as const)(
  'a mounted %s pending fallback follows an overlapping load generation',
  async (routeLevel) => {
    const firstReload = createControlledPromise<void>()
    const secondReload = createControlledPromise<void>()
    const reloads = [firstReload, secondReload]
    let loaderCall = 0

    const routeOptions = {
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: () => <div data-testid="pending">Pending</div>,
      loader: () => {
        const generation = ++loaderCall
        const gate = reloads[generation - 2]
        return gate ? gate.then(() => generation) : generation
      },
    }

    const makeRouter = (): AnyRouter => {
      if (routeLevel === 'root') {
        const rootRoute = createRootRoute({
          ...routeOptions,
          component: () => <div>Generation {rootRoute.useLoaderData()()}</div>,
        })
        return createRouter({
          routeTree: rootRoute,
          history: createMemoryHistory({ initialEntries: ['/'] }),
        })
      }

      const rootRoute = createRootRoute({ component: () => <Outlet /> })
      const pageRoute = createRoute({
        ...routeOptions,
        getParentRoute: () => rootRoute,
        path: '/page',
        component: () => <div>Generation {pageRoute.useLoaderData()()}</div>,
      })
      return createRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
      })
    }
    const router = makeRouter()

    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Generation 1')).toBeInTheDocument()

    vi.useFakeTimers()
    const firstInvalidation = router.invalidate({ forcePending: true })
    const invalidations = [firstInvalidation]
    testCleanups.push(async () => {
      firstReload.resolve()
      secondReload.resolve()
      await Promise.allSettled(invalidations)
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(loaderCall).toBe(2)
    expect(screen.getByTestId('pending')).toBeInTheDocument()
    expect(screen.queryByText('Generation 1')).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(25)
    const secondInvalidation = router.invalidate({ forcePending: true })
    invalidations.push(secondInvalidation)
    await vi.advanceTimersByTimeAsync(0)
    expect(loaderCall).toBe(3)

    firstReload.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(screen.getByTestId('pending')).toBeInTheDocument()
    expect(screen.queryByText('Generation 2')).not.toBeInTheDocument()

    let secondSettled = false
    void secondInvalidation.then(() => {
      secondSettled = true
    })
    secondReload.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(secondSettled).toBe(false)
    expect(screen.getByTestId('pending')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(74)
    expect(secondSettled).toBe(false)
    expect(screen.getByTestId('pending')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(1)
    await Promise.all(invalidations)
    expect(screen.getByText('Generation 3')).toBeInTheDocument()
    expect(screen.queryByText('Generation 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Generation 2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
    expect(router.state.status).toBe('idle')
  },
)

test('forcePending honors pendingMinMs when the reload settles before pendingMs', async () => {
  const reload = createControlledPromise<void>()
  let loaderCall = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="fast-pending">Pending</div>,
    loader: async () => {
      if (++loaderCall > 1) {
        await reload
      }
      return loaderCall
    },
    component: () => <div>Generation {pageRoute.useLoaderData()()}</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Generation 1')).toBeInTheDocument()

  vi.useFakeTimers()
  const invalidation = router.invalidate({ forcePending: true })
  testCleanups.push(async () => {
    reload.resolve()
    await Promise.allSettled([invalidation])
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByTestId('fast-pending')).toBeInTheDocument()

  let settled = false
  void invalidation.then(() => {
    settled = true
  })
  reload.resolve()
  await vi.advanceTimersByTimeAsync(0)

  await vi.advanceTimersByTimeAsync(99)
  expect(settled).toBe(false)
  expect(screen.getByTestId('fast-pending')).toBeInTheDocument()
  expect(screen.queryByText('Generation 2')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(1)
  await invalidation
  expect(screen.getByText('Generation 2')).toBeInTheDocument()
  expect(screen.queryByText('Generation 1')).not.toBeInTheDocument()
  expect(screen.queryByTestId('fast-pending')).not.toBeInTheDocument()
  expect(router.state.status).toBe('idle')
})
