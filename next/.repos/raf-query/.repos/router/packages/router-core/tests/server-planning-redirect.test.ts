import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createRequestHandler } from '../src/ssr/server'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test.each([false, true])(
  'a route-context planning redirect is control with isServer=%s',
  async (isServer) => {
    const rootRoute = new BaseRootRoute({})
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      context: () => {
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
      isServer,
    })

    if (isServer) {
      const response = await loadServerResponse(router, '/source')

      expect(response.status).toBe(307)
      expect(response.headers.get('Location')).toBe('/target')
    } else {
      await router.load()

      expect(router.state.location.pathname).toBe('/target')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: targetRoute.id,
        status: 'success',
      })
    }
  },
)

test('the generic request handler returns a redirect without rendering', async () => {
  const rootRoute = new BaseRootRoute({})
  const sourceRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/source',
    loader: () =>
      redirect({
        to: '/target',
        statusCode: 308,
        headers: { 'x-redirect': 'route' },
      }),
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
  const render = vi.fn(() => new Response('must not render'))
  const handler = createRequestHandler({
    createRouter: () => router,
    request: new Request('http://localhost/source'),
  })

  const response = await handler(render)

  expect(response.status).toBe(308)
  expect(response.headers.get('Location')).toBe('/target')
  expect(response.headers.get('x-redirect')).toBe('route')
  expect(await response.text()).toBe('')
  expect(render).not.toHaveBeenCalled()
})
