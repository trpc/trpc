import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

// A navigation that adopts an in-flight preload's loader run must reuse that
// run: it must not abort the preload's loader signal or rerun the loader. This
// is generic router adoption coverage; issue #4476 is covered separately with
// the React Query observer-unmount sequence from its reproduction.
describe('navigation adopting an in-flight preload', () => {
  test('adopted preload loader runs once and its signal is not aborted', async () => {
    const loaderGate = createControlledPromise<string>()
    const loaderStarted = createControlledPromise<void>()
    const beforeLoad = vi.fn()
    let preloadSignal: AbortSignal | undefined
    const loader = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        preloadSignal = abortController.signal
        loaderStarted.resolve()
        return loaderGate
      },
    )

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad,
      loader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    // Start the preload and wait until its loader is actually in flight.
    const preload = router.preloadRoute({ to: '/foo' })
    await loaderStarted
    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(preloadSignal).toBeDefined()
    expect(preloadSignal?.aborted).toBe(false)

    // The navigation runs its own guard but shares the loader generation.
    const navigation = router.navigate({ to: '/foo' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))
    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loaderGate.status).toBe('pending')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(preloadSignal?.aborted).toBe(false)

    // Resolve the shared loader and let both settle.
    loaderGate.resolve('adopted')
    await Promise.all([navigation, preload])

    // Loader ran exactly once; the adopted run's signal was never aborted.
    expect(loader).toHaveBeenCalledTimes(1)
    expect(preloadSignal?.aborted).toBe(false)

    // Navigation committed with the adopted loaderData.
    const committed = router.state.matches.find(
      (match) => match.routeId === fooRoute.id,
    )
    expect(committed?.status).toBe('success')
    expect(committed?.loaderData).toBe('adopted')

    // Adoption transfers loader-data lifetime ownership to the active match.
    // The shared request remains alive while rendered, then aborts on unload.
    await router.navigate({ to: '/' })
    expect(preloadSignal?.aborted).toBe(true)
  })

  test('reruns beforeLoad when router context changes during an active preload', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn(
      ({
        context,
        preload,
      }: {
        context: { auth: boolean }
        preload: boolean
      }) => ({ authorization: `${context.auth}:${preload}` }),
    )
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute<any, undefined, { auth: boolean }>({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { auth: false },
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/guarded' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    router.update({ ...router.options, context: { auth: true } })
    const navigation = router.navigate({ to: '/guarded' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)

    loaderGate.resolve('shared')
    await Promise.all([preload, navigation])
    expect(router.state.matches.at(-1)?.context).toEqual({
      auth: true,
      authorization: 'true:false',
    })
  })

  test('reruns beforeLoad when user location state changes at the same href', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn(
      ({ location, preload }: { location: any; preload: boolean }) => ({
        authorization: `${location.state.auth}:${preload}`,
      }),
    )
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({
      to: '/guarded',
      state: { auth: 'old' } as any,
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({
      to: '/guarded',
      state: { auth: 'new' } as any,
    })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(beforeLoad.mock.results.map((result) => result.value)).toEqual([
      { authorization: 'old:true' },
      { authorization: 'new:false' },
    ])
    expect(loader).toHaveBeenCalledTimes(1)

    loaderGate.resolve('shared')
    await Promise.all([preload, navigation])
    expect(router.state.matches.at(-1)?.context).toMatchObject({
      authorization: 'new:false',
    })
  })

  test('reruns beforeLoad when the route tree changes during an active preload', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn()
    const loader = vi.fn(() => loaderGate)
    const createRouteTree = () => {
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const guardedRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/guarded',
        beforeLoad,
        loader,
      })
      return rootRoute.addChildren([indexRoute, guardedRoute])
    }
    const router = createTestRouter({
      routeTree: createRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/guarded' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())

    router.update({ ...router.options, routeTree: createRouteTree() })
    const navigation = router.navigate({ to: '/guarded' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    loaderGate.resolve('shared')
    await Promise.all([preload, navigation])
    expect(loader).toHaveBeenCalledOnce()
  })
})
