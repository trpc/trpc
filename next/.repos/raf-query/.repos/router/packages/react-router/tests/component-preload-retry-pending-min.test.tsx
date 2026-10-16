import * as React from 'react'
import { act } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createControlledPromise } from '@tanstack/router-core'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouter,
} from '../src'
import type { ErrorComponentProps } from '../src'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

test('delayed component preload reveals pending UI', async () => {
  const componentGate = createControlledPromise<void>()
  const Page = Object.assign(() => <div>Page content</div>, {
    preload: () => componentGate,
  })
  const rootRoute = createRootRoute({})
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
    pendingMs: 10,
    pendingComponent: () => <div>Loading page...</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Loading page...')).toBeInTheDocument()
  componentGate.resolve()
  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(screen.queryByText('Loading page...')).not.toBeInTheDocument()
})

/**
 * A component-only route can fail while preloading its code, then retry from
 * its error UI through invalidate(). The retry is a fresh pending generation:
 * its fallback must remain visible until the retried component preload is
 * ready and pendingMinMs has elapsed.
 */
test('component preload retry remains pending through pendingMinMs', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  const retryChunk = createControlledPromise<void>()
  let preloadAttempt = 0
  let retryInvalidation!: Promise<void>
  let retrySettled = false

  const Page = Object.assign(
    () => <div data-testid="page-content">Page content</div>,
    {
      preload: vi.fn(() => {
        preloadAttempt++
        return preloadAttempt === 1
          ? Promise.reject(new Error('initial chunk request failed'))
          : retryChunk
      }),
    },
  )

  function RetryError({ reset }: ErrorComponentProps) {
    const router = useRouter()
    return (
      <button
        type="button"
        onClick={() => {
          reset()
          retryInvalidation = router.invalidate()
          void retryInvalidation.then(() => {
            retrySettled = true
          })
        }}
      >
        Retry chunk
      </button>
    )
  }

  const rootRoute = createRootRoute({})
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
    errorComponent: RetryError,
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => (
      <div data-testid="page-pending">Loading page...</div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByRole('button', { name: 'Retry chunk' }),
  ).toBeInTheDocument()
  expect(Page.preload).toHaveBeenCalledTimes(1)

  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Retry chunk' }))

  // Let pendingMs: 0 publish the retry lane.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(Page.preload).toHaveBeenCalledTimes(2)
  expect(screen.getByTestId('page-pending')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Retry chunk' }),
  ).not.toBeInTheDocument()

  await act(async () => {
    retryChunk.resolve()
    await Promise.resolve()
  })

  expect.soft(retrySettled).toBe(false)
  expect.soft(screen.queryByTestId('page-pending')).toBeInTheDocument()
  expect.soft(screen.queryByTestId('page-content')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(99)
  })
  expect(screen.getByTestId('page-pending')).toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
    await retryInvalidation
  })

  expect(screen.getByTestId('page-content')).toBeInTheDocument()
  expect(screen.queryByTestId('page-pending')).not.toBeInTheDocument()
})
