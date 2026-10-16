import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

describe('redirect target errors', () => {
  test.each([false, true])(
    'a client redirect target error becomes the originating route error (reloadDocument=%s)',
    async (reloadDocument) => {
      const boom = new Error('resolveRedirect failed')
      const errorComponentGate = createControlledPromise<void>()
      const errorComponentStarted = createControlledPromise<void>()
      const errorComponentPreload = vi.fn(() => {
        errorComponentStarted.resolve()
        return errorComponentGate
      })
      const ErrorComponent = Object.assign(() => null, {
        preload: errorComponentPreload,
      })

      const rootLoader = vi.fn(() => 'root data')
      const onError = vi.fn()
      const rootRoute = new BaseRootRoute({ loader: rootLoader })
      const badRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/bad',
        beforeLoad: () => {
          throw redirect({
            to: '/bad',
            reloadDocument,
            search: () => {
              throw boom
            },
          })
        },
        onError,
        errorComponent: ErrorComponent,
      })
      const safeLoader = vi.fn(() => 'safe data')
      const safeRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/safe',
        loader: safeLoader,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([badRoute, safeRoute]),
        history: createMemoryHistory({ initialEntries: ['/bad'] }),
      })

      const load = router.load()
      const outcome = await Promise.race([
        load.then(() => 'load-settled' as const),
        errorComponentStarted.then(() => 'error-preload-started' as const),
      ])
      expect(outcome).toBe('error-preload-started')
      expect(rootLoader).toHaveBeenCalledOnce()
      expect(onError).toHaveBeenCalledWith(boom)

      errorComponentGate.resolve()
      await load
      expect(errorComponentPreload).toHaveBeenCalledOnce()
      expect(router.state.status).toBe('idle')
      expect(router.state.location.pathname).toBe('/bad')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: badRoute.id,
        status: 'error',
        error: boom,
      })

      await router.navigate({ to: '/safe' })
      expect(router.state.location.pathname).toBe('/safe')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: safeRoute.id,
        status: 'success',
        loaderData: 'safe data',
      })
      expect(safeLoader).toHaveBeenCalledTimes(1)
    },
  )

  test('a server redirect target error becomes the originating route error', async () => {
    const boom = new Error('resolveRedirect failed')
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const badRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bad',
      beforeLoad: () => {
        throw redirect({
          to: '/bad',
          search: () => {
            throw boom
          },
        })
      },
      onError,
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([badRoute]),
      history: createMemoryHistory({ initialEntries: ['/bad'] }),
    })

    const response = await loadServerResponse(router, '/bad')

    expect(response.status).toBe(500)
    expect(response.headers.get('Location')).toBeNull()
    expect(onError).toHaveBeenCalledWith(boom)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: badRoute.id,
      status: 'error',
      error: boom,
    })
  })

  test('a server loader redirect target error becomes the route error', async () => {
    const boom = new Error('server loader redirect failed')
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const badRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bad',
      loader: () =>
        redirect({
          to: '/target',
          hash: () => {
            throw boom
          },
        }),
      onError,
      errorComponent: () => null,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([badRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/bad'] }),
    })

    const response = await loadServerResponse(router, '/bad')

    expect(response.status).toBe(500)
    expect(onError).toHaveBeenCalledWith(boom)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: badRoute.id,
      status: 'error',
      error: boom,
    })
  })

  test.each([false, true])(
    'a loader redirect target error becomes the originating route error (reloadDocument=%s)',
    async (reloadDocument) => {
      const boom = new Error('redirect hash failed')
      const onError = vi.fn()
      const rootRoute = new BaseRootRoute({})
      const badRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/bad',
        loader: () =>
          redirect({
            to: '/target',
            reloadDocument,
            hash: () => {
              throw boom
            },
          }),
        onError,
        errorComponent: () => null,
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([badRoute, targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/bad'] }),
      })

      await router.load()

      expect(onError).toHaveBeenCalledWith(boom)
      expect(router.state.location.pathname).toBe('/bad')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: badRoute.id,
        status: 'error',
        error: boom,
      })
    },
  )

  test('an internal href parse error becomes the originating route error', async () => {
    const boom = new Error('redirect search parse failed')
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      beforeLoad: () => {
        throw redirect({ href: '/target?bad' })
      },
      onError,
      errorComponent: () => null,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
      parseSearch: (search) => {
        if (search) {
          throw boom
        }
        return {}
      },
    })

    await router.load()

    expect(onError).toHaveBeenCalledWith(boom)
    expect(router.state.location.pathname).toBe('/source')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: sourceRoute.id,
      status: 'error',
      error: boom,
    })
  })

  test('an unsafe document href becomes the originating route error', async () => {
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => redirect({ href: 'javascript:alert(1)' }),
      onError,
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
    })

    await router.load()

    const error = onError.mock.calls[0]?.[0]
    expect(error).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('unsafe protocol'),
      }),
    )
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: sourceRoute.id,
      status: 'error',
      error,
    })
  })

  test('a protocol-relative redirect becomes the originating route error', async () => {
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => redirect({ href: '/\\evil.example' }),
      onError,
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
    })

    await router.load()

    const error = onError.mock.calls[0]?.[0]
    expect(error).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('unsafe protocol'),
      }),
    )
    expect(router.state.location.pathname).toBe('/source')
  })

  test('a preload does not build a document redirect target', async () => {
    const search = vi.fn(() => ({ redirected: true }))
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      beforeLoad: () =>
        redirect({
          to: '/target',
          search,
          reloadDocument: true,
        }),
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = await router.preloadRoute({ to: '/source' })

    expect(matches).toBeUndefined()
    expect(search).not.toHaveBeenCalled()
  })

  test('request cancellation discards a late redirect without finalizing it', async () => {
    const cancellation = new Error('request disconnected')
    const boom = new Error('late redirect target failed')
    const loaderStarted = createControlledPromise<void>()
    const loaderGate = createControlledPromise<ReturnType<typeof redirect>>()
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => {
        loaderStarted.resolve()
        return loaderGate
      },
      onError,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
      isServer: true,
    })
    const controller = new AbortController()
    const load = loadServerResponse(router, '/source', controller.signal)
    await loaderStarted

    controller.abort(cancellation)
    await expect(load).rejects.toBe(cancellation)
    loaderGate.resolve(
      redirect({
        to: '/target',
        search: () => {
          throw boom
        },
      }),
    )
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(onError).not.toHaveBeenCalled()
  })

  test('a background redirect target error publishes after foreground commit', async () => {
    const boom = new Error('background redirect target failed')
    const reloadStarted = createControlledPromise<void>()
    const reloadGate = createControlledPromise<ReturnType<typeof redirect>>()
    const onError = vi.fn()
    let loads = 0
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: () => {
        if (++loads === 1) {
          return 'initial data'
        }
        reloadStarted.resolve()
        return reloadGate
      },
      onError,
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    const invalidation = router.invalidate()
    await reloadStarted
    await invalidation
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      loaderData: 'initial data',
    })

    reloadGate.resolve(
      redirect({
        to: '/page',
        search: () => {
          throw boom
        },
      }),
    )

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(boom))
    await vi.waitFor(() =>
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: pageRoute.id,
        status: 'error',
        error: boom,
      }),
    )
  })

  test('a successful redirect target is built once', async () => {
    const search = vi.fn(() => ({ redirected: true }))
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => redirect({ to: '/target', search }),
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
    })

    await router.load()

    expect(search).toHaveBeenCalledOnce()
    expect(router.state.location).toMatchObject({
      pathname: '/target',
      search: { redirected: true },
    })
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
  })

  test('a shared loader redirect is materialized for each preload lane', async () => {
    const loaderStarted = createControlledPromise<void>()
    const loaderGate = createControlledPromise<ReturnType<typeof redirect>>()
    const sourceLoader = vi.fn(() => {
      loaderStarted.resolve()
      return loaderGate
    })
    const searchUpdater = vi.fn((search: { version?: number }) => ({
      version: search.version,
    }))
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      validateSearch: (search: Record<string, unknown>) => ({
        version: Number(search.version),
      }),
      loader: sourceLoader,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        version: Number(search.version),
      }),
      loaderDeps: ({ search }) => ({ version: search.version }),
      loader: ({ deps }) => deps.version,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const first = router.preloadRoute({
      to: '/source',
      search: { version: 1 },
    })
    await loaderStarted
    const second = router.preloadRoute({
      to: '/source',
      search: { version: 2 },
    })
    await vi.waitFor(() => expect(sourceLoader).toHaveBeenCalledOnce())

    loaderGate.resolve(
      redirect({ to: '/target', search: searchUpdater } as any),
    )
    const [firstMatches, secondMatches] = await Promise.all([first, second])

    expect(sourceLoader).toHaveBeenCalledOnce()
    expect(searchUpdater).toHaveBeenCalledTimes(2)
    expect(firstMatches?.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      loaderData: 1,
    })
    expect(secondMatches?.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      loaderData: 2,
    })
  })

  test.each([false, true])(
    'document redirects materialize the mask within route error handling (throws=%s)',
    async (throws) => {
      const boom = new Error('mask search failed')
      const onError = vi.fn()
      const maskSearch = vi.fn(() => {
        if (throws) {
          throw boom
        }
        return { masked: true }
      })
      const rootRoute = new BaseRootRoute({})
      const sourceRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/source',
        loader: () =>
          redirect({
            to: '/target',
            reloadDocument: true,
            mask: { to: '/pretty', search: maskSearch },
          }),
        onError,
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/source'] }),
        isServer: false,
      })
      const windowLocation = { replace: vi.fn() }
      vi.stubGlobal('window', { location: windowLocation })
      try {
        await router.load()
        expect(maskSearch).toHaveBeenCalledOnce()
        if (throws) {
          expect(onError).toHaveBeenCalledWith(boom)
          expect(router.state.matches.at(-1)).toMatchObject({
            status: 'error',
            error: boom,
          })
          expect(windowLocation.replace).not.toHaveBeenCalled()
        } else {
          expect(onError).not.toHaveBeenCalled()
          expect(windowLocation.replace).toHaveBeenCalledWith(
            '/pretty?masked=true',
          )
        }
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )

  test('an external rewrite does not bind a shared redirect to the preload location', async () => {
    const loaderStarted = createControlledPromise<void>()
    const loaderGate = createControlledPromise<ReturnType<typeof redirect>>()
    const beforeLoad = vi.fn()
    const sourceLoader = vi.fn(() => {
      loaderStarted.resolve()
      return loaderGate
    })
    const searchUpdater = vi.fn((search: { version?: number }) => ({
      version: search.version,
    }))
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      validateSearch: (search: Record<string, unknown>) => ({
        version: Number(search.version),
      }),
      beforeLoad,
      loader: sourceLoader,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      rewrite: {
        output: ({ url }) =>
          url.pathname === '/target'
            ? new URL(url.pathname + url.search, 'https://other.example')
            : url,
      },
    })
    await router.load()
    const matchRoutes = vi.spyOn(router, 'matchRoutes')
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
    const preload = router.preloadRoute({
      to: '/source',
      search: { version: 1 },
    })
    await loaderStarted
    router.history.push('/source?version=2')
    const navigation = router.load()
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))
    const rawRedirect = redirect({
      to: '/target',
      search: searchUpdater,
    } as any)
    loaderGate.resolve(rawRedirect)
    await Promise.all([preload, navigation])

    expect(sourceLoader).toHaveBeenCalledOnce()
    expect(searchUpdater).toHaveBeenCalledTimes(2)
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://other.example/target?version=2',
        reloadDocument: true,
      }),
    )
    expect(
      matchRoutes.mock.calls.every(([location]) => location !== undefined),
    ).toBe(true)
    expect(rawRedirect.options.href).toBeUndefined()
    expect(rawRedirect.headers.has('Location')).toBe(false)
  })
})
