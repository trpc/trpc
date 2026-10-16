import {
  afterEach,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  _getAssetMatches,
  createControlledPromise,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { dehydrateSsrMatchId } from '../src/ssr/ssr-match-id'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { AnyRouteMatch, AnyRouter, NavigateFn } from '../src'
import type { DehydratedRouter, TsrSsrGlobal } from '../src/ssr/types'
import type { ServerManifest } from '../src/manifest'

const testManifest: ServerManifest = { routes: {} }

// These tests install the hydration protocol directly so client-only hooks can
// be paused at deterministic ownership boundaries.
function installHydrationPayload(
  mockWindow: { $_TSR?: TsrSsrGlobal },
  matches: DehydratedRouter['matches'],
) {
  mockWindow.$_TSR = {
    router: {
      manifest: testManifest,
      dehydratedData: {},
      matches,
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  }
}

/**
 * Hydration asset work is another private lane generation. If a public
 * navigation commits while an old hydration head is pending, the hydration
 * continuation must not execute more old-lane hooks or mark its captured
 * location as resolved.
 */
describe('hydration asset currentness', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('shell hydration preserves the complete lane and its first pending boundary', async () => {
    const childLoader = vi.fn(() => 'client data')
    const rootRoute = new BaseRootRoute({})
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      ssr: false,
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(mockWindow, [
      {
        i: dehydrateSsrMatchId(matches[0]!.id),
        s: 'success',
        ssr: true,
        u: Date.now(),
      },
    ])

    await hydrate(router)

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      childRoute.id,
    ])
    expect(router.state.matches[1]).toMatchObject({
      routeId: childRoute.id,
      status: 'pending',
      ssr: false,
    })
    expect(router.state.resolvedLocation).toBeUndefined()
    expect(childLoader).not.toHaveBeenCalled()
  })

  test('includes an identity-verified ssr:false boundary in a data-only asset prefix', async () => {
    const serverChildLoader = vi.fn(() => 'server child data')
    const serverRootRoute = new BaseRootRoute({})
    const serverParentRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/parent',
      ssr: 'data-only',
    })
    const serverChildRoute = new BaseRoute({
      getParentRoute: () => serverParentRoute,
      path: '/child',
      ssr: false,
      loader: serverChildLoader,
    })
    const serverTailRoute = new BaseRoute({
      getParentRoute: () => serverChildRoute,
      path: '/tail',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverParentRoute.addChildren([
          serverChildRoute.addChildren([serverTailRoute]),
        ]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/parent/child/tail'],
      }),
      isServer: true,
    })
    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter, testManifest)
    expect(serverChildLoader).not.toHaveBeenCalled()

    const childContext = vi.fn(() => ({ assetSource: 'child context' }))
    const childHead = vi.fn(({ match }: { match: AnyRouteMatch }) => ({
      meta: [
        {
          name: 'ssr-false-boundary',
          content: (match.context as { assetSource?: string }).assetSource,
        },
      ],
    }))
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      ssr: 'data-only',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      ssr: false,
      loader: () => 'client child data',
      context: childContext,
      head: childHead,
    })
    const tailRoute = new BaseRoute({
      getParentRoute: () => childRoute,
      path: '/tail',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([childRoute.addChildren([tailRoute])]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/parent/child/tail'],
      }),
      isServer: false,
    })

    await hydrate(router)

    expect(
      _getAssetMatches(router.state.matches).map((match) => match.routeId),
    ).toEqual([rootRoute.id, parentRoute.id, childRoute.id])
    expect(childContext).toHaveBeenCalledOnce()
    expect(childHead).toHaveBeenCalledOnce()
    expect(router.state.matches[2]?.meta).toEqual([
      { name: 'ssr-false-boundary', content: 'child context' },
    ])
  })

  test('preserves a verified data-only asset prefix through its client continuation', async () => {
    const serverRootRoute = new BaseRootRoute({})
    const serverParentRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/parent',
      ssr: 'data-only',
    })
    const serverChildRoute = new BaseRoute({
      getParentRoute: () => serverParentRoute,
      path: '/child',
      ssr: false,
      loader: () => 'server child data',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverParentRoute.addChildren([serverChildRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })
    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter, testManifest)

    const childLoaderResult = createControlledPromise<string>()
    let continuationAssetEnd: number | undefined
    let router!: AnyRouter
    const childLoader = vi.fn(() => {
      continuationAssetEnd = router._tx?.[3][1]?._assetEnd
      return childLoaderResult
    })
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      ssr: 'data-only',
      pendingComponent: () => null,
      pendingMs: 0,
      pendingMinMs: 0,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      ssr: false,
      loader: childLoader,
    })
    router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: false,
    })

    await hydrate(router)
    const load = router.load()

    await vi.waitFor(() => {
      expect(childLoader).toHaveBeenCalledOnce()
      expect(router.state.status).toBe('pending')
    })
    expect(continuationAssetEnd).toBe(3)
    expect(
      _getAssetMatches(router.state.matches).map((match) => match.routeId),
    ).toEqual([rootRoute.id, parentRoute.id, childRoute.id])
    expect(router.state.matches[1]?._assetEnd).toBe(3)

    childLoaderResult.resolve('client child data')
    await load

    expect(router.state.matches[1]?._assetEnd).toBeUndefined()
    expect(router.state.matches[2]).toMatchObject({
      status: 'success',
      loaderData: 'client child data',
    })
  })

  test('settles when navigation supersedes a pending custom hydrate hook', async () => {
    const hydrateGate = createControlledPromise<void>()
    const hydrateStarted = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/new',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, newRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    router.options.hydrate = () => {
      hydrateStarted.resolve()
      return hydrateGate
    }
    const oldMatches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(
      mockWindow,
      oldMatches.map((match) => ({
        i: dehydrateSsrMatchId(match.id),
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    )

    const hydration = hydrate(router)
    onTestFinished(async () => {
      hydrateGate.resolve()
      await hydration
    })

    await hydrateStarted
    await router.navigate({ to: '/new' })
    await expect(hydration).resolves.toBeUndefined()

    expect(router.state.resolvedLocation?.pathname).toBe('/new')
    expect(router.state.matches.at(-1)?.routeId).toBe(newRoute.id)
  })

  test('does not publish an old hydration lane after a newer navigation commits', async () => {
    const oldChunkGate = createControlledPromise<void>()
    const oldChunkStarted = createControlledPromise<void>()
    const OldComponent = Object.assign(() => null, {
      preload: () => {
        oldChunkStarted.resolve()
        return oldChunkGate
      },
    })
    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      component: OldComponent,
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/new',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, newRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    const oldMatches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(
      mockWindow,
      oldMatches.map((match) => ({
        i: dehydrateSsrMatchId(match.id),
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    )

    const hydration = hydrate(router)
    onTestFinished(async () => {
      oldChunkGate.resolve()
      await hydration
    })

    await oldChunkStarted
    await router.navigate({ to: '/new' })

    expect(router.state.resolvedLocation?.pathname).toBe('/new')
    expect(router.state.matches.at(-1)?.routeId).toBe(newRoute.id)

    await hydration

    expect(router.state.location.pathname).toBe('/new')
    expect(router.state.resolvedLocation?.pathname).toBe('/new')
    expect(router.state.matches.at(-1)?.routeId).toBe(newRoute.id)
  })

  test('an aborted hydration handoff falls back to a fresh client continuation', async () => {
    let hydrationController: AbortController | undefined
    const childLoader = vi.fn(() => 'client data')
    const rootRoute = new BaseRootRoute({
      context: ({ abortController }: { abortController: AbortController }) => {
        hydrationController ??= abortController
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      ssr: false,
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(mockWindow, [
      {
        i: dehydrateSsrMatchId(matches[0]!.id),
        s: 'success',
        ssr: true,
        u: Date.now(),
      },
      {
        i: dehydrateSsrMatchId(matches[1]!.id),
        s: 'pending',
        ssr: false,
        u: Date.now(),
      },
    ])

    await hydrate(router)
    expect(hydrationController).toBeDefined()

    const unsubscribe = router.subscribe('onBeforeLoad', () => {
      hydrationController!.abort()
    })
    onTestFinished(unsubscribe)

    await router.load()

    expect(router.state.resolvedLocation?.pathname).toBe('/child')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: childRoute.id,
      status: 'success',
      loaderData: 'client data',
    })
    expect(childLoader).toHaveBeenCalledTimes(1)
  })

  test('published HMR consumes a partial hydration handoff before its successor converges', async () => {
    let hydrationController: AbortController | undefined
    let generation = 0
    const childLoader = vi.fn(() => `client child data ${++generation}`)
    const rootRoute = new BaseRootRoute({
      context: ({ abortController }: { abortController: AbortController }) => {
        hydrationController ??= abortController
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      ssr: false,
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())
    installHydrationPayload(mockWindow, [
      {
        i: dehydrateSsrMatchId(matches[0]!.id),
        s: 'success',
        ssr: true,
        u: Date.now(),
      },
    ])

    await hydrate(router)
    const handoff = router._handoff
    const firstAck = createControlledPromise<boolean>()
    const firstPublished = createControlledPromise<void>()
    let transitions = 0
    router.startTransition = (fn) => {
      transitions++
      if (transitions === 1) {
        fn()
        firstPublished.resolve()
        return firstAck
      }
      firstAck.resolve(false)
      fn()
      return Promise.resolve(true)
    }

    const firstRefresh = router._refreshRoute!()
    await firstPublished

    expect(handoff).toBeDefined()
    expect(router._handoff).toBeUndefined()
    expect(hydrationController?.signal.aborted).toBe(true)
    expect(router.state.matches[1]).toMatchObject({
      status: 'success',
      ssr: false,
      loaderData: 'client child data 1',
    })

    const secondRefresh = router._refreshRoute!()
    await Promise.all([firstRefresh, secondRefresh])

    expect(router._handoff).toBeUndefined()
    expect(router.state.matches[1]).toMatchObject({
      status: 'success',
      loaderData: 'client child data 2',
    })
    expect(childLoader).toHaveBeenCalledTimes(2)
  })

  test('a synchronous context navigation prevents stale hydration assets from running', async () => {
    const oldHead = vi.fn(() => ({ meta: [{ title: 'Old route' }] }))
    const oldScripts = vi.fn(() => [
      { children: 'window.oldHydrationLaneRan = true' },
    ])
    const newHead = vi.fn(() => ({ meta: [{ title: 'New route' }] }))

    let navigation: Promise<void> | undefined
    let navigateDuringHydration = false
    const navigationStarted = vi.fn()
    const oldContext = vi.fn(({ navigate }: { navigate: NavigateFn }) => {
      if (navigateDuringHydration) {
        navigateDuringHydration = false
        navigationStarted()
        navigation = navigate({ to: '/new' })
      }
      return { source: 'old' }
    })
    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      context: oldContext,
      head: oldHead,
      scripts: oldScripts,
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/new',
      head: newHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, newRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    const oldMatches = router.matchRoutes(router.stores.location.get())

    installHydrationPayload(
      mockWindow,
      oldMatches.map((match) => ({
        i: dehydrateSsrMatchId(match.id),
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    )

    navigateDuringHydration = true
    await hydrate(router)
    expect(navigationStarted).toHaveBeenCalled()
    expect(navigation).toBeDefined()
    await navigation

    expect(router.state.location.pathname).toBe('/new')
    expect(router.state.resolvedLocation?.pathname).toBe('/new')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: newRoute.id,
      status: 'success',
      meta: [{ title: 'New route' }],
    })
    expect(oldContext).toHaveBeenCalled()
    expect(oldHead).not.toHaveBeenCalled()
    expect(oldScripts).not.toHaveBeenCalled()
    expect(newHead).toHaveBeenCalled()
  })

  test('an adopted data-only error does not run its server-omitted descendants', async () => {
    const serverError = new Error('server failed')
    const serverBeforeLoad = vi.fn(() => {
      throw serverError
    })
    const serverRootRoute = new BaseRootRoute({})
    const serverParentRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/parent',
      ssr: 'data-only',
      beforeLoad: serverBeforeLoad,
    })
    const serverChildLoader = vi.fn()
    const serverChildRoute = new BaseRoute({
      getParentRoute: () => serverParentRoute,
      path: '/child',
      loader: serverChildLoader,
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverParentRoute.addChildren([serverChildRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })

    const bootstrap = await dehydrateToBootstrap(serverRouter, testManifest)

    expect(serverBeforeLoad).toHaveBeenCalledTimes(1)
    expect(serverChildLoader).not.toHaveBeenCalled()
    expect(serverRouter.state.matches.map((match) => match.routeId)).toEqual([
      serverRootRoute.id,
      serverParentRoute.id,
      serverChildRoute.id,
    ])
    expect(serverRouter.state.matches[1]).toMatchObject({
      routeId: serverParentRoute.id,
      status: 'error',
      ssr: 'data-only',
      error: serverError,
    })
    const transportedError = bootstrap.router?.matches.at(-1)?.e
    expect(transportedError).not.toBe(serverError)
    expect(transportedError).toMatchObject({
      name: serverError.name,
      message: serverError.message,
    })

    const parentBeforeLoad = vi.fn()
    const childBeforeLoad = vi.fn()
    const childLoader = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      ssr: 'data-only',
      beforeLoad: parentBeforeLoad,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: childBeforeLoad,
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: false,
    })
    mockWindow.$_TSR = bootstrap

    await hydrate(router)

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
      childRoute.id,
    ])
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      status: 'pending',
      error: transportedError,
    })
    expect(parentBeforeLoad).not.toHaveBeenCalled()
    expect(childBeforeLoad).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()
    expect(
      _getAssetMatches(router.state.matches).map((match) => match.routeId),
    ).toEqual([rootRoute.id, parentRoute.id])

    await router.load()

    expect(router.state.location.pathname).toBe('/parent/child')
    expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
      childRoute.id,
    ])
    expect(router.state.matches[1]).toMatchObject({
      status: 'error',
      error: transportedError,
    })
    expect(router.state.matches[1]?.error).toMatchObject({
      name: serverError.name,
      message: serverError.message,
    })
    expect(parentBeforeLoad).not.toHaveBeenCalled()
    expect(childBeforeLoad).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()
  })
})
