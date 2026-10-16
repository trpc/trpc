import * as React from 'react'
import { act } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

afterEach(() => {
  vi.useRealTimers()
  cleanup()
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
      pendingComponent: () => <div data-testid="pending">Loading...</div>,
      loader: () => {
        const generation = ++loaderCall
        const gate = reloads[generation - 2]
        return gate ? gate.then(() => ({ generation })) : { generation }
      },
    }

    const makeRouter = (): AnyRouter => {
      if (routeLevel === 'root') {
        const rootRoute = createRootRoute({
          ...routeOptions,
          component: () => (
            <div data-testid="content">
              Generation {rootRoute.useLoaderData().generation}
            </div>
          ),
        })
        return createRouter({
          routeTree: rootRoute,
          history: createMemoryHistory({ initialEntries: ['/'] }),
        })
      }

      const rootRoute = createRootRoute({
        component: () => <Outlet />,
      })
      const pageRoute = createRoute({
        ...routeOptions,
        getParentRoute: () => rootRoute,
        path: '/page',
        component: () => (
          <div data-testid="content">
            Generation {pageRoute.useLoaderData().generation}
          </div>
        ),
      })
      return createRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
      })
    }
    const router = makeRouter()

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Generation 1')).toBeInTheDocument()

    vi.useFakeTimers()

    let firstInvalidation!: Promise<void>
    await act(async () => {
      firstInvalidation = router.invalidate({ forcePending: true })
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(loaderCall).toBe(2)
    expect(screen.getByTestId('pending')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25)
    })

    let secondInvalidation!: Promise<void>
    await act(async () => {
      secondInvalidation = router.invalidate({ forcePending: true })
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(loaderCall).toBe(3)

    await act(async () => {
      firstReload.resolve()
      await Promise.resolve()
    })

    // Completing the superseded generation cannot release the currently
    // mounted fallback or restore its stale loader data.
    expect(screen.getByTestId('pending')).toBeInTheDocument()
    expect(screen.queryByText('Generation 2')).not.toBeInTheDocument()

    let secondSettled = false
    void secondInvalidation.then(() => {
      secondSettled = true
    })
    await act(async () => {
      secondReload.resolve()
      await Promise.resolve()
    })

    expect(secondSettled).toBe(false)
    expect(screen.getByTestId('pending')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(74)
    })
    expect(secondSettled).toBe(false)
    expect(screen.getByTestId('pending')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await Promise.all([firstInvalidation, secondInvalidation])
    })

    expect(screen.getByText('Generation 3')).toBeInTheDocument()
    expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  },
)
