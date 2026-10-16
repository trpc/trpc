import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cache retention across an error-boundary commit', () => {
  test('a superseded generation cannot shadow newer beyond-boundary data', async () => {
    let parentFails = false
    const parentGate = createControlledPromise<void>()
    const parentLoader = vi.fn(async () => {
      if (parentFails) {
        await parentGate
        throw new Error('parent boom')
      }
    })
    let childVersion = 0
    let wantChildReload = false
    const childLoader = vi.fn(() => ({ version: ++childVersion }))

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/p',
      loader: parentLoader,
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: 'c',
      shouldReload: () => wantChildReload,
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/p/c'] }),
      defaultStaleReloadMode: 'blocking',
    })

    await router.load()
    expect(childLoader).toHaveBeenCalledTimes(1)

    // Same-destination refresh where the child settles a newer generation
    // before the parent fails at the boundary.
    parentFails = true
    wantChildReload = true
    const refresh = router.navigate({ to: '/p/c' })
    await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(2))
    parentGate.resolve()
    await refresh
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({ status: 'error' })

    // Leave and return with reloads declined: the presented child data must
    // be the newer generation, not the superseded one.
    parentFails = false
    wantChildReload = false
    await router.navigate({ to: '/' })
    await router.navigate({ to: '/p/c' })

    const child = router.state.matches.find(
      (match) => match.routeId === childRoute.id,
    )
    expect(childLoader).toHaveBeenCalledTimes(2)
    expect(child).toMatchObject({
      status: 'success',
      loaderData: { version: 2 },
    })
  })
})
