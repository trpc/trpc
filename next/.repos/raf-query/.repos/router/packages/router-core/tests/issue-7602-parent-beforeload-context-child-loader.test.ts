import { expect, onTestFinished, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/7602
test('#7602: browser Back republishes a cached child with fresh parent beforeLoad context', async () => {
  const loaderContexts: Array<{
    number?: number
    generation?: number
  }> = []
  const reloadGate = createControlledPromise<void>()
  let loaderRuns = 0
  let beforeLoadRuns = 0

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reproRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/repro',
    beforeLoad: async () => {
      await Promise.resolve()
      return { number: 42, generation: ++beforeLoadRuns }
    },
  })
  const reproIndexRoute = new BaseRoute({
    getParentRoute: () => reproRoute,
    path: '/',
    loader: async ({
      context,
    }: {
      context: { number?: number; generation?: number }
    }) => {
      loaderRuns++
      loaderContexts.push({
        number: context.number,
        generation: context.generation,
      })
      if (loaderRuns === 2) {
        await reloadGate
      }
      return { visit: loaderRuns }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      reproRoute.addChildren([reproIndexRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/repro'] }),
  })
  const getChildMatch = () =>
    router.state.matches.find((match) => match.routeId === reproIndexRoute.id)
  // RouterProvider's Transitioner installs this subscription in applications.
  // It is what turns a browser Back history event into a router load.
  const unsubscribe = router.history.subscribe(router.load)
  onTestFinished(() => {
    reloadGate.resolve()
    unsubscribe()
  })

  await router.load()
  expect(router.state.location.pathname).toBe('/repro')
  expect(getChildMatch()).toMatchObject({
    routeId: reproIndexRoute.id,
    status: 'success',
    loaderData: { visit: 1 },
    context: { number: 42, generation: 1 },
  })
  expect(loaderContexts).toEqual([{ number: 42, generation: 1 }])

  await router.navigate({ to: '/' })
  expect(router.state.location.pathname).toBe('/')
  expect(router.state.isLoading).toBe(false)
  expect(getChildMatch()).toBeUndefined()

  router.history.back()
  await vi.waitFor(() => expect(loaderContexts).toHaveLength(2))

  // The cached success is visible while its stale loader reloads. It must
  // never be published with the parent's context contribution missing.
  expect(router.state.location.pathname).toBe('/repro')
  expect(getChildMatch()).toMatchObject({
    status: 'success',
    loaderData: { visit: 1 },
    context: { number: 42, generation: 2 },
  })
  expect(loaderContexts).toEqual([
    { number: 42, generation: 1 },
    { number: 42, generation: 2 },
  ])

  reloadGate.resolve()
  await vi.waitFor(() =>
    expect(getChildMatch()?.loaderData).toEqual({ visit: 2 }),
  )
  expect(router.state.location.pathname).toBe('/repro')
  expect(router.state.isLoading).toBe(false)
  expect(getChildMatch()?.context).toMatchObject({
    number: 42,
    generation: 2,
  })
  expect(beforeLoadRuns).toBe(2)
  expect(loaderRuns).toBe(2)
})
