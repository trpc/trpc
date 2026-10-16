import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('a structural descendant below a not-found boundary does not run onEnter when its component cannot render', async () => {
  const parentOnEnter = vi.fn()
  const unavailableOnEnter = vi.fn()
  const descendantOnEnter = vi.fn()

  const rootRoute = createRootRoute()
  const tenantRoute = createRoute({
    onEnter: parentOnEnter,
    getParentRoute: () => rootRoute,
    path: 'tenants/$tenantId',
  })
  const unavailableSettingsRoute = createRoute({
    onEnter: unavailableOnEnter,
    getParentRoute: () => tenantRoute,
    path: 'settings',
    beforeLoad: () => {
      throw notFound()
    },
    notFoundComponent: () => <div>Tenant settings unavailable</div>,
  })
  const profileRoute = createRoute({
    getParentRoute: () => unavailableSettingsRoute,
    path: 'profile',
    onEnter: descendantOnEnter,
    component: () => <div>Profile settings</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      tenantRoute.addChildren([
        unavailableSettingsRoute.addChildren([profileRoute]),
      ]),
    ]),
    history: createMemoryHistory({
      initialEntries: ['/tenants/acme/settings/profile'],
    }),
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByText('Tenant settings unavailable'),
  ).toBeInTheDocument()

  expect(screen.queryByText('Profile settings')).not.toBeInTheDocument()
  expect(parentOnEnter).toHaveBeenCalled()
  expect(unavailableOnEnter).toHaveBeenCalled()
  expect(descendantOnEnter).not.toHaveBeenCalled()
})
