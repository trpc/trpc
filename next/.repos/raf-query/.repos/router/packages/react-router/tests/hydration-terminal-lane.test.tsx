import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { AnyRouteMatch } from '@tanstack/router-core'
import type { TsrSsrGlobal } from '@tanstack/router-core/ssr/client'

function bootstrap(
  matches: Array<{
    match: AnyRouteMatch
    status: AnyRouteMatch['status']
    ssr: AnyRouteMatch['ssr']
    data?: unknown
    error?: unknown
    notFound?: boolean
  }>,
): void {
  window.$_TSR = {
    router: {
      manifest: undefined,
      matches: matches.map(({ match, status, ssr, data, error, notFound }) => ({
        i: dehydrateSsrMatchId(match.id),
        l: data,
        e: error,
        s: status,
        ssr,
        u: Date.now(),
        ...(notFound ? { g: true } : {}),
      })),
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
  } as TsrSsrGlobal
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete window.$_TSR
})

describe('hydration terminal lane', () => {
  test('keeps server data while loading only the missing client suffix', async () => {
    const parentLoader = vi.fn(() => 'client-parent')
    const childLoader = vi.fn(() => 'client-child')
    const rootRoute = createRootRoute({ component: Outlet })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      component: () => (
        <>
          <div>{parentRoute.useLoaderData()}</div>
          <Outlet />
        </>
      ),
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      ssr: false,
      loader: childLoader,
      component: () => <div>{childRoute.useLoaderData()}</div>,
    })
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    })
    const matches = router.matchRoutes(router.state.location)
    bootstrap([
      { match: matches[0]!, status: 'success', ssr: true },
      {
        match: matches[1]!,
        status: 'success',
        ssr: true,
        data: 'server-parent',
      },
      { match: matches[2]!, status: 'pending', ssr: false },
    ])

    await hydrate(router)
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('server-parent')).toBeInTheDocument()
    expect(await screen.findByText('client-child')).toBeInTheDocument()
    expect(screen.queryByText('client-parent')).not.toBeInTheDocument()
    expect(parentLoader).not.toHaveBeenCalled()
    expect(childLoader).toHaveBeenCalledTimes(1)
  })

  test('keeps a hydrated pending fallback through its minimum before a terminal result', async () => {
    const rootRoute = createRootRoute({
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: () => <div role="status">Missing page pending</div>,
      notFoundComponent: () => <div>Missing page</div>,
    })
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/missing'] }),
      routeTree: rootRoute,
    })
    const matches = router.matchRoutes(router.state.location)
    expect(matches[0]?._notFound).toBe(true)
    bootstrap([
      {
        match: matches[0]!,
        status: 'pending',
        ssr: false,
        notFound: true,
      },
    ])

    await hydrate(router)
    vi.useFakeTimers()
    vi.setSystemTime(0)
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('status')).toHaveTextContent('Missing page pending')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(99)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Missing page pending')
    expect(screen.queryByText('Missing page')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5)
    })
    expect(screen.getByText('Missing page')).toBeInTheDocument()
  })
})
