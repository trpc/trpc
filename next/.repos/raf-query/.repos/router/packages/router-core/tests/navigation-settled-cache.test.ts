import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test('a settled loader result survives when its navigation is superseded', async () => {
  const aLoader = vi.fn(() => 'a data')
  let bSignal: AbortSignal | undefined
  const bLoader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      bSignal = abortController.signal
      return new Promise<never>((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => reject(abortController.signal),
          { once: true },
        )
      })
    },
  )

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const aRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/a',
    loader: aLoader,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const bRoute = new BaseRoute({
    getParentRoute: () => aRoute,
    path: '/b',
    loader: bLoader,
  })
  const cRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/c',
  })
  const dRoute = new BaseRoute({
    getParentRoute: () => cRoute,
    path: '/d',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      aRoute.addChildren([bRoute]),
      cRoute.addChildren([dRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const abandoned = router.navigate({ to: '/a/b' })
  await vi.waitFor(() => {
    expect(aLoader).toHaveBeenCalledOnce()
    expect(bLoader).toHaveBeenCalledOnce()
  })

  await router.navigate({ to: '/c/d' })
  await abandoned
  expect(bSignal?.aborted).toBe(true)

  await router.navigate({ to: '/a' })

  expect(aLoader).toHaveBeenCalledOnce()
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: aRoute.id,
    loaderData: 'a data',
  })
})
