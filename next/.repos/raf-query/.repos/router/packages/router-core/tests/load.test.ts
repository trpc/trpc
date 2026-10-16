import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
  rootRouteId,
} from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'
import type {
  LoaderStaleReloadMode,
  RootRouteOptions,
  RouterCore,
} from '../src'

type AnyRouteOptions = RootRouteOptions<any>
type BeforeLoad = NonNullable<AnyRouteOptions['beforeLoad']>
type Loader = NonNullable<AnyRouteOptions['loader']>
type LoaderEntry = Exclude<Loader, Function>

describe('redirect resolution', () => {
  test('resolveRedirect normalizes same-origin Location to path-only', async () => {
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['https://example.com/foo'],
      }),
      origin: 'https://example.com',
    })

    // This redirect already includes an absolute Location header (external-ish),
    // but still represents an internal navigation.
    const unresolved = redirect({
      to: '/foo',
      headers: { Location: 'https://example.com/foo' },
    })

    const resolved = router.resolveRedirect(unresolved)

    // Expect Location and stored href to be path-only (no origin).
    expect(resolved.headers.get('Location')).toBe('/foo')
    expect(resolved.options.href).toBe('/foo')
  })

  test.each(['/$a', '/$toString', '/$__proto__'])(
    'server startup redirects initial path %s to /undefined',
    async (initialPath) => {
      const rootRoute = new BaseRootRoute({})
      const slugRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/$slug',
      })

      const routeTree = rootRoute.addChildren([slugRoute])

      const router = createTestRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: [initialPath] }),
        isServer: true,
      })

      const response = await loadServerResponse(router, initialPath)

      expect(response.status).toBe(307)
      expect(response.headers.get('Location')).toBe('/undefined')
    },
  )

  test.each([
    '//evil.example',
    '/\\evil.example',
    '/\\\\evil.example',
    '/\\/evil.example',
    '\\/evil.example',
    '\\\\evil.example',
  ])('server loaders do not emit an unsafe Location for %j', async (href) => {
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => redirect({ href }),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/source')

    expect(response.status).toBe(500)
    expect(response.headers.get('Location')).toBeNull()
  })

  test.each([
    [
      'preserves an explicit same-origin document redirect',
      'https://victim.example/target',
      true,
      '/target',
    ],
    [
      'document-navigates an intentional external redirect',
      'https://other.example/target',
      undefined,
      'https://other.example/target',
    ],
  ] as const)('%s', async (_name, href, reloadDocument, expectedHref) => {
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => redirect({ href, reloadDocument }),
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history,
      origin: 'https://victim.example',
      isServer: false,
    })
    const windowLocation = { href: '', replace: vi.fn() }
    vi.stubGlobal('window', { location: windowLocation })

    void router.navigate({ to: '/source' })

    await vi.waitFor(() => {
      expect(windowLocation.replace).toHaveBeenCalledWith(expectedHref)
    })
  })

  test.each(['javascript:alert(1)', 'blob:https://victim.example/id'])(
    'client loaders block redirects made dangerous by output rewrite %j',
    async (dangerousHref) => {
      const unsafeRedirect = redirect({ to: '/target' })
      const rootRoute = new BaseRootRoute({})
      const sourceRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/source',
        loader: () => unsafeRedirect,
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
      })
      const history = createMemoryHistory({ initialEntries: ['/'] })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
        history,
        isServer: false,
        rewrite: {
          input: ({ url }) => url,
          output: ({ url }) =>
            url.pathname === '/target' ? new URL(dangerousHref) : url,
        },
      })

      await router.navigate({ to: '/source' })

      expect(history.location.href).toBe('/source')
      expect(unsafeRedirect.options.href).toBeUndefined()
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: '/source',
        status: 'error',
        error: expect.objectContaining({
          message: expect.stringMatching(/Redirect blocked: unsafe protocol/),
        }),
      })
    },
  )

  test('client loaders block masked redirects made dangerous by output rewrites', async () => {
    const unsafeRedirect = redirect({
      to: '/target',
      mask: { to: '/pretty' },
    })
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => unsafeRedirect,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history,
      isServer: false,
      rewrite: {
        input: ({ url }) => url,
        output: ({ url }) =>
          url.pathname === '/pretty' ? new URL('javascript:alert(1)') : url,
      },
    })

    await router.navigate({ to: '/source' })

    expect(history.location.href).toBe('/source')
    expect(unsafeRedirect.options.href).toBeUndefined()
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: '/source',
      status: 'error',
      error: expect.objectContaining({
        message: expect.stringMatching(/Redirect blocked: unsafe protocol/),
      }),
    })
  })

  test('client loaders document-navigate an external output rewrite', async () => {
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => redirect({ to: '/target' }),
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      origin: 'https://victim.example',
      isServer: false,
      rewrite: {
        input: ({ url }) => url,
        output: ({ url }) =>
          url.pathname === '/target'
            ? new URL('https://other.example/rewritten')
            : url,
      },
    })
    const windowLocation = { href: '', replace: vi.fn() }
    vi.stubGlobal('window', { location: windowLocation })

    try {
      void router.navigate({ to: '/source' })

      await vi.waitFor(() => {
        expect(windowLocation.replace).toHaveBeenCalledWith(
          'https://other.example/rewritten',
        )
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('preloading stops at a redirect with an external output rewrite', async () => {
    const targetLoader = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => redirect({ to: '/target' }),
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: targetLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      origin: 'https://victim.example',
      isServer: false,
      rewrite: {
        input: ({ url }) => url,
        output: ({ url }) =>
          url.pathname === '/target'
            ? new URL('https://other.example/rewritten')
            : url,
      },
    })

    await router.preloadRoute({ to: '/source' })

    expect(targetLoader).not.toHaveBeenCalled()
  })

  test('preloading follows an inferred same-origin absolute redirect', async () => {
    const targetLoader = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => redirect({ href: 'https://victim.example/app/pretty' }),
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: targetLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/app/'] }),
      origin: 'https://victim.example',
      basepath: '/app',
      isServer: false,
      rewrite: {
        input: ({ url }) => {
          if (url.pathname === '/pretty') {
            url.pathname = '/target'
          }
          return url
        },
        output: ({ url }) => {
          if (url.pathname === '/target') {
            url.pathname = '/pretty'
          }
          return url
        },
      },
    })

    await router.preloadRoute({ to: '/source' })

    expect(targetLoader).toHaveBeenCalledOnce()
  })
})

describe('notFound detection', () => {
  test('does not treat arbitrary proxy property access as notFound', async () => {
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () =>
        new Proxy(
          {},
          {
            get(_target, prop) {
              if (prop === 'isNotFound') return 'truthy-but-not-true'
              return undefined
            },
            has() {
              return true
            },
          },
        ),
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
      isServer: true,
    })

    await router.load()

    expect(router.state.matches.at(-1)?.status).toBe('success')
    expect(router.state.matches.at(-1)?.error).toBeUndefined()
  })
})

describe('beforeLoad skip or exec', () => {
  const setup = ({ beforeLoad }: { beforeLoad?: BeforeLoad }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad,
    })

    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const routeTree = rootRoute.addChildren([fooRoute, barRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    return router
  }

  test('baseline', async () => {
    const beforeLoad = vi.fn()
    const router = setup({ beforeLoad })
    await router.load()
    expect(beforeLoad).toHaveBeenCalledTimes(0)
  })

  test('exec on regular nav', async () => {
    const beforeLoad = vi.fn(() => Promise.resolve({ hello: 'world' }))
    const router = setup({ beforeLoad })
    await router.navigate({ to: '/foo' })
    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
          context: {
            hello: 'world',
          },
        }),
      ]),
    )
    expect(beforeLoad).toHaveBeenCalledTimes(1)
  })

  test('preserves primitive errors thrown from beforeLoad', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(() => {
      throw 'primitive error'
    })
    const router = setup({ beforeLoad })

    await router.navigate({ to: '/foo' })

    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
          status: 'error',
          error: 'primitive error',
        }),
      ]),
    )
  })

  test('does not mutate object errors thrown from beforeLoad', async () => {
    const thrown = { type: 'domain-error' }
    const beforeLoad = vi.fn<BeforeLoad>(() => {
      throw thrown
    })
    const router = setup({ beforeLoad })

    await router.navigate({ to: '/foo' })

    const match = router.state.matches.find((d) => d.id === '/foo/foo')
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(thrown)
    expect(thrown).toEqual({ type: 'domain-error' })
  })

  test('exec if resolved preload (success)', async () => {
    const beforeLoad = vi.fn()
    const router = setup({ beforeLoad })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (success)', async () => {
    const beforeLoad = vi.fn(() => sleep(100))
    const router = setup({ beforeLoad })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (notFound)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw notFound()
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (notFound)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw notFound()
    })
    const router = setup({
      beforeLoad,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (redirect)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw redirect({ to: '/bar' })
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches.at(-1)?.status).toBe('success')
    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (redirect)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw redirect({ to: '/bar' })
    })
    const router = setup({
      beforeLoad,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches.at(-1)?.status).toBe('success')
    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (error)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw new Error('error')
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('skip child beforeLoad when parent beforeLoad throws during preload', async () => {
    const parentBeforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw new Error('parent error')
    })
    const childBeforeLoad = vi.fn<BeforeLoad>()
    const parentHead = vi.fn(() => ({ meta: [{ title: 'Parent' }] }))
    const childHead = vi.fn(() => ({ meta: [{ title: 'Child' }] }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: parentBeforeLoad,
      head: parentHead,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: childBeforeLoad,
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    await router.preloadRoute({ to: '/parent/child' })

    expect(parentBeforeLoad).toHaveBeenCalledTimes(1)
    expect(childBeforeLoad).not.toHaveBeenCalled()
    expect(parentHead).toHaveBeenCalledTimes(1)
    expect(childHead).not.toHaveBeenCalled()
  })

  test('exec if pending preload (error)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw new Error('error')
    })
    const router = setup({
      beforeLoad,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })
})

describe('loader skip or exec', () => {
  const setup = ({
    loader,
    staleTime,
    defaultStaleReloadMode,
  }: {
    loader?: Loader
    staleTime?: number
    defaultStaleReloadMode?: LoaderStaleReloadMode
  }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime,
      gcTime: staleTime,
    })

    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const routeTree = rootRoute.addChildren([fooRoute, barRoute])

    const router = createTestRouter({
      routeTree,
      defaultStaleReloadMode,
      history: createMemoryHistory(),
    })

    return router
  }

  test('baseline', async () => {
    const loader = vi.fn()
    const router = setup({ loader })
    await router.load()
    expect(loader).toHaveBeenCalledTimes(0)
  })

  test('exec on regular nav', async () => {
    const loader = vi.fn(() => Promise.resolve({ hello: 'world' }))
    const router = setup({ loader })
    await router.navigate({ to: '/foo' })
    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
          loaderData: {
            hello: 'world',
          },
        }),
      ]),
    )
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('exec if resolved preload (success)', async () => {
    const loader = vi.fn()
    const router = setup({ loader })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('skip if resolved preload (success) within staleTime duration', async () => {
    const loader = vi.fn()
    const router = setup({ loader, staleTime: 1000 })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('skip if pending preload (success)', async () => {
    const loader = vi.fn(() => sleep(100))
    const router = setup({ loader })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('exec if rejected preload (notFound)', async () => {
    const loader: Loader = vi.fn(async ({ preload }) => {
      if (preload) throw notFound()
      await Promise.resolve()
    })
    const router = setup({
      loader,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('navigation shares a pending preload loader notFound', async () => {
    const loaderGate = createControlledPromise<void>()
    const loader: Loader = vi.fn(async ({ preload }) => {
      await loaderGate
      if (preload) throw notFound()
    })
    const router = setup({
      loader,
    })
    const preload = router.preloadRoute({ to: '/foo' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())

    const navigation = router.navigate({ to: '/foo' })
    await Promise.resolve()
    expect(loader).toHaveBeenCalledOnce()

    loaderGate.resolve()
    await Promise.all([preload, navigation])

    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: '/foo',
      status: 'notFound',
      error: {
        isNotFound: true,
        routeId: '/foo',
      },
    })
    expect(loader).toHaveBeenCalledOnce()
  })

  test('exec if rejected preload (redirect)', async () => {
    const loader: Loader = vi.fn(async ({ preload }) => {
      if (preload) throw redirect({ to: '/bar' })
      await Promise.resolve()
    })
    const router = setup({
      loader,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches.at(-1)?.status).toBe('success')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload redirects', async () => {
    const loader: Loader = vi.fn(async ({ preload }) => {
      await sleep(100)
      if (preload) throw redirect({ to: '/bar' })
    })
    const router = setup({
      loader,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/bar')
    expect(router.state.matches.at(-1)?.status).toBe('success')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('exec if rejected preload (error)', async () => {
    const loader: Loader = vi.fn(async ({ preload }) => {
      if (preload) throw new Error('error')
      await Promise.resolve()
    })
    const router = setup({
      loader,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('navigation shares a pending preload loader error', async () => {
    const loaderGate = createControlledPromise<void>()
    const failure = new Error('preload failed')
    const loader: Loader = vi.fn(async ({ preload }) => {
      await loaderGate
      if (preload) throw failure
    })
    const router = setup({
      loader,
    })
    const preload = router.preloadRoute({ to: '/foo' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())

    const navigation = router.navigate({ to: '/foo' })
    await Promise.resolve()
    expect(loader).toHaveBeenCalledOnce()

    loaderGate.resolve()
    await Promise.all([preload, navigation])

    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: '/foo',
      status: 'error',
      error: failure,
    })
    expect(loader).toHaveBeenCalledOnce()
  })
})

test('exec on stay (beforeLoad & loader)', async () => {
  let rootBeforeLoadResolved = false
  const rootBeforeLoad = vi.fn(async () => {
    await sleep(10)
    rootBeforeLoadResolved = true
  })
  const rootLoader = vi.fn(() => sleep(10))
  const rootRoute = new BaseRootRoute({
    beforeLoad: rootBeforeLoad,
    loader: rootLoader,
  })

  let layoutBeforeLoadResolved = false
  const layoutBeforeLoad = vi.fn(async () => {
    await sleep(10)
    layoutBeforeLoadResolved = true
  })
  const layoutLoader = vi.fn(() => sleep(10))
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    beforeLoad: layoutBeforeLoad,
    loader: layoutLoader,
    id: '/_layout',
  })

  const fooRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/foo',
  })
  const barRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/bar',
  })

  const routeTree = rootRoute.addChildren([
    layoutRoute.addChildren([fooRoute, barRoute]),
  ])

  const router = createTestRouter({
    routeTree,
    history: createMemoryHistory(),
    defaultStaleTime: 1000,
    defaultGcTime: 1000,
  })

  await router.navigate({ to: '/foo' })
  expect(router.state.location.pathname).toBe('/foo')

  rootBeforeLoadResolved = false
  layoutBeforeLoadResolved = false
  vi.clearAllMocks()

  /*
   * When navigating between sibling routes,
   * do the parent routes get re-executed?
   */

  await router.navigate({ to: '/bar' })
  expect(router.state.location.pathname).toBe('/bar')

  // beforeLoads always re-execute
  expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
  expect(layoutBeforeLoad).toHaveBeenCalledTimes(1)

  // beforeLoads are called in order
  expect(rootBeforeLoad.mock.invocationCallOrder[0]).toBeLessThan(
    layoutBeforeLoad.mock.invocationCallOrder[0]!,
  )

  // loaders are skipped because of staleTime
  expect(rootLoader).toHaveBeenCalledTimes(0)
  expect(layoutLoader).toHaveBeenCalledTimes(0)

  // beforeLoad calls were correctly awaited
  expect(rootBeforeLoadResolved).toBe(true)
  expect(layoutBeforeLoadResolved).toBe(true)
})

describe('stale loader reload triggers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const getMatchById = (
    router: RouterCore<any, any, any, any, any>,
    id: string,
  ) => router.state.matches.find((match) => match.id === id)

  const hasActiveMatch = (
    router: RouterCore<any, any, any, any, any>,
    id: string,
  ) => router.state.matches.some((match) => match.id === id)

  const setup = ({
    loader,
    staleTime,
    defaultStaleReloadMode,
  }: {
    loader?: Loader
    staleTime?: number
    defaultStaleReloadMode?: LoaderStaleReloadMode
  }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime,
      gcTime: 60_000,
    })

    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const routeTree = rootRoute.addChildren([fooRoute, barRoute])

    return createTestRouter({
      routeTree,
      defaultStaleReloadMode,
      history: createMemoryHistory(),
    })
  }

  const createControlledStaleReload = () => {
    let resolveStaleReload: (() => void) | undefined
    let callCount = 0

    const loader = vi.fn(() => {
      callCount += 1
      if (callCount === 1) {
        return { value: 'first' }
      }

      return new Promise<{ value: string }>((resolve) => {
        resolveStaleReload = () => resolve({ value: 'second' })
      })
    })

    return {
      loader,
      resolveStaleReload: () => resolveStaleReload?.(),
    }
  }

  const expectBlockingStaleReloadBehavior = async (
    router: RouterCore<any, any, any, any, any>,
    loader: ReturnType<typeof vi.fn>,
    resolveStaleReload: () => void,
  ) => {
    await router.navigate({ to: '/foo' })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
      value: 'first',
    })

    await vi.advanceTimersByTimeAsync(1)
    await router.navigate({ to: '/bar' })
    await vi.advanceTimersByTimeAsync(1)

    let revisitSettled = false
    const revisit = router.navigate({ to: '/foo' }).then(() => {
      revisitSettled = true
    })

    await vi.waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(2)
    })
    expect(revisitSettled).toBe(false)
    expect(router.state.status).toBe('pending')
    expect(router.state.isLoading).toBe(true)
    expect(hasActiveMatch(router, '/bar/bar')).toBe(true)
    expect(hasActiveMatch(router, '/foo/foo')).toBe(false)

    resolveStaleReload()
    await revisit

    expect(revisitSettled).toBe(true)
    expect(router.state.status).toBe('idle')
    expect(router.state.isLoading).toBe(false)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(hasActiveMatch(router, '/foo/foo')).toBe(true)
    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.resolvedLocation?.pathname).toBe('/foo')
    expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
      value: 'second',
    })
  }

  const expectBackgroundStaleReloadBehavior = async (
    router: RouterCore<any, any, any, any, any>,
    loader: ReturnType<typeof vi.fn>,
    resolveStaleReload: () => void,
  ) => {
    await router.navigate({ to: '/foo' })
    expect(loader).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await router.navigate({ to: '/bar' })
    await vi.advanceTimersByTimeAsync(1)

    let revisitSettled = false
    const revisit = router.navigate({ to: '/foo' }).then(() => {
      revisitSettled = true
    })
    await revisit

    expect(revisitSettled).toBe(true)
    expect(router.state.status).toBe('idle')
    expect(router.state.isLoading).toBe(false)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(hasActiveMatch(router, '/foo/foo')).toBe(true)
    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.resolvedLocation?.pathname).toBe('/foo')
    expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
      value: 'first',
    })

    resolveStaleReload()
    await vi.waitFor(() => {
      expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
        value: 'second',
      })
    })
  }

  test('skips stale loader when only unrelated search params change', async () => {
    const rootRoute = new BaseRootRoute({})
    const loader = vi.fn(() => ({ ok: true }))

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: 0,
      gcTime: 0,
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        page: search['page'],
      }),
    })

    const routeTree = rootRoute.addChildren([fooRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo', search: { page: '1', filter: 'a' } })
    expect(loader).toHaveBeenCalledTimes(1)

    await router.navigate({ to: '/foo', search: { page: '1', filter: 'b' } })

    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('reloads stale loader when loader deps change', async () => {
    const rootRoute = new BaseRootRoute({})
    const loader = vi.fn(() => ({ ok: true }))

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: 0,
      gcTime: 0,
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        page: search['page'],
      }),
    })

    const routeTree = rootRoute.addChildren([fooRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo', search: { page: '1' } })
    expect(loader).toHaveBeenCalledTimes(1)

    await router.navigate({ to: '/foo', search: { page: '2' } })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('reuses a fresh preloaded loader when switching to a different match id of the same route', async () => {
    const rootRoute = new BaseRootRoute({})
    const rootLoader = vi.fn(() => ({ ok: true }))
    const childLoader = vi.fn(() => ({ ok: true }))

    const rootChildRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      loader: rootLoader,
      staleTime: 0,
      gcTime: 0,
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        page: search['page'],
      }),
    })

    const leafRoute = new BaseRoute({
      getParentRoute: () => rootChildRoute,
      path: '/$postId',
      loader: childLoader,
      staleTime: 0,
      gcTime: 0,
    })

    const routeTree = rootRoute.addChildren([
      rootChildRoute.addChildren([leafRoute]),
    ])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({
      to: '/posts/$postId',
      params: { postId: '1' },
      search: { page: '1' },
    })

    expect(rootLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)

    await router.preloadRoute({
      to: '/posts/$postId',
      params: { postId: '2' },
      search: { page: '2' },
    })

    expect(rootLoader).toHaveBeenCalledTimes(2)
    expect(childLoader).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1)

    await router.navigate({
      to: '/posts/$postId',
      params: { postId: '2' },
      search: { page: '2' },
    })

    expect(rootLoader).toHaveBeenCalledTimes(2)
    expect(childLoader).toHaveBeenCalledTimes(2)
  })

  test('skips stale ancestor loader when only a child path param changes', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentLoader = vi.fn(() => ({ ok: true }))
    const childLoader = vi.fn(() => ({ ok: true }))

    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$orgId',
      loader: parentLoader,
      staleTime: 0,
      gcTime: 0,
    })

    const userRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/users/$userId',
      loader: childLoader,
      staleTime: 0,
      gcTime: 0,
    })

    const routeTree = rootRoute.addChildren([orgRoute.addChildren([userRoute])])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({
      to: '/orgs/$orgId/users/$userId',
      params: { orgId: 'acme', userId: 'u1' },
    })
    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)

    await router.navigate({
      to: '/orgs/$orgId/users/$userId',
      params: { orgId: 'acme', userId: 'u2' },
    })

    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(2)
  })

  test('reloads stale ancestor loader when its own path param changes', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentLoader = vi.fn(() => ({ ok: true }))
    const childLoader = vi.fn(() => ({ ok: true }))

    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$orgId',
      loader: parentLoader,
      staleTime: 0,
      gcTime: 0,
    })

    const userRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/users/$userId',
      loader: childLoader,
      staleTime: 0,
      gcTime: 0,
    })

    const routeTree = rootRoute.addChildren([orgRoute.addChildren([userRoute])])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({
      to: '/orgs/$orgId/users/$userId',
      params: { orgId: 'acme', userId: 'u1' },
    })
    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)

    await router.navigate({
      to: '/orgs/$orgId/users/$userId',
      params: { orgId: 'beta', userId: 'u2' },
    })

    expect(parentLoader).toHaveBeenCalledTimes(2)
    expect(childLoader).toHaveBeenCalledTimes(2)
  })

  test('revalidates stale loaders on explicit same-location router.load()', async () => {
    const rootRoute = new BaseRootRoute({})
    const loader = vi.fn(() => ({ ok: true }))

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: 0,
      gcTime: 0,
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        page: search['page'],
      }),
    })

    const routeTree = rootRoute.addChildren([fooRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo', search: { page: '1', filter: 'a' } })
    expect(loader).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await Promise.resolve()

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('supports object-form loader handler', async () => {
    const handler = vi.fn(() => ({ ok: true }))
    const router = setup({
      loader: {
        handler,
      } satisfies LoaderEntry,
    })

    await router.navigate({ to: '/foo' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
          loaderData: { ok: true },
        }),
      ]),
    )
  })

  test('reloads stale loaders in the background by default', async () => {
    const { loader, resolveStaleReload } = createControlledStaleReload()
    const router = setup({ loader, staleTime: 0 })

    await expectBackgroundStaleReloadBehavior(
      router,
      loader,
      resolveStaleReload,
    )
  })

  test('blocks stale reloads when loader staleReloadMode is blocking', async () => {
    const { loader, resolveStaleReload } = createControlledStaleReload()
    const router = setup({
      staleTime: 0,
      loader: {
        handler: loader,
        staleReloadMode: 'blocking',
      } satisfies LoaderEntry,
    })

    await expectBlockingStaleReloadBehavior(router, loader, resolveStaleReload)
  })

  test('blocks stale reloads when defaultStaleReloadMode is blocking', async () => {
    const { loader, resolveStaleReload } = createControlledStaleReload()
    const router = setup({
      loader,
      staleTime: 0,
      defaultStaleReloadMode: 'blocking',
    })

    await expectBlockingStaleReloadBehavior(router, loader, resolveStaleReload)
  })

  test('loader staleReloadMode overrides defaultStaleReloadMode', async () => {
    const { loader, resolveStaleReload } = createControlledStaleReload()
    const router = setup({
      staleTime: 0,
      defaultStaleReloadMode: 'blocking',
      loader: {
        handler: loader,
        staleReloadMode: 'background',
      } satisfies LoaderEntry,
    })

    await expectBackgroundStaleReloadBehavior(
      router,
      loader,
      resolveStaleReload,
    )
  })
})

test('navigating away from a pending route aborts its loader', async () => {
  let loaderSignal: AbortSignal | undefined
  const rootRoute = new BaseRootRoute({})
  const fooRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    pendingMs: 0,
    loader: async ({ abortController }) => {
      loaderSignal = abortController.signal
      await new Promise<void>((resolve) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            resolve()
          },
          { once: true },
        )
      })
    },
    pendingComponent: {},
  })
  const barRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/bar',
  })
  const routeTree = rootRoute.addChildren([fooRoute, barRoute])
  const router = createTestRouter({ routeTree, history: createMemoryHistory() })

  await router.load()
  const fooNavigation = router.navigate({ to: '/foo' })

  await vi.waitFor(() => {
    expect(loaderSignal).toBeDefined()
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: fooRoute.id,
      status: 'pending',
    })
  })

  await router.navigate({ to: '/bar' })
  await fooNavigation

  expect(router.state.location.pathname).toBe('/bar')
  expect(router.state.resolvedLocation?.pathname).toBe('/bar')
  expect(router.state.status).toBe('idle')
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: barRoute.id,
    status: 'success',
  })
  expect(
    router.state.matches.some((match) => match.routeId === fooRoute.id),
  ).toBe(false)
  expect(loaderSignal?.aborted).toBe(true)
})

describe('head execution', () => {
  const getTitle = (match: { meta?: unknown }) =>
    (match.meta as Array<{ title?: string }> | undefined)?.[0]?.title

  const setupBeforeLoadNotFoundHierarchy = (throwAtIndex: 1 | 2 | 3) => {
    const loaderResolvers: Array<(() => void) | undefined> = []

    const makeLoader = (index: number) =>
      vi.fn(async () => {
        await new Promise<void>((resolve) => {
          loaderResolvers[index] = resolve
        })
        return { level: index }
      })

    const makeHead = (label: string) =>
      vi.fn(() => ({ meta: [{ title: label }] }))

    const rootRoute = new BaseRootRoute({
      loader: makeLoader(0),
      head: makeHead('Root'),
    })

    const level1Route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/level-1',
      loader: makeLoader(1),
      head: makeHead('Level 1'),
      beforeLoad:
        throwAtIndex === 1
          ? () => {
              throw notFound()
            }
          : undefined,
    })

    const level2Route = new BaseRoute({
      getParentRoute: () => level1Route,
      path: '/level-2',
      loader: makeLoader(2),
      head: makeHead('Level 2'),
      beforeLoad:
        throwAtIndex === 2
          ? () => {
              throw notFound()
            }
          : undefined,
    })

    const level3Route = new BaseRoute({
      getParentRoute: () => level2Route,
      path: '/level-3',
      loader: makeLoader(3),
      head: makeHead('Level 3'),
      beforeLoad:
        throwAtIndex === 3
          ? () => {
              throw notFound()
            }
          : undefined,
    })

    const routeTree = rootRoute.addChildren([
      level1Route.addChildren([level2Route.addChildren([level3Route])]),
    ])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/level-1/level-2/level-3'],
      }),
    })

    const routes = [rootRoute, level1Route, level2Route, level3Route] as const
    const loaders = routes.map(
      (route) => route.options.loader as ReturnType<typeof makeLoader>,
    )
    const heads = routes.map(
      (route) => route.options.head as ReturnType<typeof makeHead>,
    )
    return {
      router,
      routes,
      loaders,
      heads,
      loaderResolvers,
    }
  }

  const assertBeforeLoadNotFoundHierarchy = async (throwAtIndex: 1 | 2 | 3) => {
    const { router, routes, loaders, heads, loaderResolvers } =
      setupBeforeLoadNotFoundHierarchy(throwAtIndex)

    let loadResolved = false
    const loadPromise = router.load().then(() => {
      loadResolved = true
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(loadResolved).toBe(false)

    await vi.waitFor(() => {
      loaders.forEach((loader, index) => {
        expect(loader).toHaveBeenCalledTimes(index < throwAtIndex ? 1 : 0)
      })
    })
    for (let i = 0; i < throwAtIndex; i++) {
      loaderResolvers[i]!()
    }

    await loadPromise

    const titles = router.state.matches.map(getTitle)
    expect(titles.slice(0, throwAtIndex + 1)).toEqual(
      ['Root', 'Level 1', 'Level 2', 'Level 3'].slice(0, throwAtIndex + 1),
    )
    expect(titles.slice(throwAtIndex + 1).every((title) => !title)).toBe(true)
    heads.forEach((head, index) => {
      expect(head).toHaveBeenCalledTimes(index <= throwAtIndex ? 1 : 0)
    })

    for (let i = 0; i < throwAtIndex; i++) {
      const route = routes[i]!
      const match = router.state.matches.find((m) => m.routeId === route.id)
      expect(match?.loaderData).toEqual({ level: i })
    }

    const thrownRoute = routes[throwAtIndex]!
    const thrownMatch = router.state.matches.find(
      (m) => m.routeId === thrownRoute.id,
    )
    expect(thrownMatch?.status).toBe('notFound')
  }

  ;([1, 2, 3] as const).forEach((throwAtIndex) => {
    test(`beforeLoad notFound at hierarchy level ${throwAtIndex} waits for parent loader data and executes heads`, async () => {
      await assertBeforeLoadNotFoundHierarchy(throwAtIndex)
    })
  })

  test('projects head when loader throws notFound', async () => {
    const head = vi.fn(() => ({ meta: [{ title: 'Test' }] }))
    const rootRoute = new BaseRootRoute({})
    const testRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test',
      loader: () => {
        throw notFound()
      },
      head,
    })
    const routeTree = rootRoute.addChildren([testRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test'] }),
    })

    await router.load()

    const match = router.state.matches.find((m) => m.routeId === testRoute.id)
    expect(match?.status).toBe('notFound')
    expect(match?.meta).toEqual([{ title: 'Test' }])
    expect(head).toHaveBeenCalledTimes(1)
  })

  test('propagates sync beforeLoad non-notFound error running ancestor loaders and heads', async () => {
    const beforeLoadError = new Error('beforeLoad-sync-error')
    const rootLoader = vi.fn(() => ({ level: 0 }))
    const rootHead = vi.fn(() => ({ meta: [{ title: 'Root' }] }))
    const rootRoute = new BaseRootRoute({
      loader: rootLoader,
      head: rootHead,
    })

    const childLoader = vi.fn(() => ({ level: 1 }))
    const childHead = vi.fn(() => ({ meta: [{ title: 'Child' }] }))
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test',
      beforeLoad: () => {
        throw beforeLoadError
      },
      loader: childLoader,
      head: childHead,
    })

    const routeTree = rootRoute.addChildren([childRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test'] }),
    })

    await router.load()

    expect(
      router.state.matches.find((match) => match.routeId === childRoute.id)
        ?.error,
    ).toBe(beforeLoadError)

    expect(router.state.matches[0]?.loaderData).toEqual({ level: 0 })
    expect(router.state.matches.map(getTitle)).toEqual(['Root', 'Child'])
    expect(rootLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).not.toHaveBeenCalled()
    expect(rootHead).toHaveBeenCalledTimes(1)
    expect(childHead).toHaveBeenCalledTimes(1)
  })

  test('propagates async beforeLoad non-notFound error running ancestor loaders and heads', async () => {
    const beforeLoadError = new Error('beforeLoad-async-error')
    const rootLoader = vi.fn(() => ({ level: 0 }))
    const rootHead = vi.fn(() => ({ meta: [{ title: 'Root' }] }))
    const rootRoute = new BaseRootRoute({
      loader: rootLoader,
      head: rootHead,
    })

    const childLoader = vi.fn(() => ({ level: 1 }))
    const childHead = vi.fn(() => ({ meta: [{ title: 'Child' }] }))
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test',
      beforeLoad: async () => {
        await Promise.resolve()
        throw beforeLoadError
      },
      loader: childLoader,
      head: childHead,
    })

    const routeTree = rootRoute.addChildren([childRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test'] }),
    })

    await router.load()

    expect(
      router.state.matches.find((match) => match.routeId === childRoute.id)
        ?.error,
    ).toBe(beforeLoadError)

    expect(router.state.matches[0]?.loaderData).toEqual({ level: 0 })
    expect(router.state.matches.map(getTitle)).toEqual(['Root', 'Child'])
    expect(rootLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).not.toHaveBeenCalled()
    expect(rootHead).toHaveBeenCalledTimes(1)
    expect(childHead).toHaveBeenCalledTimes(1)
  })

  describe('beforeLoad notFound parent loader outcomes', () => {
    type ThrowAtIndex = 1 | 2 | 3
    type ParentFailure = 'notFound' | 'redirect' | 'error'
    type ParentFailureMap = Partial<Record<0 | 1 | 2, ParentFailure>>
    type Scenario = {
      name: string
      throwAtIndex: ThrowAtIndex
      parentFailures: ParentFailureMap
      expectedErrorKind: 'notFound' | 'redirect'
      expectedErrorSource?: string
      expectedBoundaryIndex?: 0 | 1 | 2 | 3
      expectedLoaderCount: number
      expectedHeadTitles: Array<string>
      beforeLoadNotFoundFactory?: (
        routes: readonly [any, any, any, any],
      ) => ReturnType<typeof notFound>
    }

    const setupScenario = ({
      throwAtIndex,
      parentFailures,
      beforeLoadNotFoundFactory,
      skipRootLoaderOnReload = false,
    }: {
      throwAtIndex: ThrowAtIndex
      parentFailures: ParentFailureMap
      beforeLoadNotFoundFactory?: Scenario['beforeLoadNotFoundFactory']
      skipRootLoaderOnReload?: boolean
    }) => {
      const makeHead = (label: string) =>
        vi.fn(() => ({ meta: [{ title: label }] }))

      const makeLoader = (index: number) =>
        vi.fn(({ location }: { location: { pathname: string } }) => {
          // Keep failures scoped to the route under test. A root loader which
          // redirects unconditionally would also redirect the destination and
          // describe an infinite redirect loop rather than precedence between
          // the original lane's settled outcomes.
          if (location.pathname !== '/redirect-target') {
            const failure = parentFailures[index as 0 | 1 | 2]
            if (failure === 'notFound') {
              throw notFound({ data: { source: `loader-${index}` } })
            }
            if (failure === 'redirect') {
              throw redirect({ to: '/redirect-target' })
            }
            if (failure === 'error') {
              throw new Error(`loader-${index}-error`)
            }
          }
          return { level: index }
        })

      const rootRoute = new BaseRootRoute({
        loader: makeLoader(0),
        head: makeHead('Root'),
        ...(skipRootLoaderOnReload
          ? { staleTime: Infinity, shouldReload: () => false }
          : {}),
      })

      const level1Route = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/level-1',
        loader: makeLoader(1),
        head: makeHead('Level 1'),
      })

      const level2Route = new BaseRoute({
        getParentRoute: () => level1Route,
        path: '/level-2',
        loader: makeLoader(2),
        head: makeHead('Level 2'),
      })

      const level3Route = new BaseRoute({
        getParentRoute: () => level2Route,
        path: '/level-3',
        loader: makeLoader(3),
        head: makeHead('Level 3'),
      })

      const redirectTargetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/redirect-target',
      })

      const routeTree = rootRoute.addChildren([
        level1Route.addChildren([level2Route.addChildren([level3Route])]),
        redirectTargetRoute,
      ])

      const routes = [rootRoute, level1Route, level2Route, level3Route] as const
      const loaders = routes.map(
        (route) => route.options.loader as ReturnType<typeof makeLoader>,
      )
      const heads = routes.map(
        (route) => route.options.head as ReturnType<typeof makeHead>,
      )

      const throwRoute = routes[throwAtIndex]!
      throwRoute.options.beforeLoad = () => {
        const beforeLoadNotFound = beforeLoadNotFoundFactory
          ? beforeLoadNotFoundFactory(routes)
          : notFound({ data: { source: `beforeLoad-${throwAtIndex}` } })
        throw beforeLoadNotFound
      }

      const router = createTestRouter({
        routeTree,
        history: createMemoryHistory({
          initialEntries: ['/level-1/level-2/level-3'],
        }),
      })

      return {
        router,
        routes,
        loaders,
        heads,
      }
    }

    const scenarios = [
      {
        name: 'throws beforeLoad notFound when parent loaders succeed',
        throwAtIndex: 3 as const,
        parentFailures: {} as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'beforeLoad-3',
        expectedBoundaryIndex: 3,
        expectedLoaderCount: 3,
        expectedHeadTitles: ['Root', 'Level 1', 'Level 2', 'Level 3'],
      },
      {
        name: 'promotes a fresh parent loader notFound above a serial child notFound',
        throwAtIndex: 3 as const,
        parentFailures: { 1: 'notFound' } as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'loader-1',
        expectedBoundaryIndex: 1,
        expectedLoaderCount: 3,
        expectedHeadTitles: ['Root', 'Level 1'],
      },
      {
        name: 'promotes the first fresh parent loader failure above a serial child notFound',
        throwAtIndex: 3 as const,
        parentFailures: { 1: 'notFound', 2: 'notFound' } as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'loader-1',
        expectedBoundaryIndex: 1,
        expectedLoaderCount: 3,
        expectedHeadTitles: ['Root', 'Level 1'],
      },
      {
        name: 'promotes a fresh root loader notFound above a serial child notFound',
        throwAtIndex: 2 as const,
        parentFailures: { 0: 'notFound' } as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'loader-0',
        expectedBoundaryIndex: 0,
        expectedLoaderCount: 2,
        expectedHeadTitles: ['Root'],
      },
      {
        name: 'uses explicit routeId from beforeLoad notFound to target ancestor boundary',
        throwAtIndex: 3 as const,
        parentFailures: {} as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'beforeLoad-explicit-level1',
        expectedBoundaryIndex: 1,
        expectedLoaderCount: 2,
        expectedHeadTitles: ['Root', 'Level 1'],
        beforeLoadNotFoundFactory: (routes) =>
          notFound({
            routeId: routes[1].id as never,
            data: { source: 'beforeLoad-explicit-level1' },
          }),
      },
      {
        name: 'falls back to root boundary when beforeLoad notFound uses unknown routeId',
        throwAtIndex: 3 as const,
        parentFailures: {} as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'beforeLoad-invalid-route',
        expectedBoundaryIndex: 0,
        expectedLoaderCount: 1,
        expectedHeadTitles: ['Root'],
        beforeLoadNotFoundFactory: () =>
          notFound({
            routeId: '/does-not-exist' as never,
            data: { source: 'beforeLoad-invalid-route' },
          }),
      },
      {
        name: 'falls back to root boundary when beforeLoad notFound uses non-exact routeId',
        throwAtIndex: 3 as const,
        parentFailures: {} as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'beforeLoad-non-exact-route',
        expectedBoundaryIndex: 0,
        expectedLoaderCount: 1,
        expectedHeadTitles: ['Root'],
        beforeLoadNotFoundFactory: (routes) =>
          notFound({
            routeId: `${routes[1].id}/` as never,
            data: { source: 'beforeLoad-non-exact-route' },
          }),
      },
      {
        name: 'prioritizes redirect when parent loader throws redirect',
        throwAtIndex: 3 as const,
        parentFailures: { 0: 'redirect' } as ParentFailureMap,
        expectedErrorKind: 'redirect' as const,
        expectedErrorSource: undefined,
        expectedLoaderCount: 3,
        expectedHeadTitles: ['Root'],
      },
      {
        name: 'prioritizes redirect over root-loader notFound when both appear in settled loaders',
        throwAtIndex: 3 as const,
        parentFailures: { 0: 'notFound', 1: 'redirect' } as ParentFailureMap,
        expectedErrorKind: 'redirect' as const,
        expectedErrorSource: undefined,
        expectedLoaderCount: 3,
        expectedHeadTitles: ['Root'],
      },
      {
        name: 'promotes the first fresh parent failure when later loaders fail differently',
        throwAtIndex: 3 as const,
        parentFailures: { 1: 'notFound', 2: 'error' } as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'loader-1',
        expectedBoundaryIndex: 1,
        expectedLoaderCount: 3,
        expectedHeadTitles: ['Root', 'Level 1'],
      },
    ] satisfies Array<Scenario>

    test.each(scenarios)('$name', async (scenario) => {
      const { router, routes, loaders, heads } = setupScenario({
        throwAtIndex: scenario.throwAtIndex,
        parentFailures: scenario.parentFailures,
        beforeLoadNotFoundFactory: scenario.beforeLoadNotFoundFactory,
      })

      await router.load()
      const matches = router.state.matches

      if (scenario.expectedErrorKind === 'redirect') {
        expect(router.state.location.pathname).toBe('/redirect-target')
        expect(matches.at(-1)).toEqual(
          expect.objectContaining({
            pathname: '/redirect-target',
            status: 'success',
          }),
        )
        expect(matches.some((match) => match.error !== undefined)).toBe(false)
        expect(matches.some((match) => match._notFound)).toBe(false)
      } else {
        const boundary = matches.find(
          (match) => match.status === 'notFound' || match._notFound,
        )!
        expect(boundary.routeId).toBe(
          routes[scenario.expectedBoundaryIndex!]!.id,
        )

        expect(boundary.error).toEqual(
          expect.objectContaining({
            isNotFound: true,
            data: { source: scenario.expectedErrorSource },
          }),
        )

        if (scenario.expectedBoundaryIndex === 0) {
          expect(boundary.status).toBe('success')
          expect(boundary._notFound).toBe(true)
        } else {
          expect(boundary.status).toBe('notFound')
          expect(boundary.error).toEqual(
            expect.objectContaining({ routeId: boundary.routeId }),
          )
        }
      }

      loaders.forEach((loader, index) => {
        const originalLaneCalls = loader.mock.calls.filter(
          ([options]) =>
            options.location.pathname === '/level-1/level-2/level-3',
        )
        expect(originalLaneCalls).toHaveLength(
          index < scenario.expectedLoaderCount ? 1 : 0,
        )
      })
      heads.forEach((head, index) => {
        expect(head).toHaveBeenCalledTimes(
          index < scenario.expectedHeadTitles.length ? 1 : 0,
        )
      })
      expect(
        matches.map(getTitle).filter((title) => title !== undefined),
      ).toEqual(scenario.expectedHeadTitles)
      expect(router.state.status).toBe('idle')
    })

    test('sets _notFound on root match when beforeLoad notFound targets root boundary', async () => {
      const { router, routes } = setupScenario({
        throwAtIndex: 3,
        parentFailures: {},
        beforeLoadNotFoundFactory: (innerRoutes) =>
          notFound({
            routeId: innerRoutes[0].id as never,
            data: { source: 'beforeLoad-root-explicit' },
          }),
      })

      await router.load()

      const rootMatch = router.state.matches.find(
        (m) => m.routeId === routes[0].id,
      )

      expect(rootMatch?._notFound).toBe(true)
      expect(rootMatch?.status).toBe('success')
      expect(rootMatch?.error).toEqual(
        expect.objectContaining({
          isNotFound: true,
          data: { source: 'beforeLoad-root-explicit' },
        }),
      )
    })

    test('clears stale root _notFound when the root loader is skipped on a successful reload', async () => {
      const { router, routes, loaders } = setupScenario({
        throwAtIndex: 3,
        parentFailures: {},
        skipRootLoaderOnReload: true,
        beforeLoadNotFoundFactory: (innerRoutes) =>
          notFound({
            routeId: innerRoutes[0].id as never,
            data: { source: 'beforeLoad-root-explicit' },
          }),
      })

      await router.load()
      const initialRootMatch = router.state.matches.find(
        (match) => match.routeId === routes[0].id,
      )
      expect(initialRootMatch?._notFound).toBe(true)
      expect(initialRootMatch?.error).toEqual(
        expect.objectContaining({
          isNotFound: true,
          data: { source: 'beforeLoad-root-explicit' },
        }),
      )
      expect(loaders[0]).toHaveBeenCalledTimes(1)

      const throwingRoute = routes[3]
      throwingRoute.options.beforeLoad = undefined

      await router.load()

      const rootMatch = router.state.matches.find(
        (m) => m.routeId === routes[0].id,
      )

      expect(rootMatch?._notFound).toBe(false)
      expect(rootMatch?.status).toBe('success')
      expect(loaders[0]).toHaveBeenCalledTimes(1)
    })
  })
})

describe('params.parse notFound', () => {
  test('throws notFound on invalid params', async () => {
    const rootRoute = new BaseRootRoute({})
    const testRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test/$id',
      params: {
        parse: ({ id }: { id: string }) => {
          const parsed = parseInt(id, 10)
          if (Number.isNaN(parsed)) {
            throw notFound()
          }
          return { id: parsed }
        },
      },
    })
    const routeTree = rootRoute.addChildren([testRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test/invalid'] }),
    })

    await router.load()

    const match = router.stores.matches
      .get()
      .find((m) => m.routeId === testRoute.id)

    expect(match?.status).toBe('notFound')
  })

  test('succeeds on valid params', async () => {
    const rootRoute = new BaseRootRoute({})
    const testRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test/$id',
      params: {
        parse: ({ id }: { id: string }) => {
          const parsed = parseInt(id, 10)
          if (Number.isNaN(parsed)) {
            throw notFound()
          }
          return { id: parsed }
        },
      },
    })
    const routeTree = rootRoute.addChildren([testRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test/123'] }),
    })

    await router.load()

    const match = router.state.matches.find((m) => m.routeId === testRoute.id)
    expect(match?.status).toBe('success')
  })
})

describe('routeId in context options', () => {
  test('beforeLoad and context receive correct routeId for root route', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({
      beforeLoad,
      context,
    })

    const routeTree = rootRoute.addChildren([])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.load()

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: rootRouteId,
      }),
    )

    expect(context).toHaveBeenCalledTimes(1)
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: rootRouteId,
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for child route', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad,
      context,
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/foo',
      }),
    )

    expect(context).toHaveBeenCalledTimes(1)
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/foo',
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for nested route', async () => {
    const parentBeforeLoad = vi.fn()
    const parentContext = vi.fn()
    const childBeforeLoad = vi.fn()
    const childContext = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: parentBeforeLoad,
      context: parentContext,
    })

    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: childBeforeLoad,
      context: childContext,
    })

    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })

    expect(parentBeforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent',
      }),
    )
    expect(parentContext).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent',
      }),
    )
    expect(childBeforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent/child',
      }),
    )
    expect(childContext).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent/child',
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for route with dynamic params', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const postRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$postId',
      beforeLoad,
      context,
    })

    const routeTree = rootRoute.addChildren([postRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/posts/$postId', params: { postId: '123' } })

    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/posts/$postId',
      }),
    )
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/posts/$postId',
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for layout route', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const layoutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: '/_layout',
      beforeLoad,
      context,
    })

    const indexRoute = new BaseRoute({
      getParentRoute: () => layoutRoute,
      path: '/',
    })

    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.load()

    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/_layout',
      }),
    )
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/_layout',
      }),
    )
  })
})

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
