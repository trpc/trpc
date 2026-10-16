import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// https://github.com/TanStack/router/issues/2182
test('root pending fallback remains visible through pendingMinMs', async () => {
  vi.useFakeTimers()

  const loaderGate = createControlledPromise<string>()
  const rootRoute = createRootRoute({
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="root-pending">Pending</div>,
    loader: () => loaderGate,
    component: () => <div data-testid="root-content">Loaded</div>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByTestId('root-pending')).toBeInTheDocument()
  expect(screen.queryByTestId('root-content')).not.toBeInTheDocument()

  loaderGate.resolve('loaded')

  await act(async () => {
    await vi.advanceTimersByTimeAsync(99)
  })
  expect(screen.getByTestId('root-pending')).toBeInTheDocument()
  expect(screen.queryByTestId('root-content')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(screen.queryByTestId('root-pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('root-content')).toBeInTheDocument()
})
