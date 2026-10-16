import * as Solid from 'solid-js'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('public presentation lane contracts', () => {
  test('a plain load retry presents pending UI over a committed error', async () => {
    const retryStarted = createControlledPromise<void>()
    const retry = createControlledPromise<string>()
    let attempt = 0

    const rootRoute = createRootRoute({ component: () => <Outlet /> })
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
      component: () => <div>{pageRoute.useLoaderData()()}</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Page failed')).toBeInTheDocument()

    let retryLoad!: Promise<void>
    try {
      retryLoad = router.load()
      await retryStarted
      expect(await screen.findByText('Retrying page')).toBeInTheDocument()
      expect(screen.queryByText('Page failed')).not.toBeInTheDocument()

      retry.resolve('Page recovered')
      await retryLoad
      expect(screen.getByText('Page recovered')).toBeInTheDocument()
    } finally {
      retry.resolve('Page recovered')
      await retryLoad
      consoleWarn.mockRestore()
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
        return <div>Page revision {search().revision}</div>
      },
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(() => <RouterProvider router={router} />)
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
      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(router.state.matches.at(-1)?.search).toMatchObject({ revision: 1 })

      await vi.advanceTimersByTimeAsync(25)

      const secondNavigation = router.navigate({
        to: '/page',
        search: { revision: 2 },
      })
      await vi.advanceTimersByTimeAsync(0)

      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(router.state.location.search).toMatchObject({ revision: 2 })
      expect(router.state.matches.at(-1)?.search).toMatchObject({ revision: 2 })

      void secondNavigation.then(() => {
        successorSettled = true
      })
      secondGate.resolve()
      await Promise.resolve()

      await vi.advanceTimersByTimeAsync(74)
      expect(successorSettled).toBe(false)
      expect(screen.getByText('Loading page')).toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(5)
      await Promise.resolve()

      settledAtOriginalDeadline = successorSettled
      renderedAtOriginalDeadline =
        screen.queryByText('Page revision 2') !== null
    } finally {
      firstGate.resolve()
      secondGate.resolve()
      await vi.advanceTimersByTimeAsync(1_000)
      await Promise.resolve()
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
        <div>Child revision {childRoute.useSearch()().revision}</div>
      ),
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({
        initialEntries: ['/parent/child?revision=1'],
      }),
    })

    render(() => <RouterProvider router={router} />)
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
      component: () => {
        const rootRevision = rootRoute.useRouteContext({
          select: (context) => context.rootRevision,
        })
        return (
          <div>
            <div>Root revision {rootRevision()}</div>
            <Outlet />
          </div>
        )
      },
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
        <div>Page revision {pageRoute.useSearch()().revision}</div>
      ),
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(() => <RouterProvider router={router} />)
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
      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(screen.getByText('Root revision 1')).toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(25)
      secondNavigation = router.navigate({
        to: '/page',
        search: { revision: 2 },
      })
      await retainedStarted

      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(screen.getByText('Root revision 1')).toBeInTheDocument()

      retainedReady.resolve()
      await secondPageStarted
      expect(screen.getByText('Loading page')).toBeInTheDocument()
      expect(screen.getByText('Root revision 2')).toBeInTheDocument()

      let settled = false
      const successor = secondNavigation
      void successor.then(() => {
        settled = true
      })
      secondPage.resolve()
      await vi.advanceTimersByTimeAsync(74)
      expect(settled).toBe(false)
      expect(screen.getByText('Loading page')).toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(5)
      await Promise.all([firstNavigation, successor])
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

  test('a successor supersedes the previous receipt while joining its transition', async () => {
    const firstRenderStarted = createControlledPromise<void>()
    const firstRender = createControlledPromise<void>()
    const secondRenderStarted = createControlledPromise<void>()
    const secondRender = createControlledPromise<void>()
    let setRevision!: Solid.Setter<number>

    const Revision = (props: { revision: number }) => {
      const [rendered] = Solid.createResource(async () => {
        if (props.revision === 2) {
          firstRenderStarted.resolve()
          await firstRender
        } else if (props.revision === 3) {
          secondRenderStarted.resolve()
          await secondRender
        }
        return props.revision
      })
      return <div>Revision {rendered()}</div>
    }
    const rootRoute = createRootRoute({
      component: () => {
        const [revision, set] = Solid.createSignal(1)
        setRevision = set
        return (
          <Solid.Show when={revision()} keyed>
            {(value) => <Revision revision={value} />}
          </Solid.Show>
        )
      },
    })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Revision 1')).toBeInTheDocument()

    const expected = router.state.matches
    const firstAcknowledgement = router.startTransition(
      () => setRevision(2),
      expected,
    )
    const acknowledgements = [firstAcknowledgement]
    try {
      await firstRenderStarted
      const secondAcknowledgement = router.startTransition(
        () => setRevision(3),
        expected,
      )
      acknowledgements.push(secondAcknowledgement)

      await expect(firstAcknowledgement).resolves.toBe(false)
      await secondRenderStarted
      expect(screen.getByText('Revision 1')).toBeInTheDocument()

      let secondSettled = false
      void secondAcknowledgement.then(() => {
        secondSettled = true
      })
      secondRender.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(secondSettled).toBe(false)
      expect(screen.queryByText('Revision 3')).not.toBeInTheDocument()

      firstRender.resolve()
      await expect(secondAcknowledgement).resolves.toBe(true)
      expect(await screen.findByText('Revision 3')).toBeInTheDocument()
      expect(screen.queryByText('Revision 2')).not.toBeInTheDocument()
    } finally {
      firstRender.resolve()
      secondRender.resolve()
      await Promise.allSettled(acknowledgements)
    }
  })
})
