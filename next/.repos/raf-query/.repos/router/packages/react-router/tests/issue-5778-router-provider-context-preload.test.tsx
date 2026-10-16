import * as React from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

// https://github.com/TanStack/router/issues/5778
test('#5778: intent preload sees a RouterProvider context update before the first navigation', async () => {
  const seen: Array<{
    route: 'auth' | 'foo'
    foo: string
    cause: string
    preload: boolean
  }> = []
  const rootRoute = createRootRouteWithContext<{ foo: string }>()({
    component: () => (
      <>
        <Link to="/foo" preload="intent">
          Foo
        </Link>
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const authRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_authenticated',
    beforeLoad: ({ context, cause, preload }) => {
      seen.push({ route: 'auth', foo: context.foo, cause, preload })
    },
    component: () => <Outlet />,
  })
  const fooRoute = createRoute({
    getParentRoute: () => authRoute,
    path: '/foo',
    beforeLoad: ({ context, cause, preload }) => {
      seen.push({ route: 'foo', foo: context.foo, cause, preload })
    },
    component: () => <div>Foo page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      authRoute.addChildren([fooRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { foo: null! },
    defaultPreload: 'intent',
    defaultPreloadDelay: 0,
  })

  function App() {
    const [foo, setFoo] = React.useState('foo')
    return (
      <>
        <output aria-label="Current context">{foo}</output>
        <button
          onClick={() => {
            setFoo('baz')
          }}
        >
          Update context
        </button>
        <RouterProvider router={router} context={{ foo }} />
      </>
    )
  }

  render(<App />)
  expect(await screen.findByText('Home')).toBeInTheDocument()
  expect(screen.getByLabelText('Current context')).toHaveTextContent('foo')

  fireEvent.click(screen.getByRole('button', { name: 'Update context' }))
  await waitFor(() =>
    expect(screen.getByLabelText('Current context')).toHaveTextContent('baz'),
  )

  expect(seen).toEqual([])
  const link = screen.getByRole('link', { name: 'Foo' })
  fireEvent.mouseEnter(link)
  await waitFor(() => expect(seen).toHaveLength(2))
  expect(seen).toEqual([
    { route: 'auth', foo: 'baz', cause: 'preload', preload: true },
    { route: 'foo', foo: 'baz', cause: 'preload', preload: true },
  ])
  expect(screen.getByText('Home')).toBeInTheDocument()
  expect(screen.queryByText('Foo page')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/')

  fireEvent.click(link)
  expect(await screen.findByText('Foo page')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/foo')
})
