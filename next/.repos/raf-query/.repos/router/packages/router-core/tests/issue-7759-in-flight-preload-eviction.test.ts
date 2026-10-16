import { expect, onTestFinished, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test('issue #7759: evicting an in-flight preload finishes without an internal error', async () => {
  let signalLoaderStarted!: () => void
  let resolveLoader!: (value: string) => void

  const loaderStarted = new Promise<void>((resolve) => {
    signalLoaderStarted = resolve
  })
  const loaderResult = new Promise<string>((resolve) => {
    resolveLoader = resolve
  })

  const rootRoute = new BaseRootRoute({})
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loader: () => {
      signalLoaderStarted()
      return loaderResult
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([targetRoute]),
    history: createMemoryHistory(),
  })
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  onTestFinished(() => {
    consoleError.mockRestore()
  })

  const preload = router.preloadRoute({ to: '/target' })
  await loaderStarted

  router.clearCache()
  resolveLoader('loaded')

  await preload
  expect(consoleError).not.toHaveBeenCalled()
})
