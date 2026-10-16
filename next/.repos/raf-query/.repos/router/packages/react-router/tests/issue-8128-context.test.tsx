import { act, cleanup, render, screen } from '@testing-library/react'
import { expect, onTestFinished, test, vi } from 'vitest'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { hydrate } from '../src/ssr/client'
import type { DehydratedMatch } from '@tanstack/router-core/ssr/client'

test('#8128: leaving a hydrated root not-found page preserves beforeLoad context', async () => {
  const rootRenders: Array<string | undefined> = []

  vi.useFakeTimers()
  onTestFinished(async () => {
    cleanup()
    delete window.$_TSR
    delete (window as Window & { $R?: unknown }).$R
    vi.useRealTimers()
  })

  const rootRoute = createRootRoute({
    beforeLoad: async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
      return { locale: 'en' }
    },
    component: () => {
      const context = rootRoute.useRouteContext()
      rootRenders.push(context.locale)

      return (
        <>
          <output data-testid="root-locale">
            Locale: {context.locale ?? 'missing'}
          </output>
          <Outlet />
        </>
      )
    },
    notFoundComponent: () => <div>Not found</div>,
  })
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => <div>Dashboard</div>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([dashboardRoute]),
    history: createMemoryHistory({
      initialEntries: ['/any-not-found-url'],
    }),
    defaultPendingComponent: () => <div>Loading</div>,
    defaultPendingMs: 150,
    defaultPendingMinMs: 0,
  })
  const rootMatch = router.matchRoutes(router.latestLocation)[0]!
  // Model the server bootstrap for a hydrated root-level not-found.
  const dehydratedMatch: DehydratedMatch & { b: Record<string, unknown> } = {
    i: dehydrateSsrMatchId(rootMatch.id),
    b: { locale: 'en' },
    u: Date.now(),
    s: 'success',
    ssr: true,
    g: true,
  }
  window.$_TSR = {
    router: {
      manifest: { routes: {} },
      dehydratedData: {},
      matches: [dehydratedMatch],
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  }

  await hydrate(router)
  render(<RouterProvider router={router} />)

  expect(router.state.matches[0]).toMatchObject({
    status: 'success',
    _notFound: true,
    context: { locale: 'en' },
  })
  expect(screen.getByText('Not found')).toBeInTheDocument()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/dashboard' })
    await vi.advanceTimersByTimeAsync(150)
  })

  expect(router.state.matches[0]).toMatchObject({
    status: 'success',
    _notFound: true,
    context: { locale: 'en' },
  })
  expect(screen.getByTestId('root-locale')).toHaveTextContent('Locale: en')
  expect(screen.getByText('Not found')).toBeInTheDocument()
  expect(screen.queryByText('Loading')).not.toBeInTheDocument()
  expect(rootRenders).not.toContain(undefined)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
    await navigation
  })
  expect(screen.getByText('Dashboard')).toBeInTheDocument()
})
