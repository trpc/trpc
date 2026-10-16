import { afterEach, beforeEach, expect, test } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

import {
  Link,
  Outlet,
  RouterProvider,
  Scripts,
  createBrowserHistory,
  createControlledPromise,
  createLazyRoute,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  rootRouteId,
} from '../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../src/ssr/server'
import type { NotFoundRouteProps, RouterHistory } from '../src'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

test('navigating to an actively preloaded missing URL renders the global not-found boundary', async () => {
  const missingLoaderStarted = createControlledPromise<void>()
  const missingLoader = createControlledPromise<void>()
  const rootRoute = createRootRoute({
    component: Outlet,
    notFoundComponent: () => <div>Missing URL boundary</div>,
    loader: ({ location }) => {
      if (location.pathname === '/missing') {
        missingLoaderStarted.resolve()
        return missingLoader
      }
      return
    },
    shouldReload: true,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()

  const preload = router.preloadRoute({ to: '/missing' } as any)
  await missingLoaderStarted
  const navigation = router.navigate({ to: '/missing' } as any)
  missingLoader.resolve()
  await act(() => Promise.all([preload, navigation]))

  expect(screen.getByText('Missing URL boundary')).toBeInTheDocument()
  expect(screen.queryByText('Home')).not.toBeInTheDocument()
})

test('a lazy route notFoundComponent handles an eager beforeLoad failure', async () => {
  const rootRoute = createRootRoute({
    component: Outlet,
    notFoundComponent: () => <div>Root not found</div>,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const failingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/lazy-not-found',
    beforeLoad: () => {
      throw notFound()
    },
  }).lazy(() =>
    Promise.resolve(
      createLazyRoute('/lazy-not-found')({
        notFoundComponent: () => <div>Lazy route not found</div>,
      }),
    ),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, failingRoute]),
    history,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()

  await act(() => router.navigate({ to: '/lazy-not-found' }))

  expect(screen.getByText('Lazy route not found')).toBeInTheDocument()
  expect(screen.queryByText('Root not found')).not.toBeInTheDocument()
})

test('SSR uses a lazy route notFoundComponent for an eager beforeLoad failure', async () => {
  const rootRoute = createRootRoute({
    // Streaming SSR requires the <Scripts /> boundary in the shell.
    shellComponent: ({ children }) => (
      <>
        {children}
        <Scripts />
      </>
    ),
    component: Outlet,
    notFoundComponent: () => <div>Root not found</div>,
  })
  const failingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/lazy-not-found',
    beforeLoad: () => {
      throw notFound()
    },
  }).lazy(() =>
    Promise.resolve(
      createLazyRoute('/lazy-not-found')({
        notFoundComponent: () => <div>Lazy route not found</div>,
      }),
    ),
  )
  const handler = createRequestHandler({
    request: new Request('http://localhost/lazy-not-found'),
    createRouter: () =>
      createRouter({
        routeTree: rootRoute.addChildren([failingRoute]),
        isServer: true,
      }),
  })

  const response = await handler(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
  )

  expect(response.status).toBe(404)
  const html = await response.text()
  expect(html).toContain('Lazy route not found')
  expect(html).not.toContain('Root not found')
})

test.each(['client', 'server'] as const)(
  'a lazy child boundary handles a fuzzy URL miss on the %s',
  async (environment) => {
    const rootRoute = createRootRoute({
      // Streaming SSR requires the <Scripts /> boundary in the shell; the
      // client render outputs no scripts here.
      shellComponent: ({ children }) => (
        <>
          {children}
          <Scripts />
        </>
      ),
      component: Outlet,
      notFoundComponent: () => <div>Root fuzzy boundary</div>,
    })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      component: Outlet,
      notFoundComponent: () => <div>Parent fuzzy boundary</div>,
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
    }).lazy(() =>
      Promise.resolve(
        createLazyRoute('/parent/child')({
          notFoundComponent: () => <div>Lazy child fuzzy boundary</div>,
        }),
      ),
    )
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])

    if (environment === 'client') {
      const router = createRouter({ routeTree, history })
      render(<RouterProvider router={router} />)
      await act(() => router.navigate({ to: '/parent/child/missing' as any }))

      expect(screen.getByText('Lazy child fuzzy boundary')).toBeInTheDocument()
      expect(
        screen.queryByText('Parent fuzzy boundary'),
      ).not.toBeInTheDocument()
      return
    }

    const response = await createRequestHandler({
      request: new Request('http://localhost/parent/child/missing'),
      createRouter: () => createRouter({ routeTree, isServer: true }),
    })(({ router, responseHeaders }) =>
      renderRouterToString({
        router,
        responseHeaders,
        children: <RouterServer router={router} />,
      }),
    )

    expect(response.status).toBe(404)
    const html = await response.text()
    expect(html).toContain('Lazy child fuzzy boundary')
    expect(html).not.toContain('Parent fuzzy boundary')
  },
)

test.each([
  {
    notFoundMode: 'fuzzy' as const,
    expectedNotFoundComponent: 'settings-not-found',
  },
  {
    notFoundMode: 'root' as const,
    expectedNotFoundComponent: 'root-not-found',
  },
])(
  'correct notFoundComponent is rendered for mode=%s',
  async ({ notFoundMode, expectedNotFoundComponent }) => {
    const rootRoute = createRootRoute({
      component: () => (
        <div data-testid="root-component">
          <h1>Root Component</h1>
          <div>
            <Link data-testid="settings-link" to="/settings/">
              link to settings
            </Link>{' '}
            <Link data-testid="non-existing-link" to="/settings/does-not-exist">
              link to non-existing route
            </Link>
          </div>
          <Outlet />
        </div>
      ),
      notFoundComponent: () => (
        <span data-testid="root-not-found">Root Not Found Component</span>
      ),
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <div data-testid="index-component">
          <h2>Index Page</h2>
        </div>
      ),
    })

    const settingsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/settings',
      notFoundComponent: () => (
        <span data-testid="settings-not-found">
          Settings Not Found Component
        </span>
      ),
      component: () => (
        <div>
          <p>Settings Page Layout</p>
          <Outlet />
        </div>
      ),
    })

    const settingsIndexRoute = createRoute({
      getParentRoute: () => settingsRoute,
      path: '/',
      component: () => (
        <div data-testid="settings-index-component">Settings Page</div>
      ),
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        settingsRoute.addChildren([settingsIndexRoute]),
      ]),
      history,
      notFoundMode,
    })

    render(<RouterProvider router={router} />)
    await router.load()
    await screen.findByTestId('root-component')

    const settingsLink = screen.getByTestId('settings-link')
    settingsLink.click()

    const settingsIndexComponent = await screen.findByTestId(
      'settings-index-component',
    )
    expect(settingsIndexComponent).toBeInTheDocument()

    const nonExistingLink = screen.getByTestId('non-existing-link')
    nonExistingLink.click()

    const notFoundComponent = await screen.findByTestId(
      expectedNotFoundComponent,
      {},
      { timeout: 1000 },
    )
    expect(notFoundComponent).toBeInTheDocument()
  },
)

test('defaultNotFoundComponent and notFoundComponent receives data props via spread operator', async () => {
  const isCustomData = (data: unknown): data is typeof customData => {
    return 'message' in (data as typeof customData)
  }

  const customData = {
    message: 'Custom not found message',
  }

  const DefaultNotFoundComponentWithProps = (props: NotFoundRouteProps) => (
    <div data-testid="default-not-found-with-props">
      <span data-testid="message">
        {isCustomData(props.data) && <span>{props.data.message}</span>}
      </span>
    </div>
  )

  const rootRoute = createRootRoute({
    component: () => (
      <div data-testid="root-component">
        <h1>Root Component</h1>
        <div>
          <Link
            data-testid="default-not-found-route-link"
            to="/default-not-found-route"
          >
            link to default not found route
          </Link>
          <Link data-testid="not-found-route-link" to="/not-found-route">
            link to not found route
          </Link>
        </div>
        <Outlet />
      </div>
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <div data-testid="index-component">
        <h2>Index Page</h2>
      </div>
    ),
  })

  const defaultNotFoundRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/default-not-found-route',
    loader: () => {
      throw notFound({ data: customData })
    },
    component: () => (
      <div data-testid="default-not-found-route-component">
        Should not render
      </div>
    ),
  })

  const notFoundRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/not-found-route',
    loader: () => {
      throw notFound({ data: customData })
    },
    component: () => (
      <div data-testid="not-found-route-component">Should not render</div>
    ),
    notFoundComponent: (props) => (
      <div data-testid="not-found-with-props">
        <span data-testid="message">
          {isCustomData(props.data) && <span>{props.data.message}</span>}
        </span>
      </div>
    ),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      defaultNotFoundRoute,
      notFoundRoute,
    ]),
    history,
    defaultNotFoundComponent: DefaultNotFoundComponentWithProps,
  })

  render(<RouterProvider router={router} />)
  await router.load()
  await screen.findByTestId('root-component')

  const defaultNotFoundRouteLink = screen.getByTestId(
    'default-not-found-route-link',
  )
  defaultNotFoundRouteLink.click()

  const defaultNotFoundComponent = await screen.findByTestId(
    'default-not-found-with-props',
    {},
    { timeout: 1000 },
  )
  expect(defaultNotFoundComponent).toBeInTheDocument()

  const defaultNotFoundComponentMessage = await screen.findByTestId('message')
  expect(defaultNotFoundComponentMessage).toHaveTextContent(customData.message)

  const notFoundRouteLink = screen.getByTestId('not-found-route-link')
  notFoundRouteLink.click()

  const notFoundComponent = await screen.findByTestId(
    'not-found-with-props',
    {},
    { timeout: 1000 },
  )
  expect(notFoundComponent).toBeInTheDocument()

  const errorMessageComponent = await screen.findByTestId('message')
  expect(errorMessageComponent).toHaveTextContent(customData.message)
})

test('component-thrown bare notFound renders current route notFoundComponent', async () => {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    notFoundComponent: () => <span data-testid="root-not-found">Root</span>,
  })

  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    component: () => <Outlet />,
    notFoundComponent: () => (
      <span data-testid="parent-not-found">Parent not found</span>
    ),
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    notFoundComponent: () => (
      <span data-testid="child-not-found">Child not found</span>
    ),
    component: () => {
      throw notFound()
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history,
    notFoundMode: 'fuzzy',
  })

  render(<RouterProvider router={router} />)
  await router.navigate({ to: '/parent/child' })

  expect(await screen.findByTestId('child-not-found')).toBeInTheDocument()
  expect(screen.queryByTestId('parent-not-found')).not.toBeInTheDocument()
  expect(screen.queryByTestId('root-not-found')).not.toBeInTheDocument()
})

test('component-thrown bare notFound falls back to nearest ancestor notFoundComponent', async () => {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    notFoundComponent: () => <span data-testid="root-not-found">Root</span>,
  })

  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    component: () => <Outlet />,
    notFoundComponent: () => (
      <span data-testid="parent-not-found">Parent not found</span>
    ),
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    component: () => {
      throw notFound()
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history,
    notFoundMode: 'fuzzy',
  })

  render(<RouterProvider router={router} />)
  await router.navigate({ to: '/parent/child' })

  expect(await screen.findByTestId('parent-not-found')).toBeInTheDocument()
  expect(screen.queryByTestId('root-not-found')).not.toBeInTheDocument()
})

test('beforeLoad notFound with routeId targets root notFoundComponent', async () => {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    notFoundComponent: () => (
      <span data-testid="root-not-found">Root not found</span>
    ),
  })

  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    component: () => <Outlet />,
    notFoundComponent: () => (
      <span data-testid="parent-not-found">Parent not found</span>
    ),
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    beforeLoad: () => {
      throw notFound({ routeId: rootRouteId })
    },
    component: () => <span data-testid="child-component">Child</span>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history,
    notFoundMode: 'fuzzy',
  })

  render(<RouterProvider router={router} />)
  await router.navigate({ to: '/parent/child' })

  expect(await screen.findByTestId('root-not-found')).toBeInTheDocument()
  expect(screen.queryByTestId('child-component')).not.toBeInTheDocument()
})

test('beforeLoad notFound with routeId targets parent boundary and preserves parent loader data', async () => {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    notFoundComponent: () => (
      <span data-testid="root-not-found">Root not found</span>
    ),
  })

  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: () => ({ message: 'ready' }),
    component: () => <Outlet />,
    notFoundComponent: () => {
      const loaderData = parentRoute.useLoaderData()
      return (
        <span data-testid="parent-not-found-with-loader-data">
          {loaderData.message}
        </span>
      )
    },
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    beforeLoad: () => {
      throw notFound({ routeId: parentRoute.id })
    },
    component: () => <span data-testid="child-component">Child</span>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history,
    notFoundMode: 'fuzzy',
  })

  render(<RouterProvider router={router} />)
  await router.navigate({ to: '/parent/child' })

  expect(
    await screen.findByTestId('parent-not-found-with-loader-data'),
  ).toHaveTextContent('ready')
  expect(screen.queryByTestId('child-component')).not.toBeInTheDocument()
})

test('beforeLoad notFound with non-exact routeId falls back to root notFoundComponent', async () => {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    notFoundComponent: () => (
      <span data-testid="root-not-found">Root not found</span>
    ),
  })

  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    component: () => <Outlet />,
    notFoundComponent: () => (
      <span data-testid="parent-not-found">Parent not found</span>
    ),
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    beforeLoad: () => {
      throw notFound({ routeId: `${parentRoute.id}/` as never })
    },
    component: () => <span data-testid="child-component">Child</span>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history,
    notFoundMode: 'fuzzy',
  })

  render(<RouterProvider router={router} />)
  await router.navigate({ to: '/parent/child' })

  expect(await screen.findByTestId('root-not-found')).toBeInTheDocument()
  expect(screen.queryByTestId('parent-not-found')).not.toBeInTheDocument()
  expect(screen.queryByTestId('child-component')).not.toBeInTheDocument()
})
