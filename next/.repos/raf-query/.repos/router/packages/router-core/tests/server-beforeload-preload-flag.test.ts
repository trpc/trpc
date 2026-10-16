import { createMemoryHistory } from '@tanstack/history'
import { expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test('server beforeLoad receives preload false', async () => {
  const seen: Array<boolean> = []
  const rootRoute = new BaseRootRoute({})
  const childRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    beforeLoad: ({ preload }) => {
      seen.push(preload)
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/child'] }),
    isServer: true,
  })

  await router.load()

  expect(seen).toEqual([false])
})

test('server preloadRoute stays speculative and receives preload true', async () => {
  const beforeLoad = vi.fn()
  const loader = vi.fn(() => 'preloaded data')
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    beforeLoad,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, childRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })

  await router.load()
  const matches = await router.preloadRoute({ to: '/child' })

  expect(beforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ preload: true }),
  )
  expect(loader).toHaveBeenCalledOnce()
  expect(matches?.at(-1)).toMatchObject({
    routeId: childRoute.id,
    loaderData: 'preloaded data',
  })
  expect(router.state.location.pathname).toBe('/')
  expect(router.state.matches.at(-1)?.routeId).toBe(indexRoute.id)
})

test('server child context receives its parent beforeLoad context', async () => {
  const rootRoute = new BaseRootRoute({
    beforeLoad: () => ({ parent: 'ready' }),
  })
  const childContext = vi.fn(({ context }) => ({
    child: `${context.parent}:child`,
  }))
  const childRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    context: childContext,
    loader: ({ context }) => context.child,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/child'] }),
    isServer: true,
  })

  await router.load()

  expect(router.state.matches.at(-1)).toMatchObject({
    context: { parent: 'ready', child: 'ready:child' },
    loaderData: 'ready:child',
  })
  expect(childContext).toHaveBeenCalledTimes(1)
})
