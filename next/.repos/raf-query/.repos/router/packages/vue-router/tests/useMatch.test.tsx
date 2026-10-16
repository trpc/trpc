import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import * as Vue from 'vue'
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
import type { AnyRoute, RouterHistory } from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

describe('useMatch', () => {
  function setup({
    RootComponent,
    history,
  }: {
    RootComponent: NonNullable<AnyRoute['options']['component']>
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

    return render(<RouterProvider router={router} />)
  }

  describe('when match is found', () => {
    test.each([true, false, undefined])(
      'returns the match if shouldThrow = %s',
      async (shouldThrow) => {
        const RootComponent = Vue.defineComponent({
          setup() {
            const match = useMatch({ from: '/posts', shouldThrow })
            return () => {
              expect(match.value).toBeDefined()

              expect(match.value!.routeId).toBe('/posts')

              return <Outlet />
            }
          },
        })

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
    const RootComponent = Vue.defineComponent({
      setup() {
        const targetedRevision = useMatch({
          from: '/item',
          shouldThrow: false,
          select: (match) => match.loaderData,
        })

        return () => (
          <>
            <div data-testid="targeted-match">
              {targetedRevision.value === undefined
                ? 'Targeted absent'
                : `Targeted revision ${targetedRevision.value}`}
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
      },
    })

    const ItemComponent = Vue.defineComponent({
      setup() {
        const nearestRevision = useMatch({
          strict: false,
          shouldThrow: false,
          select: (match) => match.loaderData as number,
        })
        return () => <div>Nearest revision {nearestRevision.value}</div>
      },
    })

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

    render(<RouterProvider router={router} />)
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
    const RootComponent = Vue.defineComponent({
      setup() {
        return () => (
          <>
            <Link to="/other">Other</Link>
            <Outlet />
          </>
        )
      },
    })
    const ItemComponent = Vue.defineComponent({
      setup() {
        const revision = useMatch({
          strict: false,
          select: (match) => match.loaderData as number,
        })
        return () => <div>Item revision {revision.value}</div>
      },
    })

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
    const OtherComponent = Vue.defineComponent({
      setup: () => () => <div>Other route</div>,
    })

    const otherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      component: OtherComponent,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([itemRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/item?revision=1'] }),
    })

    render(<RouterProvider router={router} />)
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

  test('an outgoing component never observes its own match disappear', async () => {
    const observedRouteIds: Array<string | undefined> = []
    const rootRoute = createRootRoute({ component: () => <Outlet /> })
    const FirstComponent = Vue.defineComponent({
      setup() {
        const match = useMatch({
          from: '/first',
          shouldThrow: false,
        })
        Vue.watchEffect(() => observedRouteIds.push(match.value?.routeId), {
          flush: 'sync',
        })
        return () => <div>First route</div>
      },
    })

    const firstRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/first',
      component: FirstComponent,
    })
    const nextRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/next',
      component: () => <div>Next route</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([firstRoute, nextRoute]),
      history: createMemoryHistory({ initialEntries: ['/first'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('First route')).toBeInTheDocument()

    await router.navigate({ to: '/next' })

    expect(await screen.findByText('Next route')).toBeInTheDocument()
    expect(observedRouteIds).not.toContain(undefined)
  })

  describe('when match is not found', () => {
    test.each([undefined, true])(
      'throws if shouldThrow = %s',
      async (shouldThrow) => {
        const RootComponent = Vue.defineComponent({
          setup() {
            useMatch({ from: '/posts', shouldThrow })
            return () => <Outlet />
          },
        })

        setup({ RootComponent })
        const postsError = await screen.findByText(
          'Invariant failed: Could not find an active match from "/posts"',
        )
        expect(postsError).toBeInTheDocument()
      },
    )

    describe('returns undefined if shouldThrow = false', () => {
      test('without select function', async () => {
        const RootComponent = Vue.defineComponent({
          setup() {
            const match = useMatch({ from: 'posts', shouldThrow: false })
            return () => {
              expect(match.value).toBeUndefined()

              return <Outlet />
            }
          },
        })

        setup({ RootComponent })
        expect(
          await waitFor(() => screen.findByText('IndexTitle')),
        ).toBeInTheDocument()
      })
      test('with select function', async () => {
        const select = vi.fn()
        const RootComponent = Vue.defineComponent({
          setup() {
            const match = useMatch({
              from: 'posts',
              shouldThrow: false,
              select,
            })
            return () => {
              expect(match.value).toBeUndefined()

              return <Outlet />
            }
          },
        })

        setup({ RootComponent })
        const indexTitle = await screen.findByText('IndexTitle')
        expect(indexTitle).toBeInTheDocument()
        expect(select).not.toHaveBeenCalled()
      })
    })
  })
})
