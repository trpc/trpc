import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

test.each(['resolve', 'reject', 'supersede'] as const)(
  'a fresh cached loader still handles a new component chunk: %s',
  async (outcome) => {
    const data = { value: 'cached' }
    const loader = vi.fn(() => data)
    const root = new BaseRootRoute({})
    const cached = new BaseRoute({
      getParentRoute: () => root,
      path: '/cached',
      loader,
      staleTime: Infinity,
      gcTime: Infinity,
    })
    const other = new BaseRoute({
      getParentRoute: () => root,
      path: '/other',
    })
    const router = createTestRouter({
      routeTree: root.addChildren([cached, other]),
      history: createMemoryHistory({ initialEntries: ['/cached'] }),
    })
    await router.load()
    await router.navigate({ to: '/other' })

    const chunk = createControlledPromise<void>()
    const started = createControlledPromise<void>()
    cached.update({
      component: Object.assign(() => null, {
        preload: () => {
          started.resolve()
          return chunk
        },
      }),
    })
    let settled = false
    const navigation = router.navigate({ to: '/cached' }).then(() => {
      settled = true
    })
    await started
    expect(settled).toBe(false)
    expect(loader).toHaveBeenCalledOnce()

    const error = new Error('Chunk failed')
    if (outcome === 'supersede') {
      await router.navigate({ to: '/other' })
      await navigation
      expect(router.state.location.pathname).toBe('/other')
      chunk.reject(error)
    } else {
      if (outcome === 'resolve') {
        chunk.resolve()
      } else {
        chunk.reject(error)
      }
      await navigation
      const match = router.state.matches.find(
        (candidate) => candidate.routeId === cached.id,
      )!
      expect(match.status).toBe(outcome === 'resolve' ? 'success' : 'error')
      if (outcome === 'resolve') {
        expect(match.loaderData).toBe(data)
      } else {
        expect(match.error).toBe(error)
      }
    }
    expect(loader).toHaveBeenCalledOnce()
  },
)

test('a synchronous component preload failure is caught and can be retried', async () => {
  const error = new Error('Synchronous preload failure')
  const preload = vi.fn(() => {
    throw error
  })
  const root = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => root,
    path: '/route',
    component: Object.assign(() => null, { preload }),
  })
  const router = createTestRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/route'] }),
  })

  await router.load()
  expect(router.state.matches.at(-1)).toMatchObject({
    status: 'error',
    error,
  })

  route.update({ component: () => null })
  await router.load()
  expect(router.state.matches.at(-1)?.status).toBe('success')
  expect(preload).toHaveBeenCalledOnce()
})

test('a synchronous loader failure takes precedence over a synchronous component preload failure', async () => {
  const loaderError = new Error('Loader failed')
  const chunkError = new Error('Component preload failed')
  const loader = vi.fn(() => {
    throw loaderError
  })
  const preload = vi.fn(() => {
    throw chunkError
  })
  const root = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => root,
    path: '/route',
    loader,
    component: Object.assign(() => null, { preload }),
    errorComponent: () => null,
  })
  const history = createMemoryHistory({ initialEntries: ['/route'] })
  const router = createTestRouter({
    routeTree: root.addChildren([route]),
    history,
  })
  try {
    await router.load()
    expect(loader).toHaveBeenCalledOnce()
    expect(preload).toHaveBeenCalledOnce()
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'error',
      error: loaderError,
    })
  } finally {
    history.destroy()
  }
})
