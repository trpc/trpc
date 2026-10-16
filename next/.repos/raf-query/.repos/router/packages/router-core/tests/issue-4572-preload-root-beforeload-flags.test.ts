import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue #4572: an intent preload used to re-trigger active beforeLoad
 * callbacks with stale navigation flags. Direct preloadRoute calls provide
 * the core-level reduction of the reported Link hover behavior.
 *
 * A completed beforeLoad result is never cached. Every new preload therefore
 * contextualizes its full route lane with fresh preload flags.
 */

function createPreloadFixture() {
  const rootBeforeLoad = vi.fn()
  const indexBeforeLoad = vi.fn()
  const aboutBeforeLoad = vi.fn()
  const bagBeforeLoad = vi.fn()
  const nestedBeforeLoad = vi.fn()

  const rootRoute = new BaseRootRoute({ beforeLoad: rootBeforeLoad })
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: indexBeforeLoad,
  })
  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    beforeLoad: aboutBeforeLoad,
  })
  const bagRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '_bag',
    beforeLoad: bagBeforeLoad,
  })
  const nestedRoute = new BaseRoute({
    getParentRoute: () => bagRoute,
    path: '/nested',
    beforeLoad: nestedBeforeLoad,
  })

  return {
    rootBeforeLoad,
    indexBeforeLoad,
    aboutBeforeLoad,
    bagBeforeLoad,
    nestedBeforeLoad,
    nestedRoute,
    router: createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        aboutRoute,
        bagRoute.addChildren([nestedRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  }
}

test('#4572: sibling preload contextualizes the full target lane with preload flags', async () => {
  const {
    rootBeforeLoad,
    indexBeforeLoad,
    aboutBeforeLoad,
    bagBeforeLoad,
    nestedBeforeLoad,
    router,
  } = createPreloadFixture()

  await router.load()
  expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
  expect(indexBeforeLoad).toHaveBeenCalledTimes(1)
  expect(rootBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'enter', preload: false }),
  )

  await router.preloadRoute({ to: '/about' })
  expect(rootBeforeLoad).toHaveBeenCalledTimes(2)
  expect(indexBeforeLoad).toHaveBeenCalledTimes(1)
  expect(aboutBeforeLoad).toHaveBeenCalledTimes(1)
  expect(aboutBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'preload', preload: true }),
  )
  expect(rootBeforeLoad).toHaveBeenLastCalledWith(
    expect.objectContaining({ cause: 'preload', preload: true }),
  )
  expect(bagBeforeLoad).not.toHaveBeenCalled()
  expect(nestedBeforeLoad).not.toHaveBeenCalled()
})

test('#4572: active-route preload reruns beforeLoad with preload flags', async () => {
  const {
    rootBeforeLoad,
    indexBeforeLoad,
    aboutBeforeLoad,
    bagBeforeLoad,
    nestedBeforeLoad,
    router,
  } = createPreloadFixture()

  await router.load()
  expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
  expect(indexBeforeLoad).toHaveBeenCalledTimes(1)
  expect(rootBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'enter', preload: false }),
  )

  rootBeforeLoad.mockClear()
  indexBeforeLoad.mockClear()
  await router.preloadRoute({ to: '/' })
  expect(rootBeforeLoad).toHaveBeenCalledOnce()
  expect(indexBeforeLoad).toHaveBeenCalledOnce()
  expect(rootBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'preload', preload: true }),
  )
  expect(indexBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'preload', preload: true }),
  )
  expect(aboutBeforeLoad).not.toHaveBeenCalled()
  expect(bagBeforeLoad).not.toHaveBeenCalled()
  expect(nestedBeforeLoad).not.toHaveBeenCalled()
})

test('#4572: active nested preload reruns its full pathless lane', async () => {
  const {
    rootBeforeLoad,
    indexBeforeLoad,
    aboutBeforeLoad,
    bagBeforeLoad,
    nestedBeforeLoad,
    nestedRoute,
    router,
  } = createPreloadFixture()

  await router.load()
  await router.navigate({ to: '/_bag/nested' })
  expect(rootBeforeLoad).toHaveBeenCalledTimes(2)
  expect(rootBeforeLoad).toHaveBeenLastCalledWith(
    expect.objectContaining({ cause: 'stay', preload: false }),
  )
  expect(indexBeforeLoad).toHaveBeenCalledTimes(1)
  expect(aboutBeforeLoad).not.toHaveBeenCalled()
  expect(bagBeforeLoad).toHaveBeenCalledTimes(1)
  expect(bagBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'enter', preload: false }),
  )
  expect(nestedBeforeLoad).toHaveBeenCalledTimes(1)
  expect(nestedBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'enter', preload: false }),
  )
  expect(
    router.state.matches.some((match) => match.routeId === nestedRoute.id),
  ).toBe(true)
  rootBeforeLoad.mockClear()
  indexBeforeLoad.mockClear()
  aboutBeforeLoad.mockClear()
  bagBeforeLoad.mockClear()
  nestedBeforeLoad.mockClear()

  await router.preloadRoute({ to: '/_bag/nested' })
  expect(rootBeforeLoad).toHaveBeenCalledOnce()
  expect(indexBeforeLoad).not.toHaveBeenCalled()
  expect(aboutBeforeLoad).not.toHaveBeenCalled()
  expect(bagBeforeLoad).toHaveBeenCalledOnce()
  expect(nestedBeforeLoad).toHaveBeenCalledOnce()
  for (const beforeLoad of [rootBeforeLoad, bagBeforeLoad, nestedBeforeLoad]) {
    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({ cause: 'preload', preload: true }),
    )
  }
})
