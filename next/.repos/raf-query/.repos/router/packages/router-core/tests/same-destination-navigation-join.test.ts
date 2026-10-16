import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('same-destination navigation while one is in flight', () => {
  function setup() {
    const gate = createControlledPromise<string>()
    const beforeLoad = vi.fn()
    const loader = vi.fn(() => gate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    return { router, beforeLoad, loader, gate, targetRoute }
  }

  test('a second navigation to the same destination joins the in-flight load', async () => {
    const { router, beforeLoad, loader, gate, targetRoute } = setup()
    await router.load()

    const first = router.navigate({ to: '/target' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    const second = router.navigate({ to: '/target' })

    gate.resolve('once')
    await Promise.all([first, second])

    expect(beforeLoad).toHaveBeenCalledTimes(2)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'once',
    })
  })

  test('a double navigation in the same tick joins the in-flight load', async () => {
    const { router, loader, gate, targetRoute } = setup()
    await router.load()

    const first = router.navigate({ to: '/target' })
    const second = router.navigate({ to: '/target' })

    gate.resolve('once')
    await Promise.all([first, second])

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'once',
    })
  })

  test('a successor joining a loader error normalizes the shared generation once', async () => {
    const gate = createControlledPromise<void>()
    const failure = new Error('shared failure')
    const loader = vi.fn(async () => {
      await gate
      throw failure
    })
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader,
      onError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    const first = router.navigate({ to: '/target' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())
    const second = router.navigate({ to: '/target' })
    await Promise.resolve()
    expect(loader).toHaveBeenCalledOnce()

    gate.resolve()
    await Promise.all([first, second])

    expect(loader).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(failure)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'error',
      error: failure,
    })
  })

  test('a navigation started by onError runs a fresh loader generation', async () => {
    const gate = createControlledPromise<void>()
    const failure = new Error('first generation failed')
    let successor: Promise<void> | undefined
    let router: ReturnType<typeof createTestRouter>
    const loader = vi.fn(async () => {
      if (loader.mock.calls.length === 1) {
        await gate
        throw failure
      }
      return 'recovered'
    })
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader,
      onError: () => {
        successor ??= router.navigate({ to: '/target' })
      },
    })
    router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    const first = router.navigate({ to: '/target' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())
    gate.resolve()
    await first
    await successor

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'recovered',
    })
  })

  test('a superseded loader failure cannot poison a successor delayed in beforeLoad', async () => {
    const firstResult = createControlledPromise<string>()
    const successorBeforeLoadStarted = createControlledPromise<void>()
    const successorBeforeLoadGate = createControlledPromise<void>()
    const failure = new Error('reserved generation failed')
    const signals: Array<AbortSignal> = []
    const onError = vi.fn()
    const loader = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        signals.push(abortController.signal)
        return loader.mock.calls.length === 1 ? firstResult : 'fresh'
      },
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        phase: String(search.phase ?? ''),
      }),
      beforeLoad: async ({ search }) => {
        if (search.phase === 'successor') {
          successorBeforeLoadStarted.resolve()
          await successorBeforeLoadGate
        }
      },
      loader,
      onError,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    const first = router.navigate({
      to: '/target',
      search: { phase: 'predecessor' },
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())

    const second = router.navigate({
      to: '/target',
      search: { phase: 'successor' },
    })
    await successorBeforeLoadStarted

    expect(loader).toHaveBeenCalledOnce()
    expect(signals[0]?.aborted).toBe(false)

    firstResult.reject(failure)
    await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true))

    expect(onError).not.toHaveBeenCalled()
    expect(loader).toHaveBeenCalledOnce()

    successorBeforeLoadGate.resolve()
    await Promise.all([first, second])

    expect(loader).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
    expect(signals[1]?.aborted).toBe(false)
    expect(router.state.location).toMatchObject({
      pathname: '/target',
      search: { phase: 'successor' },
    })
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'fresh',
    })
  })

  test('invalidate reruns the loader after the navigation settles', async () => {
    const { router, loader, gate } = setup()
    gate.resolve('data')
    await router.load()
    await router.navigate({ to: '/target' })
    expect(loader).toHaveBeenCalledTimes(1)

    await router.invalidate()

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('invalidate during an in-flight navigation still reruns the loader', async () => {
    const { router, loader, gate } = setup()
    await router.load()

    const first = router.navigate({ to: '/target' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    const second = router.invalidate()

    gate.resolve('data')
    await Promise.all([first, second])

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('filtered invalidate does not adopt same-id work from an active preload', async () => {
    const secondGate = createControlledPromise<string>()
    const loader = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        const generation = loader.mock.calls.length
        return generation === 2
          ? secondGate
          : `generation ${generation}:${abortController.signal.aborted}`
      },
    )
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision ?? 1),
      }),
      shouldReload: ({ preload }) => (preload ? true : undefined),
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({
        initialEntries: ['/target?revision=1'],
      }),
    })

    await router.load()
    const preload = router.preloadRoute({
      to: '/target',
      search: { revision: 2 },
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    const invalidation = router.invalidate({
      filter: (match) =>
        match.routeId === targetRoute.id &&
        (match.search as { revision: number }).revision === 1,
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(3))
    await invalidation

    expect(router.state.location.search).toEqual({ revision: 1 })
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      loaderData: 'generation 3:false',
    })

    secondGate.resolve('preload data')
    await preload
  })

  test('a repeat navigation after settle reloads instead of joining', async () => {
    const { router, loader, gate, targetRoute } = setup()
    gate.resolve('data')
    await router.load()
    await router.navigate({ to: '/target' })

    // Once the first navigation settles there is nothing to join: a repeat
    // same-destination navigation keeps its refresh semantics.
    await router.navigate({ to: '/target' })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
  })
})
