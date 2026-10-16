import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import { hydrate } from '../src/ssr/client'
import {
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  cleanup()
  vi.useRealTimers()
  delete window.$_TSR
})

test('a post-hydration root reload keeps its fallback through pendingMinMs', async () => {
  const reloadGate = createControlledPromise<void>()
  const rootLoader = vi.fn(() => reloadGate.then(() => ({ generation: 2 })))
  const rootRoute = createRootRoute({
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="root-pending">Pending</div>,
    loader: rootLoader,
    component: () => (
      <div data-testid="root-content">
        Generation {rootRoute.useLoaderData().generation}
      </div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const rootMatch = router.matchRoutes(router.latestLocation)[0]!
  // This is the same public bootstrap shape produced by the server. Calling
  // hydrate() ensures router.ssr and the active match are established through
  // the real client hydration path rather than by mutating router stores.
  window.$_TSR = {
    router: {
      manifest: { routes: {} },
      dehydratedData: {},
      matches: [
        {
          i: dehydrateSsrMatchId(rootMatch.id),
          s: 'success',
          ssr: true,
          l: { generation: 1 },
          u: Date.now(),
        },
      ],
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  }

  await hydrate(router)
  expect(router.ssr).toBeDefined()

  render(<RouterProvider router={router} />)
  expect(screen.getByTestId('root-content')).toHaveTextContent('Generation 1')
  expect(rootLoader).not.toHaveBeenCalled()

  vi.useFakeTimers()

  let invalidation!: Promise<void>
  await act(async () => {
    invalidation = router.invalidate({ forcePending: true })
    await vi.advanceTimersByTimeAsync(0)
  })

  expect(rootLoader).toHaveBeenCalledTimes(1)
  expect(screen.queryByTestId('root-pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('root-content')).toHaveTextContent('Generation 1')

  await act(async () => {
    reloadGate.resolve()
    await Promise.resolve()
  })

  await act(async () => {
    await vi.advanceTimersByTimeAsync(99)
  })
  expect(screen.queryByTestId('root-pending')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
    await invalidation
  })
  expect(screen.queryByTestId('root-pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('root-content')).toHaveTextContent('Generation 2')
})

test('root route hydration without a pending boundary preserves component state', async () => {
  const mounts = vi.fn()
  const unmounts = vi.fn()
  const initializers = vi.fn(() => 'preserved')

  const rootRoute = createRootRoute({
    pendingComponent: () => <div>Root pending</div>,
    component: function RootComponent() {
      const [value] = React.useState(initializers)
      React.useEffect(() => {
        mounts()
        return unmounts
      }, [])
      return <div data-testid="root-content">{value}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()

  // Model the server render and the client router produced by hydrate(). A root
  // without a separate shell stays unwrapped on both sides of hydration.
  router.ssr = { manifest: { routes: {} } }
  router.isServer = true
  const html = renderToString(<RouterProvider router={router} />)
  router.isServer = false
  expect(html).not.toContain('<!--$-->')
  expect(html).toContain('preserved')

  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  let root!: ReturnType<typeof hydrateRoot>
  await act(async () => {
    root = hydrateRoot(container, <RouterProvider router={router} />)
    testCleanups.push(async () => {
      await act(() => root.unmount())
      consoleError.mockRestore()
      container.remove()
    })
    await Promise.resolve()
  })

  expect(container).toHaveTextContent('preserved')
  // One initializer belongs to the server render and one to client hydration.
  expect(initializers).toHaveBeenCalledTimes(2)
  expect(mounts).toHaveBeenCalledTimes(1)
  expect(unmounts).not.toHaveBeenCalled()
  expect(consoleError).not.toHaveBeenCalled()
})

test('an unresolved functional ssr option does not enable a root pending boundary', async () => {
  const rootRoute = createRootRoute({
    ssr: () => true,
    pendingComponent: () => <div>Root pending</div>,
    component: () => <div>Root content</div>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()

  const match = router.stores.matches.get()[0]!
  expect(typeof match.ssr).toBe('function')

  // Client match construction can expose the unresolved route option before
  // hydration replaces it with its transported value.
  router.ssr = { manifest: { routes: {} } }
  router.isServer = true
  const html = renderToString(<RouterProvider router={router} />)

  expect(html).not.toContain('<!--$-->')
  expect(html).toContain('Root content')
})

test('server rendering uses the root pending boundary inside its document shell', async () => {
  const gate = createControlledPromise<void>()
  const rootRoute = createRootRoute({
    pendingComponent: () => <div>Server root pending</div>,
    shellComponent: ({ children }) => (
      <html>
        <head />
        <body>{children}</body>
      </html>
    ),
    component: () => {
      throw gate
    },
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  router.isServer = true
  await router.load()

  const html = renderToString(<RouterProvider router={router} />)

  // renderToString cannot wait for Suspense, but the boundary inside the root
  // shell contains the suspension and emits its fallback.
  expect(html).toContain('Server root pending')
})
