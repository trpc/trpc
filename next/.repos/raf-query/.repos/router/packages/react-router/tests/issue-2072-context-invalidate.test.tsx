import * as React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '../src'

afterEach(cleanup)

// https://github.com/TanStack/router/issues/2072
// Router context updates supplied through `RouterProvider` must be observable
// by `beforeLoad` on the very next `router.invalidate()` call, even when the
// context state and `invalidate()` change in the same event handler.
test('#2072: logout invalidates the router with the fresh auth context', async () => {
  const seen: Array<boolean> = []
  const rootRoute = createRootRouteWithContext<{
    auth: { isAuthenticated: boolean }
  }>()()
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    beforeLoad: ({ context }) => {
      if (context.auth.isAuthenticated) {
        throw redirect({ to: '/private' })
      }
    },
    component: () => <div>Login page</div>,
  })
  const authenticatedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_authenticated',
    beforeLoad: ({ context }) => {
      seen.push(context.auth.isAuthenticated)
      if (!context.auth.isAuthenticated) {
        throw redirect({ to: '/login' })
      }
    },
  })
  const privateRoute = createRoute({
    getParentRoute: () => authenticatedRoute,
    path: '/private',
    component: () => <div>Private page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      loginRoute,
      authenticatedRoute.addChildren([privateRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/private'] }),
    context: { auth: { isAuthenticated: true } },
  })

  function App() {
    const [isAuthenticated, setIsAuthenticated] = React.useState(true)
    return (
      <>
        <button
          onClick={() => {
            setIsAuthenticated(false)
            router.invalidate()
          }}
        >
          Logout
        </button>
        <RouterProvider
          router={router}
          context={{ auth: { isAuthenticated } }}
        />
      </>
    )
  }

  render(<App />)
  expect(await screen.findByText('Private page')).toBeInTheDocument()
  expect(seen).toEqual([true])

  fireEvent.click(screen.getByRole('button', { name: 'Logout' }))

  expect(await screen.findByText('Login page')).toBeInTheDocument()
  expect(seen).toEqual([true, false])
})

// The inverse transition: becoming authenticated must let the login route's
// `beforeLoad` observe the new context and redirect to the private route.
test('#2072: login invalidates the router with the fresh auth context', async () => {
  const seen: Array<boolean> = []
  const rootRoute = createRootRouteWithContext<{
    auth: { isAuthenticated: boolean }
  }>()()
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    beforeLoad: ({ context }) => {
      if (context.auth.isAuthenticated) {
        throw redirect({ to: '/private' })
      }
    },
    component: () => <div>Login page</div>,
  })
  const authenticatedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_authenticated',
    beforeLoad: ({ context }) => {
      seen.push(context.auth.isAuthenticated)
      if (!context.auth.isAuthenticated) {
        throw redirect({ to: '/login' })
      }
    },
  })
  const privateRoute = createRoute({
    getParentRoute: () => authenticatedRoute,
    path: '/private',
    component: () => <div>Private page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      loginRoute,
      authenticatedRoute.addChildren([privateRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/login'] }),
    context: { auth: { isAuthenticated: false } },
  })

  function App() {
    const [isAuthenticated, setIsAuthenticated] = React.useState(false)
    return (
      <>
        <button
          onClick={() => {
            setIsAuthenticated(true)
            router.invalidate()
          }}
        >
          Login
        </button>
        <RouterProvider
          router={router}
          context={{ auth: { isAuthenticated } }}
        />
      </>
    )
  }

  render(<App />)
  expect(await screen.findByText('Login page')).toBeInTheDocument()
  expect(seen).toEqual([])

  fireEvent.click(screen.getByRole('button', { name: 'Login' }))

  expect(await screen.findByText('Private page')).toBeInTheDocument()
  expect(seen).toEqual([true])
})
