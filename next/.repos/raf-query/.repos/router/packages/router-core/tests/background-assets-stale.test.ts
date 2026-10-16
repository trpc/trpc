import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('background decorative asset failure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('commits fresh loader data while preserving the previous projected assets', async () => {
    const projectionError = new Error('head projection failed')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolveStaleReload!: (data: { title: string }) => void
    let loaderCalls = 0
    const loader = () => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'old' }
      }

      return new Promise<{ title: string }>((resolve) => {
        resolveStaleReload = resolve
      })
    }

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head: ({ loaderData }) => {
        // The loader always resolves before head runs in this test, so
        // loaderData is never undefined here.
        if (loaderData!.title === 'fresh') {
          throw projectionError
        }

        return {
          meta: [{ title: loaderData!.title }],
        }
      },
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    const matchId = router.state.matches.find(
      (match) => match.routeId === fooRoute.id,
    )!.id
    const getMatch = () =>
      router.state.matches.find((match) => match.id === matchId)

    expect(getMatch()?.loaderData).toEqual({ title: 'old' })
    expect(getMatch()?.meta).toEqual([{ title: 'old' }])

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loaderCalls).toBe(2))

    resolveStaleReload({ title: 'fresh' })
    await vi.waitFor(() =>
      expect(getMatch()?.loaderData).toEqual({ title: 'fresh' }),
    )

    expect(getMatch()?.meta).toEqual([{ title: 'old' }])
    expect(log).toHaveBeenCalledWith(projectionError)
  })
})
