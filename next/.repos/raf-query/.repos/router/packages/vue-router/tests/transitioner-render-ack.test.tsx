import * as Vue from 'vue'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from '../src'
import type { AnyRouter } from '../src'

afterEach(() => {
  cleanup()
})

test('a generation replaced before the Vue render tick does not emit onRendered', async () => {
  const secondGate = createControlledPromise<void>()
  const lifecycle: Array<string> = []
  let replacementEnabled = false
  let secondNavigation: Promise<void> | undefined

  const First = Vue.defineComponent({
    setup() {
      Vue.onMounted(() => lifecycle.push('mounted:/first'))
      return () => <div>First</div>
    },
  })
  const SecondPending = Vue.defineComponent({
    setup() {
      Vue.onMounted(() => lifecycle.push('mounted:pending:/second'))
      return () => <div>Second pending</div>
    },
  })
  const Second = Vue.defineComponent({
    setup() {
      Vue.onMounted(() => lifecycle.push('mounted:/second'))
      return () => <div>Second</div>
    },
  })
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    component: First,
  })
  const secondRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: SecondPending,
    beforeLoad: () => secondGate,
    component: Second,
  })
  const Wrap = Vue.defineComponent({
    setup(_, { slots }) {
      const leafRouteId = useRouterState<AnyRouter, string | undefined>({
        select: (state) => state.matches.at(-1)?.routeId,
      })
      Vue.watch(
        leafRouteId,
        (routeId) => {
          if (
            replacementEnabled &&
            routeId === firstRoute.id &&
            !secondNavigation
          ) {
            lifecycle.push('offered:/first')
            secondNavigation = router.navigate({ to: '/second' })
            lifecycle.push('navigate:/second')
          }
        },
        { flush: 'sync' },
      )
      return () => slots.default?.()
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    Wrap: Wrap as any,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const unsubscribers = [
    router.subscribe('onResolved', (event) => {
      lifecycle.push(`onResolved:${event.toLocation.pathname}`)
    }),
    router.subscribe('onRendered', (event) => {
      lifecycle.push(`onRendered:${event.toLocation.pathname}`)
    }),
  ]
  replacementEnabled = true
  let firstNavigation: Promise<void> | undefined
  try {
    firstNavigation = router.navigate({ to: '/first' })

    expect(await screen.findByText('Second pending')).toBeInTheDocument()
    expect(secondNavigation).toBeDefined()
    expect(screen.queryByText('First')).not.toBeInTheDocument()
    expect(lifecycle).not.toContain('mounted:/first')
    expect(lifecycle).not.toContain('onResolved:/first')
    expect(lifecycle).not.toContain('onRendered:/first')

    secondGate.resolve()
    await Promise.all([firstNavigation, secondNavigation!])
    expect(await screen.findByText('Second')).toBeInTheDocument()
    await waitFor(() => expect(lifecycle).toContain('onRendered:/second'))

    expect(lifecycle).toContain('mounted:pending:/second')
    expect(lifecycle).toContain('mounted:/second')
    expect(lifecycle).toContain('onResolved:/second')
    expect(lifecycle).not.toContain('mounted:/first')
    expect(lifecycle).not.toContain('onResolved:/first')
    expect(lifecycle).not.toContain('onRendered:/first')
  } finally {
    replacementEnabled = false
    secondGate.resolve()
    for (const unsubscribe of unsubscribers) {
      unsubscribe()
    }
    await Promise.allSettled(
      [firstNavigation, secondNavigation].filter(
        (navigation): navigation is Promise<void> => !!navigation,
      ),
    )
  }
})

test('a rendered generation superseded before core continuation does not emit onRendered', async () => {
  const secondGate = createControlledPromise<void>()
  const lifecycle: Array<string> = []
  let secondNavigation: Promise<void> | undefined

  const First = Vue.defineComponent({
    setup() {
      Vue.onMounted(() => {
        lifecycle.push('mounted:/first')
        secondNavigation = router.navigate({ to: '/second' })
        lifecycle.push('navigate:/second')
      })
      return () => <div>First</div>
    },
  })
  const Second = Vue.defineComponent({
    setup() {
      Vue.onMounted(() => lifecycle.push('mounted:/second'))
      return () => <div>Second</div>
    },
  })
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    component: First,
  })
  const secondRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    loader: () => secondGate,
    component: Second,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const unsubscribers = [
    router.subscribe('onResolved', (event) => {
      lifecycle.push(`onResolved:${event.toLocation.pathname}`)
    }),
    router.subscribe('onRendered', (event) => {
      lifecycle.push(`onRendered:${event.toLocation.pathname}`)
    }),
  ]
  let firstNavigation: Promise<void> | undefined
  try {
    firstNavigation = router.navigate({ to: '/first' })

    expect(await screen.findByText('First')).toBeInTheDocument()
    await waitFor(() =>
      expect(lifecycle).toEqual(['mounted:/first', 'navigate:/second']),
    )
    expect(secondNavigation).toBeDefined()
    expect(lifecycle).not.toContain('onResolved:/first')

    secondGate.resolve()
    await Promise.all([firstNavigation, secondNavigation!])
    expect(await screen.findByText('Second')).toBeInTheDocument()
    await waitFor(() =>
      expect(lifecycle).toEqual([
        'mounted:/first',
        'navigate:/second',
        'mounted:/second',
        'onResolved:/second',
        'onRendered:/second',
      ]),
    )
  } finally {
    secondGate.resolve()
    for (const unsubscribe of unsubscribers) {
      unsubscribe()
    }
    await Promise.allSettled(
      [firstNavigation, secondNavigation].filter(
        (navigation): navigation is Promise<void> => !!navigation,
      ),
    )
  }
})
