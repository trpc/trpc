import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouteMask,
  createRouter,
  redirect,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

type Deferred = {
  promise: Promise<void>
  resolve: () => void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

type Gates = Partial<Record<'a' | 'b' | 'items', Deferred>>

function setup({
  initial = '/a',
  strict = false,
  bAfterGate,
  beforeRender,
}: {
  initial?: string
  strict?: boolean
  bAfterGate?: () => void
  beforeRender?: (router: any) => void
} = {}) {
  const gates: Gates = {}
  const counts = {
    aUpdater: 0,
    aRenders: 0,
    goneUpdater: 0,
    suspendedUpdater: 0,
  }
  // The `x` dependency of every `/a` load, preloads included.
  const aLoads: Array<unknown> = []
  // The `x` of every location the `a-next` link derives from.
  const nextFrom: Array<unknown> = []
  const controls: {
    setHash?: (hash: string | undefined) => void
    setExtra?: (extra: boolean) => void
    setGone?: (gone: boolean) => void
    setRenderPreload?: (renderPreload: boolean) => void
  } = {}
  let suspendGate: Deferred | undefined

  function Suspender() {
    if (suspendGate) {
      throw suspendGate.promise
    }
    return null
  }

  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/b" data-testid="root-b">
          root b
        </Link>
        <Outlet />
      </>
    ),
  })
  const layout = createRoute({
    getParentRoute: () => root,
    id: '_layout',
    component: () => (
      <>
        <Link to="/b" data-testid="layout-b">
          layout b
        </Link>
        <Outlet />
      </>
    ),
  })
  function AComponent() {
    const [hash, setHash] = React.useState<string | undefined>(undefined)
    const [extra, setExtra] = React.useState(false)
    const [gone, setGone] = React.useState(false)
    const [renderPreload, setRenderPreload] = React.useState(false)
    controls.setHash = setHash
    controls.setExtra = setExtra
    controls.setGone = setGone
    controls.setRenderPreload = setRenderPreload
    return (
      <>
        <h1>A page</h1>
        <Link
          to="/a"
          data-testid="a-self"
          search={(prev: any) => {
            counts.aUpdater++
            return prev
          }}
        >
          {() => {
            counts.aRenders++
            return 'a self'
          }}
        </Link>
        <Link to="." hash={hash} data-testid="a-dot">
          a dot
        </Link>
        <Link
          to="/a"
          search={(prev: any) => {
            nextFrom.push(prev.x)
            return { x: `${prev.x}-next` }
          }}
          preload="intent"
          preloadDelay={0}
          data-testid="a-next"
        >
          a next
        </Link>
        {renderPreload ? (
          <Link
            to="/a"
            search={(prev: any) => ({ x: `${prev.x}-render` })}
            preload="render"
            data-testid="a-render"
          >
            a render
          </Link>
        ) : null}
        {extra ? (
          <Link to="." search={(prev: any) => prev} data-testid="a-extra">
            a extra
          </Link>
        ) : null}
        {gone ? null : (
          <Link
            to="/a"
            data-testid="a-gone"
            search={(prev: any) => {
              counts.goneUpdater++
              return prev
            }}
          >
            a gone
          </Link>
        )}
        <React.Suspense fallback={<span>suspended</span>}>
          <Link
            to="/a"
            data-testid="a-suspended"
            search={(prev: any) => {
              counts.suspendedUpdater++
              return prev
            }}
          >
            a suspended
          </Link>
          <Suspender />
        </React.Suspense>
      </>
    )
  }
  const a = createRoute({
    getParentRoute: () => layout,
    path: '/a',
    loaderDeps: ({ search }: { search: any }) => ({ x: search.x }),
    loader: ({ deps }: { deps: { x: unknown } }) => {
      aLoads.push(deps.x)
      return gates.a?.promise
    },
    component: AComponent,
  })
  const b = createRoute({
    getParentRoute: () => layout,
    path: '/b',
    loader: async () => {
      await gates.b?.promise
      bAfterGate?.()
    },
    component: () => <h1>B page</h1>,
  })
  const c = createRoute({
    getParentRoute: () => root,
    path: '/c',
    component: () => <h1>C page</h1>,
  })
  const items = createRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    loader: () => gates.items?.promise,
    component: () => (
      <>
        <h1>Items page</h1>
        <Link to="/items/$id" params={{ id: '1' }} data-testid="item-1">
          item 1
        </Link>
        <Link to="/items/$id" params={{ id: '2' }} data-testid="item-2">
          item 2
        </Link>
      </>
    ),
  })

  const router = createRouter({
    routeTree: root.addChildren([layout.addChildren([a, b]), c, items]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  })

  beforeRender?.(router)
  const app = <RouterProvider router={router} />
  render(strict ? <React.StrictMode>{app}</React.StrictMode> : app)

  const link = (id: string) => screen.getByTestId(id)
  const isActive = (id: string) =>
    link(id).getAttribute('aria-current') === 'page'
  const href = (id: string) => link(id).getAttribute('href')

  async function start(options: any) {
    await act(async () => {
      void router.navigate(options)
      await Promise.resolve()
    })
  }

  async function settle() {
    await waitFor(() => expect(router.state.status).toBe('idle'))
  }

  async function release(name: keyof Gates) {
    const gate = gates[name]!
    gates[name] = undefined
    await act(async () => {
      gate.resolve()
      await gate.promise
    })
  }

  return {
    router,
    gates,
    counts,
    aLoads,
    nextFrom,
    controls,
    link,
    isActive,
    href,
    start,
    settle,
    release,
    setSuspendGate: (gate: Deferred | undefined) => (suspendGate = gate),
  }
}

describe('links in a departing match', () => {
  test('skip work at navigation start while staying links update urgently', async () => {
    const t = setup()
    await screen.findByText('A page')
    expect(t.isActive('a-self')).toBe(true)
    expect(t.isActive('root-b')).toBe(false)
    expect(t.isActive('layout-b')).toBe(false)

    const updater = t.counts.aUpdater
    const renders = t.counts.aRenders
    t.gates.b = deferred()
    await t.start({ to: '/b' })

    expect(t.router.state.status).toBe('pending')
    expect(t.router.state.location.pathname).toBe('/b')
    expect(screen.getByText('A page')).toBeInTheDocument()
    // Staying root and layout links update while the loader is pending.
    expect(t.isActive('root-b')).toBe(true)
    expect(t.isActive('layout-b')).toBe(true)
    // The departing route's links do no work.
    expect(t.counts.aUpdater).toBe(updater)
    expect(t.counts.aRenders).toBe(renders)
    expect(t.isActive('a-self')).toBe(true)

    await t.release('b')
    await screen.findByText('B page')
    expect(t.isActive('root-b')).toBe(true)
    expect(t.router.state.status).toBe('idle')
  })

  test('staying route with changed params updates its links while pending', async () => {
    const t = setup({ initial: '/items/1' })
    await screen.findByText('Items page')
    expect(t.isActive('item-1')).toBe(true)
    expect(t.isActive('item-2')).toBe(false)

    t.gates.items = deferred()
    await t.start({ to: '/items/$id', params: { id: '2' } })
    expect(t.router.state.status).toBe('pending')
    expect(t.isActive('item-1')).toBe(false)
    expect(t.isActive('item-2')).toBe(true)

    await t.release('items')
    expect(t.router.state.status).toBe('idle')
    expect(t.isActive('item-2')).toBe(true)
  })

  test('a pending departure redirected back to the owner ends consistent', async () => {
    const t = setup({
      bAfterGate: () => {
        throw redirect({ to: '/a', search: { x: 'back' } } as any)
      },
    })
    await screen.findByText('A page')
    t.gates.b = deferred()
    await t.start({ to: '/b' })
    expect(t.isActive('a-self')).toBe(true)
    expect(t.href('a-self')).toBe('/a')

    await t.release('b')
    expect(t.router.state.status).toBe('idle')
    expect(t.router.state.location.href).toBe('/a?x=back')
    expect(screen.getByText('A page')).toBeInTheDocument()
    expect(t.href('a-self')).toBe('/a?x=back')
    expect(t.isActive('a-self')).toBe(true)
    expect(t.href('a-dot')).toBe('/a')
    expect(t.isActive('root-b')).toBe(false)
  })

  test('a pending departure superseded by a location that keeps the owner ends consistent', async () => {
    const t = setup()
    await screen.findByText('A page')
    t.gates.b = deferred()
    await t.start({ to: '/b' })
    const updater = t.counts.aUpdater
    await t.start({ to: '/a', search: { x: 'two' } })
    expect(t.counts.aUpdater).toBeGreaterThan(updater)
    expect(t.href('a-self')).toBe('/a?x=two')
    expect(t.isActive('a-self')).toBe(true)
    expect(t.isActive('root-b')).toBe(false)
    t.gates.b.resolve()
    await t.settle()
    expect(t.router.state.status).toBe('idle')
    expect(t.router.state.location.href).toBe('/a?x=two')
    expect(t.href('a-self')).toBe('/a?x=two')
    expect(t.isActive('a-self')).toBe(true)
  })

  test('links mounting or changing in a departing match build from its held location', async () => {
    const t = setup()
    await screen.findByText('A page')
    expect(t.href('a-dot')).toBe('/a')
    t.gates.b = deferred()
    await t.start({ to: '/b' })

    act(() => {
      t.controls.setHash!('h')
      t.controls.setExtra!(true)
    })
    // Both build from the location the rest of the match still presents.
    expect(t.href('a-dot')).toBe('/a#h')
    expect(t.href('a-extra')).toBe('/a')
    expect(t.isActive('a-self')).toBe(true)

    await t.start({ to: '/a', search: { x: 'one' } })
    expect(t.href('a-dot')).toBe('/a#h')
    expect(t.href('a-extra')).toBe('/a?x=one')
    expect(t.href('a-self')).toBe('/a?x=one')
    t.gates.b.resolve()
    await t.settle()
    expect(t.href('a-extra')).toBe('/a?x=one')
    expect(t.isActive('a-extra')).toBe(true)
  })

  test('a pending navigation within the owner, then a departure, then back', async () => {
    const t = setup()
    await screen.findByText('A page')

    t.gates.a = deferred()
    const firstA = t.gates.a
    await t.start({ to: '/a', search: { x: 'one' } })
    expect(t.router.state.status).toBe('pending')
    // Staying: updates while the owner's own loader is pending.
    expect(t.href('a-self')).toBe('/a?x=one')

    t.gates.b = deferred()
    const updater = t.counts.aUpdater
    const renders = t.counts.aRenders
    await t.start({ to: '/b' })
    expect(t.counts.aUpdater).toBe(updater)
    expect(t.counts.aRenders).toBe(renders)
    expect(t.href('a-self')).toBe('/a?x=one')
    expect(t.isActive('root-b')).toBe(true)

    await t.start({ to: '/a', search: { x: 'two' } })
    expect(t.href('a-self')).toBe('/a?x=two')
    expect(t.isActive('root-b')).toBe(false)

    firstA.resolve()
    t.gates.b.resolve()
    await t.settle()
    expect(t.router.state.status).toBe('idle')
    expect(t.href('a-self')).toBe('/a?x=two')
    expect(t.isActive('a-self')).toBe(true)
  })

  test('a departing link unmounted while pending does no further work', async () => {
    const error = vi.spyOn(console, 'error')
    const warn = vi.spyOn(console, 'warn')
    const t = setup()
    await screen.findByText('A page')
    t.gates.b = deferred()
    const gone = t.counts.goneUpdater
    await t.start({ to: '/b' })
    act(() => {
      t.controls.setGone!(true)
    })
    expect(screen.queryByTestId('a-gone')).toBeNull()
    await t.release('b')
    await screen.findByText('B page')
    expect(t.counts.goneUpdater).toBe(gone)
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  test('an abandoned suspended link render keeps links consistent', async () => {
    const t = setup()
    await screen.findByText('A page')
    const gate = deferred()
    t.setSuspendGate(gate)
    // Re-render A so the boundary suspends with its link rendered but not committed.
    act(() => {
      t.controls.setHash!('s')
    })
    t.setSuspendGate(undefined)
    await act(async () => {
      gate.resolve()
      await gate.promise
    })
    expect(t.href('a-suspended')).toBe('/a')

    await t.start({ to: '/a', search: { x: 'one' } })
    await t.settle()
    expect(t.href('a-suspended')).toBe('/a?x=one')

    t.gates.b = deferred()
    const suspended = t.counts.suspendedUpdater
    await t.start({ to: '/b' })
    expect(t.counts.suspendedUpdater).toBe(suspended)
    await t.release('b')
    await screen.findByText('B page')
  })

  test('StrictMode double mounting keeps holding and updating', async () => {
    const t = setup({ strict: true })
    await screen.findByText('A page')
    t.gates.b = deferred()
    const updater = t.counts.aUpdater
    await t.start({ to: '/b' })
    expect(t.counts.aUpdater).toBe(updater)
    expect(t.isActive('root-b')).toBe(true)
    await t.start({ to: '/a', search: { x: 's' } })
    expect(t.href('a-self')).toBe('/a?x=s')
    t.gates.b.resolve()
    await t.settle()
    expect(t.href('a-self')).toBe('/a?x=s')
    expect(t.isActive('root-b')).toBe(false)
  })

  test.each([
    ['a-dot', '/a'],
    ['a-next', '/a?x=one-next'],
  ])(
    'clicking held link %s navigates to the href it displays',
    async (id, displayed) => {
      const t = setup({ initial: '/a?x=one' })
      await screen.findByText('A page')
      t.gates.b = deferred()
      await t.start({ to: '/b' })
      expect(t.router.state.status).toBe('pending')
      expect(t.href(id)).toBe(displayed)

      await act(async () => {
        fireEvent.click(t.link(id))
        await Promise.resolve()
      })
      expect(t.router.latestLocation.href).toBe(displayed)
      t.gates.b.resolve()
      await t.settle()
      expect(t.router.state.location.href).toBe(displayed)
      expect(screen.getByText('A page')).toBeInTheDocument()
    },
  )

  test.each(['mouseEnter', 'focus', 'touchStart'] as const)(
    'a %s preload of a held link loads the location it displays',
    async (event) => {
      const t = setup({ initial: '/a?x=one' })
      await screen.findByText('A page')
      t.gates.b = deferred()
      await t.start({ to: '/b' })
      expect(t.href('a-next')).toBe('/a?x=one-next')
      t.aLoads.length = 0

      await act(async () => {
        fireEvent[event](t.link('a-next'))
        await Promise.resolve()
      })
      expect(t.aLoads).toEqual(['one-next'])
      await t.release('b')
      await screen.findByText('B page')
    },
  )

  test('a render preload of a link mounting in a departing match loads the location it displays', async () => {
    const t = setup({ initial: '/a?x=one' })
    await screen.findByText('A page')
    t.gates.b = deferred()
    await t.start({ to: '/b' })
    t.aLoads.length = 0

    await act(async () => {
      t.controls.setRenderPreload!(true)
      await Promise.resolve()
    })
    expect(t.href('a-render')).toBe('/a?x=one-render')
    expect(t.aLoads).toEqual(['one-render'])
    await t.release('b')
    await screen.findByText('B page')
  })

  test('staying links click and preload from the live location', async () => {
    const t = setup({ initial: '/a?x=one' })
    await screen.findByText('A page')
    t.gates.a = deferred()
    await t.start({ to: '/a', search: { x: 'two' } })
    expect(t.router.state.status).toBe('pending')
    expect(t.href('a-next')).toBe('/a?x=two-next')
    t.aLoads.length = 0

    await act(async () => {
      fireEvent.mouseEnter(t.link('a-next'))
      await Promise.resolve()
    })
    expect(t.aLoads).toEqual(['two-next'])
    await act(async () => {
      fireEvent.click(t.link('a-next'))
      await Promise.resolve()
    })
    expect(t.router.latestLocation.href).toBe('/a?x=two-next')
    await t.release('a')
    await t.settle()
    expect(t.router.state.location.href).toBe('/a?x=two-next')
    expect(t.href('a-next')).toBe('/a?x=two-next-next')
  })

  test('a revisited route starts with fresh links, also ones mounting during its next departure', async () => {
    const t = setup({ initial: '/a?x=one' })
    await screen.findByText('A page')
    t.gates.b = deferred()
    await t.start({ to: '/b' })
    expect(t.href('a-next')).toBe('/a?x=one-next')
    await t.release('b')
    await screen.findByText('B page')
    await t.settle()

    t.nextFrom.length = 0
    await act(() => t.router.navigate({ to: '/a', search: { x: 'two' } }))
    await screen.findByText('A page')
    await t.settle()
    // The remounted links never derive from the previous visit's location.
    expect(t.nextFrom).not.toContain('one')
    expect(t.href('a-next')).toBe('/a?x=two-next')
    expect(t.href('a-self')).toBe('/a?x=two')
    expect(t.isActive('a-self')).toBe(true)
    expect(t.isActive('root-b')).toBe(false)

    // B is cached now: depart to a route that has not loaded yet.
    t.gates.items = deferred()
    const updater = t.counts.aUpdater
    await t.start({ to: '/items/$id', params: { id: '1' } })
    expect(t.router.state.status).toBe('pending')
    expect(t.counts.aUpdater).toBe(updater)
    act(() => {
      t.controls.setExtra!(true)
    })
    // The new link holds this visit's location, not the previous visit's.
    expect(t.href('a-extra')).toBe('/a?x=two')
    expect(t.href('a-next')).toBe('/a?x=two-next')
    expect(t.isActive('root-b')).toBe(false)

    await act(async () => {
      fireEvent.click(t.link('a-extra'))
      await Promise.resolve()
    })
    expect(t.router.latestLocation.href).toBe('/a?x=two')
    t.gates.items.resolve()
    await t.settle()
    expect(t.router.state.location.href).toBe('/a?x=two')
    expect(t.isActive('a-extra')).toBe(true)
    expect(t.href('a-next')).toBe('/a?x=two-next')
  })

  test('a document redirect from the destination does not break later navigations', async () => {
    // jsdom reports the attempted document navigation as not implemented.
    const t = setup({
      bAfterGate: () => {
        throw redirect({ to: '/c', reloadDocument: true })
      },
    })
    await screen.findByText('A page')
    t.gates.b = deferred()
    await t.start({ to: '/b' })
    await t.release('b')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await act(() => t.router.navigate({ to: '/a', search: { x: 'two' } }))
    await t.settle()
    expect(t.href('a-self')).toBe('/a?x=two')
    expect(t.isActive('a-self')).toBe(true)
    expect(t.isActive('root-b')).toBe(false)
  })

  test('a departure superseded by a history traversal back to the owner updates its links', async () => {
    const t = setup({ initial: '/a?x=one' })
    await screen.findByText('A page')
    await act(() => t.router.navigate({ to: '/a', search: { x: 'two' } }))
    await t.settle()
    expect(t.href('a-self')).toBe('/a?x=two')

    t.gates.b = deferred()
    const updater = t.counts.aUpdater
    await t.start({ to: '/b' })
    expect(t.counts.aUpdater).toBe(updater)
    await act(async () => {
      t.router.history.go(-2)
      await Promise.resolve()
    })
    await t.settle()
    expect(t.router.state.location.href).toBe('/a?x=one')
    expect(t.href('a-self')).toBe('/a?x=one')
    expect(t.isActive('a-self')).toBe(true)
    expect(t.isActive('root-b')).toBe(false)
    t.gates.b.resolve()
    await act(async () => {
      await t.gates.b?.promise
    })
    expect(screen.getByText('A page')).toBeInTheDocument()
    expect(t.href('a-self')).toBe('/a?x=one')
  })

  test('invalidating a pending departure keeps holding until it commits', async () => {
    const t = setup()
    await screen.findByText('A page')
    t.gates.b = deferred()
    const updater = t.counts.aUpdater
    const renders = t.counts.aRenders
    await t.start({ to: '/b' })
    await act(async () => {
      void t.router.invalidate()
      await Promise.resolve()
    })
    expect(t.router.state.status).toBe('pending')
    expect(t.router.state.location.pathname).toBe('/b')
    expect(t.counts.aUpdater).toBe(updater)
    expect(t.counts.aRenders).toBe(renders)
    expect(t.isActive('a-self')).toBe(true)
    expect(t.isActive('root-b')).toBe(true)
    await t.release('b')
    await screen.findByText('B page')
    expect(t.counts.aUpdater).toBe(updater)
  })

  test('a departure redirected or superseded to another departing location does no work', async () => {
    const t = setup({
      bAfterGate: () => {
        throw redirect({ to: '/c' })
      },
    })
    await screen.findByText('A page')
    const updater = t.counts.aUpdater
    const renders = t.counts.aRenders
    t.gates.b = deferred()
    await t.start({ to: '/b' })
    t.gates.items = deferred()
    await t.start({ to: '/items/$id', params: { id: '1' } })
    // B redirects to C after being superseded; neither keeps A.
    await t.release('b')
    expect(t.counts.aUpdater).toBe(updater)
    expect(t.counts.aRenders).toBe(renders)
    await t.release('items')
    await screen.findByText('Items page')
    expect(t.router.state.location.pathname).toBe('/items/1')

    await act(() => t.router.navigate({ to: '/a' }))
    await screen.findByText('A page')
    const again = t.counts.aUpdater
    t.gates.b = deferred()
    await t.start({ to: '/b' })
    await t.release('b')
    await screen.findByText('C page')
    expect(t.counts.aUpdater).toBe(again)
  })

  test('a view transition callback that throws does not break later navigations', async () => {
    vi.stubGlobal('CSS', { supports: () => true })
    ;(document as any).startViewTransition = (update: () => unknown) => {
      update()
      return {
        updateCallbackDone: Promise.resolve(),
        finished: Promise.resolve(),
      }
    }
    const failures: Array<unknown> = []
    const t = setup({
      // The history listener's load rejects with the callback's error. Record
      // it instead of leaving it unhandled.
      beforeRender: (router) => {
        const load = router.load
        router.load = (opts: any) =>
          load(opts).catch((error: unknown) => failures.push(error))
      },
    })
    await screen.findByText('A page')
    await t.start({
      to: '/b',
      viewTransition: {
        types: () => {
          throw new Error('types failed')
        },
      },
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // The failed transaction leaves the router pending on the destination
    // with the previous page displayed, without a newer publication.
    expect(failures).toHaveLength(1)
    expect(t.router.state.status).toBe('pending')
    expect(t.router.state.location.pathname).toBe('/b')
    expect(screen.getByText('A page')).toBeInTheDocument()
    delete (document as any).startViewTransition
    vi.unstubAllGlobals()

    // A navigation that keeps the page updates its links.
    await act(() => t.router.navigate({ to: '/a', search: { x: 'two' } }))
    await t.settle()
    expect(t.href('a-self')).toBe('/a?x=two')
    expect(t.isActive('a-self')).toBe(true)
    expect(t.isActive('root-b')).toBe(false)
  })

  test('links outside every match follow a pending navigation', async () => {
    const t = setup()
    await screen.findByText('A page')
    cleanup()
    const router = t.router
    const InnerWrap = ({ children }: { children: React.ReactNode }) => (
      <>
        <Link to="/b" data-testid="wrap-b">
          wrap b
        </Link>
        {children}
      </>
    )
    router.update({ ...router.options, InnerWrap })
    render(<RouterProvider router={router} />)
    await screen.findByText('A page')
    expect(t.isActive('wrap-b')).toBe(false)
    t.gates.b = deferred()
    await t.start({ to: '/b' })
    expect(router.state.status).toBe('pending')
    expect(t.isActive('wrap-b')).toBe(true)
    await t.release('b')
    await screen.findByText('B page')
    expect(t.isActive('wrap-b')).toBe(true)
  })
})

describe('masked links in a departing match', () => {
  test.each(['mask', 'routeMasks'] as const)(
    'clicking a held link with a location-dependent %s pushes the masked href it displays',
    async (kind) => {
      const root = createRootRoute()
      const gate: { b?: Deferred } = {}
      const a = createRoute({
        getParentRoute: () => root,
        path: '/a',
        component: () => (
          <Link
            to="/photo"
            search={(prev: any) => ({ id: prev.x })}
            hash
            mask={
              kind === 'mask'
                ? ({ to: '.', search: true, hash: true } as any)
                : undefined
            }
            data-testid="masked"
          >
            masked
          </Link>
        ),
      })
      const b = createRoute({
        getParentRoute: () => root,
        path: '/b',
        loader: () => gate.b?.promise,
        component: () => <h1>B page</h1>,
      })
      const photo = createRoute({
        getParentRoute: () => root,
        path: '/photo',
        component: () => <h1>Photo page</h1>,
      })
      const routeTree = root.addChildren([a, b, photo])
      const router = createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: ['/a?x=one#h'] }),
        routeMasks:
          kind === 'routeMasks'
            ? [
                createRouteMask({
                  routeTree,
                  from: '/photo',
                  to: '/a',
                  search: true,
                  hash: true,
                } as any),
              ]
            : undefined,
      })
      render(<RouterProvider router={router} />)
      const link = await screen.findByTestId('masked')
      expect(link).toHaveAttribute('href', '/a?x=one#h')

      gate.b = deferred()
      await act(async () => {
        void router.navigate({ to: '/b' })
        await Promise.resolve()
      })
      expect(router.state.status).toBe('pending')
      expect(link).toHaveAttribute('href', '/a?x=one#h')

      await act(async () => {
        fireEvent.click(link)
        await Promise.resolve()
      })
      // The URL bar shows the masked href the link displayed.
      expect(router.history.location.href).toBe('/a?x=one#h')
      expect(router.latestLocation.pathname).toBe('/photo')
      expect(router.latestLocation.search).toEqual({ id: 'one' })
      gate.b.resolve()
      await screen.findByText('Photo page')
      expect(router.history.location.href).toBe('/a?x=one#h')
    },
  )

  test.each(['mask', 'routeMasks'] as const)(
    'a link with a fixed %s builds its location once and does not rerender across navigations',
    async (kind) => {
      // Every location the router builds for the masked link passes through
      // the output rewrite.
      let maskedBuilds = 0
      let renders = 0
      const root = createRootRoute({
        component: () => (
          <>
            <Link
              to="/photo"
              search={{ id: 1 }}
              mask={
                kind === 'mask'
                  ? ({ to: '/posts', search: { from: 'photo' } } as any)
                  : undefined
              }
              data-testid="masked"
            >
              {() => {
                renders++
                return 'masked'
              }}
            </Link>
            <Outlet />
          </>
        ),
      })
      const routes = ['a', 'b', 'photo', 'posts'].map((path) =>
        createRoute({
          getParentRoute: () => root,
          path: `/${path}`,
          component: () => <h1>{path} page</h1>,
        }),
      )
      const routeTree = root.addChildren(routes)
      const router = createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: ['/a'] }),
        rewrite: {
          output: ({ url }) => {
            if (url.pathname === '/photo' || url.pathname === '/posts') {
              maskedBuilds++
            }
            return url
          },
        },
        routeMasks:
          kind === 'routeMasks'
            ? [
                createRouteMask({
                  routeTree,
                  from: '/photo',
                  to: '/posts',
                  search: { from: 'photo' },
                } as any),
              ]
            : undefined,
      })
      render(<RouterProvider router={router} />)
      const link = await screen.findByTestId('masked')
      expect(link).toHaveAttribute('href', '/posts?from=photo')
      const buildsAfterMount = maskedBuilds
      const rendersAfterMount = renders

      for (const to of ['/b', '/a', '/b']) {
        await act(() => router.navigate({ to }))
        await screen.findByText(`${to.slice(1)} page`)
      }
      expect(link).toHaveAttribute('href', '/posts?from=photo')
      expect(maskedBuilds).toBe(buildsAfterMount)
      expect(renders).toBe(rendersAfterMount)
    },
  )
})

describe('link scope retention', () => {
  setFlagsFromString('--expose-gc')
  const gc: () => void = runInNewContext('gc')
  async function collect() {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      gc()
    }
  }
  const alive = (refs: Array<WeakRef<object>>) =>
    refs.flatMap((ref, index) => (ref.deref() ? [index] : []))

  // Builds and renders a router whose route `/a` and root render Links, and
  // returns a function that visits a location with a large history state.
  function renderApp() {
    const root = createRootRoute({
      component: () => (
        <>
          <Link to="/b" data-testid="root-b">
            root b
          </Link>
          <Outlet />
        </>
      ),
    })
    const a = createRoute({
      getParentRoute: () => root,
      path: '/a',
      component: () => (
        <>
          <h1>A page</h1>
          <Link to="." search={(prev: any) => prev} data-testid="a-self">
            a self
          </Link>
        </>
      ),
    })
    const b = createRoute({
      getParentRoute: () => root,
      path: '/b',
      component: () => <h1>B page</h1>,
    })
    const router = createRouter({
      routeTree: root.addChildren([a, b]),
      history: createMemoryHistory({ initialEntries: ['/a'] }),
    })
    render(<RouterProvider router={router} />)
    return async (to: string, index: number) => {
      await act(() =>
        router.navigate({
          to,
          search: { i: index },
          state: { payload: new Array(100_000).fill(index) } as any,
          replace: true,
        } as any),
      )
      await waitFor(() => expect(router.state.status).toBe('idle'))
      const location: any = router.state.location
      return [new WeakRef(location), new WeakRef(location.state.payload)]
    }
  }

  test(
    'locations with large history state are collectable after their route is left',
    { timeout: 20_000 },
    async () => {
      const visit = renderApp()
      await screen.findByText('A page')
      // The router may keep its first navigation's state (also on main).
      await visit('/a', 0)
      const left: Array<WeakRef<object>> = []
      for (let index = 1; index < 5; index++) {
        left.push(...(await visit('/a', index)))
      }
      for (let index = 5; index < 9; index++) {
        left.push(...(await visit('/b', index)))
      }
      await visit('/b', 9)
      await screen.findByText('B page')
      await collect()
      // Only the current location (and its payload) stays reachable.
      expect(alive(left)).toEqual([])
    },
  )
})

describe('links after a same-href navigation that changes history state', () => {
  function renderStateApp() {
    // The `tag` state of every `/b` load, preloads included.
    const bLoads: Array<unknown> = []
    const root = createRootRoute({ component: () => <Outlet /> })
    const a = createRoute({
      getParentRoute: () => root,
      path: '/a',
      component: () => (
        <>
          <h1>A page</h1>
          <Link
            to="/b"
            state={true}
            preload="intent"
            preloadDelay={0}
            data-testid="inherit"
          >
            inherit
          </Link>
          <Link
            to="/b"
            state={(prev: any) => ({ tag: `${prev.tag}-updated` }) as any}
            data-testid="updater"
          >
            updater
          </Link>
        </>
      ),
    })
    const b = createRoute({
      getParentRoute: () => root,
      path: '/b',
      loader: ({ location }) => {
        bLoads.push((location.state as any).tag)
      },
      component: () => <h1>B page</h1>,
    })
    const router = createRouter({
      routeTree: root.addChildren([a, b]),
      history: createMemoryHistory({ initialEntries: ['/a'] }),
    })
    render(<RouterProvider router={router} />)
    return { router, bLoads }
  }

  async function changeState(router: any) {
    await screen.findByText('A page')
    await act(() =>
      router.navigate({
        to: '/a',
        state: { tag: 'latest' } as any,
        replace: true,
      }),
    )
    expect(router.state.location.href).toBe('/a')
    expect(router.state.location.state.tag).toBe('latest')
  }

  test.each([
    ['inherit', 'latest'],
    ['updater', 'latest-updated'],
  ])(
    'clicking link %s derives its state from the latest location',
    async (id, tag) => {
      const { router } = renderStateApp()
      await changeState(router)

      fireEvent.click(screen.getByTestId(id))
      await screen.findByText('B page')
      expect(router.state.location.pathname).toBe('/b')
      expect((router.state.location.state as any).tag).toBe(tag)
    },
  )

  test('preloading derives its state from the latest location', async () => {
    const { router, bLoads } = renderStateApp()
    await changeState(router)

    fireEvent.mouseEnter(screen.getByTestId('inherit'))
    await waitFor(() => expect(bLoads).toEqual(['latest']))
  })
})
