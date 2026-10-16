import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

const requiredPrefixModes = [
  ['fresh', 'error', false, 'child-first'],
  ['fresh', 'error', true, 'child-first'],
  ['fresh', 'notFound', false, 'child-first'],
  ['fresh', 'notFound', true, 'child-first'],
  ['retained', 'error', false, 'child-first'],
  ['retained', 'notFound', false, 'child-first'],
  ['retained', 'error', false, 'parent-first'],
] as const

describe('concurrent route failure ordering', () => {
  test.each(requiredPrefixModes)(
    'selects the reachable failure (parentData=%s, parent=%s, isServer=%s, order=%s)',
    async (parentData, parentOutcome, isServer, settlementOrder) => {
      const parentFailure =
        parentOutcome === 'error'
          ? new Error('parent loader failed')
          : notFound()
      const childFailure =
        parentOutcome === 'error'
          ? notFound()
          : new Error('child loader failed')
      const childOutcome = parentOutcome === 'error' ? 'notFound' : 'error'
      const parentGate = createControlledPromise<void>()
      const childGate = createControlledPromise<void>()
      const parentStarted = createControlledPromise<void>()
      const childStarted = createControlledPromise<void>()
      const parentSettled = createControlledPromise<void>()
      const childSettled = createControlledPromise<void>()
      const settlements: Array<string> = []
      let failing = parentData === 'fresh'
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        ssr: 'data-only',
        loader: async () => {
          if (!failing) {
            return undefined
          }
          parentStarted.resolve()
          await parentGate
          settlements.push('parent')
          parentSettled.resolve()
          throw parentFailure
        },
        errorComponent: () => null,
        notFoundComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: async () => {
          if (!failing) {
            return 'child data'
          }
          childStarted.resolve()
          await childGate
          settlements.push('child')
          childSettled.resolve()
          throw childFailure
        },
        errorComponent: () => null,
        notFoundComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer,
        defaultStaleReloadMode: 'blocking',
      })

      if (parentData === 'retained') {
        await router.load()
        const parentMatch = router.state.matches.find(
          (match) => match.routeId === parentRoute.id,
        )
        expect(parentMatch).toMatchObject({
          routeId: parentRoute.id,
          status: 'success',
          loaderData: undefined,
        })
        failing = true
      }

      const responsePromise = isServer
        ? loadServerResponse(router, '/parent/child')
        : (parentData === 'retained'
            ? router.invalidate()
            : router.load()
          ).then(() => undefined)
      await Promise.all([parentStarted, childStarted])
      if (settlementOrder === 'child-first') {
        childGate.resolve()
        await childSettled
        parentGate.resolve()
        await parentSettled
      } else {
        parentGate.resolve()
        await parentSettled
        childGate.resolve()
        await childSettled
      }
      const response = await responsePromise

      const parentWon =
        parentData === 'fresh' || settlementOrder === 'parent-first'
      const selectedOutcome = parentWon ? parentOutcome : childOutcome
      const selectedFailure = parentWon ? parentFailure : childFailure
      if (isServer) {
        expect(response?.status).toBe(selectedOutcome === 'error' ? 500 : 404)
      }
      expect(settlements).toEqual(
        settlementOrder === 'child-first'
          ? ['child', 'parent']
          : ['parent', 'child'],
      )
      const terminalMatch = router.state.matches.find(
        (match) => match.status === 'error' || match.status === 'notFound',
      )
      expect(terminalMatch).toMatchObject({
        routeId: parentWon ? parentRoute.id : childRoute.id,
        status: selectedOutcome,
        error: selectedFailure,
      })
      expect(router.state.status).toBe('idle')
    },
  )

  test.each([false, true])(
    'recomputes chunk readiness after a notFound ancestor promotes to root (isServer=%s)',
    async (isServer) => {
      const chunkError = new Error('intermediate lazy chunk failed')
      const childError = new Error('child loader failed')
      const rootNotFound = notFound()
      const ancestorGate = createControlledPromise<void>()
      const childGate = createControlledPromise<void>()
      const ancestorStarted = createControlledPromise<void>()
      const childStarted = createControlledPromise<void>()
      const ancestorSettled = createControlledPromise<void>()
      const childSettled = createControlledPromise<void>()
      const settlements: Array<string> = []
      const intermediateLazy = vi.fn(() => Promise.reject(chunkError))
      const rootRoute = new BaseRootRoute({
        notFoundComponent: () => null,
      })
      const intermediateRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/intermediate',
        errorComponent: () => null,
      }).lazy(intermediateLazy)
      const ancestorRoute = new BaseRoute({
        getParentRoute: () => intermediateRoute,
        path: '/ancestor',
        loader: async () => {
          ancestorStarted.resolve()
          await ancestorGate
          settlements.push('ancestor')
          ancestorSettled.resolve()
          throw rootNotFound
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => ancestorRoute,
        path: '/child',
        loader: async () => {
          childStarted.resolve()
          await childGate
          settlements.push('child')
          childSettled.resolve()
          throw childError
        },
        errorComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          intermediateRoute.addChildren([
            ancestorRoute.addChildren([childRoute]),
          ]),
        ]),
        history: createMemoryHistory({
          initialEntries: ['/intermediate/ancestor/child'],
        }),
        isServer,
      })

      const responsePromise = isServer
        ? loadServerResponse(router, '/intermediate/ancestor/child')
        : router.load().then(() => undefined)
      await Promise.all([ancestorStarted, childStarted])
      childGate.resolve()
      await childSettled
      ancestorGate.resolve()
      await ancestorSettled
      const response = await responsePromise

      if (isServer) {
        expect(response?.status).toBe(404)
      }
      expect(settlements).toEqual(['child', 'ancestor'])
      expect(intermediateLazy).toHaveBeenCalled()
      expect(
        router.state.matches.find((match) => match.routeId === rootRoute.id),
      ).toMatchObject({
        status: 'success',
        error: rootNotFound,
      })
      expect(
        router.state.matches.some((match) => match.error === chunkError),
      ).toBe(false)
    },
  )

  test.each([
    [false, 'beforeLoad'],
    [false, 'loader'],
    [true, 'beforeLoad'],
    [true, 'loader'],
  ] as const)(
    'keeps a resolved notFound boundary stable within one load (isServer=%s, phase=%s)',
    async (isServer, phase) => {
      const lazyError = new Error('lazy boundary lookup failed')
      const notFoundError = notFound()
      const resolveAt = phase === 'beforeLoad' ? 2 : 3
      let lazyCalls = 0
      const rootRoute = new BaseRootRoute({
        notFoundComponent: () => null,
      })
      const intermediateRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/intermediate',
      }).lazy(() => {
        lazyCalls++
        if (lazyCalls < resolveAt) {
          return Promise.reject(lazyError)
        }
        return Promise.resolve({
          options: { notFoundComponent: () => null },
        } as any)
      })
      function throwNotFound() {
        throw notFoundError
      }
      const childRoute = new BaseRoute({
        getParentRoute: () => intermediateRoute,
        path: '/child',
        beforeLoad: phase === 'beforeLoad' ? throwNotFound : undefined,
        loader: phase === 'loader' ? throwNotFound : undefined,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          intermediateRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({
          initialEntries: ['/intermediate/child'],
        }),
        isServer,
      })

      const response = isServer
        ? await loadServerResponse(router, '/intermediate/child')
        : await router.load().then(() => undefined)

      if (isServer) {
        expect(response?.status).toBe(404)
      }
      expect(lazyCalls).toBe(!isServer && phase === 'loader' ? 2 : 1)
      expect(
        router.state.matches.find((match) => match.error === notFoundError)
          ?.routeId,
      ).toBe(rootRoute.id)
    },
  )

  test('a redirect aborts every generation in its discarded server lane', async () => {
    const signals: Array<AbortSignal> = []
    const rootRoute = new BaseRootRoute({
      loader: ({ abortController }) => {
        signals.push(abortController.signal)
        return 'root data'
      },
    })
    const redirectRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/redirect',
      loader: ({ abortController }) => {
        signals.push(abortController.signal)
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([redirectRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/redirect'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/redirect')

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/target')
    expect(signals).toHaveLength(2)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  test('a started descendant can redirect after its ancestor fails', async () => {
    const childStarted = createControlledPromise<void>()
    const childRedirect = createControlledPromise<void>()
    const parentError = new Error('parent failed')
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: async () => {
        await childStarted
        throw parentError
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async () => {
        childStarted.resolve()
        await childRedirect
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })

    const responsePromise = loadServerResponse(router, '/parent/child')
    await childStarted
    childRedirect.resolve()
    const response = await responsePromise

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/target')
  })

  test('a redirect does not abort a later server generation on the same router', async () => {
    let generation = 0
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: () => {
        generation++
        if (generation === 2) {
          throw redirect({ to: '/target' })
        }
        return `data ${generation}`
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: true,
    })

    expect((await loadServerResponse(router, '/page')).status).toBe(200)
    expect((await loadServerResponse(router, '/page')).status).toBe(307)
    expect((await loadServerResponse(router, '/page')).status).toBe(200)

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      loaderData: 'data 3',
    })
  })

  test.each([false, true])(
    'an aborted child does not report its cancellation through onError (isServer=%s)',
    async (isServer) => {
      const childStarted = createControlledPromise<void>()
      const childLoader = createControlledPromise<never>()
      const cancellation = new Error('discarded request aborted')
      const childOnError = vi.fn()
      let childSignal: AbortSignal | undefined
      const rootRoute = new BaseRootRoute({})
      const sourceRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/source',
        loader: async () => {
          await childStarted
          throw redirect({ to: '/target' })
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => sourceRoute,
        path: '/child',
        loader: ({ abortController }) => {
          childSignal = abortController.signal
          abortController.signal.addEventListener(
            'abort',
            () => childLoader.reject(cancellation),
            { once: true },
          )
          childStarted.resolve()
          return childLoader
        },
        onError: childOnError,
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          sourceRoute.addChildren([childRoute]),
          targetRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/source/child'] }),
        isServer,
      })

      const childCancellation = expect(childLoader).rejects.toBe(cancellation)
      const loadPromise = isServer
        ? loadServerResponse(router, '/source/child')
        : router.load().then(() => undefined)
      const [response] = await Promise.all([loadPromise, childCancellation])

      expect(childSignal?.aborted).toBe(true)
      expect(childOnError).not.toHaveBeenCalled()
      if (isServer) {
        expect(response?.status).toBe(307)
        expect(response?.headers.get('Location')).toBe('/target')
      } else {
        expect(router.state.location.pathname).toBe('/target')
        expect(router.state.matches.at(-1)).toMatchObject({
          routeId: targetRoute.id,
          status: 'success',
        })
      }
    },
  )
})
