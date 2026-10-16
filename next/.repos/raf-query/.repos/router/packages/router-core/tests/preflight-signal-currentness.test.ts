import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

test('a route-context redirect retires its matching generation before following the redirect', async () => {
  let sourceSignal: AbortSignal | undefined
  const sourceBeforeLoad = vi.fn()
  const sourceLoader = vi.fn()
  const targetLoader = vi.fn(() => 'target')
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const sourceRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/source',
    context: ({ abortController }) => {
      sourceSignal = abortController.signal
      throw redirect({ to: '/target' })
    },
    beforeLoad: sourceBeforeLoad,
    loader: sourceLoader,
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loader: targetLoader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, sourceRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/source' })

  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: targetRoute.id,
    status: 'success',
    loaderData: 'target',
  })
  expect(sourceSignal?.aborted).toBe(true)
  expect(sourceBeforeLoad).not.toHaveBeenCalled()
  expect(sourceLoader).not.toHaveBeenCalled()
  expect(targetLoader).toHaveBeenCalledOnce()
})
