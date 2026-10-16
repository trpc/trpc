import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// https://github.com/TanStack/router/issues/2980
// Repeated child preloads must borrow a stale active parent instead of rerunning
// its loader.
test('#2980: repeated child preloads do not rerun a stale active parent loader', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)

  const layoutLoader = vi.fn(() => 'layout data')
  const childLoader = vi.fn((childId: string) => `child ${childId}`)
  const rootRoute = new BaseRootRoute({})
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/layout',
    staleTime: 10,
    loader: layoutLoader,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '$childId',
    loader: ({ params }) => childLoader(params.childId),
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([layoutRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/layout'] }),
  })

  await router.load()
  expect(layoutLoader).toHaveBeenCalledTimes(1)
  vi.setSystemTime(2_000)

  await router.preloadRoute({
    to: '/layout/$childId',
    params: { childId: 'one' },
  })
  expect(layoutLoader).toHaveBeenCalledTimes(1)
  expect(childLoader).toHaveBeenNthCalledWith(1, 'one')

  await router.preloadRoute({
    to: '/layout/$childId',
    params: { childId: 'two' },
  })

  expect(layoutLoader).toHaveBeenCalledTimes(1)
  expect(childLoader).toHaveBeenCalledTimes(2)
  expect(childLoader).toHaveBeenNthCalledWith(2, 'two')
})

// Public contract: the public stale/gc options determine whether user loader
// code runs. A read-only preload must not silently shorten a navigation-owned
// cache entry's lifetime.
test('fresh navigation data keeps its gc policy when a preload reuses it', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)

  let revision = 0
  const loader = vi.fn(() => ++revision)
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    gcTime: 30 * 60_000,
    preloadGcTime: 30_000,
    preloadStaleTime: 10 * 60_000,
    staleTime: Infinity,
    loader,
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  vi.setSystemTime(61_000)
  await router.preloadRoute({ to: '/reports' })
  await router.navigate({ to: '/other' })
  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(1)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe(1)

  await router.navigate({ to: '/' })
  vi.setSystemTime(1_000 + 31 * 60_000)
  await router.navigate({ to: '/other' })
  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(2)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe(2)
})

// Public contract: clearCache must remain authoritative even if an older
// preload finishes unrelated asset work after the clear.
test('clearCache during an in-flight preload cannot resurrect its borrowed data', async () => {
  const headGate = createControlledPromise<{
    meta: Array<{ title: string }>
  }>()
  let revision = 0
  let headCalls = 0
  const loader = vi.fn(() => ++revision)
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    staleTime: Infinity,
    preloadStaleTime: Infinity,
    loader,
    head: () => {
      headCalls++
      return headCalls === 1 ? { meta: [{ title: 'Reports' }] } : headGate
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  const preload = router.preloadRoute({ to: '/reports' })
  await vi.waitFor(() => expect(headCalls).toBe(2))
  expect(headGate.status).toBe('pending')
  router.clearCache()
  headGate.resolve({ meta: [{ title: 'Preloaded Reports' }] })
  await preload

  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(2)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe(2)
})

test('clearCache cancels a brand-new in-flight preload before it can populate the cache', async () => {
  const firstLoad = createControlledPromise<string>()
  const loader = vi
    .fn<() => string | Promise<string>>()
    .mockImplementationOnce(() => firstLoad)
    .mockReturnValue('navigation data')
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    preloadStaleTime: Infinity,
    staleTime: Infinity,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/reports' })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

  router.clearCache()
  firstLoad.resolve('obsolete preload data')
  await preload
  await router.navigate({ to: '/reports' })

  expect(loader).toHaveBeenCalledTimes(2)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe('navigation data')
})

test('clearCache does not reserve a discarded preload for a navigation in beforeLoad', async () => {
  const navigationBeforeLoad = createControlledPromise<void>()
  let preloadSignal: AbortSignal | undefined
  const beforeLoad = vi.fn(({ preload }: { preload: boolean }) =>
    preload ? undefined : navigationBeforeLoad,
  )
  const loader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      const generation = loader.mock.calls.length
      if (generation !== 1) {
        return 'fresh navigation data'
      }
      preloadSignal = abortController.signal
      return new Promise<string>((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => reject(abortController.signal.reason),
          { once: true },
        )
      })
    },
  )
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    beforeLoad,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/target' })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())
  const navigation = router.navigate({ to: '/target' })
  await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

  router.clearCache({
    filter: (match) => match.routeId === targetRoute.id,
  })
  await vi.waitFor(() => expect(preloadSignal?.aborted).toBe(true))
  await preload

  navigationBeforeLoad.resolve()
  await navigation
  expect(loader).toHaveBeenCalledTimes(2)
  expect(router.state.matches.at(-1)?.loaderData).toBe('fresh navigation data')
})

test('clearCache does not abort loader work still used by a navigation', async () => {
  const loaderGate = createControlledPromise<string>()
  let loaderSignal: AbortSignal | undefined
  const beforeLoad = vi.fn()
  const loader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      loaderSignal = abortController.signal
      return loaderGate
    },
  )
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    beforeLoad,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/target' })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())
  const navigation = router.navigate({ to: '/target' })
  await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

  router.clearCache({
    filter: (match) => match.routeId === targetRoute.id,
  })
  expect(loaderSignal?.aborted).toBe(false)

  loaderGate.resolve('shared loader data')
  await Promise.all([preload, navigation])

  expect(loader).toHaveBeenCalledOnce()
  expect(router.state.matches.at(-1)?.loaderData).toBe('shared loader data')
})

test('clearCache leaves cache authority intact when its filter throws', async () => {
  let firstSignal: AbortSignal | undefined
  let secondSignal: AbortSignal | undefined
  const rootRoute = new BaseRootRoute({})
  const firstRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    loader: ({ abortController }) => {
      firstSignal = abortController.signal
      return 'first data'
    },
  })
  const secondRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    loader: ({ abortController }) => {
      secondSignal = abortController.signal
      return 'second data'
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.preloadRoute({ to: '/first' })
  await router.preloadRoute({ to: '/second' })
  const filterError = new Error('filter failed')

  expect(() =>
    router.clearCache({
      filter: (match) => {
        if (match.routeId === firstRoute.id) {
          return true
        }
        if (match.routeId === secondRoute.id) {
          throw filterError
        }
        return false
      },
    }),
  ).toThrow(filterError)
  expect(firstSignal?.aborted).toBe(false)
  expect(secondSignal?.aborted).toBe(false)

  router.clearCache()
  expect(firstSignal?.aborted).toBe(true)
  expect(secondSignal?.aborted).toBe(true)
})

test('clearCache installs replacement authorities before abort listeners reenter', async () => {
  let reentrantNavigation: Promise<void> | undefined
  let router: ReturnType<typeof createTestRouter>
  const loader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      const generation = loader.mock.calls.length
      if (generation !== 2) {
        return `generation ${generation}`
      }
      return new Promise<string>((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            reentrantNavigation = router.navigate({ to: '/target' })
            reject(abortController.signal.reason)
          },
          { once: true },
        )
      })
    },
  )
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    staleTime: Infinity,
    preloadStaleTime: 0,
    loader,
  })
  router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/target' })
  await router.navigate({ to: '/' })

  const preload = router.preloadRoute({ to: '/target' })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
  router.clearCache()

  await reentrantNavigation
  await preload
  expect(loader).toHaveBeenCalledTimes(3)
  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.matches.at(-1)?.loaderData).toBe('generation 3')
})

test('clearCache detaches every discarded flight before abort listeners reenter', async () => {
  let reentrantNavigation: Promise<void> | undefined
  let router: ReturnType<typeof createTestRouter>
  const firstBeforeLoad = vi.fn(
    ({ abortController }: { abortController: AbortController }) =>
      new Promise<void>((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            reentrantNavigation = router.navigate({ to: '/second' })
            reject(abortController.signal.reason)
          },
          { once: true },
        )
      }),
  )
  const secondLoader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      const generation = secondLoader.mock.calls.length
      if (generation > 1) {
        return `generation ${generation}`
      }
      return new Promise<string>((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => reject(abortController.signal.reason),
          { once: true },
        )
      })
    },
  )
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const firstRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    beforeLoad: firstBeforeLoad,
  })
  const secondRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    loader: secondLoader,
  })
  router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const firstPreload = router.preloadRoute({ to: '/first' })
  await vi.waitFor(() => expect(firstBeforeLoad).toHaveBeenCalledOnce())
  const secondPreload = router.preloadRoute({ to: '/second' })
  await vi.waitFor(() => expect(secondLoader).toHaveBeenCalledOnce())

  router.clearCache()

  await reentrantNavigation
  await Promise.all([firstPreload, secondPreload])
  expect(secondLoader).toHaveBeenCalledTimes(2)
  expect(router.state.location.pathname).toBe('/second')
  expect(router.state.matches.at(-1)?.loaderData).toBe('generation 2')
})

test('filtered clearCache keeps shared loader work discoverable through a retained preload', async () => {
  const layoutGate = createControlledPromise<string>()
  const layoutLoader = vi.fn(() => layoutGate)
  const rootRoute = new BaseRootRoute({})
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/layout',
    loader: layoutLoader,
  })
  const firstBeforeLoad = vi.fn()
  const firstRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/first',
    beforeLoad: firstBeforeLoad,
  })
  const secondBeforeLoad = vi.fn()
  const secondLoader = vi.fn(() => 'second data')
  const secondRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/second',
    beforeLoad: secondBeforeLoad,
    loader: secondLoader,
  })
  const thirdBeforeLoad = vi.fn()
  const thirdLoader = vi.fn(() => 'third data')
  const thirdRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/third',
    beforeLoad: thirdBeforeLoad,
    loader: thirdLoader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      layoutRoute.addChildren([firstRoute, secondRoute, thirdRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const firstPreload = router.preloadRoute({ to: '/layout/first' })
  const secondPreload = router.preloadRoute({ to: '/layout/second' })
  await vi.waitFor(() => {
    expect(firstBeforeLoad).toHaveBeenCalledOnce()
    expect(secondBeforeLoad).toHaveBeenCalledOnce()
    expect(layoutLoader).toHaveBeenCalledOnce()
    expect(secondLoader).toHaveBeenCalledOnce()
  })

  router.clearCache({
    filter: (match) => match.routeId === firstRoute.id,
  })
  const thirdPreload = router.preloadRoute({ to: '/layout/third' })
  await vi.waitFor(() => {
    expect(thirdBeforeLoad).toHaveBeenCalledOnce()
    expect(thirdLoader).toHaveBeenCalledOnce()
  })

  expect(layoutLoader).toHaveBeenCalledOnce()
  layoutGate.resolve('layout data')
  await Promise.all([firstPreload, secondPreload, thirdPreload])
})

test('independent concurrent preloads both populate the cache', async () => {
  const firstGate = createControlledPromise<string>()
  const secondGate = createControlledPromise<string>()
  const firstLoader = vi.fn(() => firstGate)
  const secondLoader = vi.fn(() => secondGate)
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const firstRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    preloadStaleTime: Infinity,
    loader: firstLoader,
  })
  const secondRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    preloadStaleTime: Infinity,
    loader: secondLoader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const firstPreload = router.preloadRoute({ to: '/first' })
  const secondPreload = router.preloadRoute({ to: '/second' })
  await vi.waitFor(() => {
    expect(firstLoader).toHaveBeenCalledOnce()
    expect(secondLoader).toHaveBeenCalledOnce()
  })

  firstGate.resolve('first data')
  await firstPreload
  secondGate.resolve('second data')
  await secondPreload

  await router.navigate({ to: '/first' })
  await router.navigate({ to: '/second' })
  expect(firstLoader).toHaveBeenCalledOnce()
  expect(secondLoader).toHaveBeenCalledOnce()
})

test.each([
  ['unfiltered', undefined, true],
  ['filtered affected', 'target', true],
  ['filtered unaffected', 'home', false],
] as const)(
  '%s invalidation preserves the correct preload generation',
  async (_mode, selected, shouldReload) => {
    const oldLoaderGate = createControlledPromise<string>()
    let generation = 1
    const loader = vi.fn(() =>
      loader.mock.calls.length === 1
        ? oldLoaderGate
        : `generation ${generation}`,
    )
    const rootRoute = new BaseRootRoute({})
    const homeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      preloadStaleTime: Infinity,
      staleTime: Infinity,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/target' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())

    generation = 2
    await (selected
      ? router.invalidate({
          filter: (match) =>
            match.routeId ===
            (selected === 'target' ? targetRoute.id : homeRoute.id),
        })
      : router.invalidate())

    oldLoaderGate.resolve('generation 1')
    await preload
    await router.navigate({ to: '/target' })

    expect(loader).toHaveBeenCalledTimes(shouldReload ? 2 : 1)
    expect(router.state.matches.at(-1)?.loaderData).toBe(
      `generation ${shouldReload ? 2 : 1}`,
    )
  },
)

test('filtering only an active preload invalidates seeded same-ID cache data', async () => {
  const replacementGate = createControlledPromise<string>()
  const loader = vi.fn(() => {
    const generation = loader.mock.calls.length
    return generation === 2 ? replacementGate : `generation ${generation}`
  })
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    validateSearch: (search: Record<string, unknown>) => ({
      revision: Number(search.revision ?? 1),
    }),
    preloadStaleTime: 0,
    staleTime: Infinity,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/target', search: { revision: 1 } })
  await router.navigate({ to: '/' })
  const preload = router.preloadRoute({
    to: '/target',
    search: { revision: 2 },
  })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

  await router.invalidate({
    filter: (match) =>
      match.routeId === targetRoute.id &&
      (match.search as { revision?: number }).revision === 2,
  })
  replacementGate.resolve('obsolete generation 2')
  await preload
  await router.navigate({ to: '/target' })

  await vi.waitFor(() => {
    expect(loader).toHaveBeenCalledTimes(3)
    expect(router.state.matches.at(-1)?.loaderData).toBe('generation 3')
  })
})

test('invalidation wins after a preload loader settles but before it publishes', async () => {
  let invalidation: Promise<void> | undefined
  let generation = 0
  let router: ReturnType<typeof createTestRouter>
  const loader = vi.fn(() => {
    const data = `generation ${++generation}`
    if (generation === 1) {
      // Schedule invalidation after the loader outcome has fulfilled while the
      // preload lane's cache publication is still queued.
      let turn = Promise.resolve()
      for (let index = 0; index < 4; index++) {
        turn = turn.then()
      }
      invalidation = turn.then(() => router.invalidate())
    }
    return data
  })
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    preloadStaleTime: Infinity,
    staleTime: Infinity,
    loader,
  })
  router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/target' })
  await vi.waitFor(() => expect(invalidation).toBeDefined())
  await invalidation
  await preload
  await router.navigate({ to: '/target' })

  await vi.waitFor(() => {
    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe('generation 2')
  })
})

// Preload lanes are not cancelled by unrelated navigations: an in-flight
// async beforeLoad runs to completion, its loader still executes and seeds
// the cache, and a later navigation to the target reuses that work.
test('an unrelated navigation does not cancel an in-flight preload beforeLoad', async () => {
  const beforeLoadGate = createControlledPromise<{ token: string }>()
  const beforeLoad = vi.fn(() => beforeLoadGate)
  const loader = vi.fn(() => 'target data')
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    preloadStaleTime: Infinity,
    staleTime: Infinity,
    beforeLoad,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, otherRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/target' })
  await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))

  // Unrelated navigation commits while the preload's beforeLoad is pending.
  await router.navigate({ to: '/other' })
  expect(router.state.location.pathname).toBe('/other')

  beforeLoadGate.resolve({ token: 'ctx' })
  await preload
  // The preload completed its work despite the navigation.
  expect(loader).toHaveBeenCalledTimes(1)

  // Navigating to the target consumes the seeded cache without a new load.
  await router.navigate({ to: '/target' })
  expect(router.state.location.pathname).toBe('/target')
  expect(
    router.state.matches.find((match) => match.routeId === targetRoute.id)
      ?.loaderData,
  ).toBe('target data')
  expect(loader).toHaveBeenCalledTimes(1)
})
