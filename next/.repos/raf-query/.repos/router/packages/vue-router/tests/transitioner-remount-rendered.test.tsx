import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
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
  document.body.innerHTML = ''
})

function setup() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    component: () => <div>Next</div>,
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, nextRoute]),
    history,
  })
  return { history, router }
}

test('onRendered runs after the destination DOM has committed', async () => {
  const { router } = setup()
  const initialRendered = vi.fn()
  const unsubscribeInitial = router.subscribe('onRendered', initialRendered)
  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeTruthy()
  await waitFor(() => expect(initialRendered).toHaveBeenCalledTimes(1))
  unsubscribeInitial()

  const destinationWasRendered: Array<boolean> = []
  const unsubscribe = router.subscribe('onRendered', () => {
    destinationWasRendered.push(screen.queryByText('Next') !== null)
  })

  await router.navigate({ to: '/next' })
  await waitFor(() => expect(destinationWasRendered).toHaveLength(1))
  expect(destinationWasRendered).toEqual([true])

  unsubscribe()
})

test('onRendered fires for a same-href navigation with a new history key', async () => {
  const { router } = setup()
  const onRendered = vi.fn()
  const unsubscribe = router.subscribe('onRendered', onRendered)
  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeTruthy()
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))
  onRendered.mockClear()

  await router.navigate({
    to: '/',
    state: { sameHrefState: true } as any,
  })
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))

  const event = onRendered.mock.calls[0]![0]
  expect(event.fromLocation?.state.sameHrefState).toBeUndefined()
  expect(event.toLocation.state.sameHrefState).toBe(true)
  expect(event.fromLocation?.href).toBe('/')
  expect(event.toLocation.href).toBe('/')
  expect(event.hrefChanged).toBe(false)

  unsubscribe()
})
