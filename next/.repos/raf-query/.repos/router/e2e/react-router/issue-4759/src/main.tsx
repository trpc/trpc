import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

const rootRoute = createRootRoute({
  context: () => ({ locale: 'en' }),
  component: RootComponent,
})
function RootComponent() {
  const { locale } = rootRoute.useRouteContext()
  return (
    <div data-root-locale={locale}>
      <Outlet />
    </div>
  )
}
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => new Promise((resolve) => setTimeout(resolve, 1_000)),
  component: () => <div data-state="loaded">loaded</div>,
})
const routePendingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/route-pending',
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: RoutePending,
  loader: () => new Promise((resolve) => setTimeout(resolve, 1_000)),
  component: () => <div data-state="loaded">loaded</div>,
})
function RoutePending() {
  const { locale } = routePendingRoute.useRouteContext()
  return (
    <div data-state="pending" data-pending-source="route" data-locale={locale}>
      route pending
    </div>
  )
}
const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, routePendingRoute]),
})
const usesRoutePending = window.location.pathname === '/route-pending'
function DefaultPending() {
  const { locale } = indexRoute.useRouteContext()
  return (
    <div
      data-state="pending"
      data-pending-source="default"
      data-locale={locale}
    >
      default pending
    </div>
  )
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <main data-state="shell">
      <RouterProvider
        router={router}
        defaultPendingMs={usesRoutePending ? 1_000 : 0}
        defaultPendingMinMs={0}
        defaultPendingComponent={DefaultPending}
      />
    </main>
  </StrictMode>,
)
