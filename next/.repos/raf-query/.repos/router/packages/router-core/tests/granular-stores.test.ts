import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

function createRouter() {
  const rootRoute = new BaseRootRoute({})

  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
  })

  const postRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts/$postId',
  })

  const routeTree = rootRoute.addChildren([indexRoute, aboutRoute, postRoute])

  return createTestRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/'],
    }),
  })
}

describe('granular stores', () => {
  test('keeps ordered route state current across match generations', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    expect(router.state.location.pathname).toBe('/posts/123')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/posts/$postId',
    ])
    expect(router.state.matches.at(-1)?.params).toMatchObject({ postId: '123' })

    await router.navigate({ to: '/posts/456' })

    expect(router.state.location.pathname).toBe('/posts/456')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/posts/$postId',
    ])
    expect(router.state.matches.at(-1)?.params).toMatchObject({ postId: '456' })

    await router.navigate({ to: '/about' })

    expect(router.state.location.pathname).toBe('/about')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/about',
    ])
  })
})
