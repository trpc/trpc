import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
} from '../src'
import type { RouteComponent, RouterHistory } from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

describe('useMatch', () => {
  function setup({
    RootComponent,
    history,
  }: {
    RootComponent: RouteComponent
    history?: RouterHistory
  }) {
    const rootRoute = createRootRoute({
      component: RootComponent,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <>
          <h1>IndexTitle</h1>
          <Link to="/posts">Posts</Link>
        </>
      ),
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => <h1>PostsTitle</h1>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    return render(() => <RouterProvider router={router} />)
  }

  describe('when match is found', () => {
    test.each([true, false, undefined])(
      'returns the match if shouldThrow = %s',
      async (shouldThrow) => {
        function RootComponent() {
          const match = useMatch({ from: '/posts', shouldThrow })
          expect(match()).toBeDefined()
          expect(match()!.routeId).toBe('/posts')
          return <Outlet />
        }

        setup({
          RootComponent,
          history: createMemoryHistory({ initialEntries: ['/posts'] }),
        })
        const postsTitle = await screen.findByText('PostsTitle')
        expect(postsTitle).toBeInTheDocument()
      },
    )
  })

  test('tracks presentation generations across replacement and re-entry', async () => {
    function RootComponent() {
      const targetedRevision = useMatch({
        from: '/item',
        shouldThrow: false,
        select: (match) => match.loaderData,
      })

      return (
        <>
          <div data-testid="targeted-match">
            {targetedRevision() === undefined
              ? 'Targeted absent'
              : `Targeted revision ${targetedRevision()}`}
          </div>
          <Link to="/item" search={{ revision: 2 }}>
            Revision 2
          </Link>
          <Link to="/item" search={{ revision: 3 }}>
            Revision 3
          </Link>
          <Link to="/other">Other</Link>
          <Outlet />
        </>
      )
    }

    function ItemComponent() {
      const nearestRevision = useMatch({
        strict: false,
        shouldThrow: false,
        select: (match) => match.loaderData as number,
      })
      return <div>Nearest revision {nearestRevision()}</div>
    }

    const rootRoute = createRootRoute({ component: RootComponent })
    const itemRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/item',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision),
      }),
      loaderDeps: ({ search }) => ({ revision: search.revision }),
      loader: ({ deps }) => deps.revision,
      component: ItemComponent,
    })
    const otherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      component: () => <div>Other route</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([itemRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/item?revision=1'] }),
    })

    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Nearest revision 1')).toBeInTheDocument()
    expect(screen.getByTestId('targeted-match')).toHaveTextContent(
      'Targeted revision 1',
    )

    await fireEvent.click(screen.getByText('Revision 2'))
    expect(await screen.findByText('Nearest revision 2')).toBeInTheDocument()
    expect(screen.getByTestId('targeted-match')).toHaveTextContent(
      'Targeted revision 2',
    )

    await fireEvent.click(screen.getByText('Other'))
    expect(await screen.findByText('Other route')).toBeInTheDocument()
    expect(screen.getByTestId('targeted-match')).toHaveTextContent(
      'Targeted absent',
    )

    await fireEvent.click(screen.getByText('Revision 3'))
    expect(await screen.findByText('Nearest revision 3')).toBeInTheDocument()
    expect(screen.getByTestId('targeted-match')).toHaveTextContent(
      'Targeted revision 3',
    )
  })

  test('renders a route generation that re-enters before an intermediate route renders', async () => {
    function RootComponent() {
      return (
        <>
          <Link to="/other">Other</Link>
          <Outlet />
        </>
      )
    }

    function ItemComponent() {
      const revision = useMatch({
        strict: false,
        select: (match) => match.loaderData as number,
      })
      return <div>Item revision {revision()}</div>
    }

    const rootRoute = createRootRoute({ component: RootComponent })
    const itemRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/item',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision),
      }),
      loaderDeps: ({ search }) => ({ revision: search.revision }),
      loader: ({ deps }) => deps.revision,
      component: ItemComponent,
    })
    const otherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      component: () => <div>Other route</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([itemRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/item?revision=1'] }),
    })

    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Item revision 1')).toBeInTheDocument()

    let returnNavigation: Promise<void> | undefined
    const unsubscribe = router.subscribe('onLoad', (event) => {
      if (event.toLocation.pathname === '/other') {
        returnNavigation = router.navigate({
          to: '/item',
          search: { revision: 2 },
        })
      }
    })
    try {
      await fireEvent.click(screen.getByText('Other'))
      await waitFor(() => expect(returnNavigation).toBeDefined())
      await returnNavigation

      expect(await screen.findByText('Item revision 2')).toBeInTheDocument()
      expect(screen.queryByText('Other route')).not.toBeInTheDocument()
    } finally {
      unsubscribe()
    }
  })

  describe('when match is not found', () => {
    test.each([undefined, true])(
      'throws if shouldThrow = %s',
      async (shouldThrow) => {
        function RootComponent() {
          useMatch({ from: '/posts', shouldThrow })
          return <Outlet />
        }
        setup({ RootComponent })
        const postsError = await screen.findByText(
          'Invariant failed: Could not find an active match from "/posts"',
        )
        expect(postsError).toBeInTheDocument()
      },
    )

    describe('returns undefined if shouldThrow = false', () => {
      test('without select function', async () => {
        function RootComponent() {
          const match = useMatch({ from: 'posts', shouldThrow: false })
          expect(match()).toBeUndefined()
          return <Outlet />
        }
        setup({ RootComponent })
        expect(
          await waitFor(() => screen.findByText('IndexTitle')),
        ).toBeInTheDocument()
      })
      test('with select function', async () => {
        const select = vi.fn()
        function RootComponent() {
          const match = useMatch({ from: 'posts', shouldThrow: false, select })
          expect(match()).toBeUndefined()
          return <Outlet />
        }
        setup({ RootComponent })
        const indexTitle = await screen.findByText('IndexTitle')
        expect(indexTitle).toBeInTheDocument()
        expect(select).not.toHaveBeenCalled()
      })
    })
  })
})
