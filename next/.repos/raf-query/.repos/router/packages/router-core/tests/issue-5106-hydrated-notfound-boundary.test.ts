import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, isNotFound } from '../src'
import { hydrate } from '../src/ssr/client'
import { dehydrateSsrMatchId } from '../src/ssr/ssr-match-id'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { Manifest } from '../src/manifest'

const testManifest: Manifest = { routes: {} }

// The child-owned case is supplemental Core state coverage for
// https://github.com/TanStack/router/issues/5106. The reported rendered React
// hydration symptom is not observable at this layer. The ancestor-owned case
// is a generic terminal-prefix invariant, not an issue #5106 reproduction.
describe('hydrated notFound boundary coverage', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    ;(global as any).window = mockWindow
  })

  afterEach(() => {
    delete (global as any).window
    vi.restoreAllMocks()
  })

  it('#5106 existing behavior: adopts a child-owned boundary without invoking its loaders during hydration', async () => {
    const postsLoader = vi.fn(() => 'posts-data')
    const postLoader = vi.fn(() => 'post-data')
    const history = createMemoryHistory({
      initialEntries: ['/posts/i-do-not-exist'],
    })

    const rootRoute = new BaseRootRoute({})
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      loader: postsLoader,
      component: () => 'Posts',
    })
    const postRoute = new BaseRoute({
      getParentRoute: () => postsRoute,
      path: '/$postId',
      loader: postLoader,
      component: () => 'Post',
      notFoundComponent: () => 'Post not found',
    })
    const safeLoader = vi.fn(() => 'safe-data')
    const safeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/safe',
      loader: safeLoader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        postsRoute.addChildren([postRoute]),
        safeRoute,
      ]),
      history,
      isServer: false,
    })

    const matches = router.matchRoutes(router.stores.location.get())
    expect(matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      postsRoute.id,
      postRoute.id,
    ])

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        // This synthetic payload models a child-owned boundary, so its
        // terminal prefix includes the child match.
        matches: [
          {
            i: dehydrateSsrMatchId(matches[0]!.id),
            s: 'success' as const,
            ssr: true,
            u: Date.now(),
          },
          {
            i: dehydrateSsrMatchId(matches[1]!.id),
            s: 'success' as const,
            l: 'posts-data',
            ssr: true,
            u: Date.now(),
          },
          {
            i: dehydrateSsrMatchId(matches[2]!.id),
            s: 'notFound' as const,
            e: { isNotFound: true },
            ssr: true,
            u: Date.now(),
          },
        ],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(router)

    const stateMatches = router.state.matches
    expect(router.state.location.pathname).toBe('/posts/i-do-not-exist')
    expect(router.state.isLoading).toBe(false)
    expect(stateMatches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      postsRoute.id,
      postRoute.id,
    ])

    // The parent keeps the data and status supplied by the payload.
    expect(stateMatches[1]!.status).toBe('success')
    expect(stateMatches[1]!.loaderData).toBe('posts-data')

    // The child is adopted as the notFound boundary.
    expect(stateMatches[2]!.status).toBe('notFound')
    expect(isNotFound(stateMatches[2]!.error)).toBe(true)

    // Hydration does not invoke either route loader represented by the
    // payload.
    expect(postsLoader).not.toHaveBeenCalled()
    expect(postLoader).not.toHaveBeenCalled()
    expect(safeLoader).not.toHaveBeenCalled()

    // Supplemental public liveness coverage: a later client navigation still
    // completes. This does not exercise React's rendered hydration boundary.
    await router.navigate({ to: '/safe' })
    expect(router.state.location.pathname).toBe('/safe')
    expect(router.state.isLoading).toBe(false)
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      safeRoute.id,
    ])
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: safeRoute.id,
      status: 'success',
      loaderData: 'safe-data',
    })
    expect(safeLoader).toHaveBeenCalledTimes(1)
    expect(postsLoader).not.toHaveBeenCalled()
    expect(postLoader).not.toHaveBeenCalled()
  })

  it('generic terminal-prefix invariant: adopts an ancestor-owned boundary without presenting the omitted child', async () => {
    const postsLoader = vi.fn(() => 'posts-data')
    const postLoader = vi.fn(() => 'post-data')
    const history = createMemoryHistory({
      initialEntries: ['/posts/i-do-not-exist'],
    })

    const rootRoute = new BaseRootRoute({})
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      loader: postsLoader,
      component: () => 'Posts',
      notFoundComponent: () => 'Posts not found',
    })
    // The child has no notFoundComponent, so the synthetic payload below
    // represents the parent as the selected boundary and omits the child.
    const postRoute = new BaseRoute({
      getParentRoute: () => postsRoute,
      path: '/$postId',
      loader: postLoader,
      component: () => 'Post',
    })
    const safeLoader = vi.fn(() => 'safe-data')
    const safeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/safe',
      loader: safeLoader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        postsRoute.addChildren([postRoute]),
        safeRoute,
      ]),
      history,
      isServer: false,
    })

    const matches = router.matchRoutes(router.stores.location.get())
    expect(matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      postsRoute.id,
      postRoute.id,
    ])

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        // The represented terminal lane is capped at the parent boundary.
        matches: [
          {
            i: dehydrateSsrMatchId(matches[0]!.id),
            s: 'success' as const,
            ssr: true,
            u: Date.now(),
          },
          {
            i: dehydrateSsrMatchId(matches[1]!.id),
            s: 'notFound' as const,
            l: 'posts-data',
            e: { isNotFound: true },
            ssr: true,
            u: Date.now(),
          },
        ],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(router)

    // Hydration reconstructs the complete branch but executes only the
    // represented terminal prefix.
    const stateMatches = router.state.matches
    expect(router.state.location.pathname).toBe('/posts/i-do-not-exist')
    expect(router.state.isLoading).toBe(false)
    expect(stateMatches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      postsRoute.id,
      postRoute.id,
    ])
    expect(stateMatches[1]!.routeId).toBe(postsRoute.id)
    expect(stateMatches[1]!.status).toBe('notFound')
    expect(isNotFound(stateMatches[1]!.error)).toBe(true)
    // The boundary keeps the parent loader data supplied by the payload.
    expect(stateMatches[1]!.loaderData).toBe('posts-data')
    expect(stateMatches[2]).toMatchObject({
      routeId: postRoute.id,
      status: 'pending',
    })

    // Neither the omitted child nor the represented parent runs client-side.
    expect(postLoader).not.toHaveBeenCalled()
    expect(postsLoader).not.toHaveBeenCalled()
    expect(safeLoader).not.toHaveBeenCalled()

    // A later client navigation remains usable after adopting the prefix.
    await router.navigate({ to: '/safe' })
    expect(router.state.location.pathname).toBe('/safe')
    expect(router.state.isLoading).toBe(false)
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      safeRoute.id,
    ])
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: safeRoute.id,
      status: 'success',
      loaderData: 'safe-data',
    })
    expect(safeLoader).toHaveBeenCalledTimes(1)
    expect(postLoader).not.toHaveBeenCalled()
    expect(postsLoader).not.toHaveBeenCalled()
  })
})
