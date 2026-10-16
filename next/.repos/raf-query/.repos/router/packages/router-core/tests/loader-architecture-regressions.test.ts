import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test.each([
  ['error', () => new Error('parent failed')],
  ['notFound', () => notFound()],
] as const)(
  'a child can redirect after observing its parent loader %s',
  async (expectedStatus, createFailure) => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw createFailure()
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async ({ parentMatchPromise }) => {
        const parent = await parentMatchPromise
        if (parent.status === expectedStatus) {
          throw redirect({ to: '/target' })
        }
        return parent.status
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
        targetRoute,
      ]),
      history: createMemoryHistory({
        initialEntries: ['/parent/child'],
      }),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
  },
)

test.each(['client', 'server'] as const)(
  'a descendant self-abort cannot hide redirecting onError on the %s',
  async (environment) => {
    const parentGate = createControlledPromise<void>()
    const childGate = createControlledPromise<void>()
    const parentOnError = vi.fn()
    const childOnError = vi.fn(() => {
      throw redirect({ to: '/target' })
    })
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: async () => {
        await parentGate
        throw new Error('parent failed')
      },
      onError: parentOnError,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async ({ abortController }) => {
        await childGate
        abortController.abort()
        throw new Error('child failed')
      },
      onError: childOnError,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: environment === 'server',
    })

    const loading =
      environment === 'server'
        ? loadServerResponse(router, '/parent/child')
        : router.load()
    parentGate.resolve()
    await vi.waitFor(() => expect(parentOnError).toHaveBeenCalledOnce())
    childGate.resolve()
    await vi.waitFor(() => expect(childOnError).toHaveBeenCalledOnce())

    if (environment === 'server') {
      const response = await loading
      expect(response).toBeDefined()
      if (!response) {
        return
      }
      expect(response.status).toBe(307)
      expect(response.headers.get('Location')).toBe('/target')
    } else {
      await loading
      expect(router.state.location.pathname).toBe('/target')
    }
  },
)

test('superseding a load clears fetching state from the still-presented lane', async () => {
  const firstGate = createControlledPromise<void>()
  const secondGate = createControlledPromise<void>()
  const rootRoute = new BaseRootRoute({})
  const pageRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    validateSearch: (search: Record<string, unknown>) => ({
      revision: Number(search.revision ?? 0),
    }),
    beforeLoad: ({ search }) => (search.revision === 1 ? firstGate : undefined),
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    loader: () => secondGate,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([pageRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  await router.load()
  const firstNavigation = router.navigate({
    to: '/page',
    search: { revision: 1 },
  })
  await vi.waitFor(() =>
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      isFetching: 'beforeLoad',
    }),
  )

  const secondNavigation = router.navigate({ to: '/other' })
  await vi.waitFor(() => {
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      isFetching: false,
    })
  })

  firstGate.resolve()
  secondGate.resolve()
  await Promise.all([firstNavigation, secondNavigation])
})

test('an ignored preload flight is released after a navigation has planned its loaders', async () => {
  const preloadFailure = createControlledPromise<string>()
  const childGate = createControlledPromise<string>()
  let preloadSignal: AbortSignal | undefined
  const parentLoader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      const generation = parentLoader.mock.calls.length
      if (generation === 1) {
        return 'initial parent data'
      }
      preloadSignal = abortController.signal
      return preloadFailure
    },
  )
  const childLoader = vi.fn(() => childGate)
  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    shouldReload: ({ preload }) => preload,
    loader: parentLoader,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: childLoader,
  })
  const siblingRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/sibling',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([childRoute, siblingRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/parent'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/parent/sibling' })
  await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))

  const navigation = router.navigate({ to: '/parent/child' })
  await vi.waitFor(() => expect(childLoader).toHaveBeenCalledOnce())

  preloadFailure.reject(new Error('discarded preload generation'))
  await preload
  expect(preloadSignal?.aborted).toBe(true)

  childGate.resolve('child data')
  await navigation
})

test('an ordinary route-context failure still permits ancestor loaders', async () => {
  const failure = new Error('child context failed')
  const parentLoader = vi.fn(() => 'parent data')
  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: parentLoader,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    context: () => {
      throw failure
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  await router.load()

  expect(parentLoader).toHaveBeenCalledOnce()
  expect(
    router.state.matches.find((match) => match.routeId === parentRoute.id),
  ).toMatchObject({
    status: 'success',
    loaderData: 'parent data',
  })
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: childRoute.id,
    status: 'error',
    error: failure,
  })
})

test('a failed route context is recomputed when the route is retried', async () => {
  const failure = new Error('context failed')
  let shouldFail = true
  let generation = 0
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    context: () => {
      generation++
      if (shouldFail) {
        throw failure
      }
      return { generation }
    },
    loader: ({ context }) => context.generation,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: route.id,
    status: 'error',
    error: failure,
  })

  shouldFail = false
  await router.invalidate()

  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: route.id,
    status: 'success',
    loaderData: 2,
  })
})

test('invalidation reruns the loader with same-id route context', async () => {
  let contextGeneration = 0
  let loaderGeneration = 0
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    context: () => ({ generation: ++contextGeneration }),
    loader: ({ context }) => ({
      loader: ++loaderGeneration,
      context: context.generation,
    }),
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  expect(router.state.matches.at(-1)?.loaderData).toEqual({
    loader: 1,
    context: 1,
  })

  await router.invalidate()

  expect(router.state.matches.at(-1)?.loaderData).toEqual({
    loader: 2,
    context: 1,
  })
})

test("a settled preload cannot abort a navigation's beforeLoad controller", async () => {
  const suspended = createControlledPromise<void>()
  let navigationSignal: AbortSignal | undefined
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const guardedRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/guarded',
    beforeLoad: ({ abortController, preload }) => {
      if (!preload) {
        navigationSignal = abortController.signal
      }
      throw suspended
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/guarded' })
  const navigation = router.navigate({ to: '/guarded' })

  await preload
  expect(navigationSignal?.aborted).toBe(false)

  await navigation
})

test('a fast background candidate remains private when a reentrant navigation wins', async () => {
  let parentLoads = 0
  let childLoads = 0
  let activeSignal: AbortSignal | undefined
  let replacementSignal: AbortSignal | undefined
  let reentrantNavigation: Promise<void> | undefined

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    validateSearch: (search: Record<string, unknown>) => ({
      reload: Number(search.reload ?? 0),
    }),
    shouldReload: ({ location }) =>
      (location.search as { reload: number }).reload === 1,
    loader: ({ abortController }) => {
      parentLoads++
      if (parentLoads === 1) {
        activeSignal = abortController.signal
      } else {
        replacementSignal = abortController.signal
      }
      return { revision: parentLoads }
    },
    onStay: (match) => {
      if (match.search.reload === 1 && !reentrantNavigation) {
        reentrantNavigation = router.navigate({
          to: '/parent/child',
          search: { reload: 2 },
        })
      }
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    shouldReload: ({ location }) =>
      (location.search as { reload: number }).reload === 1,
    loader: () => {
      childLoads++
      if (childLoads === 2) {
        throw redirect({ to: '/target' })
      }
      return 'child data'
    },
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
      targetRoute,
    ]),
    history: createMemoryHistory({
      initialEntries: ['/parent/child?reload=0'],
    }),
  })

  await router.load()
  await router.navigate({
    to: '/parent/child',
    search: { reload: 1 },
  })
  await reentrantNavigation

  expect(router.state.location.search).toEqual({ reload: 2 })
  expect(
    router.state.matches.find((match) => match.routeId === parentRoute.id),
  ).toMatchObject({ loaderData: { revision: 1 } })
  expect(parentLoads).toBe(2)
  expect(activeSignal?.aborted).toBe(false)
  expect(replacementSignal?.aborted).toBe(true)
})

test('a superseding navigation reuses a pending background loader after async beforeLoad', async () => {
  const backgroundResult = createControlledPromise<number>()
  const beforeLoadStarted = createControlledPromise<void>()
  const beforeLoadGate = createControlledPromise<void>()
  const signals: Array<AbortSignal> = []
  let generation = 0

  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    validateSearch: (search: Record<string, unknown>) => ({
      reload: Number(search.reload ?? 0),
    }),
    shouldReload: ({ location }) =>
      (location.search as { reload: number }).reload === 1 ? true : undefined,
    beforeLoad: async ({ search }) => {
      if (search.reload === 2) {
        beforeLoadStarted.resolve()
        await beforeLoadGate
      }
    },
    loader: {
      staleReloadMode: 'background',
      handler: ({ abortController }) => {
        signals.push(abortController.signal)
        generation++
        return generation === 2 ? backgroundResult : generation
      },
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({
      initialEntries: ['/page?reload=0'],
    }),
  })

  await router.load()
  await router.navigate({
    to: '/page',
    search: { reload: 1 },
  })
  await vi.waitFor(() => expect(generation).toBe(2))

  const successor = router.navigate({
    to: '/page',
    search: { reload: 2 },
  })
  await beforeLoadStarted

  backgroundResult.resolve(2)
  beforeLoadGate.resolve()
  await successor

  await vi.waitFor(() => {
    expect(router.state.matches.at(-1)?.loaderData).toBe(2)
  })
  expect(generation).toBe(2)
  expect(signals[1]?.aborted).toBe(false)
  expect(router.state.matches.at(-1)?.preload).toBe(false)
})

test('an ancestor beforeLoad failure releases an unconsumed background loader', async () => {
  const backgroundResult = createControlledPromise<number>()
  const signals: Array<AbortSignal> = []
  let generation = 0

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    validateSearch: (search: Record<string, unknown>) => ({
      phase: String(search.phase ?? 'initial'),
    }),
    beforeLoad: ({ search }) => {
      if (search.phase === 'fail') {
        throw new Error('parent failed')
      }
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    shouldReload: ({ location }) =>
      (location.search as { phase: string }).phase === 'refresh'
        ? true
        : undefined,
    staleTime: Infinity,
    loader: {
      staleReloadMode: 'background',
      handler: ({ abortController }) => {
        signals.push(abortController.signal)
        generation++
        return generation === 2 ? backgroundResult : generation
      },
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({
      initialEntries: ['/parent/child?phase=initial'],
    }),
  })

  await router.load()
  await router.navigate({
    to: '/parent/child',
    search: { phase: 'refresh' },
  })
  await vi.waitFor(() => expect(generation).toBe(2))

  await router.navigate({
    to: '/parent/child',
    search: { phase: 'fail' },
  })

  expect(
    router.state.matches.find((match) => match.routeId === parentRoute.id),
  ).toMatchObject({ status: 'error' })
  expect(signals[1]?.aborted).toBe(true)

  backgroundResult.resolve(2)
  await router.navigate({
    to: '/parent/child',
    search: { phase: 'recovered' },
  })

  expect(generation).toBe(2)
  expect(router.state.matches.at(-1)?.loaderData).toBe(1)
})

test('reentrant navigation from onError cancels stale serial work', async () => {
  const failure = new Error('stale context failed')
  const parentLoader = vi.fn(() => 'parent data')
  let successor: Promise<void> | undefined

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: parentLoader,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    context: () => {
      throw failure
    },
    onError: () => {
      successor ??= router.navigate({ to: '/target' })
    },
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
      targetRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/parent/child' })
  await successor

  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.matches.at(-1)?.routeId).toBe(targetRoute.id)
  expect(router.state.matches.some((match) => match.error === failure)).toBe(
    false,
  )
  expect(parentLoader).not.toHaveBeenCalled()
})

test('a joined descendant loader redirect still wins after an ancestor loader fails', async () => {
  const childStarted = createControlledPromise<void>()
  const childRedirect = createControlledPromise<void>()
  const ancestorFailure = new Error('navigation parent failed')
  let childLoads = 0

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    validateSearch: (search: Record<string, unknown>) => ({
      mode: String(search.mode ?? ''),
    }),
    loaderDeps: ({ search }) => ({ mode: search.mode }),
    loader: ({ location }) => {
      if ((location.search as { mode: string }).mode === 'navigation') {
        throw ancestorFailure
      }
      return 'preload parent data'
    },
    errorComponent: () => null,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: async () => {
      childLoads++
      if (childLoads === 1) {
        childStarted.resolve()
        await childRedirect
        throw redirect({ to: '/target' })
      }
      return 'retried child data'
    },
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
      targetRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({
    to: '/parent/child',
    search: { mode: 'preload' },
  })
  await childStarted

  const navigation = router.navigate({
    to: '/parent/child',
    search: { mode: 'navigation' },
  })
  childRedirect.resolve()
  await Promise.all([preload, navigation])

  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: targetRoute.id,
    status: 'success',
  })
  expect(childLoads).toBe(1)
})

test('an unrelated preload redirect does not override a navigation error', async () => {
  const preloadChildStarted = createControlledPromise<void>()
  const releasePreloadRedirect = createControlledPromise<void>()
  const navigationFailure = new Error('navigation parent failed')

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    validateSearch: (search: Record<string, unknown>) => ({
      mode: String(search.mode ?? ''),
    }),
    loaderDeps: ({ search }) => ({ mode: search.mode }),
    loader: ({ deps }) => {
      if (deps.mode === 'navigation') {
        throw navigationFailure
      }
      return 'preload parent data'
    },
    errorComponent: () => null,
  })
  const childLoader = vi.fn(async ({ deps }: { deps: { mode: string } }) => {
    if (deps.mode === 'preload') {
      preloadChildStarted.resolve()
      await releasePreloadRedirect
      throw redirect({ to: '/target' })
    }
    return 'navigation child data'
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loaderDeps: ({ search }) => ({ mode: search.mode }),
    loader: childLoader,
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
      targetRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({
    to: '/parent/child',
    search: { mode: 'preload' },
  })
  await preloadChildStarted

  await router.navigate({
    to: '/parent/child',
    search: { mode: 'navigation' },
  })

  expect(router.state.location).toMatchObject({
    pathname: '/parent/child',
    search: { mode: 'navigation' },
  })
  expect(
    router.state.matches.find((match) => match.routeId === parentRoute.id),
  ).toMatchObject({
    status: 'error',
    error: navigationFailure,
  })
  expect(childLoader).toHaveBeenCalledTimes(2)

  releasePreloadRedirect.resolve()
  const preloaded = await preload

  expect(preloaded?.at(-1)?.routeId).toBe(targetRoute.id)
  expect(router.state.location).toMatchObject({
    pathname: '/parent/child',
    search: { mode: 'navigation' },
  })
  expect(
    router.state.matches.find((match) => match.routeId === parentRoute.id),
  ).toMatchObject({
    status: 'error',
    error: navigationFailure,
  })
})

test('a loaderDeps error is handled by the route error boundary', async () => {
  const failure = new Error('loader deps failed')
  const rootRoute = new BaseRootRoute({})
  const brokenRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/broken',
    loaderDeps: (): Record<string, never> => {
      throw failure
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([brokenRoute]),
    history: createMemoryHistory({ initialEntries: ['/broken'] }),
  })

  await router.load()

  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: brokenRoute.id,
    status: 'error',
    error: failure,
  })
})

test('loaderDeps redirects use the bounded navigation redirect policy', async () => {
  const rootRoute = new BaseRootRoute({})
  const routes = Array.from(
    { length: 23 },
    (_, index) =>
      new BaseRoute({
        getParentRoute: () => rootRoute,
        path: `/step-${index}`,
        loaderDeps:
          index === 22
            ? undefined
            : () => {
                throw redirect({ to: `/step-${index + 1}` })
              },
      }),
  )
  const router = createTestRouter({
    routeTree: rootRoute.addChildren(routes as any) as any,
    history: createMemoryHistory({ initialEntries: ['/step-0'] }),
  })

  await router.load()

  expect(router.state.location.pathname).toBe('/step-20')
  expect(
    router.state.matches.find((match) => match.status !== 'success'),
  ).toMatchObject({
    routeId: rootRoute.id,
    status: 'error',
    error: expect.objectContaining({
      message: 'Too many redirects',
    }),
  })
})

test('a reentrant user navigation starts a fresh redirect chain', async () => {
  let navigateFresh: () => void
  const rootRoute = new BaseRootRoute({})
  const chain = Array.from(
    { length: 20 },
    (_, index) =>
      new BaseRoute({
        getParentRoute: () => rootRoute,
        path: `/chain-${index}`,
        beforeLoad:
          index < 19
            ? () => {
                throw redirect({ to: `/chain-${index + 1}` })
              }
            : () => navigateFresh(),
      }),
  )
  const freshRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/fresh',
    beforeLoad: () => {
      throw redirect({ to: '/target' })
    },
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      ...(chain as any),
      freshRoute,
      targetRoute,
    ]) as any,
    history: createMemoryHistory({ initialEntries: ['/chain-0'] }),
  })
  navigateFresh = () => {
    void router.navigate({ to: '/fresh' })
  }

  await router.load()

  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: targetRoute.id,
    status: 'success',
  })
})

test('a superseded load settles without waiting for stale asset projection', async () => {
  const slowHeadStarted = createControlledPromise<void>()
  const slowHead = createControlledPromise<{
    meta: Array<{ title: string }>
  }>()
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const slowRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/slow',
    head: () => {
      slowHeadStarted.resolve()
      return slowHead
    },
    scripts: () => [{ children: 'window.route = "slow"' }],
    headers: () => ({ 'x-route': 'slow' }),
  })
  const fastRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/fast',
    head: () => ({ meta: [{ title: 'fast' }] }),
    scripts: () => [{ children: 'window.route = "fast"' }],
    headers: () => ({ 'x-route': 'fast' }),
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, slowRoute, fastRoute]),
    history,
  })

  await router.load()
  history.push('/slow')
  const slowLoad = router.load()
  await slowHeadStarted

  history.push('/fast')
  const fastLoad = router.load()
  await fastLoad

  const settledBeforeProjection = await Promise.race([
    slowLoad.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
  ])

  slowHead.resolve({ meta: [{ title: 'slow' }] })
  await slowLoad
  await Promise.resolve()

  expect(settledBeforeProjection).toBe(true)
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: fastRoute.id,
    meta: [{ title: 'fast' }],
    scripts: [{ children: 'window.route = "fast"' }],
  })
})

test('server response headers stop at the terminal render boundary', async () => {
  let failParent = false
  const rootRoute = new BaseRootRoute({
    headers: () => ({ 'x-root': 'root' }),
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: () => {
      if (failParent) {
        throw new Error('parent failed')
      }
    },
    headers: () => ({ 'x-parent': 'parent' }),
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    headers: () => ({ 'x-child': 'child' }),
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    isServer: true,
  })

  await router.load()
  expect(router.state.matches.at(-1)?.headers).toEqual({ 'x-child': 'child' })

  failParent = true
  const response = await loadServerResponse(router, '/parent/child')

  expect(router.state.matches).toHaveLength(3)
  expect(router.state.matches[1]).toMatchObject({
    routeId: parentRoute.id,
    status: 'error',
  })
  expect(response.headers.get('x-root')).toBe('root')
  expect(response.headers.get('x-parent')).toBe('parent')
  expect(response.headers.get('x-child')).toBeNull()
})

test('a superseded load settles without waiting for its normal component chunk', async () => {
  const chunkStarted = createControlledPromise<void>()
  const chunk = createControlledPromise<void>()
  const onError = vi.fn()
  const component = Object.assign(() => null, {
    preload: () => {
      chunkStarted.resolve()
      return chunk
    },
  })
  const rootRoute = new BaseRootRoute({})
  const slowRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/slow',
    component,
    onError,
  })
  const fastRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/fast',
  })
  const history = createMemoryHistory({ initialEntries: ['/slow'] })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([slowRoute, fastRoute]),
    history,
  })

  const slowLoad = router.load()
  await chunkStarted
  history.push('/fast')
  await router.load()

  expect(
    await Promise.race([
      slowLoad.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
    ]),
  ).toBe(true)
  expect(router.state.matches.at(-1)?.routeId).toBe(fastRoute.id)

  chunk.reject(new Error('obsolete chunk failed'))
  await Promise.resolve()
  expect(onError).not.toHaveBeenCalled()
})

test('a superseded load settles without waiting for its terminal boundary chunk', async () => {
  const chunkStarted = createControlledPromise<void>()
  const chunk = createControlledPromise<void>()
  const loaderError = new Error('loader failed')
  const onError = vi.fn()
  const errorComponent = Object.assign(() => null, {
    preload: () => {
      chunkStarted.resolve()
      return chunk
    },
  })
  const rootRoute = new BaseRootRoute({})
  const slowRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/slow',
    loader: () => {
      throw loaderError
    },
    errorComponent,
    onError,
  })
  const fastRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/fast',
  })
  const history = createMemoryHistory({ initialEntries: ['/slow'] })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([slowRoute, fastRoute]),
    history,
  })

  const slowLoad = router.load()
  await chunkStarted
  history.push('/fast')
  await router.load()

  expect(
    await Promise.race([
      slowLoad.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
    ]),
  ).toBe(true)
  expect(router.state.matches.at(-1)?.routeId).toBe(fastRoute.id)

  chunk.reject(new Error('obsolete boundary chunk failed'))
  await Promise.resolve()
  expect(onError).toHaveBeenCalledOnce()
  expect(onError).toHaveBeenCalledWith(loaderError)
})

test('a stale shouldReload cannot continue a superseded preload', async () => {
  const loader = vi.fn(() => 'cached')
  const onError = vi.fn()
  let reenter = false
  let winner: Promise<void> | undefined
  let router: ReturnType<typeof createTestRouter>
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const cachedRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/cached',
    preloadStaleTime: 0,
    shouldReload: () => {
      if (reenter) {
        router.history.push('/winner')
        winner = router.load()
        throw new Error('obsolete shouldReload failure')
      }
      return true
    },
    loader,
    onError,
  })
  const winnerRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/winner',
  })
  router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, cachedRoute, winnerRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.preloadRoute({ to: '/cached' })
  reenter = true
  await router.preloadRoute({ to: '/cached' })
  await winner

  expect(router.state.location.pathname).toBe('/winner')
  expect(router.state.matches.at(-1)?.routeId).toBe(winnerRoute.id)
  expect(loader).toHaveBeenCalledOnce()
  // Preload lanes run to completion despite the navigation, so the stale
  // shouldReload's failure surfaces through onError (matching pre-rewrite
  // behavior for preload errors) — but it cannot restart the loader or
  // disturb the winning navigation.
  expect(onError).toHaveBeenCalledOnce()
})

test('an onLeave navigation to the in-flight destination runs a fresh lane', async () => {
  const beforeLoad = vi.fn()
  const firstEnter = vi.fn()
  const firstStay = vi.fn()
  let successor: Promise<void> | undefined
  let redirected = false
  let router: ReturnType<typeof createTestRouter>

  const rootRoute = new BaseRootRoute({})
  const fromRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/from',
    onLeave: () => {
      if (!redirected) {
        redirected = true
        successor = router.navigate({ to: '/first' })
      }
    },
  })
  const firstRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    beforeLoad,
    onEnter: firstEnter,
    onStay: firstStay,
  })
  router = createTestRouter({
    routeTree: rootRoute.addChildren([fromRoute, firstRoute]),
    history: createMemoryHistory({ initialEntries: ['/from'] }),
  })

  await router.load()
  await router.navigate({ to: '/first' })
  await successor

  expect(router.state.location.pathname).toBe('/first')
  expect(router.state.matches.at(-1)?.routeId).toBe(firstRoute.id)
  expect(beforeLoad).toHaveBeenCalledTimes(2)
  expect(firstEnter.mock.calls.length + firstStay.mock.calls.length).toBe(1)
})
