import { runInNewContext } from 'node:vm'
import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test.each(['false', 'data-only', 'default'] as const)(
  'inherits %s SSR through static and functional children',
  async (policy) => {
    for (const mode of [
      'undefined',
      'true',
      'sync',
      'promise',
      'foreign',
      'thenable',
    ]) {
      const loader = vi.fn()
      const root = new BaseRootRoute({
        ssr:
          policy === 'default'
            ? undefined
            : policy === 'false'
              ? false
              : 'data-only',
      })
      const child = new BaseRoute({
        getParentRoute: () => root,
        path: '/',
        ssr:
          mode === 'undefined'
            ? undefined
            : mode === 'true'
              ? true
              : () => {
                  if (mode === 'foreign') {
                    return runInNewContext('Promise.resolve(true)')
                  }
                  if (mode === 'thenable') {
                    return { then: (resolve: any) => resolve(true) } as any
                  }
                  return mode === 'sync' ? true : Promise.resolve(true)
                },
        loader,
      })
      const router = createTestRouter({
        routeTree: root.addChildren([child]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: true,
      })
      router.options.defaultSsr = policy === 'default' ? 'data-only' : true
      expect((await loadServerResponse(router, '/')).status).toBe(200)
      expect(router.state.matches.map((match) => match.ssr)).toEqual(
        policy === 'false' ? [false, false] : ['data-only', 'data-only'],
      )
      expect(loader).toHaveBeenCalledTimes(policy === 'false' ? 0 : 1)
    }
  },
)

test.each(['return', 'throw', 'microtask throw'] as const)(
  'request cancellation wins when an SSR callback aborts then %ss',
  async (mode) => {
    const controller = new AbortController()
    const cancellation = new Error('disconnected')
    const context = vi.fn()
    const loader = vi.fn()
    const onError = vi.fn()
    const root = new BaseRootRoute({
      ssr: () => {
        if (mode === 'microtask throw') {
          queueMicrotask(() => controller.abort(cancellation))
        } else {
          controller.abort(cancellation)
        }
        if (mode !== 'return') {
          throw new Error('obsolete policy error')
        }
        return true
      },
      context,
      loader,
      onError,
    })
    const router = createTestRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })
    await expect(
      loadServerResponse(router, '/', controller.signal),
    ).rejects.toBe(cancellation)
    expect(context).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  },
)
