import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'
import { sleep } from './utils'

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

// A chain of async layout beforeLoad redirects during the very first load
// (search-stripping self-redirect -> layout redirect -> child redirect) used
// to leave a match rendering with a nulled loadPromise, crashing
// MatchInnerImpl with an uncaught `undefined`. Pending UI is enabled for
// every match (defaultPendingMs: 0) to force pending publication mid-chain.
// The production auto-code-splitting reproduction for issue #7457 lives in
// e2e/react-router/issue-7457.
test('chained layout beforeLoad redirects on first load render the final target without throwing from MatchInner', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  const rootRoute = createRootRoute({ component: () => <Outlet /> })

  const userLayout = createRoute({
    id: 'user',
    getParentRoute: () => rootRoute,
    validateSearch: (search: Record<string, unknown>): { flag?: boolean } => ({
      flag: search.flag === true || search.flag === 'true' ? true : undefined,
    }),
    beforeLoad: async ({ search }) => {
      if (search.flag) {
        await sleep(20)
        throw redirect({
          to: '.',
          replace: true,
          search: (prev: any) => ({ ...prev, flag: undefined }),
        })
      }
    },
    component: () => <Outlet />,
  })

  const dashboardLayout = createRoute({
    id: 'dashboard',
    getParentRoute: () => userLayout,
    beforeLoad: async () => {
      await sleep(30)
      throw redirect({ to: '/intro', replace: true })
    },
    component: () => <Outlet />,
  })

  const homeRoute = createRoute({
    getParentRoute: () => dashboardLayout,
    path: '/home',
    component: () => <div data-testid="home-page">Home</div>,
  })

  const introLayout = createRoute({
    getParentRoute: () => userLayout,
    path: '/intro',
    beforeLoad: ({ location }) => {
      if (location.pathname !== '/intro/step') {
        throw redirect({ to: '/intro/step', replace: true })
      }
    },
    component: () => <Outlet />,
  })

  const introIndexRoute = createRoute({
    getParentRoute: () => introLayout,
    path: '/',
    component: () => <div data-testid="intro-index">Intro index</div>,
  })

  const introStepRoute = createRoute({
    getParentRoute: () => introLayout,
    path: 'step',
    component: () => <div data-testid="intro-step">Intro step</div>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      userLayout.addChildren([
        dashboardLayout.addChildren([homeRoute]),
        introLayout.addChildren([introIndexRoute, introStepRoute]),
      ]),
    ]),
    defaultPendingMs: 0,
    defaultPendingComponent: () => <div data-testid="pending">loading</div>,
    history: createMemoryHistory({ initialEntries: ['/home?flag=true'] }),
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByTestId('intro-step', undefined, { timeout: 5_000 }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/intro/step')
  expect(consoleError).not.toHaveBeenCalled()
})
