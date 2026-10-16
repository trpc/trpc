import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { z } from 'zod'
import { useEffect } from 'react'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouter,
} from '../src'

import { sleep } from './utils'
import type { RouterHistory } from '../src'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

const WAIT_TIME = 100

describe('loaders are being called', () => {
  configure({ reactStrictMode: true })

  test('called on /', async () => {
    const indexLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        indexLoaderMock('foo')
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, history })

    render(<RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/')
    expect(window.location.pathname).toBe('/')

    expect(indexLoaderMock).toHaveBeenCalled()
  })

  test('both are called on /nested/foo', async () => {
    const nestedLoaderMock = vi.fn()
    const nestedFooLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/nested/foo">link to foo</Link>
          </div>
        )
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      loader: async () => {
        await sleep(WAIT_TIME)
        nestedLoaderMock('nested')
      },
    })
    const fooRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/foo',
      loader: async () => {
        await sleep(WAIT_TIME)
        nestedFooLoaderMock('foo')
      },
      component: () => <div>Nested Foo page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([fooRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree, history })

    render(<RouterProvider router={router} />)

    const linkToAbout = await screen.findByText('link to foo')
    fireEvent.click(linkToAbout)

    const fooElement = await screen.findByText('Nested Foo page')
    expect(fooElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/foo')
    expect(window.location.pathname).toBe('/nested/foo')

    expect(nestedLoaderMock).toHaveBeenCalled()
    expect(nestedFooLoaderMock).toHaveBeenCalled()
  })
})

describe('loaders parentMatchPromise', () => {
  test('parentMatchPromise is defined in a child route', async () => {
    const nestedLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <div>
          Index page
          <Link to="/nested/foo">link to foo</Link>
        </div>
      ),
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      loader: async () => {
        await sleep(WAIT_TIME)
        return 'nested'
      },
      component: () => <Outlet />,
    })
    const fooRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/foo',
      loader: async ({ parentMatchPromise }) => {
        nestedLoaderMock(parentMatchPromise)
        const parentMatch = await parentMatchPromise
        expect(parentMatch.loaderData).toBe('nested')
      },
      component: () => <div>Nested Foo page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([fooRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree, history })

    render(<RouterProvider router={router} />)

    const linkToFoo = await screen.findByRole('link', { name: 'link to foo' })

    expect(linkToFoo).toBeInTheDocument()

    fireEvent.click(linkToFoo)

    const fooElement = await screen.findByText('Nested Foo page')
    expect(fooElement).toBeInTheDocument()

    expect(nestedLoaderMock).toHaveBeenCalled()
    expect(nestedLoaderMock.mock.calls[0]?.[0]).toBeInstanceOf(Promise)
  })
})

test('reproducer for #2031', async () => {
  const rootRoute = createRootRoute({
    beforeLoad: () => {
      console.log('beforeload called')
    },
  })

  const searchSchema = z.object({
    data: z.string().array().default([]),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index page</div>,

    validateSearch: searchSchema,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({ routeTree, history })

  render(<RouterProvider router={router} />)

  const indexElement = await screen.findByText('Index page')
  expect(indexElement).toBeInTheDocument()
})

test('reproducer for #2053', async () => {
  const rootRoute = createRootRoute({
    beforeLoad: () => {
      console.log('beforeload called')
    },
  })

  const fooRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/foo/$fooId',
    component: () => {
      const { fooId } = fooRoute.useParams()
      return <div>fooId: {fooId}</div>
    },
  })

  window.history.replaceState(null, 'root', '/foo/3ΚΑΠΠΑ')

  const routeTree = rootRoute.addChildren([fooRoute])

  const router = createRouter({
    routeTree,
    history,
  })

  render(<RouterProvider router={router} />)

  const fooElement = await screen.findByText('fooId: 3ΚΑΠΠΑ')
  expect(fooElement).toBeInTheDocument()
})

test('reproducer for #2198 - throw error from beforeLoad upon initial load', async () => {
  const rootRoute = createRootRoute({})

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index page</div>,
    beforeLoad: () => {
      throw new Error('Test!')
    },
    errorComponent: () => <div>indexErrorComponent</div>,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({
    routeTree,
    history,
    defaultErrorComponent: () => {
      return <div>defaultErrorComponent</div>
    },
  })

  render(<RouterProvider router={router} />)

  const errorElement = await screen.findByText('indexErrorComponent')
  expect(errorElement).toBeInTheDocument()
})

test('throw error from loader upon initial load', async () => {
  const rootRoute = createRootRoute({})

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index page</div>,
    loader: () => {
      throw new Error('Test!')
    },
    errorComponent: () => <div>indexErrorComponent</div>,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({
    routeTree,
    history,
    defaultErrorComponent: () => {
      return <div>defaultErrorComponent</div>
    },
  })

  render(<RouterProvider router={router} />)

  const errorElement = await screen.findByText('indexErrorComponent')
  expect(errorElement).toBeInTheDocument()
})

test('throw error from beforeLoad when navigating to route', async () => {
  const rootRoute = createRootRoute({})

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <div>
        <h1>Index page</h1> <Link to="/foo">link to foo</Link>
      </div>
    ),
    errorComponent: () => <div>indexErrorComponent</div>,
  })

  const fooRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    component: () => <div>Foo page</div>,
    beforeLoad: () => {
      throw new Error('Test!')
    },
    errorComponent: () => <div>fooErrorComponent</div>,
  })

  const routeTree = rootRoute.addChildren([indexRoute, fooRoute])
  const router = createRouter({
    routeTree,
    history,
    defaultErrorComponent: () => {
      return <div>defaultErrorComponent</div>
    },
  })

  render(<RouterProvider router={router} />)

  const linkToFoo = await screen.findByRole('link', { name: 'link to foo' })

  expect(linkToFoo).toBeInTheDocument()

  fireEvent.click(linkToFoo)

  const indexElement = await screen.findByText('fooErrorComponent')
  expect(indexElement).toBeInTheDocument()
})

test('reproducer #4245', async () => {
  const LOADER_WAIT_TIME = 500
  const rootRoute = createRootRoute({})

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: async () => {
      await sleep(LOADER_WAIT_TIME)
      return 'index'
    },

    component: () => {
      const data = indexRoute.useLoaderData()
      return (
        <div>
          <Link to="/foo" data-testid="link-to-foo">
            foo
          </Link>
          {data}
        </div>
      )
    },
  })

  const fooRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    component: () => (
      <Link to="/" data-testid="link-to-index">
        index
      </Link>
    ),
  })

  const routeTree = rootRoute.addChildren([indexRoute, fooRoute])
  const router = createRouter({ routeTree })

  render(<RouterProvider router={router} />)
  // We wait for the initial loader to complete
  await act(() => router.load())
  const fooLink = await screen.findByTestId('link-to-foo')

  expect(fooLink).toBeInTheDocument()

  // We navigate to the foo route
  fireEvent.click(fooLink)

  // We immediately see the content of the foo route
  const indexLink = await screen.findByTestId('link-to-index', undefined, {
    timeout: WAIT_TIME,
  })
  expect(indexLink).toBeInTheDocument()

  // We navigate to the index route
  fireEvent.click(indexLink)

  // We immediately see the content of the index route because the stale data is still available
  const fooLink2 = await screen.findByTestId('link-to-foo', undefined, {
    timeout: WAIT_TIME,
  })
  expect(fooLink2).toBeInTheDocument()

  // We navigate to the foo route again
  fireEvent.click(fooLink2)

  // We immediately see the content of the foo route
  const indexLink2 = await screen.findByTestId('link-to-index', undefined, {
    timeout: WAIT_TIME,
  })
  expect(indexLink2).toBeInTheDocument()

  // We navigate to the index route again
  fireEvent.click(indexLink2)

  // We now should see the content of the index route immediately because the stale data is still available
  const fooLink3 = await screen.findByTestId('link-to-foo', undefined, {
    timeout: WAIT_TIME,
  })
  expect(fooLink3).toBeInTheDocument()
})

test('reproducer #4546', async () => {
  const rootRoute = createRootRoute({
    component: () => {
      return (
        <>
          <div className="flex gap-2 p-2 text-lg">
            <Link
              data-testid="link-to-index"
              to="/"
              activeProps={{
                className: 'font-bold',
              }}
              activeOptions={{ exact: true }}
            >
              Home
            </Link>{' '}
            <Link
              data-testid="link-to-id"
              to="$id"
              params={{
                id: '1',
              }}
              activeProps={{
                className: 'font-bold',
              }}
            >
              /1
            </Link>
          </div>
          <hr />
          <Outlet />
        </>
      )
    },
  })

  let counter = 0
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_app',
    beforeLoad: () => {
      counter += 1
      return {
        counter,
      }
    },
    component: () => {
      return (
        <div>
          <Header />
          <Outlet />
        </div>
      )
    },
  })

  function Header() {
    const router = useRouter()
    const { counter } = appRoute.useRouteContext()

    return (
      <div>
        Header Counter: <p data-testid="header-counter">{counter}</p>
        <button
          onClick={() => {
            router.invalidate()
          }}
          data-testid="invalidate-router"
          style={{
            border: '1px solid blue',
          }}
        >
          Invalidate router
        </button>
      </div>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => appRoute,
    path: '/',
    loader: ({ context }) => {
      return {
        counter: context.counter,
      }
    },

    component: () => {
      const data = indexRoute.useLoaderData()
      const ctx = indexRoute.useRouteContext()

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div>Index route</div>
          <div>
            route context:{' '}
            <p data-testid="index-route-context">{ctx.counter}</p>
          </div>
          <div>
            loader data: <p data-testid="index-loader-data">{data.counter}</p>
          </div>
        </div>
      )
    },
  })
  const idRoute = createRoute({
    getParentRoute: () => appRoute,
    path: '$id',
    loader: ({ context }) => {
      return {
        counter: context.counter,
      }
    },

    component: () => {
      const data = idRoute.useLoaderData()
      const ctx = idRoute.useRouteContext()

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div>$id route</div>
          <div>
            route context: <p data-testid="id-route-context">{ctx.counter}</p>
          </div>
          <div>
            loader data: <p data-testid="id-loader-data">{data.counter}</p>
          </div>
        </div>
      )
    },
  })

  const routeTree = rootRoute.addChildren([
    appRoute.addChildren([indexRoute, idRoute]),
  ])
  const router = createRouter({ routeTree })

  render(<RouterProvider router={router} />)

  const indexLink = await screen.findByTestId('link-to-index')
  expect(indexLink).toBeInTheDocument()

  const idLink = await screen.findByTestId('link-to-id')
  expect(idLink).toBeInTheDocument()

  const invalidateRouterButton = await screen.findByTestId('invalidate-router')
  expect(invalidateRouterButton).toBeInTheDocument()

  {
    const headerCounter = await screen.findByTestId('header-counter')
    expect(headerCounter).toHaveTextContent('1')

    const routeContext = await screen.findByTestId('index-route-context')
    expect(routeContext).toHaveTextContent('1')

    const loaderData = await screen.findByTestId('index-loader-data')
    expect(loaderData).toHaveTextContent('1')
  }

  fireEvent.click(idLink)

  {
    const headerCounter = await screen.findByTestId('header-counter')
    expect(headerCounter).toHaveTextContent('2')

    const routeContext = await screen.findByTestId('id-route-context')
    expect(routeContext).toHaveTextContent('2')

    const loaderData = await screen.findByTestId('id-loader-data')
    expect(loaderData).toHaveTextContent('2')
  }

  fireEvent.click(indexLink)

  {
    const headerCounter = await screen.findByTestId('header-counter')
    expect(headerCounter).toHaveTextContent('3')

    const routeContext = await screen.findByTestId('index-route-context')
    expect(routeContext).toHaveTextContent('3')

    const loaderData = await screen.findByTestId('index-loader-data')
    expect(loaderData).toHaveTextContent('3')
  }

  fireEvent.click(invalidateRouterButton)

  {
    const headerCounter = await screen.findByTestId('header-counter')
    expect(headerCounter).toHaveTextContent('4')

    const routeContext = await screen.findByTestId('index-route-context')
    expect(routeContext).toHaveTextContent('4')

    const loaderData = await screen.findByTestId('index-loader-data')
    expect(loaderData).toHaveTextContent('4')
  }

  fireEvent.click(idLink)

  {
    const headerCounter = await screen.findByTestId('header-counter')
    expect(headerCounter).toHaveTextContent('5')

    const routeContext = await screen.findByTestId('id-route-context')
    expect(routeContext).toHaveTextContent('5')

    const loaderData = await screen.findByTestId('id-loader-data')
    expect(loaderData).toHaveTextContent('5')
  }
})

test('does not show pending UI when loaders finish before their pending delays', async () => {
  const defaultPendingComponentOnMountMock = vi.fn()
  const nestedPendingComponentOnMountMock = vi.fn()
  const fooPendingComponentOnMountMock = vi.fn()

  function getPendingComponent(onMount: () => void) {
    const PendingComponent = () => {
      useEffect(() => {
        onMount()
      }, [])

      return <div>Pending...</div>
    }
    return PendingComponent
  }

  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => {
      return (
        <div>
          <h1>Index page</h1>
          <Link data-testid="link-to-foo" to="/nested/foo">
            link to foo
          </Link>
        </div>
      )
    },
  })
  const nestedRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/nested',
    // this route does not specify pendingMinMs, so it will use the defaultPendingMs from the router
    // which is set to WAIT_TIME * 2
    // since the loader immediately resolves, the pending component must NOT be shown
    pendingComponent: getPendingComponent(nestedPendingComponentOnMountMock),
    loader: () => {
      return 'nested'
    },
  })
  const fooRoute = createRoute({
    getParentRoute: () => nestedRoute,
    path: '/foo',
    // this route's loader takes WAIT_TIME * 5, so it will take longer than the defaultPendingMs
    // however, this route specifies pendingMs as WAIT_TIME * 10,
    // so this route's pending component must also NOT be shown
    pendingComponent: getPendingComponent(fooPendingComponentOnMountMock),
    pendingMs: WAIT_TIME * 10,
    loader: async () => {
      await sleep(WAIT_TIME * 5)
    },
    component: () => <div>Nested Foo page</div>,
  })
  const routeTree = rootRoute.addChildren([
    nestedRoute.addChildren([fooRoute]),
    indexRoute,
  ])
  const router = createRouter({
    routeTree,
    history,
    defaultPendingMs: WAIT_TIME * 2,
    defaultPendingComponent: getPendingComponent(
      defaultPendingComponentOnMountMock,
    ),
  })

  render(<RouterProvider router={router} />)
  const linkToFoo = await screen.findByTestId('link-to-foo')
  fireEvent.click(linkToFoo)
  const fooElement = await screen.findByText('Nested Foo page')
  expect(fooElement).toBeInTheDocument()

  expect(router.state.location.href).toBe('/nested/foo')

  // none of the pending components should have been called
  expect(defaultPendingComponentOnMountMock).not.toHaveBeenCalled()
  expect(nestedPendingComponentOnMountMock).not.toHaveBeenCalled()
  expect(fooPendingComponentOnMountMock).not.toHaveBeenCalled()
})

// https://github.com/TanStack/router/pull/7673
test('#7673: a spontaneous loader AbortError renders the boundary without executing the route component', async () => {
  history.replace('/app')
  history.flush()
  const rootRoute = createRootRoute({})
  const abortError = new DOMException('Aborted', 'AbortError')
  const routeComponentRendered = vi.fn()
  const renderedError = vi.fn()
  let routeSignal: AbortSignal | undefined

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: async ({ abortController }): Promise<{ value: string }> => {
      routeSignal = abortController.signal
      return Promise.reject(abortError)
    },
    component: () => {
      routeComponentRendered()
      const data = indexRoute.useLoaderData()
      return <div data-testid="index-content">{data.value}</div>
    },
    errorComponent: ({ error }) => {
      renderedError(error)
      return <div data-testid="index-error">indexErrorComponent</div>
    },
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({ routeTree, history, basepath: '/app' })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('index-error')).toBeInTheDocument()
  expect(screen.queryByTestId('index-content')).not.toBeInTheDocument()
  expect(routeComponentRendered).not.toHaveBeenCalled()
  expect(renderedError).toHaveBeenCalledWith(abortError)
  expect(routeSignal?.aborted).toBe(false)
  expect(
    router.state.matches.find((match) => match.routeId === indexRoute.id),
  ).toMatchObject({
    status: 'error',
    error: abortError,
  })
  expect(window.location.pathname).toBe('/app')
})

test('navigating away from a pending route aborts its loader', async () => {
  function getPendingComponent(onMount: () => void) {
    const PendingComponent = () => {
      useEffect(() => {
        onMount()
      }, [])

      return <div>Pending...</div>
    }
    return PendingComponent
  }
  const onAbortMock = vi.fn()
  const fooPendingComponentOnMountMock = vi.fn()
  let fooSignal: AbortSignal | undefined
  const rootRoute = createRootRoute({
    component: () => (
      <div>
        <h1>Index page</h1>
        <Link data-testid="link-to-foo" to="/foo">
          link to foo
        </Link>
        <Link data-testid="link-to-bar" to="/bar">
          link to bar
        </Link>
        <Outlet />
      </div>
    ),
  })
  const fooRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    pendingMs: 0,
    loader: async ({ abortController }) => {
      fooSignal = abortController.signal
      await new Promise<void>((resolve) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            onAbortMock()
            resolve()
          },
          { once: true },
        )
      })
    },
    pendingComponent: getPendingComponent(fooPendingComponentOnMountMock),
    component: () => <div>Foo page</div>,
  })
  const barRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/bar',
    component: () => <div>Bar page</div>,
  })
  const routeTree = rootRoute.addChildren([fooRoute, barRoute])
  const router = createRouter({ routeTree, history })
  render(<RouterProvider router={router} />)
  const fooLink = await screen.findByTestId('link-to-foo')
  fireEvent.click(fooLink)
  const pendingElement = await screen.findByText('Pending...')
  expect(pendingElement).toBeInTheDocument()
  expect(fooSignal?.aborted).toBe(false)
  await act(() => router.navigate({ to: '/bar' }))
  const barElement = screen.getByText('Bar page')
  expect(barElement).toBeInTheDocument()

  expect(fooPendingComponentOnMountMock).toHaveBeenCalled()
  expect(onAbortMock).toHaveBeenCalledTimes(1)
  expect(fooSignal?.aborted).toBe(true)
  expect(screen.queryByText('Pending...')).not.toBeInTheDocument()
  expect(screen.queryByText('Foo page')).not.toBeInTheDocument()
  expect(router.state.location.href).toBe('/bar')
  expect(router.state.status).toBe('idle')
})

test('reproducer for #6388 - rapid navigation between parameterized routes should not trigger errorComponent', async () => {
  const errorComponentRenderCount = vi.fn()
  const onAbortMock = vi.fn()
  const loaderCompleteMock = vi.fn()

  const rootRoute = createRootRoute({
    component: () => (
      <div>
        <Link data-testid="link-to-home" to="/">
          Home
        </Link>
        <Link
          data-testid="link-to-param-1"
          to="/something/$id"
          params={{ id: '1' }}
          preload={false}
        >
          Param 1
        </Link>
        <Link
          data-testid="link-to-param-2"
          to="/something/$id"
          params={{ id: '2' }}
          preload={false}
        >
          Param 2
        </Link>
        <Outlet />
      </div>
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="home-page">Home page</div>,
  })

  const paramRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/something/$id',
    pendingMs: 0,
    loader: async ({ params, abortController }) => {
      const result = await new Promise<{ id: string; done: boolean }>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            loaderCompleteMock(params.id)
            resolve({ id: params.id, done: true })
          }, WAIT_TIME * 5)

          abortController.signal.addEventListener('abort', () => {
            clearTimeout(timer)
            onAbortMock(params.id)
            reject(new DOMException('Aborted', 'AbortError'))
          })
        },
      )

      return result
    },
    component: () => {
      const data = paramRoute.useLoaderData()
      return (
        <div data-testid="param-page">
          Param Component {data.id} {data.done ? 'Done' : 'Not done'}
        </div>
      )
    },
    errorComponent: ({ error }) => {
      errorComponentRenderCount(error)
      return (
        <div data-testid="error-component">
          Error Component:{' '}
          {error instanceof Error ? error.message : String(error)} | Name:{' '}
          {error instanceof Error ? error.name : typeof error}
        </div>
      )
    },
    pendingComponent: () => <div data-testid="pending-component">Pending</div>,
  })

  const routeTree = rootRoute.addChildren([indexRoute, paramRoute])
  const router = createRouter({
    routeTree,
    history,
    defaultPreload: false,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('home-page')).toBeInTheDocument()
  const param1Link = await screen.findByTestId('link-to-param-1')
  fireEvent.click(param1Link)
  expect(await screen.findByTestId('pending-component')).toBeInTheDocument()

  const param2Link = await screen.findByTestId('link-to-param-2')
  fireEvent.click(param2Link)
  expect(await screen.findByTestId('pending-component')).toBeInTheDocument()

  fireEvent.click(param1Link)
  expect(await screen.findByTestId('pending-component')).toBeInTheDocument()

  const paramPage = await screen.findByTestId('param-page')

  expect(onAbortMock).toHaveBeenCalled()
  expect(errorComponentRenderCount).not.toHaveBeenCalled()
  expect(screen.queryByTestId('error-component')).not.toBeInTheDocument()
  expect(screen.queryByTestId('pending-component')).not.toBeInTheDocument()

  expect(paramPage).toBeInTheDocument()
  expect(paramPage).toHaveTextContent('Param Component 1 Done')
  expect(loaderCompleteMock).toHaveBeenCalled()
})
