import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
} from '../src'
import { createTestRouter } from './routerTestUtils'

test.each(['success', 'error', 'notFound'] as const)(
  'departure after a background %s preserves lifecycle membership and current data',
  async (outcome) => {
    let revision = 0
    const onLeave = vi.fn()
    const childOnLeave = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        revision++
        if (revision > 1 && outcome !== 'success') {
          throw outcome === 'error' ? new Error('reload failed') : notFound()
        }
        return revision
      },
      errorComponent: () => null,
      notFoundComponent: () => null,
      onLeave,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      onLeave: childOnLeave,
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })
    const history = createMemoryHistory({ initialEntries: ['/parent/child'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
        otherRoute,
      ]),
      history,
    })
    try {
      await router.load()
      await router.invalidate()
      await expect.poll(() => router.state.matches[1]?.status).toBe(outcome)
      if (outcome === 'success') {
        await expect.poll(() => router.state.matches[1]?.loaderData).toBe(2)
      }
      expect(childOnLeave).not.toHaveBeenCalled()
      await router.navigate({ to: '/other' })
      expect(childOnLeave).toHaveBeenCalledOnce()
      expect(onLeave).toHaveBeenCalledOnce()
      expect(onLeave.mock.calls[0]![0]).toMatchObject({
        status: outcome,
        ...(outcome === 'success' && { loaderData: 2 }),
      })
      await router.invalidate()
      expect(childOnLeave).toHaveBeenCalledOnce()
    } finally {
      history.destroy()
    }
  },
)

test('a background boundary keeps the matched branch and its lifecycle stable', async () => {
  let parentLoads = 0
  const parentError = new Error('parent background reload failed')
  const childOnEnter = vi.fn()
  const childOnLeave = vi.fn()

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: () => {
      if (++parentLoads === 2) {
        throw parentError
      }
      return `parent data ${parentLoads}`
    },
    errorComponent: () => null,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: () => {
      return 'child data'
    },
    onEnter: childOnEnter,
    onLeave: childOnLeave,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  await router.load()
  await router.invalidate()

  await expect.poll(() => router.state.matches[1]?.status).toBe('error')

  expect(router.state.matches.map((match) => match.routeId)).toEqual([
    rootRoute.id,
    parentRoute.id,
    childRoute.id,
  ])
  expect(router.state.matches[1]).toMatchObject({
    status: 'error',
    error: parentError,
  })
  expect(router.state.matches[2]).toMatchObject({
    status: 'success',
    loaderData: 'child data',
  })
  expect(childOnEnter).toHaveBeenCalledTimes(1)
  expect(childOnLeave).not.toHaveBeenCalled()

  await router.invalidate()
  await expect.poll(() => router.state.matches[1]?.status).toBe('success')
  expect(childOnEnter).toHaveBeenCalledTimes(1)
  expect(childOnLeave).not.toHaveBeenCalled()
})

test('a background notFound stays private until its parent boundary is ready', async () => {
  const boundaryReady = createControlledPromise<void>()
  const ParentNotFound = Object.assign(() => null, {
    preload: () => boundaryReady,
  })
  let childLoads = 0

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    notFoundComponent: ParentNotFound,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: () => {
      if (++childLoads > 1) {
        throw notFound()
      }
      return 'initial child data'
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  await router.load()
  await router.invalidate({
    filter: (match) => match.routeId === childRoute.id,
  })
  await vi.waitFor(() => expect(childLoads).toBe(2))

  expect(router.state.matches.map((match) => match.status)).toEqual([
    'success',
    'success',
    'success',
  ])

  boundaryReady.resolve()
  await vi.waitFor(() => {
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
      childRoute.id,
    ])
    expect(router.state.matches[1]?.status).toBe('notFound')
    expect(router.state.matches[2]?.status).toBe('success')
  })
})

test('foreground supersession aborts every loader in a background batch', async () => {
  let parentLoads = 0
  let childLoads = 0
  const backgroundSignals: Array<AbortSignal> = []

  const waitForAbort = (signal: AbortSignal) =>
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        },
        { once: true },
      )
    })

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: ({ abortController }) => {
      if (++parentLoads > 1) {
        backgroundSignals.push(abortController.signal)
        return waitForAbort(abortController.signal)
      }
      return 'initial parent data'
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: ({ abortController }) => {
      if (++childLoads > 1) {
        backgroundSignals.push(abortController.signal)
        return waitForAbort(abortController.signal)
      }
      return 'initial child data'
    },
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
      otherRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  await router.load()
  const revalidation = router.invalidate()
  await vi.waitFor(() => expect(backgroundSignals).toHaveLength(2))

  await router.navigate({ to: '/other' })
  await revalidation

  expect(backgroundSignals[0]).not.toBe(backgroundSignals[1])
  expect(backgroundSignals.every((signal) => signal.aborted)).toBe(true)
  expect(router.state.matches.at(-1)?.routeId).toBe(otherRoute.id)
})
