import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('a pending child observes settled ancestor context during beforeLoad and loader waits', async () => {
  const childBeforeLoadStarted = createControlledPromise<void>()
  const childBeforeLoadGate = createControlledPromise<void>()
  const childLoaderStarted = createControlledPromise<void>()
  const childLoaderGate = createControlledPromise<void>()
  let navigation: Promise<void> | undefined

  const rootRoute = createRootRoute({
    context: () => ({
      workspace: 'Router Team',
      role: 'maintainer',
    }),
    component: RootComponent,
  })
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: HomeComponent,
  })
  const reportsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    beforeLoad: async ({ context }) => {
      childBeforeLoadStarted.resolve()
      await childBeforeLoadGate

      return {
        report: 'Activity',
        access: `${context.workspace}:${context.role}`,
      }
    },
    loader: async () => {
      childLoaderStarted.resolve()
      await childLoaderGate
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: ReportsPendingComponent,
    component: ReportsComponent,
  })

  function RootComponent() {
    const context = rootRoute.useRouteContext()

    return (
      <main>
        <header>
          <h1>{context.workspace}</h1>
          <output data-testid="root-context">
            Workspace {context.workspace}; role {context.role}
          </output>
        </header>
        <Outlet />
      </main>
    )
  }

  function HomeComponent() {
    const navigate = homeRoute.useNavigate()

    return (
      <section>
        <h2>Home</h2>
        <button
          onClick={() => {
            navigation = navigate({ to: '/reports' })
          }}
        >
          View reports
        </button>
      </section>
    )
  }

  function ReportsPendingComponent() {
    const parentContext = rootRoute.useRouteContext()

    return (
      <section data-testid="reports-pending" role="status">
        Loading reports
        <output data-testid="pending-ancestor-context">
          Workspace {parentContext.workspace}; role {parentContext.role}
        </output>
      </section>
    )
  }

  function ReportsComponent() {
    const context = reportsRoute.useRouteContext()

    return (
      <section>
        <h2>Reports</h2>
        <output data-testid="child-context">
          Workspace {context.workspace}; role {context.role}; report{' '}
          {context.report}; access {context.access}
        </output>
      </section>
    )
  }

  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const view = render(<RouterProvider router={router} />)

  try {
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible()
    expect(screen.getByTestId('root-context')).toHaveTextContent(
      'Workspace Router Team; role maintainer',
    )

    fireEvent.click(screen.getByRole('button', { name: 'View reports' }))
    await act(async () => {
      await childBeforeLoadStarted
    })

    expect(await screen.findByTestId('reports-pending')).toHaveTextContent(
      'Loading reports',
    )
    expect(screen.getByTestId('root-context')).toHaveTextContent(
      'Workspace Router Team; role maintainer',
    )
    expect(screen.getByTestId('pending-ancestor-context')).toHaveTextContent(
      'Workspace Router Team; role maintainer',
    )
    expect(screen.queryByTestId('child-context')).not.toBeInTheDocument()

    await act(async () => {
      childBeforeLoadGate.resolve()
      await childLoaderStarted
    })

    expect(screen.getByTestId('reports-pending')).toHaveTextContent(
      'Loading reports',
    )
    expect(screen.getByTestId('root-context')).toHaveTextContent(
      'Workspace Router Team; role maintainer',
    )
    expect(screen.getByTestId('pending-ancestor-context')).toHaveTextContent(
      'Workspace Router Team; role maintainer',
    )
    expect(screen.queryByTestId('child-context')).not.toBeInTheDocument()

    const childNavigation = navigation
    if (!childNavigation) {
      throw new Error('Expected child navigation to start')
    }

    await act(async () => {
      childLoaderGate.resolve()
      await childNavigation
    })

    expect(screen.queryByTestId('reports-pending')).not.toBeInTheDocument()
    expect(screen.getByTestId('root-context')).toHaveTextContent(
      'Workspace Router Team; role maintainer',
    )
    expect(screen.getByTestId('child-context')).toHaveTextContent(
      'Workspace Router Team; role maintainer; report Activity; access Router Team:maintainer',
    )
  } finally {
    childBeforeLoadGate.resolve()
    childLoaderGate.resolve()
    await act(async () => {
      await Promise.allSettled(navigation ? [navigation] : [])
    })
    view.unmount()
  }
})

test('overlapping invalidations keep the latest context through completion', async () => {
  const secondChildLoaderStarted = createControlledPromise<void>()
  const secondChildLoaderGate = createControlledPromise<void>()
  const thirdRootBeforeLoadStarted = createControlledPromise<void>()
  const thirdRootBeforeLoadGate = createControlledPromise<void>()
  let contextGeneration = 0
  let childLoaderGeneration = 0

  const rootRoute = createRootRoute({
    beforeLoad: async () => {
      const generation = ++contextGeneration

      if (generation === 3) {
        thirdRootBeforeLoadStarted.resolve()
        await thirdRootBeforeLoadGate
      }

      return { generation }
    },
    component: () => (
      <main>
        <output data-testid="root-context">
          Root generation {rootRoute.useRouteContext().generation}
        </output>
        <Outlet />
      </main>
    ),
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: async () => {
      if (++childLoaderGeneration === 2) {
        secondChildLoaderStarted.resolve()
        await secondChildLoaderGate
      }
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => <p data-testid="child-pending">Loading child</p>,
    component: () => <p>Child content</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const view = render(<RouterProvider router={router} />)
  let firstInvalidation: Promise<void> | undefined
  let secondInvalidation: Promise<void> | undefined

  try {
    expect(await screen.findByText('Child content')).toBeInTheDocument()
    expect(screen.getByTestId('root-context')).toHaveTextContent(
      'Root generation 1',
    )

    await act(async () => {
      firstInvalidation = router.invalidate({ forcePending: true })
      await secondChildLoaderStarted
      await Promise.resolve()
    })
    expect(screen.getByTestId('child-pending')).toHaveTextContent(
      'Loading child',
    )
    expect(screen.getByTestId('root-context')).toHaveTextContent(
      'Root generation 2',
    )

    await act(async () => {
      secondInvalidation = router.invalidate({ forcePending: true })
      await thirdRootBeforeLoadStarted
      await Promise.resolve()
    })

    expect(screen.getByTestId('child-pending')).toHaveTextContent(
      'Loading child',
    )
    expect(screen.getByTestId('root-context')).toHaveTextContent(
      'Root generation 2',
    )
    await act(async () => {
      thirdRootBeforeLoadGate.resolve()
      await secondInvalidation
    })
    expect(screen.getByTestId('root-context')).toHaveTextContent(
      'Root generation 3',
    )
    expect(screen.getByText('Child content')).toBeVisible()
    expect(screen.queryByTestId('child-pending')).not.toBeInTheDocument()

    await act(async () => {
      secondChildLoaderGate.resolve()
      await firstInvalidation
    })
    expect(screen.getByTestId('root-context')).toHaveTextContent(
      'Root generation 3',
    )
    expect(screen.getByText('Child content')).toBeVisible()
  } finally {
    await act(async () => {
      secondChildLoaderGate.resolve()
      thirdRootBeforeLoadGate.resolve()
      await Promise.allSettled(
        [firstInvalidation, secondInvalidation].filter(
          (invalidation): invalidation is Promise<void> =>
            invalidation !== undefined,
        ),
      )
    })
    view.unmount()
  }
})
