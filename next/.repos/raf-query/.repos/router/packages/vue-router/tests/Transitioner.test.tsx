import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/vue'
import {
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

describe('Transitioner', () => {
  it('loads the initial route when the provider mounts', async () => {
    const loader = vi.fn()
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Index</div>,
      loader,
    })

    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
    })

    const view = render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(1)
      expect(view.getByText('Index')).toBeInTheDocument()
    })
  })

  it('reuses a public load already in progress when the provider mounts', async () => {
    const loaderGate = createControlledPromise<void>()
    const beforeLoad = vi.fn()
    const loader = vi.fn(() => loaderGate)
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad,
      loader,
      component: () => <div>Index</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const load = router.load()
    onTestFinished(async () => {
      loaderGate.resolve()
      await Promise.allSettled([load])
    })

    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const view = render(<RouterProvider router={router} />)
    loaderGate.resolve()
    await load

    expect(await view.findByText('Index')).toBeInTheDocument()
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
