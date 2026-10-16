import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { hydrate as hydrateRouter } from '@tanstack/router-core/ssr/client'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '../src'
import { dehydrateToBootstrap } from './ssr-test-utils'
import type { TsrSsrGlobal } from '@tanstack/router-core/ssr/client'

declare global {
  interface Window {
    $_TSR?: TsrSsrGlobal
  }
}

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  vi.restoreAllMocks()
  window.$_TSR = undefined
  document.body.innerHTML = ''
})

describe('hydrating a server-capped boundary lane', () => {
  test.each([
    ['error', 'parent'],
    ['notFound', 'parent'],
    ['error', 'root'],
    ['notFound', 'root'],
  ] as const)(
    'keeps the server-rendered %s %s boundary visible through hydration',
    async (outcome, boundary) => {
      const childLoader = vi.fn(() => 'child data')
      const makeRouteTree = () => {
        const boundaryOptions = {
          beforeLoad: () => {
            throw outcome === 'notFound'
              ? notFound()
              : new Error('server route failure')
          },
          pendingComponent: () => (
            <div data-testid="boundary-pending">Boundary pending</div>
          ),
          errorComponent: () => (
            <div data-testid="boundary-error">Boundary error</div>
          ),
          notFoundComponent: () => (
            <div data-testid="boundary-not-found">Boundary not found</div>
          ),
        }
        const rootRoute = createRootRoute({
          component: Outlet,
          ...(boundary === 'root' ? boundaryOptions : {}),
        })
        const parentRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          component: Outlet,
          ...(boundary === 'parent' ? boundaryOptions : {}),
        })
        const childRoute = createRoute({
          getParentRoute: () => parentRoute,
          path: '/child',
          loader: childLoader,
          component: () => <div>Child</div>,
        })
        return rootRoute.addChildren([parentRoute.addChildren([childRoute])])
      }

      const serverRouter = createRouter({
        routeTree: makeRouteTree(),
        history: createMemoryHistory({
          initialEntries: ['/parent/child'],
        }),
      })
      serverRouter.isServer = true
      testCleanups.push(() => serverRouter.serverSsr?.cleanup())
      window.$_TSR = await dehydrateToBootstrap(serverRouter)

      const serverMatches = serverRouter.stores.matches.get()
      expect(serverMatches).toHaveLength(3)
      const serverBoundary = serverMatches[boundary === 'root' ? 0 : 1]!
      if (outcome === 'notFound' && boundary === 'root') {
        expect(serverBoundary).toMatchObject({
          status: 'success',
          _notFound: true,
        })
      } else {
        expect(serverBoundary.status).toBe(outcome)
      }

      const serverApp = Vue.createSSRApp(
        Vue.defineComponent({
          setup: () => () => <RouterProvider router={serverRouter} />,
        }),
      )
      const serverHtml = await renderToString(serverApp)
      const expectedBoundary =
        outcome === 'notFound' ? 'Boundary not found' : 'Boundary error'
      expect(serverHtml).toContain(expectedBoundary)

      const clientRouter = createRouter({
        routeTree: makeRouteTree(),
        history: createMemoryHistory({
          initialEntries: ['/parent/child'],
        }),
      })

      await hydrateRouter(clientRouter)

      const container = document.createElement('div')
      container.innerHTML = serverHtml
      document.body.appendChild(container)
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const clientApp = Vue.createSSRApp(
        Vue.defineComponent({
          setup: () => () => <RouterProvider router={clientRouter} />,
        }),
      )
      let clientAppMounted = false
      testCleanups.push(() => {
        if (clientAppMounted) {
          clientApp.unmount()
        }
        container.remove()
      })

      clientApp.mount(container)
      clientAppMounted = true
      await Vue.nextTick()

      expect(container).toHaveTextContent(expectedBoundary)
      expect(container).not.toHaveTextContent('Boundary pending')
      expect(
        [consoleError.mock.calls, consoleWarn.mock.calls].flat(2).join(' '),
      ).not.toMatch(/hydration|mismatch/i)
      expect(childLoader).not.toHaveBeenCalled()
    },
  )
})
