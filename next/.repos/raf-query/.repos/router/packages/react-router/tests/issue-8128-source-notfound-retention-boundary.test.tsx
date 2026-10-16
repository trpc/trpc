import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, onTestFinished, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

function createGate() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

afterEach(cleanup)

test('#8128: returning from a layout-owned fuzzy not-found retains only through its owner', async () => {
  const beforeLoadStarted = createGate()
  const beforeLoadGate = createGate()
  onTestFinished(() => beforeLoadGate.resolve())
  let gateNextBeforeLoad = false

  const rootRoute = createRootRoute({ component: Outlet })
  const agentsLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_agents',
    component: () => (
      <section>
        <h1>Agent operations</h1>
        <Outlet />
      </section>
    ),
    notFoundComponent: () => <p>Agent page not found</p>,
  })
  const agentsRoute = createRoute({
    getParentRoute: () => agentsLayoutRoute,
    path: '/agents',
    beforeLoad: async () => {
      if (gateNextBeforeLoad) {
        gateNextBeforeLoad = false
        beforeLoadStarted.resolve()
        await beforeLoadGate.promise
      }
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => <p role="status">Loading agents</p>,
    component: () => <p>Agents directory</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      agentsLayoutRoute.addChildren([agentsRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/agents'] }),
  })

  let navigation: Promise<void> | undefined
  try {
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Agents directory')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Agent operations' }),
    ).toBeVisible()

    await act(async () => {
      navigation = router.navigate({ to: '/agents/missing' } as any)
      await navigation
    })

    expect(
      screen.getByRole('heading', { name: 'Agent operations' }),
    ).toBeVisible()
    expect(screen.getByText('Agent page not found')).toBeVisible()
    expect(screen.queryByText('Agents directory')).not.toBeInTheDocument()

    gateNextBeforeLoad = true
    await act(async () => {
      navigation = router.navigate({ to: '/agents' })
      await beforeLoadStarted.promise
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(
      screen.getByRole('heading', { name: 'Agent operations' }),
    ).toBeVisible()
    expect(screen.queryByText('Agent page not found')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading agents')

    await act(async () => {
      beforeLoadGate.resolve()
      await navigation
    })

    expect(screen.getByText('Agents directory')).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  } finally {
    await act(async () => {
      await Promise.allSettled(navigation ? [navigation] : [])
    })
  }
})

test('#8128: retention stops at the earlier committed boundary when the presented boundary is deeper', async () => {
  const groupsBeforeLoadStarted = createGate()
  const groupsBeforeLoadGate = createGate()
  const workspaceReloadStarted = createGate()
  const workspaceReloadGate = createGate()
  const agentsReloadStarted = createGate()
  const agentsReloadGate = createGate()
  let agentsLoaderCalls = 0

  const rootRoute = createRootRoute({ component: Outlet })
  const workspaceLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_workspace',
    component: () => (
      <section>
        <h1>Workspace</h1>
        <Outlet />
      </section>
    ),
    notFoundComponent: () => <p>Workspace page not found</p>,
    beforeLoad: ({ location }) => {
      if (
        location.pathname === '/agents' &&
        (location.search as { reload?: number }).reload === 1
      ) {
        workspaceReloadStarted.resolve()
        return workspaceReloadGate.promise
      }
      return undefined
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => <p role="status">Loading workspace</p>,
  })
  const agentsRoute = createRoute({
    getParentRoute: () => workspaceLayoutRoute,
    path: '/agents',
    validateSearch: (search: Record<string, unknown>) => ({
      reload: Number(search.reload ?? 0),
    }),
    shouldReload: ({ location }) =>
      (location.search as { reload: number }).reload === 1,
    loader: {
      staleReloadMode: 'blocking',
      handler: async () => {
        agentsLoaderCalls++
        if (agentsLoaderCalls === 2) {
          agentsReloadStarted.resolve()
          await agentsReloadGate.promise
        }
        return { generation: agentsLoaderCalls }
      },
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => <p role="status">Loading agents destination</p>,
    component: () => (
      <section>
        <h2>Agents area</h2>
        <Outlet />
      </section>
    ),
  })
  const groupsRoute = createRoute({
    getParentRoute: () => agentsRoute,
    path: 'groups',
    beforeLoad: async () => {
      groupsBeforeLoadStarted.resolve()
      await groupsBeforeLoadGate.promise
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => <p role="status">Loading groups</p>,
    component: Outlet,
  })
  const groupsBoundaryRoute = createRoute({
    getParentRoute: () => groupsRoute,
    id: '_groups',
    component: Outlet,
    notFoundComponent: () => <p>Group page not found</p>,
  })
  const knownGroupRoute = createRoute({
    getParentRoute: () => groupsBoundaryRoute,
    path: 'known',
    component: () => <p>Known group</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      workspaceLayoutRoute.addChildren([
        agentsRoute.addChildren([
          groupsRoute.addChildren([
            groupsBoundaryRoute.addChildren([knownGroupRoute]),
          ]),
        ]),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/agents'] }),
  })

  let deeperNavigation: Promise<void> | undefined
  let agentsNavigation: Promise<void> | undefined
  try {
    render(<RouterProvider router={router} />)
    expect(
      await screen.findByRole('heading', { name: 'Agents area' }),
    ).toBeVisible()

    await act(async () => {
      await router.navigate({ to: '/agents/missing' } as any)
    })

    expect(screen.getByText('Workspace page not found')).toBeVisible()
    const committedBoundaryIndex = router.state.matches.findIndex(
      (match) => match._notFound,
    )
    expect(committedBoundaryIndex).toBeGreaterThanOrEqual(0)
    expect(router.state.matches[committedBoundaryIndex]?.routeId).toBe(
      workspaceLayoutRoute.id,
    )
    expect(
      router.state.matches.find((match) => match.routeId === agentsRoute.id),
    ).toMatchObject({ status: 'success' })

    await act(async () => {
      deeperNavigation = router.navigate({
        to: '/agents/groups/known/missing',
      } as any)
      await groupsBeforeLoadStarted.promise
    })

    expect(await screen.findByText('Loading groups')).toBeVisible()
    const presentedBoundaryIndex = router.state.matches.findIndex(
      (match) => match._notFound,
    )
    expect(presentedBoundaryIndex).toBeGreaterThan(committedBoundaryIndex)
    expect(router.state.matches[presentedBoundaryIndex]?.routeId).toBe(
      groupsBoundaryRoute.id,
    )
    expect(
      router.state.matches.find((match) => match.routeId === agentsRoute.id),
    ).toMatchObject({ status: 'success' })
    expect(
      router.state.matches.find((match) => match.routeId === groupsRoute.id),
    ).toMatchObject({ status: 'pending' })

    await act(async () => {
      agentsNavigation = router.navigate({
        to: '/agents',
        search: { reload: 1 },
      })
      await workspaceReloadStarted.promise
    })

    expect(screen.getByText('Loading groups')).toBeVisible()
    expect(screen.queryByText('Loading workspace')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Workspace' })).toBeVisible()
    expect(router.state.matches[presentedBoundaryIndex]?.routeId).toBe(
      groupsBoundaryRoute.id,
    )

    await act(async () => {
      workspaceReloadGate.resolve()
      await agentsReloadStarted.promise
    })

    expect(await screen.findByText('Loading agents destination')).toBeVisible()
    expect(
      router.state.matches.find((match) => match.routeId === agentsRoute.id),
    ).toMatchObject({ status: 'pending' })

    await act(async () => {
      agentsReloadGate.resolve()
      await agentsNavigation
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Agents area' })).toBeVisible()
    expect(router.state.location).toMatchObject({
      pathname: '/agents',
      search: { reload: 1 },
    })
    expect(router.state.matches.some((match) => match._notFound)).toBe(false)
    expect(agentsLoaderCalls).toBe(2)
  } finally {
    groupsBeforeLoadGate.resolve()
    workspaceReloadGate.resolve()
    agentsReloadGate.resolve()
    await act(async () => {
      await Promise.allSettled(
        [deeperNavigation, agentsNavigation].filter(
          (navigation): navigation is Promise<void> => navigation !== undefined,
        ),
      )
    })
  }
})
