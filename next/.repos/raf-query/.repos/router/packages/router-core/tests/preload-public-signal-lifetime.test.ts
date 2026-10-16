import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

// Public contract: the AbortSignal supplied to loader code belongs to the
// accepted data generation. Adopting preloaded data keeps it alive; accepting
// replacement data aborts it; unloading aborts the replacement generation.
test('an adopted loader signal lives until public replacement and unload', async () => {
  const replacementGate = createControlledPromise<{ generation: number }>()
  let generation = 0
  let adoptedSignal: AbortSignal | undefined
  let replacementSignal: AbortSignal | undefined
  const loader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      generation++
      if (generation === 1) {
        adoptedSignal = abortController.signal
        return { generation }
      }

      replacementSignal = abortController.signal
      return replacementGate
    },
  )

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    staleTime: Infinity,
    preloadStaleTime: Infinity,
    loader: {
      staleReloadMode: 'blocking',
      handler: loader,
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.preloadRoute({ to: '/reports' })
  expect(adoptedSignal?.aborted).toBe(false)

  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(1)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toEqual({ generation: 1 })
  expect(adoptedSignal?.aborted).toBe(false)

  const replacement = router.invalidate({ forcePending: true })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
  expect(replacementGate.status).toBe('pending')

  // Until replacement data is accepted, the currently rendered data still
  // owns the adopted signal.
  expect(adoptedSignal?.aborted).toBe(false)
  expect(replacementSignal?.aborted).toBe(false)

  replacementGate.resolve({ generation: 2 })
  await replacement
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toEqual({ generation: 2 })
  expect(adoptedSignal?.aborted).toBe(true)
  expect(replacementSignal?.aborted).toBe(false)

  await router.navigate({ to: '/' })
  expect(replacementSignal?.aborted).toBe(true)
})

test('a superseded preload releases its borrowed loader signal lease', async () => {
  let parentSignal: AbortSignal | undefined
  let navigation!: Promise<void>

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: ({ abortController }) => {
      parentSignal = abortController.signal
      return 'parent data'
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    beforeLoad: ({ navigate, preload }) => {
      if (preload) {
        navigation = navigate({ to: '/' })
        throw navigation
      }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/parent'] }),
  })

  await router.load()
  expect(parentSignal?.aborted).toBe(false)

  await router.preloadRoute({ to: '/parent/child' })
  await navigation

  expect(router.state.location.pathname).toBe('/')
  expect(parentSignal?.aborted).toBe(true)
})

test('a terminal preload aborts its loader generation', async () => {
  const routeError = new Error('preload failed')
  let signal: AbortSignal | undefined

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    loader: ({ abortController }) => {
      signal = abortController.signal
      throw routeError
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const matches = await router.preloadRoute({ to: '/reports' })

  expect(
    matches?.find((match) => match.routeId === reportsRoute.id),
  ).toMatchObject({ status: 'error', error: routeError })
  expect(signal?.aborted).toBe(true)
})
