import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, retainSearchParams } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouter, ParsedLocation } from '../src'

// Mirrors what `useLinkProps` does on every location publication: each link
// owns one stable `dest` object, points `_fromLocation` at the new location
// and calls `router.buildLocation(dest)` inside its store selector.

const LINKS = 32

function createBenchRouter(withMiddleware: boolean) {
  const root = new BaseRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      page: Number(search.page ?? 1),
    }),
  })
  const posts = new BaseRoute({
    getParentRoute: () => root,
    path: '/posts',
    // Only routes with middleware get a `search` key, like real route trees.
    ...(withMiddleware
      ? { search: { middlewares: [retainSearchParams(['page'])] } }
      : {}),
  } as any)
  const post = new BaseRoute({
    getParentRoute: () => posts,
    path: '/$postId',
  })
  const edit = new BaseRoute({
    getParentRoute: () => post,
    path: '/edit',
  })
  const history = createMemoryHistory({ initialEntries: ['/posts/1?page=2'] })
  const router = createTestRouter({
    routeTree: root.addChildren([
      posts.addChildren([post.addChildren([edit])]),
    ]),
    history,
    scrollRestoration: false,
  })
  history.destroy()
  return router
}

type Dest = Record<string, unknown> & { _fromLocation?: ParsedLocation }

function publication(router: AnyRouter, dests: Array<Dest>) {
  // A fresh location object per publication, like a committed navigation.
  const location = { ...router.latestLocation }
  let checksum = 0
  for (const dest of dests) {
    dest._fromLocation = location
    checksum += router.buildLocation(dest as any).href.length
  }
  return checksum
}

function defineCase(
  name: string,
  withMiddleware: boolean,
  makeDest: (index: number) => Dest,
  expectedHref: (index: number) => string,
) {
  const router = createBenchRouter(withMiddleware)
  const dests = Array.from({ length: LINKS }, (_, index) => makeDest(index))
  const expected = dests.reduce(
    (sum, _dest, index) => sum + expectedHref(index).length,
    0,
  )
  // Correctness before timing: every link resolves to the expected href.
  dests.forEach((dest, index) => {
    dest._fromLocation = router.latestLocation
    expect(router.buildLocation(dest as any).href).toBe(expectedHref(index))
  })
  let checksum = 0
  bench(
    name,
    () => {
      checksum = publication(router, dests)
    },
    {
      time: 1000,
      warmupTime: 200,
      throws: true,
      teardown: () => {
        expect(checksum).toBe(expected)
      },
    },
  )
}

describe(`buildLocation per publication (${LINKS} links)`, () => {
  defineCase(
    'absolute to + literal params (static cache hit)',
    false,
    (index) => ({ to: '/posts/$postId', params: { postId: String(index) } }),
    (index) => `/posts/${index}`,
  )

  defineCase(
    'absolute to + search updater (reads current search)',
    false,
    (index) => ({
      to: '/posts',
      search: (prev: Record<string, unknown>) => ({ ...prev, page: index }),
    }),
    (index) => `/posts?page=${index}`,
  )

  defineCase(
    'absolute to + search updater + retainSearchParams middleware',
    true,
    (index) => ({
      to: '/posts/$postId',
      params: { postId: String(index) },
      search: () => ({ page: index }),
    }),
    (index) => `/posts/${index}?page=${index}`,
  )

  defineCase(
    'relative to from the current match',
    false,
    (index) => ({
      to: './edit',
      search: (prev: unknown) => prev,
      hash: `h${index}`,
    }),
    (index) => `/posts/1/edit?page=2#h${index}`,
  )

  defineCase(
    'params: true (inherits current params)',
    false,
    (index) => ({ to: '/posts/$postId/edit', params: true, hash: `h${index}` }),
    (index) => `/posts/1/edit#h${index}`,
  )

  defineCase(
    'masked destination',
    false,
    (index) => ({
      to: '/posts/$postId',
      params: { postId: String(index) },
      search: () => ({ page: index }),
      mask: { to: '/posts' },
    }),
    (index) => `/posts/${index}?page=${index}`,
  )
})
