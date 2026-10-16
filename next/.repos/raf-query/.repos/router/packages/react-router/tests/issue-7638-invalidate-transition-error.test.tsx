import * as React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouter,
} from '../src'
import type { ErrorComponentProps } from '../src'

afterEach(() => {
  cleanup()
})

// https://github.com/TanStack/router/issues/7638
// router.invalidate() called inside React.startTransition while a nested
// route is showing its errorComponent must complete the reload and land back
// on the error UI without crashing React with
// "Rendered more hooks than during the previous render."
function setup({ failVia }: { failVia: 'render' | 'loader' }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const parentAction = vi.fn()
  const secondChildLoad = createControlledPromise<void>()
  let invalidation: Promise<void> | undefined

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/test',
    component: function TestComponent() {
      testRoute.useLoaderData()
      const router = useRouter()
      const [isPending, startTransition] = React.useTransition()
      return (
        <div>
          <button
            data-testid="invalidate"
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                invalidation = router.invalidate()
                return invalidation
              })
            }
          >
            {isPending ? 'pending' : 'invalidate'}
          </button>
          <button data-testid="parent-action" onClick={parentAction}>
            parent action
          </button>
          <Outlet />
        </div>
      )
    },
  })

  let childLoaderCalls = 0
  const childLoader = vi.fn(async () => {
    childLoaderCalls++
    if (childLoaderCalls === 2) {
      await secondChildLoad
    }
    if (failVia === 'loader') {
      throw new Error('loader error')
    }
    return 'data'
  })

  const testIndexRoute = createRoute({
    getParentRoute: () => testRoute,
    path: '/',
    loader: childLoader,
    component: function ChildComponent() {
      if (failVia === 'render') {
        throw new Error('render error')
      }
      return <div>child content</div>
    },
  })

  let errorRenders = 0
  const router = createRouter({
    routeTree: rootRoute.addChildren([testRoute.addChildren([testIndexRoute])]),
    history: createMemoryHistory({ initialEntries: ['/test'] }),
    defaultErrorComponent: (props: ErrorComponentProps) => {
      errorRenders++
      return (
        <div data-testid="error-ui">
          error:{' '}
          {props.error instanceof Error
            ? props.error.message
            : String(props.error)}
        </div>
      )
    },
  })

  return {
    router,
    childLoader,
    parentAction,
    secondChildLoad,
    getErrorRenders: () => errorRenders,
    getInvalidation: () => invalidation,
  }
}

test.each(['render', 'loader'] as const)(
  'invalidate() inside startTransition through a nested %s-error route does not crash',
  async (failVia) => {
    // Error boundaries log caught errors through console.error, and so does a
    // hooks-order crash. Capture instead of polluting the test output, then
    // inspect the captured calls for the crash signature.
    const {
      router,
      childLoader,
      parentAction,
      secondChildLoad,
      getErrorRenders,
      getInvalidation,
    } = setup({ failVia })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('error-ui')).toHaveTextContent(
        `error: ${failVia} error`,
      )
      const initialErrorRenders = getErrorRenders()
      expect(childLoader).toHaveBeenCalledTimes(1)
      consoleError.mockClear()

      fireEvent.click(screen.getByTestId('invalidate'))

      await waitFor(() => {
        expect(childLoader).toHaveBeenCalledTimes(2)
        expect(screen.getByTestId('invalidate')).toHaveTextContent('pending')
        expect(screen.getByTestId('invalidate')).toBeDisabled()
      })
      expect(secondChildLoad.status).toBe('pending')

      const invalidation = getInvalidation()
      if (!invalidation) {
        throw new Error('invalidate action did not return its promise')
      }

      await act(async () => {
        secondChildLoad.resolve()
        await invalidation
      })

      await waitFor(() => {
        expect(screen.getByTestId('error-ui')).toHaveTextContent(
          `error: ${failVia} error`,
        )
        expect(getErrorRenders()).toBeGreaterThan(initialErrorRenders)
        expect(screen.getByTestId('invalidate')).toHaveTextContent('invalidate')
        expect(screen.getByTestId('invalidate')).toBeEnabled()
      })

      fireEvent.click(screen.getByTestId('parent-action'))
      expect(parentAction).toHaveBeenCalledTimes(1)

      const hooksCrash = consoleError.mock.calls.find((call) =>
        call.some((arg) =>
          String(arg?.message ?? arg).includes('Rendered more hooks'),
        ),
      )
      expect(hooksCrash).toBeUndefined()
    } finally {
      if (secondChildLoad.status === 'pending') {
        await act(async () => {
          secondChildLoad.resolve()
          await getInvalidation()?.catch(() => undefined)
        })
      }
      consoleError.mockRestore()
    }
  },
)
