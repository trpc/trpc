import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TanStackRouterDevtoolsPanelCore } from '../src/TanStackRouterDevtoolsPanelCore'
import type { AnyRouteMatch, AnyRouter } from '@tanstack/router-core'

function createCachedMatch(loaderData: string): AnyRouteMatch {
  return {
    id: 'cached-match',
    routeId: '/cached',
    pathname: '/cached',
    params: {},
    search: {},
    status: 'success',
    isFetching: false,
    updatedAt: Date.now(),
    loaderData,
  } as AnyRouteMatch
}

describe('cached matches', () => {
  let panel: TanStackRouterDevtoolsPanelCore | undefined

  // Warm Vite's lazy transform of the panel chunk outside any test so its
  // cost never counts against a test's timeout budget on slow CI runners.
  beforeAll(async () => {
    await import('../src/BaseTanStackRouterDevtoolsPanel')
  }, 30_000)

  afterEach(() => {
    panel?.unmount()
    panel = undefined
    document.body.innerHTML = ''
    try {
      window.localStorage.clear()
    } catch {}
    vi.useRealTimers()
  })

  it('uses the default gc time and refreshes replaced cache entries', async () => {
    vi.useFakeTimers()

    const route = {
      id: '/cached',
      path: 'cached',
      fullPath: '/cached',
      rank: 0,
      children: [],
      options: { loader: () => undefined },
    }
    const routeTree = {
      id: '__root__',
      path: '/',
      fullPath: '/',
      rank: 0,
      children: [route],
      options: {},
    }
    const cache = new Map([['cached-match', createCachedMatch('old data')]])
    const router = {
      _cache: cache,
      routeTree,
      routesById: {
        __root__: routeTree,
        '/cached': route,
      },
      options: {},
      navigate: vi.fn(),
    } as unknown as AnyRouter
    const routerState = {
      location: {
        href: '/',
        pathname: '/',
        search: {},
        searchStr: '',
        hash: '',
      },
      matches: [],
    }
    const container = document.createElement('div')
    document.body.append(container)

    panel = new TanStackRouterDevtoolsPanelCore({ router, routerState })
    panel.mount(container)

    await vi.waitFor(() => {
      expect(
        container.querySelector(
          '[aria-label="Open match details for cached-match"]',
        ),
      ).not.toBeNull()
    })
    expect(container.textContent).toContain('5min')

    const cachedMatch = container.querySelector(
      '[aria-label="Open match details for cached-match"]',
    ) as HTMLElement
    cachedMatch.click()
    expect(container.textContent).toContain('old data')

    cache.set('cached-match', createCachedMatch('new data'))
    await vi.advanceTimersByTimeAsync(500)

    expect(container.textContent).toContain('new data')
    expect(container.textContent).not.toContain('old data')
  }, 10_000)
})
