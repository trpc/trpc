import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import { defineComponent, ref } from 'vue'
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
  },
)

test('global catch boundary resets when a background child generation recovers', async () => {
  const refresh = createControlledPromise<number>()
  let loaderCalls = 0
  const rootRoute = createRootRoute({ component: Outlet })
  const ChildComponent = defineComponent({
    setup() {
      const revision = childRoute.useLoaderData()
      return () => {
        if (revision.value === 1) {
          throw new Error('stale child render failed')
        }

        return <div>Recovered child revision {revision.value}</div>
      }
    },
  })

  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: {
      staleReloadMode: 'background',
      handler: () => (++loaderCalls === 1 ? 1 : refresh),
    },
    component: ChildComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
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
  const ChildComponent = defineComponent({
    setup() {
      const revision = childRoute.useLoaderData()
      return () => {
        if (revision.value === 1) {
          throw new Error('stale child render failed')
        }

        return <div>Recovered child revision {revision.value}</div>
      }
    },
  })

  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: {
      staleReloadMode: 'background',
      handler: () => (++loaderCalls === 1 ? 1 : refresh),
    },
    component: ChildComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
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

test.each([
  ['false', false],
  ['zero', 0],
  ['negative zero', -0],
  ['bigint zero', 0n],
  ['empty string', ''],
  ['null', null],
  ['undefined', undefined],
  ['NaN', NaN],
] as const)(
  'CatchBoundary renders falsy thrown value %s',
  async (_, thrown) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let caught: unknown

    function ThrowFalsy(): never {
      throw thrown
    }

    const rootRoute = createRootRoute({
      component: ThrowFalsy,
      errorComponent: ({ error }) => (
        <div>{Object.is(error, thrown) ? 'Caught value' : 'Wrong value'}</div>
      ),
      onCatch: (error) => {
        caught = error
      },
    })
    const router = createRouter({ routeTree: rootRoute })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Caught value')).toBeInTheDocument()
    expect(screen.queryByText('Wrong value')).not.toBeInTheDocument()
    expect(Object.is(caught, thrown)).toBe(true)
  },
)

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

test.each([false, 0, -0, 0n, '', null, undefined, NaN, { message: 'object' }])(
  'CatchBoundary retains the original value and resets after throwing %s',
  async (thrown) => {
    const shouldThrow = ref(true)
    const resetKey = ref(0)
    const onCatch = vi.fn()
    const Child = defineComponent(() => () => {
      if (shouldThrow.value) {
        throw thrown
      }
      return <div>Recovered child</div>
    })
    const App = defineComponent(() => () => (
      <CatchBoundary
        getResetKey={() => resetKey.value}
        onCatch={onCatch}
        errorComponent={({ error, reset }: ErrorComponentProps) => (
          <button onClick={reset}>
            {Object.is(error, thrown) ? 'Reset' : 'Wrong value'}
          </button>
        )}
        children={<Child />}
      />
    ))

    render(<App />)
    await screen.findByText('Reset')
    shouldThrow.value = false
    await fireEvent.click(screen.getByText('Reset'))
    expect(await screen.findByText('Recovered child')).toBeInTheDocument()

    shouldThrow.value = true
    await screen.findByText('Reset')
    shouldThrow.value = false
    resetKey.value++
    expect(await screen.findByText('Recovered child')).toBeInTheDocument()
    expect(onCatch).toHaveBeenCalledTimes(2)
    expect(onCatch).toHaveBeenLastCalledWith(thrown)
  },
)
