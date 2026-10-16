import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
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
})

describe('public presentation lane contracts', () => {
  test('visible pending UI publishes every matched route and its loading state', async () => {
    const parentGate = createControlledPromise<string>()

    const rootRoute = createRootRoute({ component: Outlet })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
    })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      pendingMs: 0,
      pendingComponent: () => <div>Loading parent</div>,
      loader: () => parentGate,
      component: Outlet,
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => 'child data',
      component: () => <div>Child content</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeInTheDocument()
    await waitFor(() => expect(router.state.status).toBe('idle'))

    let navigation!: Promise<void>
    await act(async () => {
      navigation = router.navigate({ to: '/parent/child' })
      await Promise.resolve()
    })

    expect(await screen.findByText('Loading parent')).toBeInTheDocument()
    expect(screen.queryByText('Child content')).not.toBeInTheDocument()

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
      childRoute.id,
    ])
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({ status: 'pending', isFetching: 'loader' })

    await act(async () => {
      parentGate.resolve('parent data')
      await navigation
    })

    expect(screen.getByText('Child content')).toBeInTheDocument()
    expect(router.state.status).toBe('idle')
  })

  test('a plain load retry presents pending UI over a committed error', async () => {
    const retryStarted = createControlledPromise<void>()
    const retry = createControlledPromise<string>()
    let attempt = 0

    const rootRoute = createRootRoute({ component: Outlet })
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
      component: () => <div>{pageRoute.useLoaderData()}</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Page failed')).toBeInTheDocument()

    let retryLoad!: Promise<void>
    try {
      await act(async () => {
        retryLoad = router.load()
        await retryStarted
      })
      expect(screen.getByText('Retrying page')).toBeInTheDocument()
      expect(screen.getByText('Page failed')).not.toBeVisible()

      await act(async () => {
        retry.resolve('Page recovered')
        await retryLoad
      })
      expect(screen.getByText('Page recovered')).toBeInTheDocument()
    } finally {
      retry.resolve('Page recovered')
      await act(async () => {
        await retryLoad
      })
      consoleWarn.mockRestore()
    }
  })

  test('same-boundary takeover republishes successor search without restarting pendingMinMs', async () => {
    const firstGate = createControlledPromise<void>()
    const secondGate = createControlledPromise<void>()

    const rootRoute = createRootRoute({ component: Outlet })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
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
      component: () => {
        const search = pageRoute.useSearch()
        return <div>Page revision {search.revision}</div>
      },
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
      await act(async () => {
        void router.navigate({
          to: '/page',
          search: { revision: 1 },
        })
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(router.state.matches.at(-1)?.search).toMatchObject({ revision: 1 })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(25)
      })

      let secondNavigation!: Promise<void>
      await act(async () => {
        secondNavigation = router.navigate({
          to: '/page',
          search: { revision: 2 },
        })
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(router.state.location.search).toMatchObject({ revision: 2 })
      expect(router.state.matches.at(-1)?.search).toMatchObject({ revision: 2 })

      void secondNavigation.then(() => {
        successorSettled = true
      })
      await act(async () => {
        secondGate.resolve()
        await Promise.resolve()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(74)
      })
      expect(successorSettled).toBe(false)
      expect(screen.getByText('Loading page')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5)
        await Promise.resolve()
      })

      settledAtOriginalDeadline = successorSettled
      renderedAtOriginalDeadline =
        screen.queryByText('Page revision 2') !== null
    } finally {
      // Finish a faulty implementation too, so a deadline assertion cannot
      // strand this router and contaminate the following test.
      firstGate.resolve()
      secondGate.resolve()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
        await Promise.resolve()
      })
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
      component: Outlet,
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
      component: Outlet,
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
      component: () => (
        <div>Child revision {childRoute.useSearch().revision}</div>
      ),
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
      await act(async () => {
        firstNavigation = router.invalidate({
          filter: (match) => match.routeId === childRoute.id,
          forcePending: true,
        })
        await childReloadStarted
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('Loading child')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(25)
        secondNavigation = router.navigate({
          to: '/parent/child',
          search: { revision: 2 },
        })
        await parentReloadStarted
      })
      expect(screen.getByText('Loading child')).toBeInTheDocument()

      childReload.resolve()

      const successor = secondNavigation
      if (!successor) {
        throw new Error('Expected the successor navigation to start')
      }
      void successor.then(() => {
        settledBeforeOldMinimum = true
      })
      await act(async () => {
        parentReload.resolve()
        await vi.advanceTimersByTimeAsync(5)
      })
      renderedBeforeOldMinimum = screen.queryByText('Child revision 2') !== null
    } finally {
      childReload.resolve()
      parentReload.resolve()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
        await Promise.allSettled(
          [firstNavigation, secondNavigation].filter(
            (navigation): navigation is Promise<void> => !!navigation,
          ),
        )
      })
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
      component: () => (
        <div>
          <div>Root revision {rootRoute.useRouteContext().rootRevision}</div>
          <Outlet />
        </div>
      ),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
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
      component: () => (
        <div>Page revision {pageRoute.useSearch().revision}</div>
      ),
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
      await act(async () => {
        firstNavigation = router.navigate({
          to: '/page',
          search: { revision: 1 },
        })
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(screen.getByText('Root revision 1')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(25)
        secondNavigation = router.navigate({
          to: '/page',
          search: { revision: 2 },
        })
        await retainedStarted
      })

      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(screen.getByText('Root revision 1')).toBeInTheDocument()

      await act(async () => {
        retainedReady.resolve()
        await secondPageStarted
      })
      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(screen.getByText('Root revision 2')).toBeInTheDocument()

      let settled = false
      const successor = secondNavigation
      if (!successor) {
        throw new Error('Expected the successor navigation to start')
      }
      void successor.then(() => {
        settled = true
      })
      await act(async () => {
        secondPage.resolve()
        await vi.advanceTimersByTimeAsync(74)
      })
      expect(settled).toBe(false)
      expect(screen.getByText('Loading page')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5)
        await Promise.all([firstNavigation, successor])
      })
      expect(screen.getByText('Page revision 2')).toBeInTheDocument()
    } finally {
      retainedReady.resolve()
      firstPage.resolve()
      secondPage.resolve()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
        await Promise.allSettled(
          [firstNavigation, secondNavigation].filter(
            (navigation): navigation is Promise<void> => !!navigation,
          ),
        )
      })
    }
  })

  test('an exact-boundary terminal result supersedes an unrendered pending offer', async () => {
    const pendingRenderStarted = createControlledPromise<void>()
    const pendingRender = createControlledPromise<void>()
    const terminalLoadStarted = createControlledPromise<void>()
    const terminalLoad = createControlledPromise<void>()

    const rootRoute = createRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        terminal: search.terminal === true,
      }),
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: () => {
        pendingRenderStarted.resolve()
        throw pendingRender
      },
      beforeLoad: async ({ search }) => {
        if (search.terminal) {
          terminalLoadStarted.resolve()
          await terminalLoad
          throw notFound()
        }
      },
      notFoundComponent: () => <div>Root not found</div>,
      component: Outlet,
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
      await act(async () => {
        navigation = router.navigate({
          to: '/',
          search: { terminal: true },
        })
        await terminalLoadStarted
        await vi.advanceTimersByTimeAsync(0)
        await pendingRenderStarted
      })
      expect(screen.getByText('Home')).toBeInTheDocument()

      await act(async () => {
        terminalLoad.resolve()
        await navigation
      })

      expect(screen.getByText('Root not found')).toBeInTheDocument()
      expect(Date.now()).toBe(0)
    } finally {
      terminalLoad.resolve()
      pendingRender.resolve()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
        await Promise.allSettled(navigation ? [navigation] : [])
      })
    }
  })

  test('a reentrant navigation from onResolved suppresses the stale onRendered event', async () => {
    const rootRoute = createRootRoute({ component: Outlet })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
    })
    const firstRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/first',
      component: () => <div>First</div>,
    })
    const secondRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/second',
      component: () => <div>Second</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeInTheDocument()
    await waitFor(() => expect(router.state.status).toBe('idle'))

    const renderedPaths: Array<string> = []
    let successor: Promise<void> | undefined
    const unsubscribeResolved = router.subscribe('onResolved', (event) => {
      if (event.toLocation.pathname === '/first') {
        successor = router.navigate({ to: '/second' })
      }
    })
    const unsubscribeRendered = router.subscribe('onRendered', (event) => {
      if (event.toLocation.pathname !== '/') {
        renderedPaths.push(event.toLocation.pathname)
      }
    })

    try {
      await act(() => router.navigate({ to: '/first' }))
      await act(async () => {
        await successor
      })

      expect(screen.getByText('Second')).toBeInTheDocument()
      expect(screen.queryByText('First')).not.toBeInTheDocument()
      expect(renderedPaths).toEqual(['/second'])
    } finally {
      unsubscribeResolved()
      unsubscribeRendered()
    }
  })
})
