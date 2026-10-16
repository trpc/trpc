import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

afterEach(() => {
  vi.useRealTimers()
})

function abortAwareGate(signal: AbortSignal): Promise<void> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      },
      { once: true },
    )
  })
}

describe('adversarial client lane ownership', () => {
  test('a navigation started by a pre-load listener supersedes the emitting load before it can continue', async () => {
    const firstBeforeLoad = vi.fn()
    const secondBeforeLoad = vi.fn()
    const firstLoader = vi.fn(() => 'first data')
    const secondLoader = vi.fn(() => 'second data')

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/first',
      beforeLoad: firstBeforeLoad,
      loader: firstLoader,
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/second',
      beforeLoad: secondBeforeLoad,
      loader: secondLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const beforeLoadLocations: Array<string> = []
    router.subscribe('onBeforeLoad', (event) => {
      beforeLoadLocations.push(event.toLocation.pathname)
    })
    router.subscribe('onBeforeNavigate', (event) => {
      if (event.toLocation.pathname === '/first') {
        void router.navigate({ to: '/second' })
      }
    })

    await router.navigate({ to: '/first' })

    expect(router.state.location.pathname).toBe('/second')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: secondRoute.id,
      status: 'success',
    })
    expect(beforeLoadLocations).toEqual(['/second'])
    expect(firstBeforeLoad).not.toHaveBeenCalled()
    expect(firstLoader).not.toHaveBeenCalled()
    expect(secondBeforeLoad).toHaveBeenCalledTimes(1)
    expect(secondLoader).toHaveBeenCalledTimes(1)
  })

  test.each(['onBeforeNavigate', 'onBeforeLoad'] as const)(
    'a throwing %s listener cannot interrupt later listeners or navigation finalization',
    async (eventType) => {
      const listenerError = new Error(`${eventType} listener failed`)
      const laterListener = vi.fn()

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const targetLoader = vi.fn(() => 'target data')
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        loader: targetLoader,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()
      router.subscribe(eventType, () => {
        throw listenerError
      })
      router.subscribe(eventType, laterListener)

      await router.navigate({ to: '/target' })

      expect(laterListener).toHaveBeenCalledTimes(1)
      expect(router.state.location.pathname).toBe('/target')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: targetRoute.id,
        status: 'success',
      })
      expect(targetLoader).toHaveBeenCalledTimes(1)
    },
  )

  test('superseding a published pending lane diffs lifecycle hooks from the last final lane', async () => {
    const aOnLeave = vi.fn()
    const bOnEnter = vi.fn()
    const bOnLeave = vi.fn()
    const cOnEnter = vi.fn()

    const rootRoute = new BaseRootRoute({})
    const aRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      onLeave: aOnLeave,
    })
    const bRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/b',
      pendingMs: 0,
      pendingComponent: () => null,
      loader: ({ abortController }) => abortAwareGate(abortController.signal),
      onEnter: bOnEnter,
      onLeave: bOnLeave,
    })
    const cRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/c',
      onEnter: cOnEnter,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([aRoute, bRoute, cRoute]),
      history: createMemoryHistory({ initialEntries: ['/a'] }),
    })

    await router.load()
    aOnLeave.mockClear()

    const bNavigation = router.navigate({ to: '/b' })
    await vi.waitFor(() =>
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: bRoute.id,
        status: 'pending',
      }),
    )

    await router.navigate({ to: '/c' })
    await bNavigation

    expect(router.state.matches.at(-1)?.routeId).toBe(cRoute.id)
    expect(aOnLeave).toHaveBeenCalledTimes(1)
    expect(bOnEnter).not.toHaveBeenCalled()
    expect(bOnLeave).not.toHaveBeenCalled()
    expect(cOnEnter).toHaveBeenCalledTimes(1)
  })

  test('supersession cancels lazy not-found boundary lookup without leaking pending ownership', async () => {
    const lazyStarted = createControlledPromise<void>()
    const lazyGate = createControlledPromise<any>()
    const safeHeadStarted = createControlledPromise<void>()
    const safeHeadGate = createControlledPromise<void>()

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const missingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/missing',
      pendingMs: 0,
      pendingMinMs: 0,
      pendingComponent: () => null,
      beforeLoad: () => {
        throw notFound()
      },
    }).lazy(() => {
      lazyStarted.resolve()
      return lazyGate
    })
    const safeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/safe',
      head: async () => {
        safeHeadStarted.resolve()
        await safeHeadGate
        return {}
      },
    })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, missingRoute, safeRoute]),
      history,
    })

    await router.load()
    history.push('/missing')
    const supersededLoad = router.load()
    await lazyStarted
    const supersededTx = router._tx!
    expect(router._pending?.[0]).toBe(supersededTx)

    let supersededOutcome: unknown
    const observedSupersededLoad = supersededLoad.then(
      () => {
        supersededOutcome = 'resolved'
      },
      (cause) => {
        supersededOutcome = cause
      },
    )
    history.push('/safe')
    const replacementLoad = router.load()
    await safeHeadStarted
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(supersededOutcome).toBeUndefined()
    expect(safeHeadGate.status).toBe('pending')
    expect(router._pending).toBeUndefined()
    expect(router.state.matches.at(-1)?.routeId).toBe(missingRoute.id)

    safeHeadGate.resolve()
    lazyGate.resolve({ options: { notFoundComponent: () => null } })
    await Promise.all([observedSupersededLoad, replacementLoad])

    expect(supersededOutcome).toBe('resolved')
    expect(router._pending).toBeUndefined()
    expect(router.state).toMatchObject({
      status: 'idle',
      location: { pathname: '/safe' },
    })
    expect(router.state.matches.at(-1)?.routeId).toBe(safeRoute.id)
    history.destroy()
  })

  test('an unrelated third load clears a pending session awaiting same-boundary takeover', async () => {
    const pageStarted = createControlledPromise<void>()
    const pageGate = createControlledPromise<void>()
    const retainedStarted = createControlledPromise<void>()
    const retainedGate = createControlledPromise<void>()
    const safeHeadStarted = createControlledPromise<void>()
    const safeHeadGate = createControlledPromise<void>()

    const rootRoute = new BaseRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision) || 0,
      }),
      beforeLoad: ({ search }) => {
        if (search.revision === 2) {
          retainedStarted.resolve()
          return retainedGate.then(() => ({}))
        }
        return {}
      },
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      pendingMs: 0,
      pendingMinMs: 0,
      pendingComponent: () => null,
      beforeLoad: ({ search }) => {
        if (search.revision === 1) {
          pageStarted.resolve()
          return pageGate.then(() => ({}))
        }
        return {}
      },
    })
    const safeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/safe',
      head: async () => {
        safeHeadStarted.resolve()
        await safeHeadGate
        return {}
      },
    })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, pageRoute, safeRoute]),
      history,
    })

    await router.load()
    const loads: Array<Promise<void>> = []
    try {
      history.push('/page?revision=1')
      const firstLoad = router.load()
      loads.push(firstLoad)
      await pageStarted
      const firstTx = router._tx!
      await vi.waitFor(() => expect(router._pending?.[0]).toBe(firstTx))

      history.push('/page?revision=2')
      const secondLoad = router.load()
      loads.push(secondLoad)
      await retainedStarted
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(router._pending?.[0]).toBe(firstTx)

      history.push('/safe')
      const thirdLoad = router.load()
      loads.push(thirdLoad)
      await safeHeadStarted
      await new Promise<void>((resolve) => setTimeout(resolve, 0))

      expect(router._pending).toBeUndefined()
    } finally {
      pageGate.resolve()
      retainedGate.resolve()
      safeHeadGate.resolve()
      await Promise.allSettled(loads)
      history.destroy()
    }
  })

  test('a live signal rejected by lazy not-found lookup is not treated as cancellation', async () => {
    let laneSignal: AbortSignal | undefined
    const rootRoute = new BaseRootRoute({})
    const missingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/missing',
      beforeLoad: ({ abortController }) => {
        laneSignal = abortController.signal
        throw notFound()
      },
    }).lazy(() => Promise.reject(laneSignal))
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([missingRoute]),
      history: createMemoryHistory({ initialEntries: ['/missing'] }),
    })

    await router.load()

    expect(laneSignal?.aborted).toBe(false)
    expect(router.state.status).toBe('idle')
    expect(router.state.location.pathname).toBe('/missing')
    expect(router.state.resolvedLocation?.pathname).toBe('/missing')
    expect(router.state.matches.at(-1)?.status).not.toBe('pending')
  })

  test('keeps a hidden child matched without projecting it below a parent error', async () => {
    const parentError = new Error('parent failed')
    const parentOnEnter = vi.fn()
    const childHead = vi.fn()
    const childOnEnter = vi.fn()

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw parentError
      },
      errorComponent: () => null,
      onEnter: parentOnEnter,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => {
        throw notFound()
      },
      notFoundComponent: () => null,
      head: childHead,
      onEnter: childOnEnter,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
      childRoute.id,
    ])
    expect(router.state.matches[1]).toMatchObject({
      routeId: parentRoute.id,
      status: 'error',
      error: parentError,
    })
    expect(childHead).not.toHaveBeenCalled()
    expect(childOnEnter).not.toHaveBeenCalled()
    expect(parentOnEnter).toHaveBeenCalledOnce()
  })

  test('a redirect aborts the discarded loader generation', async () => {
    let redirectSignal: AbortSignal | undefined

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: ({ abortController }) => {
        redirectSignal = abortController.signal
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.navigate({ to: '/source' })

    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
    expect(redirectSignal?.aborted).toBe(true)
  })

  test('a navigation started while releasing a redirect lane supersedes that redirect', async () => {
    let successorNavigation: Promise<void> | undefined

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: ({ abortController }) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            successorNavigation = router.navigate({ to: '/successor' })
          },
          { once: true },
        )
        throw redirect({ to: '/redirect-target' })
      },
    })
    const redirectTargetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/redirect-target',
    })
    const successorRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/successor',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        sourceRoute,
        redirectTargetRoute,
        successorRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.navigate({ to: '/source' })
    await successorNavigation

    expect(router.state.location.pathname).toBe('/successor')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: successorRoute.id,
      status: 'success',
    })
  })

  test('keeps successful descendant data behind an ancestor boundary', async () => {
    const parentError = new Error('parent failed')
    const childData = { value: 'child data' }

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw parentError
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => childData,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()

    expect(router.state.matches[1]).toMatchObject({
      routeId: parentRoute.id,
      status: 'error',
      error: parentError,
    })
    expect(router.state.matches[2]).toMatchObject({
      routeId: childRoute.id,
      status: 'success',
      loaderData: childData,
    })
  })

  test('a terminal preload retains reusable descendant loader data', async () => {
    const parentError = new Error('preload parent failed')
    const childLoader = vi.fn(() => 'child data')

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw parentError
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/parent/child' })
    await router.navigate({ to: '/parent/child' })

    expect(childLoader).toHaveBeenCalledTimes(1)
    expect(router.state.matches[2]).toMatchObject({
      routeId: childRoute.id,
      status: 'success',
      loaderData: 'child data',
    })
  })

  test('navigation started by route context cannot be overwritten by the stale matching pass', async () => {
    const bLoaderGate = createControlledPromise<void>()
    const bLoader = vi.fn(() => bLoaderGate)
    let retainedLoaderSignal: AbortSignal | undefined
    let abandonedContextSignal: AbortSignal | undefined
    let redirected = false

    const rootRoute = new BaseRootRoute({
      staleTime: Infinity,
      loader: ({ abortController }) => {
        retainedLoaderSignal = abortController.signal
        return 'root data'
      },
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const aRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      context: ({ navigate, abortController }) => {
        abandonedContextSignal = abortController.signal
        if (!redirected) {
          redirected = true
          void navigate({ to: '/b' })
        }
        return { fromA: true }
      },
    })
    const bRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/b',
      loader: bLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, aRoute, bRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const navigation = router.navigate({ to: '/a' })
    await vi.waitFor(() => expect(bLoader).toHaveBeenCalledTimes(1))

    bLoaderGate.resolve()
    await navigation

    expect(router.state.location.pathname).toBe('/b')
    expect(router.state.matches.at(-1)?.routeId).toBe(bRoute.id)
    expect(abandonedContextSignal?.aborted).toBe(true)
    expect(retainedLoaderSignal?.aborted).toBe(false)
  })

  test('a context-failure lane stays live until its terminal generation is replaced', async () => {
    const contextError = new Error('context failed after starting work')

    let contextSignal: AbortSignal | undefined
    let contextWorkAborted = false
    const safeLoader = vi.fn(() => 'safe data')

    const rootRoute = new BaseRootRoute({})
    const brokenRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/broken',
      context: ({ abortController }) => {
        contextSignal = abortController.signal
        abortController.signal.addEventListener(
          'abort',
          () => {
            contextWorkAborted = true
          },
          { once: true },
        )
        throw contextError
      },
    })
    const safeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/safe',
      loader: safeLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([brokenRoute, safeRoute]),
      history: createMemoryHistory({ initialEntries: ['/broken'] }),
    })

    await router.load()
    expect(contextSignal?.aborted).toBe(false)
    expect(contextWorkAborted).toBe(false)

    await router.navigate({ to: '/safe' })
    expect(router.state.location.pathname).toBe('/safe')
    expect(safeLoader).toHaveBeenCalledTimes(1)
    expect(contextSignal?.aborted).toBe(true)
    expect(contextWorkAborted).toBe(true)
  })

  test.each([
    {
      isServer: false,
      thrownType: 'AbortSignal',
      createThrownValue: (signal: AbortSignal) => signal,
    },
    {
      isServer: false,
      thrownType: 'AbortError',
      createThrownValue: () =>
        new DOMException('The operation was aborted.', 'AbortError'),
    },
    {
      isServer: true,
      thrownType: 'AbortError',
      createThrownValue: () =>
        Object.assign(new Error('The operation was aborted.'), {
          name: 'AbortError',
        }),
    },
  ])(
    'treats a user-thrown $thrownType in beforeLoad as an ordinary route error (isServer=$isServer)',
    async ({ isServer, createThrownValue }) => {
      let matchSignal: AbortSignal | undefined
      let thrownValue: unknown
      const rootRoute = new BaseRootRoute({})
      const brokenRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/broken',
        beforeLoad: ({ abortController }) => {
          matchSignal = abortController.signal
          thrownValue = createThrownValue(matchSignal)
          throw thrownValue
        },
        errorComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([brokenRoute]),
        history: createMemoryHistory({ initialEntries: ['/broken'] }),
        isServer,
      })

      if (isServer) {
        const response = await loadServerResponse(router, '/broken')
        expect(response.status).toBe(500)
      } else {
        await router.load()
      }

      const match = router.state.matches.at(-1)
      // The payload finished, so the controller is left alone on both sides.
      expect(matchSignal?.aborted).toBe(false)
      expect(match).toMatchObject({
        routeId: brokenRoute.id,
        status: 'error',
      })
      expect(match?.error).toBe(thrownValue)
    },
  )

  test('a planning failure becomes the successor lane instead of stranding navigation', async () => {
    const preflightError = new Error('next loaderDeps failed')
    const pendingGate = createControlledPromise<void>()
    const brokenPreflightReached = createControlledPromise<void>()
    let pendingSignal: AbortSignal | undefined
    const pendingStarted = createControlledPromise<void>()

    const rootRoute = new BaseRootRoute({})
    const aRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
    })
    const pendingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/pending',
      pendingMs: 0,
      pendingComponent: () => null,
      loader: ({ abortController }) => {
        pendingSignal = abortController.signal
        pendingStarted.resolve()
        return Promise.race([
          pendingGate,
          abortAwareGate(abortController.signal),
        ])
      },
    })
    const brokenRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/broken',
      loaderDeps: (): Record<string, never> => {
        brokenPreflightReached.resolve()
        throw preflightError
      },
      loader: () => 'never runs',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([aRoute, pendingRoute, brokenRoute]),
      history: createMemoryHistory({ initialEntries: ['/a'] }),
    })

    await router.load()
    const pendingNavigation = router.navigate({ to: '/pending' })
    await pendingStarted

    const brokenNavigation = router.navigate({ to: '/broken' })
    await brokenPreflightReached

    await vi.waitFor(() => expect(pendingSignal?.aborted).toBe(true))

    pendingGate.resolve()
    await Promise.all([pendingNavigation, brokenNavigation])

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: brokenRoute.id,
      status: 'error',
      error: preflightError,
    })
    expect(router.state.location.pathname).toBe('/broken')
  })
})
