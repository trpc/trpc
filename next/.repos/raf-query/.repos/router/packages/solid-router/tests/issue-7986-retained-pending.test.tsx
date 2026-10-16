import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { ControlledPromise } from '@tanstack/router-core'

const controlledPromises = new Set<ControlledPromise<void>>()
const pendingOperations = new Set<Promise<unknown>>()

afterEach(async () => {
  try {
    for (const promise of controlledPromises) {
      if (promise.status === 'pending') {
        promise.resolve()
      }
    }
    if (vi.isFakeTimers()) {
      await vi.runAllTimersAsync()
    }
    await Promise.allSettled(pendingOperations)
  } finally {
    controlledPromises.clear()
    pendingOperations.clear()
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  }
})

const navigationDelay = 100

function delayNavigation() {
  return new Promise<void>((resolve) => setTimeout(resolve, navigationDelay))
}

function controlled() {
  const promise = createControlledPromise<void>()
  controlledPromises.add(promise)
  return promise
}

function track<T>(operation: Promise<T>) {
  pendingOperations.add(operation)
  return operation
}

function setup() {
  const navigationBeforeLoadStarted = controlled()
  let beforeLoadCalls = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'app',
    beforeLoad: async () => {
      if (++beforeLoadCalls > 1) {
        navigationBeforeLoadStarted.resolve()
        await delayNavigation()
      }
      return { user: 'test' }
    },
    component: () => <Outlet />,
  })
  const projectRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/projects/$projectId',
    validateSearch: (search: Record<string, unknown>): { tab?: string } =>
      typeof search.tab === 'string' ? { tab: search.tab } : {},
    component: Project,
  })

  function Project() {
    const params = projectRoute.useParams()
    const search = projectRoute.useSearch()
    return (
      <div data-testid="content">
        project={params().projectId} tab={search().tab ?? 'default'}
      </div>
    )
  }

  const router = createRouter({
    routeTree: rootRoute.addChildren([layoutRoute.addChildren([projectRoute])]),
    history: createMemoryHistory({ initialEntries: ['/projects/p1'] }),
    defaultPendingComponent: () => <div data-testid="pending">Pending</div>,
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  return { router, navigationBeforeLoadStarted }
}

test('a search-only navigation retains successful UI while beforeLoad reruns', async () => {
  const { router, navigationBeforeLoadStarted } = setup()
  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const navigation = track(
    router.navigate({
      to: '/projects/$projectId',
      params: { projectId: 'p1' },
      search: { tab: 'files' },
    }),
  )
  await navigationBeforeLoadStarted

  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(navigationDelay)
  await navigation

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=files',
  )
})

test('a path-param navigation retains successful UI while beforeLoad reruns', async () => {
  const { router, navigationBeforeLoadStarted } = setup()
  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const navigation = track(
    router.navigate({
      to: '/projects/$projectId',
      params: { projectId: 'p2' },
    }),
  )
  await navigationBeforeLoadStarted

  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(navigationDelay)
  await navigation

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p2 tab=default',
  )
})

test('a blocking reload retains the exact successful match', async () => {
  const reloadStarted = controlled()
  let loaderCalls = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    validateSearch: (search: Record<string, unknown>): { tab?: string } =>
      typeof search.tab === 'string' ? { tab: search.tab } : {},
    shouldReload: true,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        if (++loaderCalls === 1) {
          return 'initial'
        }
        reloadStarted.resolve()
        return delayNavigation().then(() => 'reloaded')
      },
    },
    component: () => (
      <div data-testid="content">
        {pageRoute.useLoaderData()()} tab=
        {pageRoute.useSearch()().tab ?? 'default'}
      </div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultPendingComponent: () => <div data-testid="pending">Pending</div>,
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'initial tab=default',
  )

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const navigation = track(
    router.navigate({
      to: '/page',
      search: { tab: 'files' },
    }),
  )
  await reloadStarted

  const contentWhileLoading = screen.getByTestId('content')
  expect(contentWhileLoading).toBeVisible()
  expect(contentWhileLoading).toHaveTextContent('initial tab=default')
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('initial tab=default')
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(navigationDelay)
  await navigation

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent('reloaded tab=files')
})

test('a cached success retries through pending UI when an error is mounted', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const retryStarted = controlled()
  const retry = controlled()
  let loaderCalls = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    shouldReload: true,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        loaderCalls++
        if (loaderCalls === 1) {
          throw new Error('initial load failed')
        }
        if (loaderCalls === 2) {
          return 'preloaded'
        }
        retryStarted.resolve()
        return retry.then(() => 'retried')
      },
    },
    component: () => (
      <div data-testid="content">{pageRoute.useLoaderData()()}</div>
    ),
    pendingComponent: () => <div data-testid="pending">Pending</div>,
    errorComponent: () => <div data-testid="error">Failed</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('error')).toBeInTheDocument()

  await router.preloadRoute({ to: '/page' })
  expect(loaderCalls).toBe(2)
  expect(screen.getByTestId('error')).toBeInTheDocument()

  const navigation = track(router.navigate({ to: '/page' }))
  await retryStarted

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('error')).not.toBeInTheDocument()

  retry.resolve()
  await navigation

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('retried')
})

test('a cache-only success retries through pending UI over mounted success', async () => {
  const retryStarted = controlled()
  const retry = controlled()
  let loaderCalls = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    shouldReload: true,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        const generation = ++loaderCalls
        if (generation === 3) {
          retryStarted.resolve()
          return retry.then(() => `generation ${generation}`)
        }
        return `generation ${generation}`
      },
    },
    component: () => (
      <div data-testid="content">{pageRoute.useLoaderData()()}</div>
    ),
    pendingComponent: () => <div data-testid="pending">Pending</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent('generation 1')

  await router.preloadRoute({ to: '/page' })
  expect(loaderCalls).toBe(2)
  expect(screen.getByTestId('content')).toHaveTextContent('generation 1')

  const navigation = track(router.navigate({ to: '/page' }))
  await retryStarted

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('content')).not.toBeInTheDocument()

  retry.resolve()
  await navigation

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent('generation 3')
})

test('a success hidden below an error boundary retries through pending UI', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const childReloadStarted = controlled()
  const childReload = controlled()
  let parentFails = false
  let childReloads = false

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    shouldReload: true,
    loader: () => {
      if (parentFails) {
        throw new Error('parent failed')
      }
      return 'parent data'
    },
    component: () => <Outlet />,
    errorComponent: () => <div data-testid="error">Parent failed</div>,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    shouldReload: () => childReloads,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        if (childReloads) {
          childReloadStarted.resolve()
          return childReload.then(() => 'reloaded child')
        }
        return 'initial child'
      },
    },
    component: () => (
      <div data-testid="content">{childRoute.useLoaderData()()}</div>
    ),
    pendingComponent: () => <div data-testid="pending">Pending child</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'initial child',
  )

  parentFails = true
  await track(router.navigate({ to: '/parent/child' }))
  expect(await screen.findByTestId('error')).toBeInTheDocument()

  parentFails = false
  childReloads = true
  const navigation = track(router.navigate({ to: '/parent/child' }))
  await childReloadStarted

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('error')).not.toBeInTheDocument()

  childReload.resolve()
  await navigation

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('reloaded child')
})

test('a global not-found destination keeps pending until its terminal component is ready', async () => {
  const missingStarted = controlled()
  const missingLoader = controlled()
  const terminalStarted = controlled()
  const terminalReady = controlled()
  let loaderCalls = 0
  const Missing = Object.assign(
    () => <div data-testid="missing">Missing</div>,
    {
      preload: () => {
        terminalStarted.resolve()
        return terminalReady
      },
    },
  )

  const rootRoute = createRootRoute({
    shouldReload: true,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        if (++loaderCalls === 1) {
          return 'initial root'
        }
        missingStarted.resolve()
        return missingLoader
      },
    },
    component: () => <Outlet />,
    pendingComponent: () => <div data-testid="pending">Pending root</div>,
    notFoundComponent: Missing,
  })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: () => <div data-testid="content">Page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toBeInTheDocument()

  const navigation = track(router.navigate({ to: '/missing' } as any))
  await missingStarted

  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('content')).not.toBeInTheDocument()

  let settled = false
  void navigation.then(() => {
    settled = true
  })
  missingLoader.resolve()
  await terminalStarted
  expect(screen.getByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('missing')).not.toBeInTheDocument()
  expect(settled).toBe(false)

  terminalReady.resolve()
  await navigation

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('missing')).toBeVisible()
})

test('a cold global not-found presents pending only while its terminal component loads', async () => {
  const terminalStarted = controlled()
  const terminalReady = controlled()
  const Missing = Object.assign(
    () => <div data-testid="missing">Missing</div>,
    {
      preload: () => {
        terminalStarted.resolve()
        return terminalReady
      },
    },
  )
  const rootRoute = createRootRoute({
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => <div data-testid="pending">Pending root</div>,
    notFoundComponent: Missing,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/missing'] }),
  })

  render(() => <RouterProvider router={router} />)
  await terminalStarted
  expect(await screen.findByTestId('pending')).toBeVisible()
  expect(screen.queryByTestId('missing')).not.toBeInTheDocument()

  terminalReady.resolve()
  expect(await screen.findByTestId('missing')).toBeVisible()
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
})

test('lazy fuzzy-boundary relocation retains the mounted parent', async () => {
  const lazyStarted = controlled()
  const lazyRoute = controlled()
  const parentReloadStarted = controlled()
  const parentReload = controlled()
  let parentLoads = 0

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    notFoundComponent: () => <div data-testid="root-missing">Root missing</div>,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: async () => {
      if (++parentLoads > 1) {
        parentReloadStarted.resolve()
        await parentReload
      }
    },
    component: () => (
      <div>
        <div data-testid="parent-content">Parent content</div>
        <Outlet />
      </div>
    ),
    pendingComponent: () => (
      <div data-testid="parent-pending">Parent pending</div>
    ),
    notFoundComponent: () => (
      <div data-testid="parent-missing">Parent missing</div>
    ),
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
  }).lazy(async () => {
    lazyStarted.resolve()
    await lazyRoute
    return createLazyRoute('/parent/child')({
      notFoundComponent: () => (
        <div data-testid="child-missing">Child missing</div>
      ),
    })
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent'] }),
    defaultPendingComponent: () => (
      <div data-testid="default-pending">Pending</div>
    ),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('parent-content')).toBeVisible()

  const navigation = track(
    router.navigate({ to: '/parent/child/missing' as any }),
  )
  await lazyStarted

  expect(screen.getByTestId('parent-content')).toBeVisible()
  expect(screen.queryByTestId('parent-pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('parent-missing')).not.toBeInTheDocument()

  lazyRoute.resolve()
  await parentReloadStarted

  expect(screen.getByTestId('parent-content')).toBeVisible()
  expect(screen.queryByTestId('parent-pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('parent-missing')).not.toBeInTheDocument()

  parentReload.resolve()
  await navigation

  expect(screen.getByTestId('child-missing')).toBeVisible()
  expect(screen.queryByTestId('root-missing')).not.toBeInTheDocument()
  expect(screen.queryByTestId('parent-missing')).not.toBeInTheDocument()
})

test('a superseding navigation replaces an unrelated pending presentation', async () => {
  const otherStarted = controlled()
  const otherLoader = controlled()
  const pageReloadStarted = controlled()
  const pageReload = controlled()
  let pageLoads = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    shouldReload: true,
    loader: {
      staleReloadMode: 'blocking',
      handler: () => {
        if (++pageLoads === 1) {
          return 'initial page'
        }
        pageReloadStarted.resolve()
        return pageReload.then(() => 'reloaded page')
      },
    },
    component: () => (
      <div data-testid="content">{pageRoute.useLoaderData()()}</div>
    ),
    pendingComponent: () => <div data-testid="page-pending">Page pending</div>,
  })
  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    loader: async () => {
      otherStarted.resolve()
      await otherLoader
    },
    pendingComponent: () => (
      <div data-testid="other-pending">Other pending</div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent('initial page')

  const otherNavigation = track(router.navigate({ to: '/other' }))
  await otherStarted
  expect(await screen.findByTestId('other-pending')).toBeVisible()

  const navigation = track(router.navigate({ to: '/page' }))
  await pageReloadStarted

  await waitFor(() => {
    expect(screen.getByTestId('page-pending')).toBeVisible()
    expect(screen.queryByTestId('other-pending')).not.toBeInTheDocument()
  })

  pageReload.resolve()
  await navigation
  otherLoader.resolve()
  await otherNavigation

  expect(screen.queryByTestId('page-pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent('reloaded page')
})

test('a retained root publishes fresh context with a child fallback', async () => {
  const retainedStarted = controlled()
  const retainedReady = controlled()
  const childStarted = controlled()
  const childReady = controlled()
  let retainedLoads = 0

  const rootRoute = createRootRoute({
    validateSearch: (search: Record<string, unknown>): { user: string } => ({
      user: typeof search.user === 'string' ? search.user : 'unknown',
    }),
    beforeLoad: async ({ search }) => {
      if (++retainedLoads > 1) {
        retainedStarted.resolve()
        await retainedReady
      }
      return { user: search.user }
    },
    component: () => (
      <div>
        <div data-testid="user">{rootRoute.useRouteContext()().user}</div>
        <Outlet />
      </div>
    ),
  })
  const sourceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/source',
    component: () => <div data-testid="source">Source</div>,
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    loader: async () => {
      childStarted.resolve()
      await childReady
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => <div data-testid="child-pending">Pending</div>,
    component: () => <div data-testid="child">Child</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([sourceRoute, childRoute]),
    history: createMemoryHistory({ initialEntries: ['/source?user=Ada'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('source')).toBeVisible()
  expect(screen.getByTestId('user')).toHaveTextContent('Ada')
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const navigation = track(
    router.navigate({ to: '/child', search: { user: 'Grace' } }),
  )
  await retainedStarted
  expect(screen.getByTestId('source')).toBeVisible()
  expect(screen.getByTestId('user')).toHaveTextContent('Ada')
  expect(screen.queryByTestId('child-pending')).not.toBeInTheDocument()

  retainedReady.resolve()
  await childStarted
  expect(await screen.findByTestId('child-pending')).toBeVisible()
  expect(screen.getByTestId('user')).toHaveTextContent('Grace')

  childReady.resolve()
  await navigation
  expect(screen.getByTestId('child')).toBeVisible()
})

test('a retained prefix exposes one fresh context chain before descendant pending', async () => {
  const retainedStarted = controlled()
  const retainedReady = controlled()
  const pendingStarted = controlled()
  const pendingReady = controlled()
  let retainedLoads = 0

  const rootRoute = createRootRoute({
    beforeLoad: () => ({ rootReady: true }),
    component: () => <Outlet />,
  })
  const aRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'a',
    validateSearch: (search: Record<string, unknown>): { user: string } => ({
      user: typeof search.user === 'string' ? search.user : 'unknown',
    }),
    beforeLoad: async ({ search }) => {
      if (++retainedLoads > 1) {
        retainedStarted.resolve()
        await retainedReady
      }
      return { user: search.user }
    },
    component: () => {
      const user = aRoute.useRouteContext({
        select: (context) => context.user,
      })
      return (
        <div>
          <div data-testid="user">{user()}</div>
          <Outlet />
        </div>
      )
    },
  })
  const bRoute = createRoute({
    getParentRoute: () => aRoute,
    path: 'b',
    component: () => <Outlet />,
  })
  const cRoute = createRoute({
    getParentRoute: () => bRoute,
    path: 'c',
    component: () => <Outlet />,
  })
  const dRoute = createRoute({
    getParentRoute: () => cRoute,
    path: 'd',
    component: () => <div data-testid="source">Source</div>,
  })
  const eRoute = createRoute({
    getParentRoute: () => aRoute,
    path: 'e',
    component: () => {
      const user = eRoute.useRouteContext({
        select: (context) => context.user,
      })
      return (
        <div>
          <div data-testid="e-user">{user()}</div>
          <Outlet />
        </div>
      )
    },
  })
  const fRoute = createRoute({
    getParentRoute: () => eRoute,
    path: 'f',
    loader: async () => {
      pendingStarted.resolve()
      await pendingReady
    },
    pendingComponent: () => {
      const user = fRoute.useRouteContext({
        select: (context) => context.user,
      })
      return <div data-testid="f-pending">F pending for {user()}</div>
    },
    component: () => <Outlet />,
  })
  const gRoute = createRoute({
    getParentRoute: () => fRoute,
    path: 'g',
    component: () => <div data-testid="hidden-g">G</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      aRoute.addChildren([
        bRoute.addChildren([cRoute.addChildren([dRoute])]),
        eRoute.addChildren([fRoute.addChildren([gRoute])]),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/a/b/c/d?user=Ada'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('source')).toBeVisible()
  expect(screen.getByTestId('user')).toHaveTextContent('Ada')

  const navigation = track(
    router.navigate({
      to: '/a/e/f/g',
      search: { user: 'Grace' },
    }),
  )
  await retainedStarted

  expect(screen.getByTestId('source')).toBeVisible()
  expect(screen.getByTestId('user')).toHaveTextContent('Ada')
  expect(screen.queryByTestId('f-pending')).not.toBeInTheDocument()

  retainedReady.resolve()
  await pendingStarted

  expect(await screen.findByTestId('f-pending')).toBeVisible()
  expect(screen.getByTestId('user')).toHaveTextContent('Grace')
  expect(screen.getByTestId('e-user')).toHaveTextContent('Grace')
  expect(screen.getByTestId('f-pending')).toHaveTextContent('Grace')
  expect(screen.queryByTestId('source')).not.toBeInTheDocument()
  expect(screen.queryByTestId('hidden-g')).not.toBeInTheDocument()
  expect(router.state.matches.map((match) => match.routeId)).toContain(
    gRoute.id,
  )

  pendingReady.resolve()
  await navigation
})

test.each([false, true])(
  'retained loader and component work does not own the child fallback (parent pending: %s)',
  async (parentHasPending) => {
    const parentReloadStarted = controlled()
    const parentReload = controlled()
    const parentComponent = controlled()
    const childLoader = controlled()
    let parentLoads = 0
    let parentPreloads = 0

    const rootRoute = createRootRoute({ component: () => <Outlet /> })
    const Parent = Object.assign(
      () => (
        <div data-testid="parent-content">
          {parentRoute.useLoaderData()()}
          <Outlet />
        </div>
      ),
      {
        preload: () => (++parentPreloads === 1 ? undefined : parentComponent),
      },
    )
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'parent',
      shouldReload: true,
      loader: {
        staleReloadMode: 'blocking',
        handler: async () => {
          if (++parentLoads === 1) {
            return 'initial parent'
          }
          parentReloadStarted.resolve()
          await parentReload
          return 'reloaded parent'
        },
      },
      component: Parent,
      ...(parentHasPending
        ? {
            pendingMs: 0,
            pendingMinMs: 0,
            pendingComponent: () => (
              <div data-testid="parent-pending">Parent pending</div>
            ),
          }
        : {}),
    })
    const sourceRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: 'source',
      component: () => <div data-testid="source">Source</div>,
    })
    const childOptions = createLazyRoute('/parent/child')({
      pendingComponent: () => (
        <div data-testid="child-pending">Child pending</div>
      ),
      component: () => <div data-testid="child">Child</div>,
    })
    const childLazy = createControlledPromise<typeof childOptions>()
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: 'child',
      pendingMs: 0,
      pendingMinMs: 0,
      loader: () => childLoader,
    }).lazy(() => childLazy)
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([sourceRoute, childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/source'] }),
    })

    render(() => <RouterProvider router={router} />)
    expect(await screen.findByTestId('source')).toBeVisible()
    await waitFor(() => expect(router.state.status).toBe('idle'))

    const navigation = track(router.navigate({ to: '/parent/child' }))
    try {
      await parentReloadStarted
      parentReload.resolve()
      await waitFor(() => {
        expect(
          router.state.matches.find((match) => match.routeId === parentRoute.id)
            ?.isFetching,
        ).toBe(false)
      })

      childLazy.resolve(childOptions)
      expect(await screen.findByTestId('child-pending')).toBeVisible()
      expect(screen.getByTestId('parent-content')).toBeVisible()
      expect(screen.queryByTestId('parent-pending')).not.toBeInTheDocument()
      expect(screen.queryByTestId('source')).not.toBeInTheDocument()
    } finally {
      parentReload.resolve()
      parentComponent.resolve()
      childLazy.resolve(childOptions)
      childLoader.resolve()
      await navigation
    }

    expect(screen.getByTestId('child')).toBeVisible()
  },
)

test('a failure in the last retained guard suppresses descendant pending', async () => {
  const guardStarted = controlled()
  const guardReady = controlled()
  const childReady = controlled()
  let guardLoads = 0
  let childLoads = 0

  const rootRoute = createRootRoute({
    beforeLoad: () => ({ rootReady: true }),
    component: () => <Outlet />,
  })
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'layout',
    beforeLoad: async () => {
      if (++guardLoads > 1) {
        guardStarted.resolve()
        await guardReady
        throw new Error('blocked')
      }
    },
    component: () => <Outlet />,
    errorComponent: () => <div data-testid="guard-error">Guard error</div>,
  })
  const sourceRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/source',
    component: () => <div data-testid="source">Source</div>,
  })
  const childRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/child',
    loader: async () => {
      childLoads++
      await childReady
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => <div data-testid="child-pending">Pending</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      layoutRoute.addChildren([sourceRoute, childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('source')).toBeVisible()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const navigation = track(router.navigate({ to: '/child' }))
  await guardStarted
  expect(screen.getByTestId('source')).toBeVisible()
  expect(screen.queryByTestId('child-pending')).not.toBeInTheDocument()
  expect(childLoads).toBe(0)

  guardReady.resolve()
  await navigation
  expect(await screen.findByTestId('guard-error')).toBeVisible()
  expect(screen.queryByTestId('child-pending')).not.toBeInTheDocument()
  expect(childLoads).toBe(0)
})
