import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test('router.loadRouteChunk exposes a failed lazy import and remains retryable', async () => {
  const chunkError = new TypeError('Failed to fetch lazy route')
  const component = () => null
  let fail = true
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/route',
  }).lazy(() => {
    if (fail) {
      fail = false
      return Promise.reject(chunkError)
    }
    return Promise.resolve({ options: { component } } as any)
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await expect(router.loadRouteChunk(route as any)).rejects.toBe(chunkError)
  await router.loadRouteChunk(route as any)

  expect(route.options.component).toBe(component)
})
