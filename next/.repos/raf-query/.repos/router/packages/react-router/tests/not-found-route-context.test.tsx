import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  notFound,
} from '../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../src/ssr/server'

afterEach(cleanup)

const expectedContext = 'from router / from root / from parent'

function createRouteTree() {
  const rootRoute = createRootRouteWithContext<{
    routerValue: string
  }>()({
    context: () => ({ rootValue: 'from root' }),
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    context: () => ({ parentValue: 'from parent' }),
    component: ParentComponent,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    context: (): { childValue: string } => {
      throw notFound()
    },
    component: () => <div>Child content</div>,
    notFoundComponent: ChildNotFoundComponent,
  })

  function ParentComponent() {
    const context = parentRoute.useRouteContext()

    return (
      <>
        <output data-testid="parent-context">
          {[context.routerValue, context.rootValue, context.parentValue].join(
            ' / ',
          )}
        </output>
        <Outlet />
      </>
    )
  }

  function ChildNotFoundComponent() {
    const context = parentRoute.useRouteContext()

    return (
      <output data-testid="not-found-context">
        {[context.routerValue, context.rootValue, context.parentValue].join(
          ' / ',
        )}
      </output>
    )
  }

  return rootRoute.addChildren([parentRoute.addChildren([childRoute])])
}

test('a client load-phase not-found preserves inherited ancestor context', async () => {
  const router = createRouter({
    routeTree: createRouteTree(),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    context: { routerValue: 'from router' },
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('not-found-context')).toHaveTextContent(
    expectedContext,
  )
  expect(screen.getByTestId('parent-context')).toHaveTextContent(
    expectedContext,
  )
  expect(screen.queryByText('Child content')).not.toBeInTheDocument()
})

test('an SSR load-phase not-found preserves inherited ancestor context', async () => {
  const response = await createRequestHandler({
    request: new Request('http://localhost/parent/child'),
    createRouter: () =>
      createRouter({
        routeTree: createRouteTree(),
        context: { routerValue: 'from router' },
        isServer: true,
      }),
  })(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
  )

  const html = await response.text()

  const document = new DOMParser().parseFromString(html, 'text/html')
  expect(
    document.querySelector('[data-testid="parent-context"]')?.textContent,
  ).toBe(expectedContext)
  expect(
    document.querySelector('[data-testid="not-found-context"]')?.textContent,
  ).toBe(expectedContext)
  expect(html).not.toContain('Child content')
})

test('a root beforeLoad not-found exposes only completed root data', async () => {
  const loader = vi.fn(() => ({ loaderValue: 'from loader' }))

  const rootRoute = createRootRoute({
    context: () => ({ contextValue: 'from context' }),
    beforeLoad: (): { beforeLoadValue: string } => {
      throw notFound()
    },
    loader,
    component: RootComponent,
    notFoundComponent: () => (
      <div data-testid="root-not-found">Root not found</div>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index content</div>,
  })

  function RootComponent() {
    const context = rootRoute.useRouteContext()
    const loaderData = rootRoute.useLoaderData()

    return (
      <main data-testid="root-component">
        <output data-testid="context-value">
          Context: {context.contextValue ?? 'unavailable'}
        </output>
        <output data-testid="before-load-value">
          Before load: {context.beforeLoadValue ?? 'unavailable'}
        </output>
        <output data-testid="loader-value">
          Loader: {loaderData?.loaderValue ?? 'unavailable'}
        </output>
        <Outlet />
      </main>
    )
  }

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  const notFoundContent = await screen.findByTestId('root-not-found')
  const rootComponent = screen.getByTestId('root-component')

  expect(rootComponent).toContainElement(notFoundContent)
  expect(screen.getByTestId('context-value')).toHaveTextContent(
    'Context: from context',
  )
  expect(screen.getByTestId('before-load-value')).toHaveTextContent(
    'Before load: unavailable',
  )
  expect(screen.getByTestId('loader-value')).toHaveTextContent(
    'Loader: unavailable',
  )
  expect(screen.queryByText('Index content')).not.toBeInTheDocument()
  expect(loader).not.toHaveBeenCalled()
})
