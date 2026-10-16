import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

test.each(['success', 'shouldReload error'] as const)(
  'a child immediately observes its fresh cached parent snapshot: %s',
  async (outcome) => {
    const originalError = new Error('shouldReload failed')
    const selectedError = new Error('selected by onError')
    const parentLoader = vi.fn(() => 'cached parent data')
    const onError = vi.fn(() => {
      throw selectedError
    })
    const observed = createControlledPromise<void>()
    const childGate = createControlledPromise<string>()
    let shouldFail = false
    let snapshot: unknown
    const root = new BaseRootRoute({})
    const parent = new BaseRoute({
      getParentRoute: () => root,
      path: '/parent',
      staleTime: Infinity,
      gcTime: Infinity,
      loader: parentLoader,
      shouldReload:
        outcome === 'shouldReload error'
          ? () => {
              if (shouldFail) {
                throw originalError
              }
              return false
            }
          : undefined,
      onError,
      errorComponent: () => null,
    })
    const childLoader = vi.fn(async ({ parentMatchPromise }) => {
      const match = await parentMatchPromise
      snapshot = {
        status: match.status,
        loaderData: match.loaderData,
        invalid: match.invalid,
        isFetching: match.isFetching,
        hasSelectedError: match.error === selectedError,
      }
      observed.resolve()
      return childGate
    })
    const child = new BaseRoute({
      getParentRoute: () => parent,
      path: '/child',
      loader: childLoader,
    })
    const other = new BaseRoute({
      getParentRoute: () => root,
      path: '/other',
    })
    const router = createTestRouter({
      routeTree: root.addChildren([parent.addChildren([child]), other]),
      history: createMemoryHistory({ initialEntries: ['/parent'] }),
      isServer: false,
    })

    await router.load()
    await router.navigate({ to: '/other' })
    shouldFail = true
    let settled = false
    const navigation = router.navigate({ to: '/parent/child' }).then(() => {
      settled = true
    })

    await observed
    expect(settled).toBe(false)
    expect(parentLoader).toHaveBeenCalledOnce()
    expect(childLoader).toHaveBeenCalledOnce()
    expect(snapshot).toEqual({
      status: outcome === 'success' ? 'success' : 'error',
      loaderData: 'cached parent data',
      invalid: outcome !== 'success',
      isFetching: false,
      hasSelectedError: outcome !== 'success',
    })

    childGate.resolve('child data')
    await navigation

    expect(parentLoader).toHaveBeenCalledOnce()
    const parentMatch = router.state.matches.find(
      (match) => match.routeId === parent.id,
    )
    expect(parentMatch?.status).toBe(
      outcome === 'success' ? 'success' : 'error',
    )
    if (outcome === 'success') {
      expect(onError).not.toHaveBeenCalled()
      expect(router.state.matches.at(-1)?.loaderData).toBe('child data')
    } else {
      expect(onError).toHaveBeenCalledExactlyOnceWith(originalError)
      expect(parentMatch?.error).toBe(selectedError)
    }
  },
)
