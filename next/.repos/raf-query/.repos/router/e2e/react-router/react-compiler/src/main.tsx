import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  linkOptions,
  useMatchRoute,
} from '@tanstack/react-router'

const links = linkOptions([
  { to: '/home', label: 'Home' },
  { to: '/about', label: 'About' },
])

function useRouteName() {
  const matchRoute = useMatchRoute()

  return links.find((link) => matchRoute(link))?.label ?? 'Unknown'
}

function RootComponent() {
  const matchedRoute = useRouteName()

  return (
    <>
      <nav>
        {links.map((link) => (
          <Link key={link.label} {...link}>
            {link.label}
          </Link>
        ))}
      </nav>
      <p>
        Matched route: <span data-testid="matched-route">{matchedRoute}</span>
      </p>
      <Outlet />
    </>
  )
}

const rootRoute = createRootRoute({ component: RootComponent })
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
})
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
})
const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, aboutRoute]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
