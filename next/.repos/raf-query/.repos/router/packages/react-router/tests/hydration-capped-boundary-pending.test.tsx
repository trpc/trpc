import * as React from 'react'
import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import { hydrate } from '../src/ssr/client'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '../src'
import type { TsrSsrGlobal } from '../src/ssr/client'

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
  test('recovers a /404 payload against a missing browser URL', async () => {
    function MissingPage() {
      return <div data-testid="missing-page">Missing page</div>
    }

    const makeRouteTree = () => {
      const rootRoute = createRootRoute({
        component: Outlet,
        notFoundComponent: MissingPage,
      })
      const notFoundRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/404',
        component: MissingPage,
      })
      return rootRoute.addChildren([notFoundRoute])
    }

    const serverRouter = createRouter({
      routeTree: makeRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/404'] }),
    })
    serverRouter.isServer = true
    await serverRouter.load()
    const serverMatches = serverRouter.stores.matches.get()
    const serverHtml = renderToString(<RouterProvider router={serverRouter} />)
    expect(serverHtml).toContain('Missing page')

    const clientRouter = createRouter({
      routeTree: makeRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/missing'] }),
    })
    window.$_TSR = {
      router: {
        manifest: { routes: {} },
        dehydratedData: {},
        matches: serverMatches.map((match) => ({
          i: dehydrateSsrMatchId(match.id),
          u: match.updatedAt,
          s: match.status,
          l: match.loaderData,
          e: match.error,
          ssr: match.ssr,
          ...(match._notFound ? { g: true } : {}),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(clientRouter)

    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)
    let root!: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, <RouterProvider router={clientRouter} />, {
        onRecoverableError: () => {},
      })
      testCleanups.push(async () => {
        await act(() => root.unmount())
      })
      await Promise.resolve()
    })

    expect(container).toHaveTextContent('Missing page')
    expect(clientRouter.state.resolvedLocation?.pathname).toBe('/missing')
    expect(clientRouter.state.matches).toHaveLength(1)
    expect(clientRouter.state.matches[0]).toMatchObject({ _notFound: true })
  })

  test.each([
    ['error', 'parent'],
    ['notFound', 'parent'],
    ['error', 'root'],
    ['notFound', 'root'],
  ] as const)(
    'keeps the server-rendered %s %s boundary visible',
    async (outcome, boundary) => {
      const childLoader = vi.fn(() => 'child data')
      const boundaryCommits = vi.fn()

      function BoundaryError() {
        React.useEffect(() => {
          boundaryCommits()
        }, [])
        return <div data-testid="boundary-error">Boundary error</div>
      }

      function BoundaryNotFound() {
        React.useEffect(() => {
          boundaryCommits()
        }, [])
        return <div data-testid="boundary-not-found">Boundary not found</div>
      }

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
          errorComponent: BoundaryError,
          notFoundComponent: BoundaryNotFound,
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
        return {
          routeTree: rootRoute.addChildren([
            parentRoute.addChildren([childRoute]),
          ]),
        }
      }

      const serverRouter = createRouter({
        ...makeRouteTree(),
        history: createMemoryHistory({
          initialEntries: ['/parent/child'],
        }),
      })
      serverRouter.isServer = true
      await serverRouter.load()

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
      const serverHtml = renderToString(
        <RouterProvider router={serverRouter} />,
      )
      expect(serverHtml).toContain(
        outcome === 'notFound' ? 'Boundary not found' : 'Boundary error',
      )
      expect(boundaryCommits).not.toHaveBeenCalled()

      const clientRouter = createRouter({
        ...makeRouteTree(),
        history: createMemoryHistory({
          initialEntries: ['/parent/child'],
        }),
      })

      window.$_TSR = {
        router: {
          manifest: { routes: {} },
          dehydratedData: {},
          matches: serverMatches
            .slice(0, boundary === 'root' ? 1 : 2)
            .map((match) => ({
              i: dehydrateSsrMatchId(match.id),
              u: match.updatedAt,
              s: match.status,
              l: match.loaderData,
              e: match.error,
              ssr: match.ssr,
              ...(match._notFound ? { g: true } : {}),
            })),
        },
        h: vi.fn(),
        e: vi.fn(),
        c: vi.fn(),
        p: vi.fn(),
        buffer: [],
        initialized: false,
      }

      await hydrate(clientRouter)

      const container = document.createElement('div')
      container.innerHTML = serverHtml
      document.body.appendChild(container)
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      let root!: ReturnType<typeof hydrateRoot>
      await act(async () => {
        root = hydrateRoot(container, <RouterProvider router={clientRouter} />)
        testCleanups.push(async () => {
          await act(() => root.unmount())
        })
        await Promise.resolve()
      })

      // A shorter dehydrated lane means SPA mode only for an actual shell.
      // Here it is shorter because the server already rendered a terminal
      // boundary, so hydration must not replace that boundary with pending UI.
      expect(boundaryCommits).toHaveBeenCalledTimes(1)
      expect(container).toHaveTextContent(
        outcome === 'notFound' ? 'Boundary not found' : 'Boundary error',
      )
      expect(container).not.toHaveTextContent('Boundary pending')
      expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(
        /hydration|did not match/i,
      )
      expect(childLoader).not.toHaveBeenCalled()
    },
  )
})
