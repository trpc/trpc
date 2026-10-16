import { runInNewContext } from 'node:vm'
import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound, redirect } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

describe.each([false, true])('awaitable hooks (server=%s)', (isServer) => {
  test.each(['sync', 'promise', 'foreign promise'])(
    'inherits the result of a %s beforeLoad',
    async (mode) => {
      const value = { token: 'parent context' }
      const root = new BaseRootRoute({
        beforeLoad: () => {
          switch (mode) {
            case 'promise':
              return Promise.resolve(value)
            case 'foreign promise':
              return runInNewContext('Promise.resolve(value)', { value })
            default:
              return value
          }
        },
      })
      const loader = vi.fn(({ context }) => context.token)
      const child = new BaseRoute({
        getParentRoute: () => root,
        path: '/',
        loader,
      })
      const router = createTestRouter({
        routeTree: root.addChildren([child]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer,
      })
      if (isServer) {
        expect((await loadServerResponse(router, '/')).status).toBe(200)
      } else {
        await router.load()
      }
      expect(loader).toHaveBeenCalledOnce()
      expect(router.state.matches.at(-1)?.loaderData).toBe(value.token)
    },
  )
})

test.each(['immediate', 'microtask'] as const)(
  'a %s replacement from beforeLoad does not start its stale loader',
  async (mode) => {
    const root = new BaseRootRoute({})
    const loader = vi.fn()
    const stale = new BaseRoute({
      getParentRoute: () => root,
      path: '/stale',
      beforeLoad: ({ navigate }) => {
        const replace = () => {
          void navigate({ to: '/current' })
        }
        if (mode === 'microtask') {
          queueMicrotask(replace)
        } else {
          replace()
        }
        return { stale: true }
      },
      loader,
    })
    const current = new BaseRoute({
      getParentRoute: () => root,
      path: '/current',
    })
    const router = createTestRouter({
      routeTree: root.addChildren([stale, current]),
      history: createMemoryHistory({ initialEntries: ['/stale'] }),
    })
    await router.load()
    expect(router.state.location.pathname).toBe('/current')
    expect(loader).not.toHaveBeenCalled()
  },
)

test.each(['native', 'foreign'] as const)(
  'supersedes an unresolved %s Promise beforeLoad and observes its late rejection',
  async (mode) => {
    let rejectValue!: (error: Error) => void
    const capture = (_resolve: unknown, reject: typeof rejectValue) => {
      rejectValue = reject
    }
    const pending =
      mode === 'native'
        ? new Promise(capture)
        : runInNewContext('new Promise(capture)', { capture })
    const beforeLoad = vi.fn(() => pending)
    const loader = vi.fn()
    const onError = vi.fn()
    const root = new BaseRootRoute({})
    const stale = new BaseRoute({
      getParentRoute: () => root,
      path: '/stale',
      beforeLoad,
      loader,
      onError,
    })
    const current = new BaseRoute({
      getParentRoute: () => root,
      path: '/current',
    })
    const router = createTestRouter({
      routeTree: root.addChildren([stale, current]),
      history: createMemoryHistory({ initialEntries: ['/stale'] }),
    })
    const staleLoad = router.load()
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledOnce())
    await router.navigate({ to: '/current' })
    await staleLoad
    rejectValue(new Error('late failure'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(router.state.location.pathname).toBe('/current')
    expect(loader).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  },
)

test.each(['throw', 'reject'] as const)(
  'a normal component preload can %s a redirect',
  async (mode) => {
    const root = new BaseRootRoute({})
    const from = new BaseRoute({
      getParentRoute: () => root,
      path: '/from',
      component: Object.assign(() => null, {
        preload: () => {
          const result = redirect({ to: '/to' })
          if (mode === 'throw') {
            throw result
          }
          return Promise.reject(result)
        },
      }) as any,
    })
    const to = new BaseRoute({ getParentRoute: () => root, path: '/to' })
    const router = createTestRouter({
      routeTree: root.addChildren([from, to]),
      history: createMemoryHistory({ initialEntries: ['/from'] }),
    })
    await router.load()
    expect(router.state.location.pathname).toBe('/to')
    expect(router.state.matches.at(-1)?.status).toBe('success')
  },
)

test.each(['throw', 'reject'] as const)(
  'a chunk %s supports reentrant onError control flow',
  async (mode) => {
    for (const control of ['navigate', 'redirect', 'notFound'] as const) {
      const error = new Error('chunk failed')
      const root = new BaseRootRoute({})
      const onError = vi.fn(() => {
        if (control === 'navigate') {
          void router.navigate({ to: '/current' })
        } else if (control === 'redirect') {
          throw redirect({ to: '/current' })
        } else {
          throw notFound()
        }
      })
      const stale = new BaseRoute({
        getParentRoute: () => root,
        path: '/stale',
        component: Object.assign(() => null, {
          preload: () => {
            if (mode === 'throw') {
              throw error
            }
            return Promise.reject(error)
          },
        }) as any,
        notFoundComponent: (() => null) as any,
        loader: control === 'navigate' ? () => 'obsolete data' : undefined,
        onError,
      })
      const current = new BaseRoute({
        getParentRoute: () => root,
        path: '/current',
      })
      const router = createTestRouter({
        routeTree: root.addChildren([stale, current]),
        history: createMemoryHistory({ initialEntries: ['/stale'] }),
      })
      await router.load()
      expect(onError).toHaveBeenCalledExactlyOnceWith(error)
      if (control === 'notFound') {
        expect(router.state.matches.at(-1)?.status).toBe('notFound')
      } else {
        expect(router.state.location.pathname).toBe('/current')
        expect(router.state.matches.at(-1)?.status).toBe('success')
      }
      expect(router._flights?.size ?? 0).toBe(0)
    }
  },
)
