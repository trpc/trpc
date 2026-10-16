import { createBrowserHistory, createMemoryHistory } from '@tanstack/history'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import { createTestRouter } from './routerTestUtils'
import type { RouterHistory } from '@tanstack/history'
import type { LocationRewrite } from '../src'

const externalHref = 'https://admin.example.com/dashboard'

function setupRouter({
  isServer = false,
  basepath,
  history = createMemoryHistory({ initialEntries: ['/'] }),
  rewrite = {
    output: ({ url }) => {
      if (url.pathname === '/admin') {
        return new URL(externalHref + url.search + url.hash)
      }
      return url
    },
  },
}: {
  isServer?: boolean
  basepath?: string
  history?: RouterHistory
  rewrite?: LocationRewrite
} = {}) {
  const rootRoute = new BaseRootRoute()
  const loader = vi.fn(() => 'admin')
  const routeTree = rootRoute.addChildren([
    new BaseRoute({ getParentRoute: () => rootRoute, path: '/' }),
    new BaseRoute({ getParentRoute: () => rootRoute, path: '/local' }),
    new BaseRoute({ getParentRoute: () => rootRoute, path: '/admin', loader }),
  ])
  const router = createTestRouter({
    routeTree,
    history,
    origin: 'https://example.com',
    isServer,
    basepath,
    rewrite,
  })
  const windowLocation = { href: '', replace: vi.fn() }
  vi.stubGlobal('window', { location: windowLocation })

  return { router, history, windowLocation, loader }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SSR redirects to cross-origin rewrites', () => {
  test.each([
    { hook: 'beforeLoad', statusCode: undefined },
    { hook: 'beforeLoad', statusCode: 308 },
    { hook: 'loader', statusCode: undefined },
    { hook: 'loader', statusCode: 308 },
  ] as const)(
    'returns the rewritten HTTP redirect from $hook (statusCode=$statusCode)',
    async ({ hook, statusCode }) => {
      const rootRoute = new BaseRootRoute()
      const throwRedirect = vi.fn(() => {
        throw redirect({
          to: '/admin',
          search: { page: 2 },
          hash: 'details',
          statusCode,
        })
      })
      const destinationLoader = vi.fn(() => 'admin')
      const router = createTestRouter({
        isServer: true,
        routeTree: rootRoute.addChildren([
          new BaseRoute({
            getParentRoute: () => rootRoute,
            path: '/redirecting',
            [hook]: throwRedirect,
          }),
          new BaseRoute({
            getParentRoute: () => rootRoute,
            path: '/admin',
            loader: destinationLoader,
          }),
        ]),
        rewrite: {
          output: ({ url }) => {
            if (url.pathname === '/admin') {
              return new URL(externalHref + url.search + url.hash)
            }
            return url
          },
        },
      })
      const render = vi.fn(() => new Response('rendered HTML'))
      vi.stubGlobal('window', undefined)

      const response = await createRequestHandler({
        createRouter: () => router,
        request: new Request('https://example.com/redirecting'),
      })(render)

      expect(throwRedirect).toHaveBeenCalledOnce()
      expect(response.status).toBe(statusCode ?? 307)
      expect(response.headers.get('Location')).toBe(
        `${externalHref}?page=2#details`,
      )
      expect(render).not.toHaveBeenCalled()
      expect(destinationLoader).not.toHaveBeenCalled()
    },
  )
})

describe('document navigation', () => {
  test.each([false, true])(
    'navigates to the final cross-origin output (replace=%s)',
    async (replace) => {
      const { router, history, windowLocation, loader } = setupRouter()
      const push = vi.spyOn(history, 'push')
      const replaceHistory = vi.spyOn(history, 'replace')
      const location = router.state.location

      await router.navigate({
        to: '/admin',
        search: { page: 2 },
        hash: 'details',
        replace,
      })

      const href = `${externalHref}?page=2#details`
      if (replace) {
        expect(windowLocation.replace).toHaveBeenCalledWith(href)
        expect(windowLocation.href).toBe('')
      } else {
        expect(windowLocation.href).toBe(href)
        expect(windowLocation.replace).not.toHaveBeenCalled()
      }
      expect(push).not.toHaveBeenCalled()
      expect(replaceHistory).not.toHaveBeenCalled()
      expect(loader).not.toHaveBeenCalled()
      expect(router.state.location).toBe(location)
      expect(router._commitPromise).toBeUndefined()
    },
  )

  test('commits an external public mask without rebuilding the location', async () => {
    const { router, history, windowLocation } = setupRouter()
    const location = router.buildLocation({
      to: '/local',
      mask: { to: '/admin', hash: 'masked' },
    })
    const buildLocation = vi.spyOn(router, 'buildLocation')
    const navigate = vi.spyOn(router, 'navigate')

    await router.commitLocation({ ...location, replace: true })

    expect(windowLocation.replace).toHaveBeenCalledWith(
      `${externalHref}#masked`,
    )
    expect(history.location.href).toBe('/')
    expect(buildLocation).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  test('uses history for a same-origin mask of an external output', async () => {
    const { router, history, windowLocation } = setupRouter()
    await router.load()

    await router.navigate({ to: '/admin', mask: { to: '/local' } })

    expect(history.location.href).toBe('/local')
    expect(router.state.location.pathname).toBe('/admin')
    expect(router.state.location.maskedLocation?.pathname).toBe('/local')
    expect(windowLocation.href).toBe('')
    expect(windowLocation.replace).not.toHaveBeenCalled()
  })

  test('ignores server navigation to an external output', async () => {
    const { router, history } = setupRouter({ isServer: true })
    vi.stubGlobal('window', undefined)

    await router.navigate({ to: '/admin' })

    expect(history.location.href).toBe('/')
  })

  test.each([
    {
      href: 'https://other.example/a%2fb?value=a+b&value=a%20b#raw%2f',
      publicHref: '/ignored',
    },
    {
      href: '../target?value=a+b&value=a%20b#raw%2f',
      reloadDocument: true,
    },
  ])('preserves a raw document href: $href', async (options) => {
    const output = vi.fn(({ url }) => url)
    const { router, windowLocation } = setupRouter({
      basepath: '/app',
      rewrite: { output },
    })
    const buildLocation = vi.spyOn(router, 'buildLocation')

    await router.navigate(options)

    expect(windowLocation.href).toBe(options.href)
    expect(buildLocation).not.toHaveBeenCalled()
    expect(output).not.toHaveBeenCalled()
  })

  test.each([undefined, 'https://public.example/prepared'])(
    'preserves explicit reload publicHref precedence (%s)',
    async (publicHref) => {
      const { router, windowLocation } = setupRouter()
      const buildLocation = vi.spyOn(router, 'buildLocation')

      await router.navigate({
        to: '/admin',
        href: '/admin',
        publicHref,
        reloadDocument: true,
      })

      expect(windowLocation.href).toBe(publicHref ?? externalHref)
      expect(buildLocation).toHaveBeenCalledTimes(1)
    },
  )

  describe.each(['memory', 'browser'] as const)(
    '%s history blockers',
    (kind) => {
      test.each([
        { reloadDocument: false, replace: false },
        { reloadDocument: false, replace: true },
        { reloadDocument: true, replace: false },
        { reloadDocument: true, replace: true },
      ])(
        'respects registered blockers and ignoreBlocker (reloadDocument=$reloadDocument, replace=$replace)',
        async ({ reloadDocument, replace }) => {
          const history =
            kind === 'browser'
              ? createBrowserHistory()
              : createMemoryHistory({ initialEntries: ['/'] })
          try {
            const { router, windowLocation } = setupRouter({ history })
            const blockerFn = vi.fn(async () => true)
            history.block({ blockerFn, enableBeforeUnload: false })
            const location = history.location

            await router.navigate({ to: '/admin', reloadDocument, replace })

            expect(blockerFn).toHaveBeenCalledExactlyOnceWith({
              currentLocation: location,
              nextLocation: location,
              action: replace ? 'REPLACE' : 'PUSH',
            })
            expect(windowLocation.href).toBe('')
            expect(windowLocation.replace).not.toHaveBeenCalled()
            expect(history.location).toBe(location)

            await router.navigate({
              to: '/admin',
              reloadDocument,
              replace,
              ignoreBlocker: true,
            })

            expect(blockerFn).toHaveBeenCalledTimes(1)
            if (replace) {
              expect(windowLocation.replace).toHaveBeenCalledWith(externalHref)
              expect(windowLocation.href).toBe('')
            } else {
              expect(windowLocation.href).toBe(externalHref)
              expect(windowLocation.replace).not.toHaveBeenCalled()
            }
            expect(history.location).toBe(location)
          } finally {
            history.destroy()
          }
        },
      )
    },
  )

  test('validates the protocol of an external output before navigating', async () => {
    const href = 'javascript:alert(1)'
    const { router, history, windowLocation } = setupRouter({
      rewrite: { output: () => new URL(href) },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await router.navigate({ to: '/admin' })

    expect(windowLocation.href).toBe('')
    expect(windowLocation.replace).not.toHaveBeenCalled()
    expect(history.location.href).toBe('/')
    expect(warn).toHaveBeenCalledWith(
      `Blocked navigation to dangerous protocol: ${href}`,
    )
  })
})
