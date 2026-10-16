import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

// Existing-behavior controls for https://github.com/TanStack/router/issues/3293
test('#3293 existing behavior: direct load runs onEnter after beforeLoad and loader', async () => {
  const beforeLoadGate = createControlledPromise<{ ready: true }>()
  const loaderGate = createControlledPromise<{ someData: 42 }>()
  const beforeLoad = vi.fn(() => beforeLoadGate)
  const loader = vi.fn(() => loaderGate)
  const onEnter = vi.fn()

  const rootRoute = new BaseRootRoute({})
  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    beforeLoad,
    loader,
    onEnter,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([aboutRoute]),
    history: createMemoryHistory({ initialEntries: ['/about'] }),
  })

  const load = router.load()
  await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))
  expect(loader).not.toHaveBeenCalled()
  expect(onEnter).not.toHaveBeenCalled()

  beforeLoadGate.resolve({ ready: true })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
  expect(loader).toHaveBeenCalledWith(
    expect.objectContaining({
      context: expect.objectContaining({ ready: true }),
    }),
  )
  expect(onEnter).not.toHaveBeenCalled()

  loaderGate.resolve({ someData: 42 })
  await load

  expect(onEnter).toHaveBeenCalledTimes(1)
  expect(onEnter).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'success',
      context: expect.objectContaining({ ready: true }),
      loaderData: { someData: 42 },
    }),
  )
})

test('#3293 existing behavior: uncached SPA navigation runs onEnter after beforeLoad and loader', async () => {
  const beforeLoadGate = createControlledPromise<{ ready: true }>()
  const loaderGate = createControlledPromise<{ someData: 42 }>()
  const beforeLoad = vi.fn(() => beforeLoadGate)
  const loader = vi.fn(() => loaderGate)
  const onEnter = vi.fn()

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    beforeLoad,
    loader,
    onEnter,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  expect(beforeLoad).not.toHaveBeenCalled()
  expect(loader).not.toHaveBeenCalled()
  expect(onEnter).not.toHaveBeenCalled()

  const navigation = router.navigate({ to: '/about' })
  await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))
  expect(loader).not.toHaveBeenCalled()
  expect(onEnter).not.toHaveBeenCalled()

  beforeLoadGate.resolve({ ready: true })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
  expect(loader).toHaveBeenCalledWith(
    expect.objectContaining({
      context: expect.objectContaining({ ready: true }),
    }),
  )
  expect(onEnter).not.toHaveBeenCalled()

  loaderGate.resolve({ someData: 42 })
  await navigation

  expect(onEnter).toHaveBeenCalledTimes(1)
  expect(onEnter).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'success',
      context: expect.objectContaining({ ready: true }),
      loaderData: { someData: 42 },
    }),
  )
})
