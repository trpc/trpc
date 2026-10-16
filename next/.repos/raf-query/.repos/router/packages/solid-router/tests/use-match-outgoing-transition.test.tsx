import * as Solid from 'solid-js'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
} from '../src'

afterEach(() => {
  cleanup()
})

test('an outgoing component never observes its own active match disappear', async () => {
  const observedRouteIds: Array<string | undefined> = []
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    component: () => {
      const match = useMatch({ from: '/first', shouldThrow: false })
      Solid.createRenderEffect(() => {
        observedRouteIds.push(match()?.routeId)
      })
      return <div>First</div>
    },
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    component: () => <div>Next</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([firstRoute, nextRoute]),
    history: createMemoryHistory({ initialEntries: ['/first'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('First')).toBeInTheDocument()
  expect(observedRouteIds).toContain('/first')

  await router.navigate({ to: '/next' })
  expect(await screen.findByText('Next')).toBeInTheDocument()
  expect(screen.queryByText('First')).not.toBeInTheDocument()

  expect(observedRouteIds).not.toContain(undefined)
})

test('a persistent observer releases an explicit match only with the destination render', async () => {
  const nextLoader = createControlledPromise<void>()
  const observations: Array<{
    routeId: string | undefined
    destinationRendered: boolean
  }> = []

  const rootRoute = createRootRoute({
    component: () => {
      const routeId = useMatch({
        from: '/first',
        shouldThrow: false,
        select: (match) => match.routeId,
      })
      Solid.createRenderEffect(() => {
        observations.push({
          routeId: routeId(),
          destinationRendered: screen.queryByText('Next') !== null,
        })
      })
      return <Outlet />
    },
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    component: () => <div>First</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    loader: () => nextLoader,
    component: () => <div>Next</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([firstRoute, nextRoute]),
    history: createMemoryHistory({ initialEntries: ['/first'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('First')).toBeInTheDocument()

  const navigation = router.navigate({ to: '/next' })
  await Promise.resolve()
  expect(screen.queryByText('Next')).toBeNull()
  expect(observations).toContainEqual({
    routeId: '/first',
    destinationRendered: false,
  })
  expect(observations.some(({ routeId }) => routeId === undefined)).toBe(false)

  nextLoader.resolve()
  await navigation
  expect(await screen.findByText('Next')).toBeInTheDocument()
  expect(screen.queryByText('First')).not.toBeInTheDocument()

  const retainedWhilePending = observations.findIndex(
    ({ routeId, destinationRendered }) =>
      routeId === '/first' && !destinationRendered,
  )
  const releasedWithDestination = observations.findIndex(
    ({ routeId, destinationRendered }) =>
      routeId === undefined && destinationRendered,
  )
  expect(retainedWhilePending).toBeGreaterThanOrEqual(0)
  expect(releasedWithDestination).toBeGreaterThan(retainedWhilePending)
  expect(
    observations.some(
      ({ routeId, destinationRendered }) =>
        routeId === undefined && !destinationRendered,
    ),
  ).toBe(false)
})
