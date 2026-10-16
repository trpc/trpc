import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Awaiting router.load() should remain a reliable synchronization point even
 * when that load is superseded. If the abandoned load resolves immediately,
 * callers can observe router state before the newer load has settled.
 *
 * This test starts a real public router.load() for /one, supersedes it with a
 * real navigation to /two, and resolves only the abandoned /one loader. The
 * original await should not settle until the superseding /two loader settles.
 */

const waitForMacrotask = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

describe('superseded load await', () => {
  test('router.load waits for a superseding navigation load to settle', async () => {
    const firstLoaderGate = createControlledPromise<void>()
    const secondLoaderGate = createControlledPromise<void>()
    let firstLoaderCalls = 0
    let secondLoaderCalls = 0
    let secondLoaderSettled = false
    let supersededLoadSettled = false

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/one',
      loader: async () => {
        firstLoaderCalls++
        await firstLoaderGate
        return 'one'
      },
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/two',
      loader: async () => {
        secondLoaderCalls++
        await secondLoaderGate
        secondLoaderSettled = true
        return 'two'
      },
    })

    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
      history,
    })

    await router.load()

    history.push('/one')
    const supersededLoad = router.load().then(() => {
      supersededLoadSettled = true
    })
    await vi.waitFor(() => expect(firstLoaderCalls).toBe(1))

    const latestNavigation = router.navigate({ to: '/two' })
    await vi.waitFor(() => expect(secondLoaderCalls).toBe(1))

    firstLoaderGate.resolve()
    await waitForMacrotask()

    expect(secondLoaderSettled).toBe(false)
    expect(supersededLoadSettled).toBe(false)

    secondLoaderGate.resolve()
    await Promise.all([supersededLoad, latestNavigation])

    expect(secondLoaderSettled).toBe(true)
    expect(supersededLoadSettled).toBe(true)
    expect(router.state.location.pathname).toBe('/two')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: secondRoute.id,
      status: 'success',
      loaderData: 'two',
    })
  })
})
