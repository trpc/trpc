import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/7379
//
// On a direct (initial) load, head({ matches }) must observe loaderData and
// context on every ancestor match so a breadcrumb-style title can be built.
describe('issue #7379: head({ matches }) has loaderData and context on direct load', () => {
  test('initial load executes head after loaders with populated matches', async () => {
    const seenMatches: Array<
      Array<{ routeId: string; loaderData: unknown; context: unknown }>
    > = []

    const rootRoute = new BaseRootRoute({})
    const nestedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async () => {
        await Promise.resolve()
        return { section: 'nested-section' }
      },
      loader: async () => {
        await Promise.resolve()
        return { crumb: 'Nested' }
      },
    })
    const evenRoute = new BaseRoute({
      getParentRoute: () => nestedRoute,
      path: 'even',
      loader: async () => {
        await Promise.resolve()
        return { crumb: 'Even' }
      },
      head: ({ matches }) => {
        seenMatches.push(
          matches.map((match) => ({
            routeId: match.routeId,
            loaderData: match.loaderData,
            context: match.context,
          })),
        )
        const crumbs = matches
          .map((match) => match.loaderData?.crumb)
          .filter(Boolean)
        return {
          meta: [{ title: [...crumbs, 'Company Inc.'].join(' - ') }],
        }
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([nestedRoute.addChildren([evenRoute])]),
      history: createMemoryHistory({ initialEntries: ['/nested/even'] }),
    })

    // Direct load: this is the first and only load of the router.
    await router.load()

    expect(seenMatches.length).toBeGreaterThan(0)
    const seen = seenMatches.at(-1)!

    const seenNested = seen.find((entry) => entry.routeId === nestedRoute.id)
    const seenEven = seen.find((entry) => entry.routeId === evenRoute.id)

    // loaderData is present on every match handed to head().
    expect(seenNested?.loaderData).toEqual({ crumb: 'Nested' })
    expect(seenEven?.loaderData).toEqual({ crumb: 'Even' })

    // context (incl. beforeLoad context) is present as well.
    expect(seenNested?.context).toMatchObject({ section: 'nested-section' })
    expect(seenEven?.context).toMatchObject({ section: 'nested-section' })

    // The breadcrumb title is complete on the committed match.
    const evenMatch = router.state.matches.find(
      (match) => match.routeId === evenRoute.id,
    )
    expect(evenMatch?.meta).toEqual([{ title: 'Nested - Even - Company Inc.' }])
  })
})
