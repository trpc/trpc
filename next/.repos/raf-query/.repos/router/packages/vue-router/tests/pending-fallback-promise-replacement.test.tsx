import { cleanup, render, screen } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  vi.useRealTimers()
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  cleanup()
})

test('a continuously visible fallback keeps its deadline across replacement loads', async () => {
  const firstReload = createControlledPromise<void>()
  const secondReload = createControlledPromise<void>()
  const reloads = [firstReload, secondReload]
  let loaderCall = 0

  const rootRoute = createRootRoute({
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="pending">Pending</div>,
    loader: () => {
      const generation = ++loaderCall
      const gate = reloads[generation - 2]
      return gate ? gate.then(() => generation) : generation
    },
    component: () => <div>Content</div>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Content')).toBeInTheDocument()

  vi.useFakeTimers()
  const firstInvalidation = router.invalidate({ forcePending: true })
  const invalidations = [firstInvalidation]
  testCleanups.push(async () => {
    firstReload.resolve()
    secondReload.resolve()
    await Promise.allSettled(invalidations)
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByTestId('pending')).toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(25)
  let secondSettled = false
  const secondInvalidation = router
    .invalidate({ forcePending: true })
    .then(() => {
      secondSettled = true
    })
  invalidations.push(secondInvalidation)

  firstReload.resolve()
  secondReload.resolve()
  await Promise.resolve()

  await vi.advanceTimersByTimeAsync(74)
  expect(secondSettled).toBe(false)
  expect(screen.getByTestId('pending')).toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(1)
  await Promise.all(invalidations)
  expect(screen.getByText('Content')).toBeInTheDocument()
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
})
