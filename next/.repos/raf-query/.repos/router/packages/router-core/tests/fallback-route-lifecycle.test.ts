import { createMemoryHistory } from '@tanstack/history'
import { expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test('an explicitly targeted not-found owner remains lifecycle-active', async () => {
  const onEnter = vi.fn()
  const rootRoute = new BaseRootRoute({
    beforeLoad: () => {
      throw notFound({ routeId: '/child' })
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    notFoundComponent: () => null,
    onEnter,
  })
  const history = createMemoryHistory({ initialEntries: ['/child'] })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history,
  })
  try {
    await router.load()
    expect(onEnter).toHaveBeenCalledOnce()
  } finally {
    history.destroy()
  }
})

test.each(['client', 'server'] as const)(
  '%s lifecycle follows the active branch through fallback transitions',
  async (environment) => {
    for (const fallback of ['error', 'notFound', 'fuzzy'] as const) {
      for (const boundary of ['root', 'parent', 'child'] as const) {
        const events: Array<string> = []
        let failed = false
        const callbacks = (name: string) => ({
          onEnter: () => {
            events.push(`enter:${name}`)
          },
          onStay: () => {
            events.push(`stay:${name}`)
          },
          onLeave: () => {
            events.push(`leave:${name}`)
          },
        })
        const boundaryOptions = (name: string) =>
          name === boundary
            ? {
                errorComponent: () => null,
                notFoundComponent: () => null,
                beforeLoad: () => {
                  if (failed && fallback !== 'fuzzy') {
                    throw fallback === 'error'
                      ? new Error('unavailable')
                      : notFound()
                  }
                },
              }
            : {}
        const rootRoute = new BaseRootRoute({
          ...callbacks('root'),
          ...boundaryOptions('root'),
        })
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          ...callbacks('parent'),
          ...boundaryOptions('parent'),
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: 'child',
          ...callbacks('child'),
          ...boundaryOptions('child'),
        })
        const otherRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/other',
          ...callbacks('other'),
        })
        const history = createMemoryHistory({ initialEntries: ['/other'] })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([
            parentRoute.addChildren([childRoute]),
            otherRoute,
          ]),
          history,
          isServer: environment === 'server',
        })
        const visit = async (path: string) => {
          events.length = 0
          if (environment === 'server') {
            const response = await loadServerResponse(router, path)
            expect(response.status).toBe(
              failed && path !== '/other'
                ? fallback === 'error'
                  ? 500
                  : 404
                : 200,
            )
          } else {
            await router.navigate({ to: path })
          }
        }

        const active =
          boundary === 'root'
            ? ['root']
            : boundary === 'parent'
              ? ['root', 'parent']
              : ['root', 'parent', 'child']
        const hidden =
          boundary === 'root'
            ? ['parent', 'child']
            : boundary === 'parent'
              ? ['child']
              : []
        try {
          await visit('/parent/child')
          expect(events).toEqual(['enter:root', 'enter:parent', 'enter:child'])

          failed = true
          const missingPath =
            fallback === 'fuzzy' ? '/parent/child/missing' : '/parent/child'
          await visit(`${missingPath}?step=1`)
          expect(events).toEqual([
            ...hidden.map((name) => `leave:${name}`),
            ...active.map((name) => `stay:${name}`),
          ])
          // Matching still includes the child; only its lifecycle is hidden.
          expect(router.state.matches.map((match) => match.routeId)).toContain(
            childRoute.id,
          )

          await visit(`${missingPath}?step=2`)
          expect(events).toEqual(active.map((name) => `stay:${name}`))

          failed = false
          await visit('/parent/child')
          expect(events).toEqual([
            ...active.map((name) => `stay:${name}`),
            ...hidden.map((name) => `enter:${name}`),
          ])

          failed = true
          await visit(`${missingPath}?step=3`)
          expect(events).toEqual([
            ...hidden.map((name) => `leave:${name}`),
            ...active.map((name) => `stay:${name}`),
          ])

          failed = false
          await visit('/other')
          expect(events).toEqual([
            ...active
              .filter((name) => name !== 'root')
              .map((name) => `leave:${name}`),
            'stay:root',
            'enter:other',
          ])
        } finally {
          history.destroy()
        }
      }
    }
  },
)

test('publication supersession keeps lifecycle membership with the published branch', async () => {
  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: 'child',
  })
  const leafRoute = new BaseRoute({
    getParentRoute: () => childRoute,
    path: 'leaf',
  })
  const shortEnter = vi.fn()
  const otherEnter = vi.fn()
  const shortRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/short',
    onEnter: shortEnter,
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    onEnter: otherEnter,
  })
  const history = createMemoryHistory({
    initialEntries: ['/parent/child/leaf'],
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([childRoute.addChildren([leafRoute])]),
      shortRoute,
      otherRoute,
    ]),
    history,
  })
  const publish = router.stores.setMatches.bind(router.stores)
  let successor: Promise<void> | undefined
  try {
    await router.load()
    router.stores.setMatches = (matches) => {
      publish(matches)
      if (
        !successor &&
        router._committed === matches &&
        matches.at(-1)?.routeId === shortRoute.id
      ) {
        successor = router.navigate({ to: '/other' })
      }
    }
    await router.navigate({ to: '/short' })
    expect(successor).toBeDefined()
    await successor
    expect(router.state.location.pathname).toBe('/other')
    expect(shortEnter).not.toHaveBeenCalled()
    expect(otherEnter).toHaveBeenCalledOnce()
  } finally {
    router.stores.setMatches = publish
    history.destroy()
  }
})

test.each([
  ['error', false],
  ['error', true],
  ['notFound', false],
  ['notFound', true],
] as const)(
  'invalidation preserves the previous %s lifecycle boundary (forcePending: %s)',
  async (fallback, forcePending) => {
    const events: Array<string> = []
    let failed = true
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      errorComponent: () => null,
      notFoundComponent: () => null,
      beforeLoad: () => {
        if (failed) {
          throw fallback === 'error' ? new Error('unavailable') : notFound()
        }
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: 'child',
      onEnter: () => {
        events.push('enter')
      },
      onStay: () => {
        events.push('stay')
      },
      onLeave: () => {
        events.push('leave')
      },
    })
    const history = createMemoryHistory({ initialEntries: ['/parent/child'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history,
    })
    try {
      await router.load()
      expect(events).toEqual([])
      await router.invalidate({ forcePending })
      expect(events).toEqual([])
      failed = false
      await router.invalidate({ forcePending })
      expect(events).toEqual(['enter'])
    } finally {
      history.destroy()
    }
  },
)
