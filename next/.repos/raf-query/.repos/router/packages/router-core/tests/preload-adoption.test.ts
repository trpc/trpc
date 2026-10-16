import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Preload adoption edge cases. The happy path (navigation adopts an
 * in-flight preload's successful loader run) and the control-flow
 * non-leakage path are pinned in load.test.ts; this file pins the
 * adoption boundary: a donor must have its loader genuinely in flight. A
 * preload still in its serial phase can itself be waiting on the navigation
 * through the borrow protocol, while a stale successful donor can still have
 * fresh loader work pending behind its cached snapshot.
 */

describe('preload adoption', () => {
  test('navigation waits for fresh data from an in-flight stale preload revalidation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    const revalidationGate = createControlledPromise<{
      notifications: Array<string>
    }>()
    const revalidationStarted = createControlledPromise<void>()
    let loaderCalls = 0

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const notificationsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/notifications',
      staleTime: 0,
      preloadStaleTime: 0,
      gcTime: 60_000,
      loader: {
        staleReloadMode: 'blocking',
        handler: () => {
          loaderCalls++
          if (loaderCalls === 1) {
            return { notifications: ['old'] }
          }

          revalidationStarted.resolve()
          return revalidationGate
        },
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, notificationsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/notifications' } as any)

    expect(loaderCalls).toBe(1)

    // The cached successful preload is now stale. A second hover starts a
    // genuine revalidation while the user clicks the link.
    vi.setSystemTime(1)
    const revalidation = router.preloadRoute({
      to: '/notifications',
    } as any)
    await revalidationStarted
    expect(loaderCalls).toBe(2)

    let navigationSettled = false
    const navigation = router.navigate({ to: '/notifications' }).then(() => {
      navigationSettled = true
    })
    await Promise.resolve()

    // The navigation may share the revalidation, but it must not treat the
    // stale cached snapshot as the completed result while fresh work runs.
    expect(revalidationGate.status).toBe('pending')
    expect(navigationSettled).toBe(false)

    revalidationGate.resolve({ notifications: ['fresh'] })
    await Promise.all([revalidation, navigation])

    // A fix may either share the fresh revalidation or run a navigation
    // loader of its own; correctness only requires publishing fresh data.
    expect(loaderCalls).toBeGreaterThanOrEqual(2)
    expect(
      router.state.matches.find(
        (match) => match.routeId === notificationsRoute.id,
      )?.loaderData,
    ).toEqual({ notifications: ['fresh'] })
  })

  test('navigation runs beforeLoad independently of a preload serial phase', async () => {
    const beforeLoadGate = createControlledPromise<void>()
    const preloadSerialStarted = createControlledPromise<void>()
    let beforeLoadCalls = 0
    const loader = vi.fn(() => 'data')

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad: async () => {
        beforeLoadCalls++
        if (beforeLoadCalls === 1) {
          // Keep the shared lane's serial phase in flight.
          preloadSerialStarted.resolve()
          await beforeLoadGate
        }
      },
      loader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    // Preload is stuck in its serial phase — its loader has NOT started.
    const preload = router.preloadRoute({ to: '/foo' } as any)
    await preloadSerialStarted
    expect(beforeLoadCalls).toBe(1)

    const navigation = router.navigate({ to: '/foo' })
    await vi.waitFor(() => expect(beforeLoadCalls).toBe(2))
    expect(loader).toHaveBeenCalledTimes(1)

    beforeLoadGate.resolve()
    await Promise.all([navigation, preload])
    expect(beforeLoadCalls).toBe(2)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(
      router.state.matches.find((match) => match.routeId === fooRoute.id)
        ?.status,
    ).toBe('success')
  })

  test("a sibling preload shares another preload lane's in-flight loader", async () => {
    const loaderGate = createControlledPromise<string>()
    const loaderStarted = createControlledPromise<void>()
    let preloadBeforeLoadCalls = 0
    const loader = vi.fn(() => {
      loaderStarted.resolve()
      return loaderGate
    })

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      preloadStaleTime: Infinity,
      beforeLoad: ({ preload }) => {
        if (preload) {
          preloadBeforeLoadCalls++
        }
      },
      loader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const first = router.preloadRoute({ to: '/foo' } as any)
    await loaderStarted

    const second = router.preloadRoute({ to: '/foo' } as any)
    await vi.waitFor(() => expect(preloadBeforeLoadCalls).toBe(2))
    expect(loader).toHaveBeenCalledTimes(1)

    loaderGate.resolve('once')
    await Promise.all([first, second])
    expect(loader).toHaveBeenCalledTimes(1)

    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(
      router.state.matches.find((match) => match.routeId === fooRoute.id)
        ?.loaderData,
    ).toBe('once')
  })

  test('a fulfilled undefined loader result is adopted as success', async () => {
    const loaderGate = createControlledPromise<undefined>()
    const loaderStarted = createControlledPromise<void>()
    const loader = vi.fn(() => {
      loaderStarted.resolve()
      return loaderGate
    })

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad: vi.fn(),
      loader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const preload = router.preloadRoute({ to: '/foo' })
    await loaderStarted
    const navigation = router.navigate({ to: '/foo' })
    await Promise.resolve()
    expect(loaderGate.status).toBe('pending')
    expect(loader).toHaveBeenCalledTimes(1)

    loaderGate.resolve(undefined)
    await Promise.all([preload, navigation])

    expect(loader).toHaveBeenCalledTimes(1)
    const match = router.state.matches.find(
      (candidate) => candidate.routeId === fooRoute.id,
    )
    expect(match?.status).toBe('success')
    expect(match?.loaderData).toBeUndefined()
  })

  test('navigation shares a failed pending preload without starving sibling work', async () => {
    const preloadParentStarted = createControlledPromise<void>()
    const preloadFailureGate = createControlledPromise<void>()
    const childStarted = createControlledPromise<void>()
    const childGate = createControlledPromise<string>()
    const parentFailure = new Error('preload failed')
    let parentLoads = 0
    let childLoads = 0
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: async ({ preload }) => {
        parentLoads++
        if (preload) {
          preloadParentStarted.resolve()
          await preloadFailureGate
          throw parentFailure
        }
        return 'navigation data'
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async () => {
        childLoads++
        childStarted.resolve()
        return childGate
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/parent/child' } as any)
    await Promise.all([preloadParentStarted, childStarted])
    expect(parentLoads).toBe(1)
    expect(childLoads).toBe(1)

    const navigation = router.navigate({ to: '/parent/child' })
    await Promise.resolve()
    expect(preloadFailureGate.status).toBe('pending')
    expect(parentLoads).toBe(1)
    expect(childLoads).toBe(1)

    preloadFailureGate.resolve()
    childGate.resolve('child data')
    await Promise.all([navigation, preload])

    expect(parentLoads).toBe(1)
    expect(childLoads).toBe(1)
    expect(router.state.location.pathname).toBe('/parent/child')
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      status: 'error',
      error: parentFailure,
    })
    expect(
      router.state.matches.find((match) => match.routeId === childRoute.id),
    ).toMatchObject({
      status: 'success',
      loaderData: 'child data',
    })
  })

  test('a route with preload disabled does not discard its preloaded ancestor', async () => {
    const parentLoader = vi.fn(() => 'parent data')
    const childLoader = vi.fn(() => 'child data')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      preloadStaleTime: Infinity,
      loader: parentLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      preload: false,
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/parent/child' } as any)
    await router.navigate({ to: '/parent/child' })

    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id)
        ?.loaderData,
    ).toBe('parent data')
    expect(
      router.state.matches.find((match) => match.routeId === childRoute.id)
        ?.loaderData,
    ).toBe('child data')
  })
})
