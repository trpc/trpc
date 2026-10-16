import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function setup() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    component: () => <div>Next</div>,
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, nextRoute]),
    history,
  })
  return { history, router }
}

describe('Transitioner remount', () => {
  // Zombie-router pin: once the provider unmounts, the history subscription
  // must be torn down so a later history change never re-drives the router.
  it('does not load after the provider unmounts', async () => {
    const { history, router } = setup()
    const loadSpy = vi.spyOn(router, 'load')

    const first = render(<RouterProvider router={router} />)
    expect(await screen.findByText('Index')).toBeTruthy()
    await waitFor(() => expect(router.state.status).toBe('idle'))

    first.unmount()
    loadSpy.mockClear()

    // A history change while unmounted must not reach the router.
    history.push('/next')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(loadSpy).not.toHaveBeenCalled()
    // Raw history advanced...
    expect(router.history.location.pathname).toBe('/next')
    // ...but the router never processed it, so its committed state stayed put.
    expect(router.state.location.pathname).toBe('/')

    loadSpy.mockRestore()
  })

  // Remounting the same router instance must re-establish the subscription so
  // navigation keeps working, without leaving a stale duplicate behind.
  it('re-subscribes and loads on remount with the same router', async () => {
    const { history, router } = setup()
    // Spy before the first mount so the subscription captures the spy by
    // reference - both the first and second mounts subscribe with it.
    const loadSpy = vi.spyOn(router, 'load')

    const first = render(<RouterProvider router={router} />)
    expect(await screen.findByText('Index')).toBeTruthy()
    await waitFor(() => expect(router.state.status).toBe('idle'))

    first.unmount()

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Index')).toBeTruthy()
    await waitFor(() => expect(router.state.status).toBe('idle'))

    // A push on the remounted provider must drive exactly one load, proving
    // the subscription was re-established (and is singular).
    loadSpy.mockClear()
    history.push('/next')
    expect(await screen.findByText('Next')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/next')
    await waitFor(() => expect(loadSpy).toHaveBeenCalledTimes(1))

    loadSpy.mockRestore()
  })
})
