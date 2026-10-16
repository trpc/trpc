import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, trimPathRight } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Repro for https://github.com/TanStack/router/issues/6371
 *
 * Entering a route directly via URL without search params, while
 * validateSearch supplies defaults, makes the framework Transitioner commit a
 * canonical replace-navigation (URL with the defaulted search) right after
 * the mount load already started. The canonical pass may reuse that loader
 * generation, and the URL-only replacement must not abort it or surface an
 * AbortError.
 */

describe('issue #6371: search default normalization aborts the mount load silently', () => {
  test('canonical replace after validateSearch defaults does not surface AbortError', async () => {
    const invocations: Array<{ resolve: () => void; signal: AbortSignal }> = []

    const rootRoute = new BaseRootRoute({})
    const aboutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      validateSearch: (search: Record<string, unknown>) => ({
        page: typeof search.page === 'number' ? search.page : 1,
      }),
      loader: ({ abortController }: { abortController: AbortController }) =>
        new Promise<string>((resolve, reject) => {
          invocations.push({
            resolve: () => resolve('about data'),
            signal: abortController.signal,
          })
          abortController.signal.addEventListener('abort', () => {
            const abortError = new Error('signal is aborted without reason')
            abortError.name = 'AbortError'
            reject(abortError)
          })
        }),
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/about'] }),
    })

    // Mount load for the raw URL (no search params in the href yet).
    const initialLoad = router.load()
    await vi.waitFor(() => expect(invocations.length).toBe(1))

    // What the framework Transitioner does on mount: rebuild the canonical
    // location with validated search and replace if the public href differs.
    const nextLocation = router.buildLocation({
      to: router.latestLocation.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
      _includeValidateSearch: true,
    } as any)

    expect(nextLocation.publicHref).toContain('page=1')
    expect(trimPathRight(router.latestLocation.publicHref)).not.toBe(
      trimPathRight(nextLocation.publicHref),
    )

    // In core (no history subscribers) commitLocation starts the second load.
    void router.commitLocation({ ...nextLocation, replace: true } as any)

    await Promise.resolve()
    expect(invocations).toHaveLength(1)
    expect(invocations[0]!.signal.aborted).toBe(false)

    for (const match of router.state.matches) {
      expect(match.status).not.toBe('error')
      expect((match.error as Error | undefined)?.name).not.toBe('AbortError')
    }

    invocations[0]!.resolve()
    // Awaiting the superseded mount load also awaits the superseding chain.
    await initialLoad

    expect(invocations).toHaveLength(1)

    const aboutMatch = router.state.matches.find(
      (match) => match.routeId === aboutRoute.id,
    )!
    expect(aboutMatch.status).toBe('success')
    expect(aboutMatch.error).toBeUndefined()
    expect(aboutMatch.loaderData).toBe('about data')
    expect(aboutMatch.search).toEqual({ page: 1 })

    expect(router.state.location.search).toEqual({ page: 1 })
    expect(router.latestLocation.publicHref).toContain('page=1')
  })
})
