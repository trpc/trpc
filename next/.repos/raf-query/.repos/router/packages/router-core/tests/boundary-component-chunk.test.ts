import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
} from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * boundary component preloads should not be blocked by an unrelated
 * normal route component preload. A route load starts the normal component
 * preload before the loader settles; if that loader throws, the error boundary
 * asks to load only the route's errorComponent.
 *
 * This test uses a real client router load. It keeps the normal route component
 * preload pending, resolves the errorComponent preload, and expects the route
 * error state to be committed without waiting for the normal component chunk.
 */

const pendingGates: Array<ReturnType<typeof createControlledPromise<void>>> = []
const pendingLoads: Array<Promise<unknown>> = []

afterEach(async () => {
  for (const gate of pendingGates) {
    gate.resolve()
  }

  await Promise.allSettled(pendingLoads)

  pendingGates.length = 0
  pendingLoads.length = 0
})

describe('route boundary component preloads', () => {
  test('errorComponent preload resolves without waiting for a pending route component preload', async () => {
    const componentGate = createControlledPromise<void>()
    const errorComponentGate = createControlledPromise<void>()
    const routeError = new Error('loader failed')
    let errorComponentPreloadCalls = 0
    pendingGates.push(componentGate, errorComponentGate)

    const SlowRouteComponent = Object.assign(() => null, {
      preload: () => componentGate,
    })
    const ErrorBoundary = Object.assign(() => null, {
      preload: () => {
        errorComponentPreloadCalls++
        return errorComponentGate
      },
    })

    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/chunked',
      loader: () => {
        throw routeError
      },
      component: SlowRouteComponent as any,
      errorComponent: ErrorBoundary as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/chunked'] }),
    })

    const loadPromise = router.load()
    pendingLoads.push(loadPromise)

    await vi.waitFor(() => expect(errorComponentPreloadCalls).toBe(1))
    errorComponentGate.resolve()

    // The route component chunk (componentGate) is still pending: the error
    // state and the public load promise must settle without waiting for it.
    await loadPromise
    expect(componentGate.status).toBe('pending')
    const match = router.state.matches.find((item) => item.routeId === route.id)
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(routeError)

    componentGate.resolve()
  })

  test('an error boundary ignores a late normal component failure', async () => {
    const componentGate = createControlledPromise<void>()
    const errorComponentGate = createControlledPromise<void>()
    const routeError = new Error('loader failed')
    const componentError = new Error('component chunk failed')
    const onError = vi.fn()
    let errorComponentPreloadCalls = 0
    pendingGates.push(errorComponentGate)

    const SlowRouteComponent = Object.assign(() => null, {
      preload: () => componentGate,
    })
    const ErrorBoundary = Object.assign(() => null, {
      preload: () => {
        errorComponentPreloadCalls++
        return errorComponentGate
      },
    })

    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/chunked',
      loader: () => {
        throw routeError
      },
      onError,
      component: SlowRouteComponent as any,
      errorComponent: ErrorBoundary as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/chunked'] }),
    })

    const loadPromise = router.load()
    pendingLoads.push(loadPromise)

    await vi.waitFor(() => expect(errorComponentPreloadCalls).toBe(1))
    errorComponentGate.resolve()
    await loadPromise

    const match = router.state.matches.find((item) => item.routeId === route.id)
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(routeError)
    expect(onError).toHaveBeenCalledOnce()

    componentGate.reject(componentError)
    await expect(componentGate).rejects.toBe(componentError)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onError).toHaveBeenCalledOnce()
    expect(match?.error).toBe(routeError)
  })

  test('an ancestor error boundary ignores a hidden descendant component failure', async () => {
    const componentGate = createControlledPromise<void>()
    const routeError = new Error('parent loader failed')
    const componentError = new Error('child component chunk failed')
    const childOnError = vi.fn()
    pendingGates.push(componentGate)

    const HiddenComponent = Object.assign(() => null, {
      preload: () => componentGate,
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw routeError
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      component: HiddenComponent as any,
      onError: childOnError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    const loading = router.load()
    pendingLoads.push(loading)
    await loading

    expect(router.state.matches[1]).toMatchObject({
      routeId: parentRoute.id,
      status: 'error',
      error: routeError,
    })
    expect(componentGate.status).toBe('pending')

    componentGate.reject(componentError)
    await expect(componentGate).rejects.toBe(componentError)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(childOnError).not.toHaveBeenCalled()
    expect(router.state.matches[1]?.error).toBe(routeError)
  })

  test('global notFound does not wait for component chunks below its boundary', async () => {
    const hiddenComponentGate = createControlledPromise<void>()
    const componentError = new Error('hidden component chunk failed')
    const hiddenOnError = vi.fn()
    const notFoundPreload = vi.fn(() => Promise.resolve())
    pendingGates.push(hiddenComponentGate)

    const NotFoundBoundary = Object.assign(() => null, {
      preload: notFoundPreload,
    })
    const HiddenComponent = Object.assign(() => null, {
      preload: () => hiddenComponentGate,
    })

    const rootRoute = new BaseRootRoute({})
    const layoutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      notFoundComponent: NotFoundBoundary as any,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => layoutRoute,
      path: '/child',
      component: HiddenComponent as any,
      onError: hiddenOnError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([layoutRoute.addChildren([childRoute])]),
      history: createMemoryHistory({
        initialEntries: ['/child/does-not-exist'],
      }),
      notFoundMode: 'fuzzy',
    })

    const loading = router.load()
    pendingLoads.push(loading)
    await loading

    expect(hiddenComponentGate.status).toBe('pending')
    expect(notFoundPreload).toHaveBeenCalledOnce()
    expect(router.state.matches.find((match) => match._notFound)?.routeId).toBe(
      layoutRoute.id,
    )

    hiddenComponentGate.reject(componentError)
    await expect(hiddenComponentGate).rejects.toBe(componentError)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(hiddenOnError).not.toHaveBeenCalled()
  })

  test('a root not-found boundary ignores a late root component failure', async () => {
    const componentGate = createControlledPromise<void>()
    const notFoundGate = createControlledPromise<void>()
    const componentError = new Error('root component chunk failed')
    const onError = vi.fn()
    const notFoundPreload = vi.fn(() => notFoundGate)
    pendingGates.push(componentGate, notFoundGate)

    const RootComponent = Object.assign(() => null, {
      preload: () => componentGate,
    })
    const NotFoundBoundary = Object.assign(() => null, {
      preload: notFoundPreload,
    })
    const rootRoute = new BaseRootRoute({
      component: RootComponent as any,
      notFoundComponent: NotFoundBoundary as any,
      onError,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      beforeLoad: () => {
        throw notFound({ routeId: rootRoute.id })
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
    })

    const loading = router.load()
    pendingLoads.push(loading)
    await vi.waitFor(() => expect(notFoundPreload).toHaveBeenCalledOnce())
    notFoundGate.resolve()
    await loading

    expect(router.state.matches[0]).toMatchObject({
      status: 'success',
      _notFound: true,
    })

    componentGate.reject(componentError)
    await expect(componentGate).rejects.toBe(componentError)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onError).not.toHaveBeenCalled()
  })

  test('a late normal component chunk cannot replace a selected not-found boundary', async () => {
    const componentGate = createControlledPromise<void>()
    const notFoundGate = createControlledPromise<void>()
    const notFoundPreload = vi.fn(() => notFoundGate)
    pendingGates.push(componentGate, notFoundGate)

    const ParentComponent = Object.assign(() => null, {
      preload: () => componentGate,
    })
    const NotFoundBoundary = Object.assign(() => null, {
      preload: notFoundPreload,
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => 'ready',
      component: ParentComponent as any,
      notFoundComponent: NotFoundBoundary as any,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: () => {
        throw notFound({ routeId: parentRoute.id })
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    const loading = router.load()
    pendingLoads.push(loading)
    await vi.waitFor(() => expect(notFoundPreload).toHaveBeenCalledOnce())

    componentGate.resolve()
    await Promise.resolve()
    notFoundGate.resolve()
    await loading

    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      status: 'notFound',
      loaderData: 'ready',
    })
  })

  test('a required ancestor lazy chunk failure wins over a deeper loader notFound', async () => {
    const chunkError = new Error('ancestor lazy chunk failed')
    const rootRoute = new BaseRootRoute({})
    const ancestorRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/ancestor',
      errorComponent: () => null,
    }).lazy(() => Promise.reject(chunkError))
    const childRoute = new BaseRoute({
      getParentRoute: () => ancestorRoute,
      path: '/child',
      loader: () => {
        throw notFound()
      },
      notFoundComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        ancestorRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/ancestor/child'] }),
    })

    await router.load()

    expect(
      router.state.matches.find((match) => match.routeId === ancestorRoute.id),
    ).toMatchObject({ status: 'error', error: chunkError })
  })
})
