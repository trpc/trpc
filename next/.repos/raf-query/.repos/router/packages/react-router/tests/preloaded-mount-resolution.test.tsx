import { afterEach, beforeEach, expect, onTestFinished, test, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

/**
 * A load that settles before RouterProvider mounts (or completes within the
 * mount effect's batch) gives the Transitioner no isLoading flip to observe.
 * The router status must still resolve to 'idle' with resolvedLocation set,
 * and onRendered must fire — otherwise consumers waiting on those signals
 * deadlock forever (this hung the memory-client benchmark for 6 hours).
 *
 * Uses a raw createRoot without the act() test environment: act-driven
 * flushing re-renders between the isLoading toggles and masks the race.
 *
 * Note: vitest's jsdom scheduler still observes the flip more often than the
 * benchmark's environment, so this test pins the CONTRACT; the deterministic
 * regression guard for the original hang is the memory-client:react
 * benchmark (benchmarks/memory/client/scenarios/mount-unmount), which CI runs.
 */

let prevActEnv: unknown

beforeEach(() => {
  prevActEnv = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

afterEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = prevActEnv
})

test('mounting after a settled load still resolves status and fires onRendered', async () => {
  const lifecycle: Array<'layout' | 'rendered'> = []
  const Home = () => {
    React.useLayoutEffect(() => {
      lifecycle.push('layout')
    }, [])
    return <div data-testid="home">Home</div>
  }
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => 'home data',
    component: Home,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  let resolveRendered!: () => void
  const rendered = new Promise<void>((resolve) => {
    resolveRendered = resolve
  })
  const onRendered = vi.fn(() => {
    lifecycle.push('rendered')
    resolveRendered()
  })
  const onResolved = vi.fn()
  const onLoad = vi.fn()
  const unsubscribers = [
    router.subscribe('onRendered', onRendered),
    router.subscribe('onResolved', onResolved),
    router.subscribe('onLoad', onLoad),
  ]
  const unsubscribe = () => unsubscribers.forEach((fn) => fn())
  const container = document.createElement('div')
  document.body.appendChild(container)
  const reactRoot = createRoot(container)
  let renderedTimeout: ReturnType<typeof setTimeout> | undefined

  onTestFinished(() => {
    clearTimeout(renderedTimeout)
    unsubscribe()
    reactRoot.unmount()
    container.remove()
  })

  // Load fully settles before the provider mounts — the exact shape of the
  // memory benchmark's mount/unmount cycle.
  await router.load()
  expect(router.state.status).toBe('idle')
  expect(router.state.resolvedLocation?.pathname).toBe('/')
  expect(onLoad).toHaveBeenCalledTimes(1)
  expect(onResolved).toHaveBeenCalledTimes(1)
  expect(onRendered).not.toHaveBeenCalled()

  reactRoot.render(<RouterProvider router={router} />)
  await Promise.race([
    rendered,
    new Promise<never>((_, reject) => {
      renderedTimeout = setTimeout(() => {
        reject(new Error('Timed out waiting for onRendered'))
      }, 2000)
    }),
  ])

  expect(container.querySelector('[data-testid="home"]')).not.toBeNull()
  expect(onRendered).toHaveBeenCalledTimes(1)
  expect(lifecycle).toEqual(['layout', 'rendered'])
  expect(router.state.status).toBe('idle')
  expect(router.state.resolvedLocation?.pathname).toBe('/')
})

test('mounting during a load keeps the existing generation', async () => {
  const gate = createControlledPromise<void>()
  const beforeLoad = vi.fn()
  const loader = vi.fn(() => gate)
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad,
    loader,
    component: () => <div data-testid="home">Home</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const load = router.load()
  await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())

  const container = document.createElement('div')
  document.body.appendChild(container)
  const reactRoot = createRoot(container)

  onTestFinished(() => {
    reactRoot.unmount()
    container.remove()
  })

  reactRoot.render(<RouterProvider router={router} />)
  await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledOnce())
  gate.resolve()
  await load
  await vi.waitFor(() => {
    expect(container.querySelector('[data-testid="home"]')).not.toBeNull()
  })

  expect(beforeLoad).toHaveBeenCalledOnce()
  expect(loader).toHaveBeenCalledOnce()
})
