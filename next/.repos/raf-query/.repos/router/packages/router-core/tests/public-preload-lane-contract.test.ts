import { afterEach, describe, expect, onTestFinished, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.useRealTimers()
})

describe('public preload lane contracts', () => {
  test('completed preload matches retain context without caching beforeLoad context', async () => {
    let beforeLoadGeneration = 0
    const loader = vi.fn(() => 'loader data')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      context: () => ({ routeContext: true }),
      beforeLoad: () => ({ generation: ++beforeLoadGeneration }),
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preloaded = await router.preloadRoute({ to: '/target' })

    expect(preloaded?.at(-1)?.context).toEqual({
      routeContext: true,
      generation: 1,
    })

    await router.navigate({ to: '/target' })

    expect(router.state.matches.at(-1)?.context).toEqual({
      routeContext: true,
      generation: 2,
    })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('every active preload runs beforeLoad even for an identical location', async () => {
    const gates = new Map<
      number,
      ReturnType<typeof createControlledPromise<void>>
    >()
    const beforeLoad = vi.fn(({ search }: { search: { version: number } }) => {
      let gate = gates.get(search.version)
      if (!gate) {
        gate = createControlledPromise<void>()
        gates.set(search.version, gate)
      }
      return gate
    })
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        version: Number(search.version),
      }),
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      stringifySearch: () => '',
    })

    await router.load()
    const first = router.preloadRoute({
      to: '/target',
      search: { version: 1 },
    })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))
    const second = router.preloadRoute({
      to: '/target',
      search: { version: 2 },
    })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))
    gates.get(1)!.resolve(undefined)
    gates.get(2)!.resolve(undefined)
    await Promise.all([first, second])

    const third = router.preloadRoute({
      to: '/target',
      search: { version: 3 },
    })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(3))
    const identical = router.preloadRoute({
      to: '/target',
      search: { version: 3 },
    })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(4))
    gates.get(3)!.resolve(undefined)
    await Promise.all([third, identical])
  })

  test('navigation reruns beforeLoad while sharing an identical preload loader', async () => {
    const beforeLoadGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(async ({ preload }: { preload: boolean }) => {
      await beforeLoadGate
      return { source: preload ? 'preload' : 'navigation' }
    })
    const loader = vi.fn(() => 'loader data')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
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
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/target' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({ to: '/target' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    beforeLoadGate.resolve()
    await Promise.all([preload, navigation])

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      context: { source: 'navigation' },
      loaderData: 'loader data',
    })
  })

  test('a depth-20 navigation does not adopt a depth-0 active preload redirect', async () => {
    const redirectGate = createControlledPromise<void>()
    const sharedBeforeLoad = vi.fn(async (_context: { preload: boolean }) => {
      await redirectGate
      throw redirect({ to: '/target' })
    })
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const hopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hop/$hop',
      beforeLoad: ({ params }) => {
        const hop = Number(params.hop)
        if (hop < 19) {
          throw redirect({
            to: '/hop/$hop',
            params: { hop: String(hop + 1) },
          } as any)
        }
        throw redirect({ to: '/shared' })
      },
    })
    const sharedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/shared',
      beforeLoad: sharedBeforeLoad,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        hopRoute,
        sharedRoute,
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    let preload: Promise<unknown> | undefined
    let navigation: Promise<unknown> | undefined
    onTestFinished(async () => {
      redirectGate.resolve()
      const activeWork: Array<Promise<unknown>> = []
      if (preload) {
        activeWork.push(preload)
      }
      if (navigation) {
        activeWork.push(navigation)
      }
      await Promise.allSettled(activeWork)
    })

    await router.load()
    preload = router.preloadRoute({ to: '/shared' })
    await vi.waitFor(() => expect(sharedBeforeLoad).toHaveBeenCalledOnce())

    navigation = router.navigate({
      to: '/hop/$hop',
      params: { hop: '0' },
    } as any)
    await vi.waitFor(() => expect(sharedBeforeLoad).toHaveBeenCalledTimes(2))

    redirectGate.resolve()
    await Promise.all([preload, navigation])

    expect(
      sharedBeforeLoad.mock.calls.map(([context]) => context.preload),
    ).toEqual([true, false])
    expect(router.state.location.pathname).toBe('/shared')
    expect(
      router.state.matches.find((match) => match.status !== 'success'),
    ).toMatchObject({
      routeId: rootRoute.id,
      status: 'error',
      error: expect.objectContaining({ message: 'Too many redirects' }),
    })
    expect(router.state.status).toBe('idle')
  })

  test.each([
    {
      difference: 'pathname',
      preloadMask: { to: '/mask-a' },
      navigationMask: { to: '/mask-b' },
      preloadPathname: '/mask-a',
      navigationPathname: '/mask-b',
    },
    {
      difference: 'unmaskOnReload',
      preloadMask: { to: '/mask-a' },
      navigationMask: { to: '/mask-a', unmaskOnReload: true },
      preloadPathname: '/mask-a',
      navigationPathname: '/mask-a',
    },
    {
      difference: 'search',
      preloadMask: { to: '/mask-a', search: { source: 'preload' } },
      navigationMask: { to: '/mask-a', search: { source: 'navigation' } },
      preloadPathname: '/mask-a',
      navigationPathname: '/mask-a',
    },
    {
      difference: 'state',
      preloadMask: { to: '/mask-a', state: { source: 'preload' } },
      navigationMask: { to: '/mask-a', state: { source: 'navigation' } },
      preloadPathname: '/mask-a',
      navigationPathname: '/mask-a',
    },
  ])(
    'navigation reruns beforeLoad for a different explicit mask $difference on the same destination',
    async ({
      preloadMask,
      navigationMask,
      preloadPathname,
      navigationPathname,
    }) => {
      const beforeLoadGate = createControlledPromise<void>()
      const loaderGate = createControlledPromise<string>()
      const beforeLoad = vi.fn(
        async (context: {
          location: { maskedLocation?: { pathname: string } }
          preload: boolean
        }) => {
          if (context.preload) {
            await beforeLoadGate
          }
          return { source: context.preload ? 'preload' : 'navigation' }
        },
      )
      const loader = vi.fn(() => loaderGate)
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        beforeLoad,
        loader,
      })
      const maskARoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/mask-a',
      })
      const maskBRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/mask-b',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          targetRoute,
          maskARoute,
          maskBRoute,
        ]),
        ...('search' in preloadMask ? { stringifySearch: () => '' } : {}),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      let preload: Promise<unknown> | undefined
      let navigation: Promise<unknown> | undefined
      try {
        await router.load()
        preload = router.preloadRoute({
          to: '/target',
          mask: preloadMask as any,
        })
        await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))

        beforeLoadGate.resolve()
        await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

        navigation = router.navigate({
          to: '/target',
          mask: navigationMask as any,
        })
        await vi.waitFor(() =>
          expect(
            beforeLoad.mock.calls.map(([callContext]) => ({
              preload: callContext.preload,
              pathname: callContext.location.maskedLocation?.pathname,
            })),
          ).toEqual([
            { preload: true, pathname: preloadPathname },
            { preload: false, pathname: navigationPathname },
          ]),
        )

        loaderGate.resolve('shared loader data')
        await Promise.all([preload, navigation])

        expect(router.state.matches.at(-1)?.context).toEqual({
          source: 'navigation',
        })
        expect(router.history.location.pathname).toBe(navigationPathname)
        expect(loader).toHaveBeenCalledTimes(1)
      } finally {
        beforeLoadGate.resolve()
        loaderGate.resolve('shared loader data')
        const activeWork: Array<Promise<unknown>> = []
        if (preload) {
          activeWork.push(preload)
        }
        if (navigation) {
          activeWork.push(navigation)
        }
        await Promise.allSettled(activeWork)
      }
    },
  )

  test('identical active preloads await the same redirect chain', async () => {
    const redirectGate = createControlledPromise<void>()
    const loaderGate = createControlledPromise<void>()
    const redirectedLoader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      beforeLoad: async () => {
        await redirectGate
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: redirectedLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const first = router.preloadRoute({ to: '/source' })
    const second = router.preloadRoute({ to: '/source' })
    let secondSettled = false
    void second.then(() => {
      secondSettled = true
    })

    redirectGate.resolve()
    await vi.waitFor(() => expect(redirectedLoader).toHaveBeenCalledOnce())
    expect(secondSettled).toBe(false)

    loaderGate.resolve()
    await Promise.all([first, second])
    expect(secondSettled).toBe(true)
  })

  test.each([
    {
      name: 'route suffix',
      preload: { to: '/items/one/first' },
      navigation: { to: '/items/one/second' },
      pathname: '/items/one/second',
      search: {},
    },
    {
      name: 'params',
      preload: { to: '/items/one/first' },
      navigation: { to: '/items/two/first' },
      pathname: '/items/two/first',
      search: {},
    },
    {
      name: 'search',
      preload: {
        to: '/items/one/first',
        search: { view: 'summary' },
      },
      navigation: {
        to: '/items/one/first',
        search: { view: 'detail' },
      },
      pathname: '/items/one/first',
      search: { view: 'detail' },
    },
  ])(
    'navigation does not adopt beforeLoad from an active preload with different $name',
    async ({
      preload: preloadOptions,
      navigation: navigationOptions,
      pathname,
      search,
    }) => {
      const beforeLoadGate = createControlledPromise<void>()
      const beforeLoad = vi.fn(async ({ preload }: { preload: boolean }) => {
        await beforeLoadGate
        return { preload }
      })
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const itemsRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/items/$itemId',
        beforeLoad,
      })
      const firstRoute = new BaseRoute({
        getParentRoute: () => itemsRoute,
        path: '/first',
      })
      const secondRoute = new BaseRoute({
        getParentRoute: () => itemsRoute,
        path: '/second',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          itemsRoute.addChildren([firstRoute, secondRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()
      const preload = router.preloadRoute(preloadOptions as any)
      await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))

      const navigation = router.navigate(navigationOptions as any)
      await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

      beforeLoadGate.resolve()
      await Promise.all([preload, navigation])

      expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual(
        [true, false],
      )
      expect(router.state.location.pathname).toBe(pathname)
      expect(router.state.location.search).toEqual(search)
      expect(router.state.matches.at(-1)?.context).toEqual({ preload: false })
    },
  )

  test('a different full navigation lane reruns beforeLoad but reuses active same-id loader work', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      source: preload ? 'preload' : 'navigation',
    }))
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad,
      loader,
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([firstRoute, secondRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/parent/first' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({ to: '/parent/second' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(loader).toHaveBeenCalledTimes(1)
    loaderGate.resolve('shared parent data')
    await Promise.all([preload, navigation])

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.routeId).toBe(secondRoute.id)
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      context: { source: 'navigation' },
      loaderData: 'shared parent data',
    })
  })

  test('reserved preload loader work survives preload completion while navigation beforeLoad is pending', async () => {
    const loaderGate = createControlledPromise<string>()
    const navigationBeforeLoadGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(async ({ preload }: { preload: boolean }) => {
      if (!preload) {
        await navigationBeforeLoadGate
      }
      return { source: preload ? 'preload' : 'navigation' }
    })
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad,
      loader,
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([firstRoute, secondRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/parent/first' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({ to: '/parent/second' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    loaderGate.resolve('reserved parent data')
    await preload
    expect(loader).toHaveBeenCalledTimes(1)

    navigationBeforeLoadGate.resolve()
    await navigation

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.routeId).toBe(secondRoute.id)
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      context: { source: 'navigation' },
      loaderData: 'reserved parent data',
    })
  })

  test('a background refresh consumes reserved preload work after that preload completes', async () => {
    const refreshGate = createControlledPromise<string>()
    const navigationBeforeLoadGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(
      async ({
        preload,
        search,
      }: {
        preload: boolean
        search: { revision: number }
      }) => {
        if (!preload && search.revision === 2) {
          await navigationBeforeLoadGate
        }
        return { source: preload ? 'preload' : 'navigation' }
      },
    )
    const loader = vi.fn(() =>
      loader.mock.calls.length === 1 ? 'initial data' : refreshGate,
    )
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision ?? 0),
      }),
      beforeLoad,
      shouldReload: ({ location }) =>
        (location.search as { revision: number }).revision > 0,
      loader: {
        handler: loader,
        staleReloadMode: 'background',
      },
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([firstRoute, secondRoute]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/parent/first?revision=0'],
      }),
    })

    await router.load()
    const preload = router.preloadRoute({
      to: '/parent/first',
      search: { revision: 1 },
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    let navigationSettled = false
    const navigation = router
      .navigate({
        to: '/parent/second',
        search: { revision: 2 },
      })
      .then(() => {
        navigationSettled = true
      })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(3))

    refreshGate.resolve('refreshed data')
    await preload
    expect(loader).toHaveBeenCalledTimes(2)
    expect(navigationSettled).toBe(false)

    navigationBeforeLoadGate.resolve()
    await navigation

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      false,
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.routeId).toBe(secondRoute.id)
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      context: { source: 'navigation' },
      loaderData: 'refreshed data',
      preload: false,
      isFetching: false,
    })
  })

  test('different same-href preload lanes rerun beforeLoad but share loader work by match id', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn()
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      validateSearch: (search: Record<string, unknown>) => ({
        version: Number(search.version),
      }),
      beforeLoad,
      loader,
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([firstRoute, secondRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      stringifySearch: () => '',
    })

    await router.load()
    const first = router.preloadRoute({
      to: '/parent/first',
      search: { version: 1 },
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    const second = router.preloadRoute({
      to: '/parent/first',
      search: { version: 2 },
    })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(loader).toHaveBeenCalledTimes(1)
    loaderGate.resolve('parent data')
    await Promise.all([first, second])

    expect(beforeLoad).toHaveBeenCalledTimes(2)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('completed preloads cache loader data but not beforeLoad context', async () => {
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      source: preload ? 'preload' : 'navigation',
    }))
    const loader = vi.fn(
      ({ context }: { context: { source: string } }) => context.source,
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      staleTime: Infinity,
      preloadStaleTime: Infinity,
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/target' })
    await router.navigate({ to: '/target' })

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      context: { source: 'navigation' },
      loaderData: 'preload',
    })
  })

  test('completed preloads reuse same-id route context and loader data', async () => {
    const context = ({ preload }: { preload: boolean }) => ({
      source: preload ? 'preload' : 'navigation',
    })
    const loader = vi.fn(
      ({ context: value }: { context: { source: string } }) => value.source,
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      staleTime: Infinity,
      preloadStaleTime: Infinity,
      context,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/target' })
    await router.navigate({ to: '/target' })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      context: { source: 'preload' },
      loaderData: 'preload',
    })
  })

  test('navigation runs independently when an active preload fails', async () => {
    const preloadGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(async ({ preload }: { preload: boolean }) => {
      if (preload) {
        await preloadGate
        throw new Error('preload failed')
      }
      return { source: 'navigation' }
    })
    const loader = vi.fn(() => 'navigation data')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
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
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/target' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))
    const navigation = router.navigate({ to: '/target' })

    preloadGate.resolve()
    await Promise.all([preload, navigation])

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      context: { source: 'navigation' },
      loaderData: 'navigation data',
    })
  })

  test('a later retry reuses successful loader data from the failed preload lane', async () => {
    const childGate = createControlledPromise<void>()
    const childFailure = new Error('preload child failed')
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      source: preload ? 'preload' : 'navigation',
    }))
    let parentSignal: AbortSignal | undefined
    const parentLoader = vi.fn(({ abortController }) => {
      parentSignal = abortController.signal
      return 'parent data'
    })
    const childLoader = vi.fn(async ({ preload }: { preload: boolean }) => {
      if (preload) {
        await childGate
        throw childFailure
      }
      return 'child data'
    })
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad,
      loader: parentLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
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
    const preload = router.preloadRoute({ to: '/parent/child' })
    await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(1))

    childGate.resolve()
    const terminal = await preload

    expect(
      terminal?.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      status: 'success',
      loaderData: 'parent data',
    })
    expect(
      terminal?.find((match) => match.routeId === childRoute.id),
    ).toMatchObject({
      status: 'error',
      error: childFailure,
    })

    await router.navigate({ to: '/parent/child' })

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(parentSignal?.aborted).toBe(false)
    expect(childLoader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: childRoute.id,
      status: 'success',
      loaderData: 'child data',
    })
  })

  test('a terminal preload stays terminal publicly while caching its successful loader generation', async () => {
    const loader = vi.fn(
      ({ deps }: { deps: { version: number } }) => deps.version,
    )
    const rootRoute = new BaseRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        version: Number(search.version ?? 0),
      }),
      loaderDeps: ({ search }) => ({ version: search.version }),
      shouldReload: false,
      loader,
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      beforeLoad: () => {
        throw notFound({ routeId: rootRoute.id as never })
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({
        initialEntries: ['/?version=0'],
      }),
    })

    await router.load()
    const terminal = await router.preloadRoute({
      to: '/target',
      search: { version: 1 },
    })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(terminal).toHaveLength(2)
    expect(terminal?.[0]).toMatchObject({
      routeId: rootRoute.id,
      status: 'success',
      _notFound: true,
      error: { isNotFound: true },
      loaderData: 1,
    })
    expect(terminal?.[1]).toMatchObject({
      routeId: targetRoute.id,
      status: 'pending',
    })

    await router.navigate({
      to: '/target',
      search: { version: 1 },
    })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches[0]).toMatchObject({
      status: 'success',
      _notFound: true,
      loaderData: 1,
    })
    expect(router.state.matches[1]).toMatchObject({
      routeId: targetRoute.id,
      status: 'pending',
    })
  })

  test('a terminal preload started during navigation borrows its loader generation', async () => {
    const loaderGate = createControlledPromise<string>()
    const loader = vi.fn(() =>
      loader.mock.calls.length === 1 ? 'initial data' : loaderGate,
    )
    const rootRoute = new BaseRootRoute({
      shouldReload: true,
      loader,
    })
    const beforeLoad = vi.fn(() => {
      throw notFound({ routeId: rootRoute.id as never })
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const navigation = router.navigate({ to: '/target' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    const preload = router.preloadRoute({ to: '/target' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(loader).toHaveBeenCalledTimes(2)
    loaderGate.resolve('navigation data')
    const [, terminal] = await Promise.all([navigation, preload])

    expect(loader).toHaveBeenCalledTimes(2)
    expect(terminal?.[0]).toMatchObject({
      routeId: rootRoute.id,
      _notFound: true,
      loaderData: 'navigation data',
    })
  })

  test('leaving a route preserves its newer same-id preload generation', async () => {
    const loader = vi.fn(() => `loader data ${loader.mock.calls.length}`)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision ?? 1),
      }),
      shouldReload: ({ location }) =>
        (location.search as { revision: number }).revision === 2,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({
        initialEntries: ['/target?revision=1'],
      }),
    })

    await router.load()
    await router.preloadRoute({
      to: '/target',
      search: { revision: 2 },
    })
    await router.navigate({ to: '/' })
    await router.navigate({
      to: '/target',
      search: { revision: 1 },
    })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe('loader data 2')
  })

  test('an expired same-id preload does not displace fresh unloaded data', async () => {
    const loader = vi.fn(() => `loader data ${loader.mock.calls.length}`)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision ?? 1),
      }),
      shouldReload: ({ location }) =>
        (location.search as { revision: number }).revision === 2,
      preloadGcTime: 0,
      gcTime: Infinity,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({
        initialEntries: ['/target?revision=1'],
      }),
    })

    await router.load()
    await router.preloadRoute({
      to: '/target',
      search: { revision: 2 },
    })
    await router.navigate({ to: '/' })
    await router.navigate({
      to: '/target',
      search: { revision: 1 },
    })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe('loader data 1')
  })

  test('filtered invalidation reloads every generation of the selected match id', async () => {
    const loader = vi.fn(() => `loader data ${loader.mock.calls.length}`)
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision ?? 1),
      }),
      shouldReload: ({ location }) =>
        (location.search as { revision: number }).revision === 2
          ? true
          : undefined,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({
        initialEntries: ['/target?revision=1'],
      }),
    })

    await router.load()
    await router.preloadRoute({
      to: '/target',
      search: { revision: 2 },
    })
    await router.invalidate({
      filter: (match) => (match.search as { revision?: number }).revision === 1,
    })

    expect(loader).toHaveBeenCalledTimes(3)
    expect(router.state.matches.at(-1)?.loaderData).toBe('loader data 3')
  })

  test('a hidden terminal suffix does not evict a newer same-id preload', async () => {
    const failingBeforeLoadStarted = createControlledPromise<void>()
    const failingBeforeLoadGate = createControlledPromise<void>()
    const loader = vi.fn(() => 'preloaded child data')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      validateSearch: (search: Record<string, unknown>) => ({
        fail: search.fail === true,
      }),
      beforeLoad: async ({ search }) => {
        if (search.fail) {
          failingBeforeLoadStarted.resolve()
          await failingBeforeLoadGate
          throw new Error('parent failed')
        }
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      staleTime: Infinity,
      preloadStaleTime: Infinity,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const failingNavigation = router.navigate({
      to: '/parent/child',
      search: { fail: true },
    })
    await failingBeforeLoadStarted

    await router.preloadRoute({
      to: '/parent/child',
      search: { fail: false },
    })
    expect(loader).toHaveBeenCalledTimes(1)

    failingBeforeLoadGate.resolve()
    await failingNavigation
    expect(router.state.matches).toHaveLength(3)
    expect(router.state.matches[1]).toMatchObject({
      routeId: parentRoute.id,
      status: 'error',
    })

    await router.navigate({
      to: '/parent/child',
      search: { fail: false },
    })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: childRoute.id,
      loaderData: 'preloaded child data',
    })
  })

  test('preload false skips speculation but performs a blocking navigation load', async () => {
    const loaderGate = createControlledPromise<string>()
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      preload: false,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/target' })
    expect(loader).not.toHaveBeenCalled()

    let settled = false
    const navigation = router.navigate({ to: '/target' }).then(() => {
      settled = true
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    expect(settled).toBe(false)

    loaderGate.resolve('target data')
    await navigation

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'target data',
    })
  })

  test('preloads the target of a twenty-hop redirect chain', async () => {
    const beforeLoad = vi.fn(({ params }) => {
      const hop = Number(params.hop)
      if (hop < 20) {
        throw redirect({
          to: '/hop/$hop',
          params: { hop: String(hop + 1) },
        } as any)
      }
    })
    const rootRoute = new BaseRootRoute({})
    const hopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hop/$hop',
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([hopRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = await router.preloadRoute({
      to: '/hop/$hop',
      params: { hop: '0' },
    } as any)

    expect(beforeLoad).toHaveBeenCalledTimes(21)
    expect(matches?.at(-1)).toMatchObject({
      routeId: hopRoute.id,
      status: 'success',
      params: { hop: '20' },
    })
  })

  test('stops a preload after the twenty-hop redirect limit', async () => {
    const beforeLoad = vi.fn(({ params }) => {
      const hop = Number(params.hop)
      if (hop < 22) {
        throw redirect({
          to: '/hop/$hop',
          params: { hop: String(hop + 1) },
        } as any)
      }
    })
    const rootRoute = new BaseRootRoute({})
    const hopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hop/$hop',
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([hopRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = await router.preloadRoute({
      to: '/hop/$hop',
      params: { hop: '0' },
    } as any)

    expect(beforeLoad).toHaveBeenCalledTimes(21)
    expect(matches?.find((match) => match.status !== 'success')).toMatchObject({
      routeId: rootRoute.id,
      status: 'error',
      error: expect.objectContaining({
        message: 'Too many redirects',
      }),
    })
  })

  test('limits inferred same-origin absolute redirects during preload', async () => {
    const origin = 'https://example.com'
    const beforeLoad = vi.fn(({ params }) => {
      const hop = Number(params.hop)
      if (hop < 21) {
        throw redirect({ href: `${origin}/hop/${hop + 1}` })
      }
    })
    const rootRoute = new BaseRootRoute({})
    const hopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hop/$hop',
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([hopRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      origin,
      isServer: false,
    })

    const matches = await router.preloadRoute({
      to: '/hop/$hop',
      params: { hop: '0' },
    } as any)

    expect(beforeLoad).toHaveBeenCalledTimes(21)
    expect(matches?.find((match) => match.status !== 'success')).toMatchObject({
      routeId: rootRoute.id,
      status: 'error',
      error: expect.objectContaining({ message: 'Too many redirects' }),
    })
  })

  test('forwards a document redirect at the redirect limit', async () => {
    const beforeLoad = vi.fn(({ params }) => {
      const hop = Number(params.hop)
      throw redirect({
        to: '/hop/$hop',
        params: { hop: String(hop + 1) },
        reloadDocument: hop === 20,
      } as any)
    })
    const rootRoute = new BaseRootRoute({})
    const hopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hop/$hop',
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([hopRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = await router.preloadRoute({
      to: '/hop/$hop',
      params: { hop: '0' },
    } as any)

    expect(beforeLoad).toHaveBeenCalledTimes(21)
    expect(matches).toBeUndefined()
  })

  test('reports a chunk redirect limit at root', async () => {
    const chunkError = new Error('route chunk failed')
    const rootRoute = new BaseRootRoute({})
    const loopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/loop',
      onError: () => {
        throw redirect({ to: '/loop' })
      },
    }).lazy(() => Promise.reject(chunkError))
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([loopRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = await router.preloadRoute({ to: '/loop' })

    const terminal = matches?.find((match) => match.status !== 'success')
    expect(terminal).toMatchObject({
      routeId: rootRoute.id,
      status: 'error',
      error: expect.objectContaining({ message: 'Too many redirects' }),
    })
  })
})
