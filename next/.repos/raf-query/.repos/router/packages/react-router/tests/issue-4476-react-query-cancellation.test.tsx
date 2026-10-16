import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

// https://github.com/TanStack/router/issues/4476
test('#4476: pending navigation keeps the query observer mounted and its fetchQuery signal alive', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  const queryGate = createControlledPromise<number>()
  const queryKey = ['issue-4476'] as const
  const routeError = vi.fn()
  const pageTwoBeforeLoad = vi.fn()
  const pendingComponentRendered = vi.fn()
  let querySignal: AbortSignal | undefined

  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link to="/page-two" preload="intent">
          Page two
        </Link>
        <Outlet />
      </>
    ),
  })
  function PageOneComponent() {
    const query = useQuery({
      queryKey,
      queryFn: () => Promise.resolve(3),
    })
    return <div data-testid="page-one">Page one: {query.data}</div>
  }
  const pageOneRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: PageOneComponent,
  })
  const pageTwoRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page-two',
    beforeLoad: async ({ preload }) => {
      pageTwoBeforeLoad(preload)
      if (preload) {
        return
      }
      const data = await queryClient.fetchQuery({
        queryKey,
        queryFn: ({ signal }) => {
          querySignal = signal
          return queryGate
        },
      })
      return { data }
    },
    errorComponent: ({ error }) => {
      routeError(error)
      return (
        <div data-testid="page-two-error">
          {error instanceof Error ? error.name : String(error)}
        </div>
      )
    },
    component: () => {
      const { data } = pageTwoRoute.useRouteContext()
      return <div data-testid="page-two">Page two: {data}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageOneRoute, pageTwoRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPreload: 'intent',
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 0,
    defaultPendingComponent: () => {
      pendingComponentRendered()
      return <div data-testid="page-two-pending">Loading page two</div>
    },
  })

  onTestFinished(() => {
    queryGate.resolve(10)
    queryClient.clear()
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  expect(await screen.findByText('Page one: 3')).toBeInTheDocument()

  const link = screen.getByRole('link', { name: 'Page two' })
  fireEvent.mouseOver(link)
  await waitFor(() => expect(pageTwoBeforeLoad).toHaveBeenCalledWith(true))
  fireEvent.click(link)

  await waitFor(() => expect(querySignal).toBeDefined())
  expect(screen.getByTestId('page-one')).toBeInTheDocument()
  expect(screen.getByTestId('page-two-pending')).toBeInTheDocument()
  expect(querySignal?.aborted).toBe(false)
  queryGate.resolve(10)

  expect(await screen.findByText('Page two: 10')).toBeInTheDocument()
  expect(routeError).not.toHaveBeenCalled()
  expect(screen.queryByTestId('page-one')).not.toBeInTheDocument()
  expect(screen.queryByTestId('page-two-pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('page-two-error')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/page-two')
})
