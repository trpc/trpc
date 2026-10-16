import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

test('invalidation retires a zero-owner reservation before a blocked successor completes', async () => {
  const started = createControlledPromise<void>()
  const data = createControlledPromise<string>()
  const entered = createControlledPromise<void>()
  const before = createControlledPromise<void>()
  let signal: AbortSignal | undefined
  const root = new BaseRootRoute({})
  const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const target = new BaseRoute({
    getParentRoute: () => root,
    path: '/target',
    validateSearch: (search: Record<string, unknown>) => ({
      blocked: !!search.blocked,
    }),
    beforeLoad: ({ search }) => {
      if (search.blocked) {
        entered.resolve()
        return before
      }
      return undefined
    },
    loader: ({ abortController }) => {
      signal = abortController.signal
      started.resolve()
      return data
    },
  })
  const router = createTestRouter({
    routeTree: root.addChildren([home, target]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const first = router.navigate({ to: '/target', search: { blocked: false } })
  await started
  const second = router.navigate({ to: '/target', search: { blocked: true } })
  await entered
  expect(signal?.aborted).toBe(false)
  const aborted = vi.fn()
  signal!.addEventListener('abort', aborted)
  const invalidation = router.invalidate({
    filter: (match) => match.routeId === target.id,
  })
  await router.navigate({ to: '/' })
  before.resolve()
  data.resolve('obsolete data')
  await Promise.all([first, second, invalidation])
  expect(signal?.aborted).toBe(true)
  expect(aborted).toHaveBeenCalledOnce()
  expect(router.state.location.pathname).toBe('/')
})
