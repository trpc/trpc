import { describe, expect, it, onTestFinished } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  rootRouteId,
} from '../src'
import { createTestRouter } from './routerTestUtils'

// Existing Core attribution coverage related to:
// https://github.com/TanStack/router/issues/4078
// https://github.com/TanStack/router/issues/2255
// Throwing an untargeted notFound() in a child loader used to always render the
// defaultNotFoundComponent, even when __root__ defined a notFoundComponent
// (#4078). #2255 is the same asymmetry: a path-mismatch notFound renders the
// root component + notFoundComponent, but a loader-thrown notFound did not.
//
// At Router Core's boundary, root attribution is represented by the root match
// with _notFound. These assertions do not distinguish the
// configured root notFoundComponent from the router default; that reported
// rendering behavior requires framework-level coverage.
describe('#4078 / #2255 existing Core root-boundary attribution', () => {
  const setup = (initialEntries: Array<string>) => {
    const loaderStarted = createControlledPromise<void>()
    const loaderResponse = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({
      component: () => 'Root',
      notFoundComponent: () => 'Root not found',
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const aboutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        loaderStarted.resolve()
        await loaderResponse
        throw notFound()
      },
      component: () => 'About',
    })

    return {
      router: createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
        history: createMemoryHistory({ initialEntries }),
      }),
      loaderStarted,
      loaderResponse,
    }
  }

  const getRootBoundaryProjection = (
    router: ReturnType<typeof setup>['router'],
  ) => {
    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRouteId,
    )

    return {
      routeId: rootMatch?.routeId,
      _notFound: rootMatch?._notFound,
    }
  }

  it('an async loader notFound navigation selects the root boundary', async () => {
    const { router, loaderStarted, loaderResponse } = setup(['/'])
    await router.load()

    const navigation = router.navigate({ to: '/about' })
    onTestFinished(() => {
      loaderResponse.resolve()
    })
    await loaderStarted
    expect(loaderResponse.status).toBe('pending')
    loaderResponse.resolve()

    await navigation

    expect(router.state.location.pathname).toBe('/about')
    expect(getRootBoundaryProjection(router)).toEqual({
      routeId: rootRouteId,
      _notFound: true,
    })
  })

  it('matches the root-boundary projection of an unmatched URL (#2255 parity)', async () => {
    const unmatched = setup(['/missing'])
    await unmatched.router.load()
    const unmatchedProjection = getRootBoundaryProjection(unmatched.router)
    expect(unmatchedProjection).toEqual({
      routeId: rootRouteId,
      _notFound: true,
    })

    const loaderNotFound = setup(['/'])
    await loaderNotFound.router.load()
    const navigation = loaderNotFound.router.navigate({ to: '/about' })
    await loaderNotFound.loaderStarted
    loaderNotFound.loaderResponse.resolve()
    await navigation

    expect(getRootBoundaryProjection(loaderNotFound.router)).toEqual(
      unmatchedProjection,
    )
  })
})
