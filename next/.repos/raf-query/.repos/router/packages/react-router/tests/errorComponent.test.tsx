import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  CatchBoundary,
  ErrorComponent,
  HeadContent,
  Link,
  Outlet,
  RouterProvider,
  Scripts,
  createBrowserHistory,
  createControlledPromise,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../src/ssr/server'
import type { ErrorComponentProps, RouterHistory } from '../src'

function MyErrorComponent(props: ErrorComponentProps) {
  return <div>Error: {getErrorMessage(props.error)}</div>
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function asyncToThrowFn() {
  await new Promise((resolve) => setTimeout(resolve, 500))
  throw new Error('error thrown')
}

function throwFn() {
  throw new Error('error thrown')
}

function primitiveThrowFn() {
  throw 'primitive error thrown'
}

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

describe.each([true, false])(
  'with lazy errorComponent=%s',
  (isUsingLazyError) => {
    describe.each([{ preload: false }, { preload: 'intent' }] as const)(
      'errorComponent is rendered when the preload=$preload',
      (options) => {
        describe.each([true, false])('with async=%s', (isAsync) => {
          const throwableFn = isAsync ? asyncToThrowFn : throwFn

          const callers = [
            { caller: 'beforeLoad', testFn: throwableFn },
            { caller: 'loader', testFn: throwableFn },
          ]

          test.each(callers)(
            'an Error is thrown on navigate in the route $caller function',
            async ({ caller, testFn }) => {
              const rootRoute = createRootRoute()
              const indexRoute = createRoute({
                getParentRoute: () => rootRoute,
                path: '/',
                component: function Home() {
                  return (
                    <div>
                      <Link to="/about">link to about</Link>
                    </div>
                  )
                },
              })
              const aboutRoute = createRoute({
                getParentRoute: () => rootRoute,
                path: '/about',
                beforeLoad: caller === 'beforeLoad' ? testFn : undefined,
                loader: caller === 'loader' ? testFn : undefined,
                component: function Home() {
                  return <div>About route content</div>
                },
                errorComponent: isUsingLazyError ? undefined : MyErrorComponent,
              })

              if (isUsingLazyError) {
                aboutRoute.lazy(() =>
                  Promise.resolve(
                    createLazyRoute('/about')({
                      errorComponent: MyErrorComponent,
                    }),
                  ),
                )
              }

              const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

              const router = createRouter({
                routeTree,
                defaultPreload: options.preload,
                history,
              })

              render(<RouterProvider router={router} />)

              const linkToAbout = await screen.findByRole('link', {
                name: 'link to about',
              })

              expect(linkToAbout).toBeInTheDocument()
              fireEvent.mouseOver(linkToAbout)
              fireEvent.focus(linkToAbout)
              fireEvent.click(linkToAbout)

              const errorComponent = await screen.findByText(
                `Error: error thrown`,
                undefined,
                { timeout: 1500 },
              )
              await expect(
                screen.findByText('About route content'),
              ).rejects.toThrow()
              expect(errorComponent).toBeInTheDocument()
            },
          )

          test.each(callers)(
            'an Error is thrown on first load in the route $caller function',
            async ({ caller, testFn }) => {
              const rootRoute = createRootRoute()
              const indexRoute = createRoute({
                getParentRoute: () => rootRoute,
                path: '/',
                beforeLoad: caller === 'beforeLoad' ? testFn : undefined,
                loader: caller === 'loader' ? testFn : undefined,
                component: function Home() {
                  return <div>Index route content</div>
                },
                errorComponent: isUsingLazyError ? undefined : MyErrorComponent,
              })

              if (isUsingLazyError) {
                indexRoute.lazy(() =>
                  Promise.resolve(
                    createLazyRoute('/')({
                      errorComponent: MyErrorComponent,
                    }),
                  ),
                )
              }

              const routeTree = rootRoute.addChildren([indexRoute])

              const router = createRouter({
                routeTree,
                defaultPreload: options.preload,
                history,
              })

              render(<RouterProvider router={router} />)

              const errorComponent = await screen.findByText(
                `Error: error thrown`,
                undefined,
                { timeout: 750 },
              )
              await expect(
                screen.findByText('Index route content'),
              ).rejects.toThrow()
              expect(errorComponent).toBeInTheDocument()
            },
          )
        })
      },
    )

    describe('stale route errors do not leak after navigation', () => {
      test.each([
        {
          caller: 'loader' as const,
          routeOptions: {
            loader: throwFn,
          },
        },
        {
          caller: 'render' as const,
          routeOptions: {
            component: function RenderErrorComponent() {
              throwFn()
            },
          },
        },
      ])(
        'navigating away from a $caller error does not call the next route errorComponent',
        async ({ routeOptions }) => {
          const rootRoute = createRootRoute()
          const indexErrorComponent = vi.fn(() => <div>Index error</div>)

          const indexRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: '/',
            component: function Home() {
              return (
                <div>
                  <div>Index route content</div>
                  <Link to="/about">link to about</Link>
                </div>
              )
            },
            errorComponent: indexErrorComponent,
          })

          const aboutRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: '/about',
            component: function About() {
              return <div>About route content</div>
            },
            errorComponent: isUsingLazyError ? undefined : MyErrorComponent,
            ...routeOptions,
          })

          if (isUsingLazyError) {
            aboutRoute.lazy(() =>
              Promise.resolve(
                createLazyRoute('/about')({
                  errorComponent: MyErrorComponent,
                }),
              ),
            )
          }

          const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

          const router = createRouter({
            routeTree,
            history,
          })

          render(<RouterProvider router={router} />)

          const linkToAbout = await screen.findByRole('link', {
            name: 'link to about',
          })

          await act(() => fireEvent.click(linkToAbout))

          expect(
            await screen.findByText('Error: error thrown', undefined, {
              timeout: 1500,
            }),
          ).toBeInTheDocument()

          await act(() => router.navigate({ to: '/' }))

          expect(
            await screen.findByText('Index route content'),
          ).toBeInTheDocument()
          expect(indexErrorComponent).not.toHaveBeenCalled()
        },
      )
    })
  },
)

test('global catch boundary resets when a background child generation recovers', async () => {
  const refresh = createControlledPromise<number>()
  let loaderCalls = 0
  const rootRoute = createRootRoute({ component: Outlet })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: {
      staleReloadMode: 'background',
      handler: () => (++loaderCalls === 1 ? 1 : refresh),
    },
    component: () => {
      const revision = childRoute.useLoaderData()
      if (revision === 1) {
        throw new Error('stale child render failed')
      }
      return <div>Recovered child revision {revision}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history,
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  render(<RouterProvider router={router} />)
  expect(
    await screen.findByText('stale child render failed'),
  ).toBeInTheDocument()

  const invalidation = router.invalidate()
  await vi.waitFor(() => expect(loaderCalls).toBe(2))
  expect(screen.getByText('stale child render failed')).toBeInTheDocument()
  expect(screen.queryByText(/Recovered child revision/)).not.toBeInTheDocument()
  refresh.resolve(2)
  await invalidation

  expect(
    await screen.findByText('Recovered child revision 2'),
  ).toBeInTheDocument()
  expect(
    screen.queryByText('stale child render failed'),
  ).not.toBeInTheDocument()
})

test('ancestor route errorComponent resets when a background child generation recovers', async () => {
  const refresh = createControlledPromise<number>()
  let loaderCalls = 0
  const rootRoute = createRootRoute({
    component: Outlet,
    errorComponent: ({ error }) => (
      <div>Ancestor error: {getErrorMessage(error)}</div>
    ),
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: {
      staleReloadMode: 'background',
      handler: () => (++loaderCalls === 1 ? 1 : refresh),
    },
    component: () => {
      const revision = childRoute.useLoaderData()
      if (revision === 1) {
        throw new Error('stale child render failed')
      }
      return <div>Recovered child revision {revision}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history,
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  let invalidation: Promise<void> | undefined
  try {
    render(<RouterProvider router={router} />)
    expect(
      await screen.findByText('Ancestor error: stale child render failed'),
    ).toBeInTheDocument()

    invalidation = router.invalidate({
      filter: (match) => match.routeId === childRoute.id,
    })
    await vi.waitFor(() => expect(loaderCalls).toBe(2))
    expect(
      screen.getByText('Ancestor error: stale child render failed'),
    ).toBeInTheDocument()
    refresh.resolve(2)
    await invalidation

    expect(
      await screen.findByText('Recovered child revision 2'),
    ).toBeInTheDocument()
  } finally {
    refresh.resolve(2)
    if (invalidation) {
      await Promise.allSettled([invalidation])
    }
  }
})

test('errorComponent receives primitive errors thrown from beforeLoad', async () => {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: function Home() {
      return (
        <div>
          <Link to="/about">link to about</Link>
        </div>
      )
    },
  })
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    beforeLoad: primitiveThrowFn,
    component: function About() {
      return <div>About route content</div>
    },
    errorComponent: ({ error }) => <div>Error: {String(error)}</div>,
  })

  const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

  const router = createRouter({
    routeTree,
    history,
  })

  render(<RouterProvider router={router} />)

  const linkToAbout = await screen.findByRole('link', {
    name: 'link to about',
  })

  await act(() => fireEvent.click(linkToAbout))

  expect(
    await screen.findByText('Error: primitive error thrown', undefined, {
      timeout: 750,
    }),
  ).toBeInTheDocument()
  expect(screen.queryByText('About route content')).not.toBeInTheDocument()
})

test.each([
  ['false', false],
  ['zero', 0],
  ['negative zero', -0],
  ['bigint zero', 0n],
  ['empty string', ''],
  ['null', null],
  ['undefined', undefined],
  ['NaN', NaN],
] as const)('CatchBoundary renders falsy thrown value %s', (_, thrown) => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const onCatch = vi.fn()

  function ThrowFalsy(): never {
    throw thrown
  }

  render(
    <CatchBoundary
      getResetKey={() => 0}
      errorComponent={({ error }) => (
        <div>{Object.is(error, thrown) ? 'Caught value' : 'Wrong value'}</div>
      )}
      onCatch={onCatch}
    >
      <ThrowFalsy />
    </CatchBoundary>,
  )

  expect(screen.getByText('Caught value')).toBeInTheDocument()
  expect(screen.queryByText('Wrong value')).not.toBeInTheDocument()
  expect(onCatch).toHaveBeenCalledWith(thrown, expect.anything())
})

test.each([
  ['null', null],
  ['undefined', undefined],
] as const)('default error UI renders thrown %s', async (_, thrown) => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  function ThrowFalsy(): never {
    throw thrown
  }

  const rootRoute = createRootRoute({ component: ThrowFalsy })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Something went wrong!')).toBeInTheDocument()
})

test.each(['beforeLoad', 'loader'] as const)(
  'a Promise synchronously thrown from %s renders the route error UI',
  async (hook) => {
    const thrown = Promise.resolve('not route data')
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad:
        hook === 'beforeLoad'
          ? () => {
              throw thrown
            }
          : undefined,
      loader:
        hook === 'loader'
          ? () => {
              throw thrown
            }
          : undefined,
      errorComponent: ({ error }) => (
        <div>
          {error instanceof Error && error.cause === thrown
            ? 'Promise route error'
            : 'Wrong route error'}
        </div>
      ),
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Promise route error')).toBeInTheDocument()
    expect(screen.queryByText('Wrong route error')).not.toBeInTheDocument()
  },
)

test('SSR errorComponent receives primitive errors thrown from beforeLoad', async () => {
  const rootRoute = createRootRoute({
    shellComponent: function RootDocument({ children }) {
      return (
        <html>
          <body>
            {children}
            <Scripts />
          </body>
        </html>
      )
    },
    component: function Root() {
      return <Outlet />
    },
  })
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    beforeLoad: primitiveThrowFn,
    component: function About() {
      return <div>About route content</div>
    },
    errorComponent: ({ error }) => <div>Error: {String(error)}</div>,
  })

  const handler = createRequestHandler({
    request: new Request('http://localhost/about'),
    createRouter: () =>
      createRouter({
        routeTree: rootRoute.addChildren([aboutRoute]),
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

  expect(response.status).toBe(500)
  const html = await response.text()
  expect(html).toContain('Error:')
  expect(html).toContain('primitive error thrown')
})

test('a later fresh ancestor loader failure owns the reachable boundary', async () => {
  const parentStarted = createControlledPromise<void>()
  const childStarted = createControlledPromise<void>()
  const parentGate = createControlledPromise<void>()
  const childGate = createControlledPromise<void>()
  const childSettled = createControlledPromise<void>()
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    component: Outlet,
    loader: async () => {
      parentStarted.resolve()
      await parentGate
      throw new Error('later parent failure')
    },
    errorComponent: () => <div>Parent error boundary</div>,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: async () => {
      childStarted.resolve()
      await childGate
      childSettled.resolve()
      throw new Error('first child failure')
    },
    errorComponent: () => <div>Child error boundary</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  render(<RouterProvider router={router} />)

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/parent/child' })
    await Promise.all([parentStarted, childStarted])
  })
  await act(async () => {
    childGate.resolve()
    await childSettled
    parentGate.resolve()
    await navigation
  })

  expect(screen.getByText('Parent error boundary')).toBeInTheDocument()
  expect(screen.queryByText('Child error boundary')).not.toBeInTheDocument()
})

test('a fresh ancestor failure waits for lazy options before rendering its error', async () => {
  const parentStarted = createControlledPromise<void>()
  const childStarted = createControlledPromise<void>()
  const parentGate = createControlledPromise<void>()
  const childGate = createControlledPromise<void>()
  const childSettled = createControlledPromise<void>()
  const lazyParentOptions = createLazyRoute('/parent')({
    component: () => (
      <>
        <div>Lazy parent shell</div>
        <Outlet />
      </>
    ),
  })
  const parentChunk = createControlledPromise<typeof lazyParentOptions>()
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: async () => {
      parentStarted.resolve()
      await parentGate
      throw new Error('later parent failure')
    },
    errorComponent: () => <div>Parent error boundary</div>,
  }).lazy(() => parentChunk)
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: async () => {
      childStarted.resolve()
      await childGate
      childSettled.resolve()
      throw new Error('first child failure')
    },
    errorComponent: () => <div>Child error boundary</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  render(<RouterProvider router={router} />)

  let navigation: Promise<void> | undefined
  try {
    await act(async () => {
      navigation = router.navigate({ to: '/parent/child' })
      await Promise.all([parentStarted, childStarted])
    })
    await act(async () => {
      childGate.resolve()
      await childSettled
      parentGate.resolve()
      await Promise.resolve()
    })

    expect(parentChunk.status).toBe('pending')
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.queryByText('Parent error boundary')).not.toBeInTheDocument()
    expect(screen.queryByText('Child error boundary')).not.toBeInTheDocument()
    expect(screen.queryByText('Lazy parent shell')).not.toBeInTheDocument()
  } finally {
    await act(async () => {
      childGate.resolve()
      parentGate.resolve()
      parentChunk.resolve(lazyParentOptions)
      await navigation
    })
  }

  expect(screen.getByText('Parent error boundary')).toBeInTheDocument()
  expect(screen.queryByText('Lazy parent shell')).not.toBeInTheDocument()
  expect(screen.queryByText('Child error boundary')).not.toBeInTheDocument()
})

test('SSR renders a later fresh ancestor loader failure', async () => {
  const parentStarted = createControlledPromise<void>()
  const childStarted = createControlledPromise<void>()
  const parentGate = createControlledPromise<void>()
  const childGate = createControlledPromise<void>()
  const childSettled = createControlledPromise<void>()
  const rootRoute = createRootRoute({
    shellComponent: function RootDocument({ children }) {
      return (
        <html>
          <body>
            {children}
            <Scripts />
          </body>
        </html>
      )
    },
    component: Outlet,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    component: Outlet,
    loader: async () => {
      parentStarted.resolve()
      await parentGate
      throw new Error('later parent failure')
    },
    errorComponent: () => <div>Parent error boundary</div>,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: async () => {
      childStarted.resolve()
      await childGate
      childSettled.resolve()
      throw new Error('first child failure')
    },
    errorComponent: () => <div>Child error boundary</div>,
  })
  const handler = createRequestHandler({
    request: new Request('http://localhost/parent/child'),
    createRouter: () =>
      createRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        isServer: true,
      }),
  })

  const responsePromise = handler(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
  )
  await Promise.all([parentStarted, childStarted])
  childGate.resolve()
  await childSettled
  parentGate.resolve()
  const response = await responsePromise
  const html = await response.text()

  expect(response.status).toBe(500)
  expect(html).toContain('Parent error boundary')
  expect(html).not.toContain('Child error boundary')
})

// https://github.com/TanStack/router/issues/4684
test('#4684: SSR renders head content when beforeLoad throws', async () => {
  const rootRoute = createRootRoute({
    head: () => ({
      links: [{ rel: 'stylesheet', href: '/global.css' }],
    }),
    shellComponent: function RootDocument({ children }) {
      return (
        <html>
          <head>
            <HeadContent />
          </head>
          <body>
            {children}
            <Scripts />
          </body>
        </html>
      )
    },
    component: Outlet,
  })
  const failingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/fail',
    beforeLoad: () => {
      throw new Error('beforeLoad failed')
    },
    head: ({ match }) => ({
      meta: [{ title: match.error ? 'Error title' : 'Success title' }],
    }),
    component: function FailingRoute() {
      return <div>Route content</div>
    },
    errorComponent: ({ error }) => (
      <div>Error UI: {getErrorMessage(error)}</div>
    ),
  })

  const handler = createRequestHandler({
    request: new Request('http://localhost/fail'),
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

  expect(response.status).toBe(500)
  const html = await response.text()
  const serverDocument = new DOMParser().parseFromString(html, 'text/html')

  expect(serverDocument.body.textContent).toContain(
    'Error UI: beforeLoad failed',
  )
  expect(serverDocument.head.querySelector('title')?.textContent).toBe(
    'Error title',
  )
  expect(
    serverDocument.head.querySelector(
      'link[rel="stylesheet"][href="/global.css"]',
    ),
  ).not.toBeNull()
})

describe('notFoundComponent is rendered when an error is thrown in params.parse', () => {
  test('displays notFoundComponent when error is thrown in params.parse', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const rootLoader = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return { ok: true }
    })

    const rootRoute = createRootRoute({
      component: function Root() {
        return <Outlet />
      },
      notFoundComponent: function NotFound() {
        return <div>No pizza</div>
      },
      pendingComponent: function Pending() {
        return <div>Loading...</div>
      },
      loader: rootLoader,
      shouldReload: true,
      pendingMs: 0,
      pendingMinMs: 100,
      wrapInSuspense: true,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: function Home() {
        return (
          <div>
            <Link to="/pizza/rotten" preload="intent">
              link to rotten pizza
            </Link>
          </div>
        )
      },
    })

    const restaurantRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: 'restaurant',
      component: function Restaurant() {
        return <Outlet />
      },
    })

    const pizzaRoute = createRoute({
      getParentRoute: () => restaurantRoute,
      path: '/pizza/$pizzaType',
      component: function Pizza() {
        return <div>Pizza</div>
      },
      params: {
        parse: (p) => {
          if (p.pizzaType === 'rotten') {
            throw new Error('404 No rotten pizzas')
          }
          return { pizzaType: p.pizzaType }
        },
        stringify: (p) => ({ pizzaType: p.pizzaType }),
      },
      onError: () => {
        throw notFound()
      },
    })

    const routeTree = rootRoute.addChildren([
      indexRoute,
      restaurantRoute.addChildren([pizzaRoute]),
    ])

    const router = createRouter({
      routeTree,
      history,
    })

    render(<RouterProvider router={router} />)

    const linkToRottenPizza = await screen.findByRole('link', {
      name: 'link to rotten pizza',
    })

    expect(rootLoader).toHaveBeenCalledTimes(1)
    expect(linkToRottenPizza).toBeInTheDocument()
    await act(() => fireEvent.mouseOver(linkToRottenPizza))
    await act(() => fireEvent.click(linkToRottenPizza))

    const notFoundComponent = await screen.findByText('No pizza', undefined, {
      timeout: 750,
    })
    expect(rootLoader).toHaveBeenCalledTimes(2)
    expect(notFoundComponent).toBeInTheDocument()
  })
})

test.each([
  [new Error('Error message'), 'Error message'],
  [{ message: 'Serialized message' }, 'Serialized message'],
  [{ message: 0 }, undefined],
  ['Thrown string', undefined],
  [false, undefined],
  [0, undefined],
  [0n, undefined],
  ['', undefined],
  [null, undefined],
  [undefined, undefined],
  [NaN, undefined],
  [Symbol('error'), undefined],
  [Object.create(null), undefined],
])('default error details render %s', (error, expected) => {
  const { container } = render(<ErrorComponent error={error} />)

  expect(screen.getByText('Something went wrong!')).toBeInTheDocument()
  expect(container.querySelector('code')?.textContent).toBe(expected)
})

test.each([false, 0, -0, 0n, '', null, undefined, NaN])(
  'CatchBoundary resets after throwing %s',
  (thrown) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let shouldThrow = true
    let resetKey = 0
    const onCatch = vi.fn()

    function Child() {
      if (shouldThrow) {
        throw thrown
      }
      return <div>Recovered child</div>
    }

    function App() {
      return (
        <CatchBoundary
          getResetKey={() => resetKey}
          onCatch={onCatch}
          errorComponent={({ reset }) => <button onClick={reset}>Reset</button>}
        >
          <Child />
        </CatchBoundary>
      )
    }

    const { rerender } = render(<App />)
    shouldThrow = false
    rerender(<App />)
    expect(screen.queryByText('Recovered child')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Reset'))
    expect(screen.getByText('Recovered child')).toBeInTheDocument()

    shouldThrow = true
    rerender(<App />)
    shouldThrow = false
    resetKey++
    rerender(<App />)
    expect(screen.getByText('Recovered child')).toBeInTheDocument()
    expect(onCatch).toHaveBeenCalledTimes(2)
  },
)

test('CatchBoundary tracks reset keys while healthy', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  let resetKey: unknown
  let shouldThrow = false

  function Child() {
    if (shouldThrow) {
      throw null
    }
    return <div>Healthy child</div>
  }

  function App() {
    return (
      <CatchBoundary
        getResetKey={() => resetKey}
        errorComponent={() => <div>Caught error</div>}
      >
        <Child />
      </CatchBoundary>
    )
  }

  const { rerender } = render(<App />)
  expect(screen.getByText('Healthy child')).toBeInTheDocument()

  resetKey = {}
  rerender(<App />)
  expect(screen.getByText('Healthy child')).toBeInTheDocument()

  shouldThrow = true
  rerender(<App />)
  expect(screen.getByText('Caught error')).toBeInTheDocument()

  shouldThrow = false
  rerender(<App />)
  expect(screen.getByText('Caught error')).toBeInTheDocument()

  resetKey = undefined
  rerender(<App />)
  expect(screen.getByText('Healthy child')).toBeInTheDocument()

  shouldThrow = true
  rerender(<App />)
  expect(screen.getByText('Caught error')).toBeInTheDocument()
})
