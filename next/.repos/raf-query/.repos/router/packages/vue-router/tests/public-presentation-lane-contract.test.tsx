import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('public presentation lane contracts', () => {
  test('a plain load retry presents pending UI over a committed error', async () => {
    const retryStarted = createControlledPromise<void>()
    const retry = createControlledPromise<string>()
    let attempt = 0

    const rootRoute = createRootRoute({ component: () => <Outlet /> })
    const PageComponent = defineComponent({
      setup() {
        const loaderData = pageRoute.useLoaderData()
        return () => <div>{loaderData.value}</div>
      },
    })

    const pageRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      pendingMs: 0,
      pendingMinMs: 0,
      pendingComponent: () => <div>Retrying page</div>,
      loader: () => {
        if (!attempt++) {
          throw new Error('Initial failure')
        }
        retryStarted.resolve()
        return retry
      },
      errorComponent: () => <div>Page failed</div>,
      component: PageComponent,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Page failed')).toBeInTheDocument()

    let retryLoad!: Promise<void>
    try {
      retryLoad = router.load()
      await retryStarted
      await nextTick()
      expect(screen.getByText('Retrying page')).toBeInTheDocument()
      expect(screen.queryByText('Page failed')).not.toBeInTheDocument()

      retry.resolve('Page recovered')
      await retryLoad
      await nextTick()
      expect(screen.getByText('Page recovered')).toBeInTheDocument()
    } finally {
      retry.resolve('Page recovered')
      await retryLoad
    }
  })

  test('same-boundary takeover republishes successor search without restarting pendingMinMs', async () => {
    const firstGate = createControlledPromise<void>()
    const secondGate = createControlledPromise<void>()

    const rootRoute = createRootRoute({ component: () => <Outlet /> })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
    })
    const PageComponent = defineComponent({
      setup() {
        const search = pageRoute.useSearch()
        return () => <div>Page revision {search.value.revision}</div>
      },
    })

    const pageRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision),
      }),
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: () => <div>Loading page</div>,
      beforeLoad: ({ search }) =>
        search.revision === 1 ? firstGate : secondGate,
      component: PageComponent,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeInTheDocument()
    await waitFor(() => expect(router.state.status).toBe('idle'))
    vi.useFakeTimers()
    vi.setSystemTime(0)

    let successorSettled = false
    let settledAtOriginalDeadline = false
    let renderedAtOriginalDeadline = false
    try {
      void router.navigate({
        to: '/page',
        search: { revision: 1 },
      })
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()
      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(router.state.matches.at(-1)?.search).toMatchObject({ revision: 1 })

      await vi.advanceTimersByTimeAsync(25)

      const secondNavigation = router.navigate({
        to: '/page',
        search: { revision: 2 },
      })
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()

      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(router.state.location.search).toMatchObject({ revision: 2 })
      expect(router.state.matches.at(-1)?.search).toMatchObject({ revision: 2 })

      void secondNavigation.then(() => {
        successorSettled = true
      })
      secondGate.resolve()
      await Promise.resolve()

      await vi.advanceTimersByTimeAsync(74)
      await nextTick()
      expect(successorSettled).toBe(false)
      expect(screen.getByText('Loading page')).toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(5)
      await Promise.resolve()
      await nextTick()

      settledAtOriginalDeadline = successorSettled
      renderedAtOriginalDeadline =
        screen.queryByText('Page revision 2') !== null
    } finally {
      firstGate.resolve()
      secondGate.resolve()
      await vi.advanceTimersByTimeAsync(1_000)
      await nextTick()
    }

    expect({
      settled: settledAtOriginalDeadline,
      rendered: renderedAtOriginalDeadline,
    }).toEqual({ settled: true, rendered: true })
    expect(screen.getByText('Page revision 2')).toBeInTheDocument()
    expect(screen.queryByText('Loading page')).not.toBeInTheDocument()
  })

  test('an earlier pending-ineligible boundary retires a deeper pending minimum', async () => {
    const childReloadStarted = createControlledPromise<void>()
    const childReload = createControlledPromise<void>()
    const parentReloadStarted = createControlledPromise<void>()
    const parentReload = createControlledPromise<void>()
    let childLoads = 0

    const rootRoute = createRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision),
      }),
      component: () => <Outlet />,
    })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loaderDeps: ({ search }) => ({ revision: search.revision }),
      beforeLoad: ({ search }) => {
        if (search.revision === 2) {
          parentReloadStarted.resolve()
          return parentReload
        }
        return undefined
      },
      component: () => <Outlet />,
    })
    const ChildComponent = defineComponent({
      setup() {
        const search = childRoute.useSearch()
        return () => <div>Child revision {search.value.revision}</div>
      },
    })

    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: () => <div>Loading child</div>,
      loader: {
        staleReloadMode: 'blocking',
        handler: () => {
          if (childLoads++) {
            childReloadStarted.resolve()
            return childReload
          }
          return undefined
        },
      },
      component: ChildComponent,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({
        initialEntries: ['/parent/child?revision=1'],
      }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Child revision 1')).toBeInTheDocument()
    await waitFor(() => expect(router.state.status).toBe('idle'))
    vi.useFakeTimers()
    vi.setSystemTime(0)

    let firstNavigation: Promise<void> | undefined
    let secondNavigation: Promise<void> | undefined
    let settledBeforeOldMinimum = false
    let renderedBeforeOldMinimum = false
    try {
      firstNavigation = router.invalidate({
        filter: (match) => match.routeId === childRoute.id,
        forcePending: true,
      })
      await childReloadStarted
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()
      expect(screen.getByText('Loading child')).toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(25)
      secondNavigation = router.navigate({
        to: '/parent/child',
        search: { revision: 2 },
      })
      await parentReloadStarted
      expect(screen.getByText('Loading child')).toBeInTheDocument()

      childReload.resolve()
      const successor = secondNavigation
      void successor.then(() => {
        settledBeforeOldMinimum = true
      })
      parentReload.resolve()
      await vi.advanceTimersByTimeAsync(5)
      await nextTick()
      renderedBeforeOldMinimum = screen.queryByText('Child revision 2') !== null
    } finally {
      childReload.resolve()
      parentReload.resolve()
      await vi.advanceTimersByTimeAsync(1_000)
      await Promise.allSettled(
        [firstNavigation, secondNavigation].filter(
          (navigation): navigation is Promise<void> => !!navigation,
        ),
      )
    }

    expect({
      settled: settledBeforeOldMinimum,
      rendered: renderedBeforeOldMinimum,
    }).toEqual({ settled: true, rendered: true })
  })

  test('same-boundary timing survives a private retained-context barrier', async () => {
    const retainedStarted = createControlledPromise<void>()
    const retainedReady = createControlledPromise<void>()
    const firstPage = createControlledPromise<void>()
    const secondPageStarted = createControlledPromise<void>()
    const secondPage = createControlledPromise<void>()

    const RootComponent = defineComponent({
      setup() {
        const context = rootRoute.useRouteContext()
        return () => (
          <div>
            <div>Root revision {context.value.rootRevision}</div>
            <Outlet />
          </div>
        )
      },
    })

    const rootRoute = createRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision) || 0,
      }),
      beforeLoad: ({ search }) => {
        if (search.revision === 2) {
          retainedStarted.resolve()
          return retainedReady.then(() => ({ rootRevision: 2 }))
        }
        return { rootRevision: search.revision }
      },
      component: RootComponent,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
    })
    const PageComponent = defineComponent({
      setup() {
        const search = pageRoute.useSearch()
        return () => <div>Page revision {search.value.revision}</div>
      },
    })

    const pageRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: () => <div>Loading page</div>,
      beforeLoad: ({ search }) => {
        if (search.revision === 1) {
          return firstPage
        }
        secondPageStarted.resolve()
        return secondPage
      },
      component: PageComponent,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeInTheDocument()
    vi.useFakeTimers()
    vi.setSystemTime(0)

    let firstNavigation: Promise<void> | undefined
    let secondNavigation: Promise<void> | undefined
    try {
      firstNavigation = router.navigate({
        to: '/page',
        search: { revision: 1 },
      })
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()
      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(screen.getByText('Root revision 1')).toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(25)
      secondNavigation = router.navigate({
        to: '/page',
        search: { revision: 2 },
      })
      await retainedStarted
      await nextTick()

      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(screen.getByText('Root revision 1')).toBeInTheDocument()

      retainedReady.resolve()
      await secondPageStarted
      await nextTick()
      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(screen.getByText('Root revision 2')).toBeInTheDocument()

      let settled = false
      const successor = secondNavigation
      void successor.then(() => {
        settled = true
      })
      secondPage.resolve()
      await vi.advanceTimersByTimeAsync(74)
      await nextTick()
      expect(settled).toBe(false)
      expect(screen.getByText('Loading page')).toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(5)
      await Promise.all([firstNavigation, successor])
      await nextTick()
      expect(screen.getByText('Page revision 2')).toBeInTheDocument()
    } finally {
      retainedReady.resolve()
      firstPage.resolve()
      secondPage.resolve()
      await vi.advanceTimersByTimeAsync(1_000)
      await Promise.allSettled(
        [firstNavigation, secondNavigation].filter(
          (navigation): navigation is Promise<void> => !!navigation,
        ),
      )
    }
  })

  test('an exact-boundary terminal result supersedes an unrendered pending offer', async () => {
    const pendingRenderStarted = createControlledPromise<void>()
    const pendingRender = createControlledPromise<void>()
    const terminalLoadStarted = createControlledPromise<void>()
    const terminalLoad = createControlledPromise<void>()
    const Pending = defineComponent({
      async setup() {
        pendingRenderStarted.resolve()
        await pendingRender
        return () => <div>Root pending</div>
      },
    })

    const rootRoute = createRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        terminal: search.terminal === true,
      }),
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: Pending,
      beforeLoad: async ({ search }) => {
        if (search.terminal) {
          terminalLoadStarted.resolve()
          await terminalLoad
          throw notFound()
        }
      },
      notFoundComponent: () => <div>Root not found</div>,
      component: () => <Outlet />,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/?terminal=false'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeInTheDocument()
    await waitFor(() => expect(router.state.status).toBe('idle'))
    vi.useFakeTimers()
    vi.setSystemTime(0)

    let navigation: Promise<void> | undefined
    try {
      navigation = router.navigate({
        to: '/',
        search: { terminal: true },
      })
      await terminalLoadStarted
      await vi.advanceTimersByTimeAsync(0)
      await pendingRenderStarted
      await nextTick()
      expect(screen.getByText('Home')).toBeInTheDocument()

      terminalLoad.resolve()
      await navigation
      await nextTick()

      expect(screen.getByText('Root not found')).toBeInTheDocument()
      expect(Date.now()).toBe(0)
    } finally {
      terminalLoad.resolve()
      pendingRender.resolve()
      await vi.advanceTimersByTimeAsync(1_000)
      await Promise.allSettled(navigation ? [navigation] : [])
    }
  })
})
