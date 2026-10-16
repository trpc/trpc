import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
} from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * A settled success stay-match must keep its abortController un-aborted
 * across navigations and invalidations: loaders can hand that signal to
 * still-streaming deferred data (fetch(url, { signal }) consumed via
 * <Await>), and the documented contract only cancels the signal when the
 * route unloads or the loader call becomes outdated. Only pending or
 * actively-fetching matches are cancelled at load start.
 */

function setup(reloadGate?: Promise<void>) {
  let capturedSignal: AbortSignal | undefined
  let deferredRequestAbortCount = 0
  let loaderCalls = 0

  const rootRoute = new BaseRootRoute({})
  const dashboardRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    staleTime: Infinity,
    loader: ({ abortController }: { abortController: AbortController }) => {
      loaderCalls++
      capturedSignal = abortController.signal

      // A common streaming pattern is to return immediately-available data
      // alongside a request consumed later by <Await>. That request must stay
      // alive while this layout is reused, then be cancelled when it unloads.
      const deferredRequest = new Promise<'aborted'>((resolve) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            deferredRequestAbortCount++
            resolve('aborted')
          },
          { once: true },
        )
      })

      const data = { critical: 'dashboard data', deferredRequest }
      return reloadGate && loaderCalls > 1 ? reloadGate.then(() => data) : data
    },
  })
  const settingsRoute = new BaseRoute({
    getParentRoute: () => dashboardRoute,
    path: '/settings',
  })
  const loginRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      dashboardRoute.addChildren([settingsRoute]),
      loginRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  })

  return {
    router,
    dashboardRoute,
    getSignal: () => capturedSignal,
    getDeferredRequestAbortCount: () => deferredRequestAbortCount,
  }
}

describe('stay-match abort scope', () => {
  test('unloading a reused match aborts the signal exposed to its loader', async () => {
    const { router, getSignal, getDeferredRequestAbortCount } = setup()

    await router.load()
    const dashboardLoaderSignal = getSignal()

    // Reusing the dashboard layout for a child must preserve the lifetime of
    // its loader's deferred request.
    await router.navigate({ to: '/dashboard/settings' })
    expect(dashboardLoaderSignal?.aborted).toBe(false)
    expect(getDeferredRequestAbortCount()).toBe(0)

    // Leaving the layout altogether must now cancel that same request.
    await router.navigate({ to: '/login' })
    expect(dashboardLoaderSignal?.aborted).toBe(true)
    expect(getDeferredRequestAbortCount()).toBe(1)
  })

  test('background invalidation keeps the old loader signal until fresh data commits', async () => {
    const reloadGate = createControlledPromise<void>()
    const { router, dashboardRoute, getSignal } = setup(reloadGate)

    await router.load()
    const firstSignal = getSignal()
    expect(firstSignal?.aborted).toBe(false)

    const invalidation = router.invalidate()
    await vi.waitFor(() => expect(getSignal()).not.toBe(firstSignal))
    const replacementSignal = getSignal()

    // The old loader data is still the published generation while the
    // background replacement is private.
    expect(firstSignal?.aborted).toBe(false)
    expect(replacementSignal?.aborted).toBe(false)

    reloadGate.resolve()
    await invalidation
    await vi.waitFor(() => expect(firstSignal?.aborted).toBe(true))
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: dashboardRoute.id,
      status: 'success',
    })
    expect(replacementSignal?.aborted).toBe(false)
  })

  test.each(['beforeLoad', 'shouldReload'] as const)(
    '%s failure replacing a successful stay aborts its loader signal',
    async (failureStage) => {
      const failure = new Error(`${failureStage} failed`)
      const onAbort = vi.fn()
      let shouldFail = false
      let loaderSignal: AbortSignal | undefined

      const rootRoute = new BaseRootRoute({})
      const accountRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/account',
        staleTime: Infinity,
        beforeLoad: () => {
          if (shouldFail && failureStage === 'beforeLoad') {
            throw failure
          }
        },
        shouldReload: () => {
          if (shouldFail && failureStage === 'shouldReload') {
            throw failure
          }
          return false
        },
        loader: ({ abortController }: { abortController: AbortController }) => {
          loaderSignal = abortController.signal
          loaderSignal.addEventListener('abort', onAbort, { once: true })
          return { user: 'Flo' }
        },
        errorComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([accountRoute]),
        history: createMemoryHistory({ initialEntries: ['/account'] }),
      })

      await router.load()
      expect(loaderSignal?.aborted).toBe(false)

      shouldFail = true
      await router.load()

      const match = router.state.matches.find(
        (candidate) => candidate.routeId === accountRoute.id,
      )
      expect(match?.status).toBe('error')
      expect(match?.error).toBe(failure)
      expect(loaderSignal?.aborted).toBe(true)
      expect(onAbort).toHaveBeenCalledTimes(1)
    },
  )

  test('background notFound replacing successful data aborts its old loader signal', async () => {
    let loaderCalls = 0
    let initialSignal: AbortSignal | undefined

    const rootRoute = new BaseRootRoute({})
    const accountRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/account',
      staleTime: Infinity,
      loader: ({ abortController }: { abortController: AbortController }) => {
        loaderCalls++
        if (loaderCalls === 1) {
          initialSignal = abortController.signal
          return { user: 'Flo' }
        }
        throw notFound()
      },
      notFoundComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([accountRoute]),
      history: createMemoryHistory({ initialEntries: ['/account'] }),
    })

    await router.load()
    expect(initialSignal?.aborted).toBe(false)

    await router.invalidate()
    await vi.waitFor(() =>
      expect(router.state.matches.at(-1)?.status).toBe('notFound'),
    )
    expect(initialSignal?.aborted).toBe(true)
  })

  test('decorative background asset failure still transfers loader signal ownership', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let loaderCalls = 0
    const loaderSignals: Array<AbortSignal> = []

    const rootRoute = new BaseRootRoute({})
    const accountRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/account',
      staleTime: Infinity,
      loader: ({ abortController }: { abortController: AbortController }) => {
        loaderSignals.push(abortController.signal)
        return { revision: ++loaderCalls }
      },
      head: ({ loaderData }) => {
        if (loaderData?.revision === 2) {
          throw new Error('fresh head failed')
        }
        return { meta: [{ title: 'account' }] }
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([accountRoute]),
      history: createMemoryHistory({ initialEntries: ['/account'] }),
    })

    await router.load()
    await router.invalidate()

    expect(router.state.matches.at(-1)?.loaderData).toEqual({ revision: 2 })
    expect(loaderSignals).toHaveLength(2)
    expect(loaderSignals[0]?.aborted).toBe(true)
    expect(loaderSignals[1]?.aborted).toBe(false)
  })
})
