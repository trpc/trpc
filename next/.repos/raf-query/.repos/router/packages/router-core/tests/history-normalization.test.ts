import { createHashHistory, createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

const fragments = ['//section', '/\\section', '\\/section', '\\\\section']

describe('history normalization boundaries', () => {
  test.each([false, true])(
    'normalizes a pathname exposed by the basepath input rewrite (server=%s)',
    async (isServer) => {
      const root = new BaseRootRoute()
      const target = new BaseRoute({
        getParentRoute: () => root,
        path: '/target',
        loader: () => 'target data',
      })
      const router = createTestRouter({
        routeTree: root.addChildren([target]),
        basepath: '/app',
        isServer,
        history: createMemoryHistory({
          initialEntries: ['/app//target#//section'],
        }),
      })

      await router.load()

      expect(router.state.location.pathname).toBe('/target')
      expect(router.state.location.hash).toBe('//section')
      if (isServer) {
        expect(router._serverResult?.type).toBe('redirect')
        if (router._serverResult?.type === 'redirect') {
          expect(router._serverResult.redirect.headers.get('Location')).toBe(
            '/app/target#//section',
          )
        }
      } else {
        expect(router.state.matches.at(-1)).toMatchObject({
          routeId: target.id,
          status: 'success',
          loaderData: 'target data',
        })
      }
    },
  )

  test('preserves distinct logical and masked fragment data through a rewrite', async () => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: false,
      rewrite: { input: ({ url }) => url },
    })
    await router.load()
    await router.navigate({
      to: '/',
      hash: '/\\logical',
      mask: { to: '/', hash: '\\/public' },
    })
    expect(router.state.location.hash).toBe('/\\logical')
    expect(router.state.location.maskedLocation?.hash).toBe('\\/public')
    expect(router.history.location.hash).toBe('#\\/public')
  })

  test.each([
    { rewrite: false, isServer: false },
    { rewrite: true, isServer: false },
    { rewrite: false, isServer: true },
    { rewrite: true, isServer: true },
  ])(
    'normalizes a generated splat destination before output rewriting (%s)',
    ({ rewrite, isServer }) => {
      const root = new BaseRootRoute()
      const splat = new BaseRoute({ getParentRoute: () => root, path: '$' })
      const rewrittenOrigins: Array<string> = []
      const router = createTestRouter({
        routeTree: root.addChildren([splat]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        origin: 'https://app.example',
        isServer,
        rewrite: rewrite
          ? {
              output: ({ url }) => {
                rewrittenOrigins.push(url.origin)
                return url
              },
            }
          : undefined,
      })
      const location = router.buildLocation({
        to: '/$',
        params: { _splat: '/other.example/path' },
      })
      expect(location.pathname).toBe('/other.example/path')
      expect(location.publicHref).toBe('/other.example/path')
      expect(rewrittenOrigins).toEqual(rewrite ? ['https://app.example'] : [])
    },
  )

  test('normalizes protocol-relative paths from output rewrites', () => {
    const origin = 'https://victim.example'
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      origin,
      rewrite: {
        output: ({ url }) =>
          url.pathname === '/safe'
            ? new URL(`${origin}//evil.example/path`)
            : url,
      },
    })

    const location = router.buildLocation({ to: '/safe' })

    expect(location.external).toBe(false)
    expect(location.publicHref).toBe('/evil.example/path')
  })

  test.each(fragments)('preserves fragment data %j on initial load', (hash) => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      history: createMemoryHistory({ initialEntries: [`/#${hash}`] }),
    })

    expect(router.state.location.hash).toBe(hash)
    expect(router.state.location.href).toBe(`/#${hash}`)
  })

  test.each(fragments)(
    'preserves fragment data %j through navigation',
    async (hash) => {
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: false,
      })
      await router.load()
      await router.navigate({ to: '/', hash })

      expect(router.state.location.hash).toBe(hash)
      expect(router.history.location.hash).toBe(`#${hash}`)
    },
  )

  test.each(fragments)(
    'preserves fragment data %j after an input rewrite',
    (hash) => {
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history: createMemoryHistory({ initialEntries: ['/public'] }),
        rewrite: {
          input: ({ url }) => {
            url.pathname = '/'
            url.hash = hash
            return url
          },
        },
      })

      expect(router.state.location.hash).toBe(hash)
    },
  )

  test.each(fragments)(
    'preserves nested fragment data %j with hash history',
    async (hash) => {
      window.history.replaceState(null, '', `/shell#/route#${hash}`)
      const history = createHashHistory()
      try {
        const root = new BaseRootRoute()
        const router = createTestRouter({
          routeTree: root.addChildren([
            new BaseRoute({ getParentRoute: () => root, path: '/route' }),
          ]),
          history,
          isServer: false,
        })
        expect(router.state.location.pathname).toBe('/route')
        expect(router.state.location.hash).toBe(hash)
        await router.load()
        await router.navigate({ to: '/route', hash: `${hash}-next` })
        history.flush()
        expect(router.state.location.hash).toBe(`${hash}-next`)
        expect(window.location.hash).toBe(`#/route#${hash}-next`)
      } finally {
        history.destroy()
        window.history.replaceState(null, '', '/')
      }
    },
  )

  test('reads a hash route that starts with a query once', async () => {
    window.history.replaceState(null, '', '/shell#?x=1')
    const history = createHashHistory()
    try {
      const root = new BaseRootRoute()
      const index = new BaseRoute({ getParentRoute: () => root, path: '/' })
      const router = createTestRouter({
        routeTree: root.addChildren([index]),
        history,
        isServer: false,
      })
      await router.load()
      expect(router.state.location.search).toEqual({ x: 1 })
      // The query must not also be read as part of the pathname.
      expect(router.state.location.href).toMatch(/^\/?\?x=1$/)
      expect(router.state.matches.at(-1)?.routeId).toBe(index.id)
    } finally {
      history.destroy()
      window.history.replaceState(null, '', '/')
    }
  })
})
