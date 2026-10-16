import { createMemoryHistory } from '@tanstack/history'
import { expect, onTestFinished, test } from 'vitest'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/3920
test('onBeforeNavigate fires after the initial load redirects', async () => {
  const rootRoute = new BaseRootRoute({})
  const sourceRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/source',
    beforeLoad: () => {
      throw redirect({ to: '/target' })
    },
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  const thirdRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/third',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([sourceRoute, targetRoute, thirdRoute]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
  })

  await router.load()
  expect(router.state.location.pathname).toBe('/target')

  const navigatedPaths: Array<string> = []
  const unsub = router.subscribe('onBeforeNavigate', (event) => {
    navigatedPaths.push(event.toLocation.pathname)
  })
  onTestFinished(unsub)

  await router.navigate({ to: '/third' })

  expect(navigatedPaths).toEqual(['/third'])
})
