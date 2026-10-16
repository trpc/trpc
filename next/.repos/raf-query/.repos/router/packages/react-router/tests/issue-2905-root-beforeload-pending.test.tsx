import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// https://github.com/TanStack/router/issues/2905
test('#2905: a root pendingComponent renders while root beforeLoad is pending', async () => {
  vi.useFakeTimers()

  const rootRoute = createRootRoute({
    beforeLoad: async () => {
      await new Promise((resolve) => setTimeout(resolve, 3_000))
    },
    pendingComponent: () => <div data-testid="root-pending">Root pending</div>,
    component: () => <div data-testid="root-content">Root</div>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })

  await act(async () => {
    await vi.advanceTimersByTimeAsync(999)
  })
  expect(screen.queryByTestId('root-pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('root-content')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(screen.getByTestId('root-pending')).toBeInTheDocument()
  expect(screen.queryByTestId('root-content')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_999)
  })
  expect(screen.getByTestId('root-pending')).toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(screen.queryByTestId('root-pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('root-content')).toBeInTheDocument()
})
