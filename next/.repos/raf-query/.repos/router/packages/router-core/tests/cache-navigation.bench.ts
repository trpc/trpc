import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

// A public-API cross-check for the isolated commit benchmark. Preload seeding
// is outside the timed loop; replace navigations keep history size stationary.
for (const size of [0, 100, 1000, 5000]) {
  const root = new BaseRootRoute({})
  const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const other = new BaseRoute({ getParentRoute: () => root, path: '/other' })
  let loads = 0
  const item = new BaseRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    loader: ({ params }) => {
      loads++
      return params.id
    },
    staleTime: Infinity,
    preloadStaleTime: Infinity,
    preloadGcTime: Infinity,
    gcTime: Infinity,
  })
  const router = createTestRouter({
    routeTree: root.addChildren([home, other, item]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  for (let index = 0; index < size; index++) {
    await router.preloadRoute({
      to: '/items/$id',
      params: { id: String(index) },
    })
  }
  const navigate = async () => {
    await router.navigate({ to: '/other', replace: true })
    await router.navigate({ to: '/', replace: true })
  }
  await navigate()
  expect(loads).toBe(size)
  expect(router._cache.size).toBe(size)
  expect(router.state.location.pathname).toBe('/')
  describe(`${size} cached preloads`, () => {
    bench('two unrelated navigations', navigate, {
      time: 1000,
      warmupTime: 200,
    })
  })
}
