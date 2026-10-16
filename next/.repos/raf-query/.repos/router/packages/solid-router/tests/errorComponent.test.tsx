import { afterEach, describe, expect, onTestFinished, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createControlledPromise } from '@tanstack/router-core'

import {
  CatchBoundary,
  ErrorComponent,
  Link,
  Outlet,
  RouterProvider,
  createLazyRoute,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { ErrorComponentProps } from '../src'

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

afterEach(() => {
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
              })

              render(() => <RouterProvider router={router} />)

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
              })

              render(() => <RouterProvider router={router} />)

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
      if (revision() === 1) {
        throw new Error('stale child render failed')
      }
      return <div>Recovered child revision {revision()}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  render(() => <RouterProvider router={router} />)
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
      if (revision() === 1) {
        throw new Error('stale child render failed')
      }
      return <div>Recovered child revision {revision()}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  render(() => <RouterProvider router={router} />)
  expect(
    await screen.findByText('Ancestor error: stale child render failed'),
  ).toBeInTheDocument()

  const invalidation = router.invalidate({
    filter: (match) => match.routeId === childRoute.id,
  })
  onTestFinished(async () => {
    refresh.resolve(2)
    await Promise.allSettled([invalidation])
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
  let caught: unknown

  function ThrowFalsy(): never {
    throw thrown
  }

  render(() => (
    <CatchBoundary
      getResetKey={() => 0}
      errorComponent={({ error }) => (
        <div>
          {error instanceof Error && Object.is(error.cause, thrown)
            ? 'Caught value'
            : 'Wrong value'}
        </div>
      )}
      onCatch={(error) => {
        caught = error
      }}
    >
      <ThrowFalsy />
    </CatchBoundary>
  ))

  expect(screen.getByText('Caught value')).toBeInTheDocument()
  expect(screen.queryByText('Wrong value')).not.toBeInTheDocument()
  expect(caught).toBeInstanceOf(Error)
  expect(Object.is((caught as Error).cause, thrown)).toBe(true)
})

test.each([
  [new Error('Error message'), 'Error message'],
  [new Error('Wrapped error', { cause: false }), 'Wrapped error'],
  [new Error(''), undefined],
])('default error details render %s', (error, expected) => {
  const { container } = render(() => <ErrorComponent error={error} />)

  expect(screen.getByText('Something went wrong!')).toBeInTheDocument()
  expect(container.querySelector('code')?.textContent).toBe(expected)
})
