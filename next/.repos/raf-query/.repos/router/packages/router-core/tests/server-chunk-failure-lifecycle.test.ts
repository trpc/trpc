import { describe, expect, onTestFinished, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

/**
 * A primary route chunk failure observed by the server loader phase (a route
 * component preload or lazyFn rejection) must go through the same route
 * failure lifecycle as loader failures: the route's onError runs,
 * redirect/notFound conversion applies, and the errorComponent boundary
 * chunk is loaded. Only boundary component chunk failures commit directly
 * without recursing into another boundary chunk.
 *
 * These tests use real server router loads and public component preload/lazy
 * route APIs.
 */

describe('server route chunk failure lifecycle', () => {
  test('calls route onError once and loads the errorComponent chunk when the route component chunk rejects', async () => {
    const chunkError = new Error('component chunk failed')
    const capturedErrors: Array<unknown> = []
    const events: Array<string> = []

    const FailingComponent = Object.assign(() => null, {
      preload: () => Promise.reject(chunkError),
    })
    const ErrorBoundary = Object.assign(() => null, {
      preload: () => {
        events.push('errorComponent-preload')
        return Promise.resolve()
      },
    })

    const rootRoute = new BaseRootRoute({})
    const chunkedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/chunked',
      onError: (error: unknown) => {
        capturedErrors.push(error)
        events.push('onError')
      },
      component: FailingComponent as any,
      errorComponent: ErrorBoundary as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([chunkedRoute]),
      history: createMemoryHistory({ initialEntries: ['/chunked'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/chunked')

    const match = router.state.matches.find(
      (item) => item.routeId === chunkedRoute.id,
    )
    expect(capturedErrors).toEqual([chunkError])
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(chunkError)
    expect(events).toEqual(['onError', 'errorComponent-preload'])
    expect(response.status).toBe(500)
  })

  test('a notFound thrown from onError for a route chunk failure sets 404 instead of 500', async () => {
    const chunkError = new Error('component chunk failed')

    const FailingComponent = Object.assign(() => null, {
      preload: () => Promise.reject(chunkError),
    })

    const rootRoute = new BaseRootRoute({})
    const chunkedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/chunked',
      onError: () => {
        throw notFound()
      },
      component: FailingComponent as any,
      notFoundComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([chunkedRoute]),
      history: createMemoryHistory({ initialEntries: ['/chunked'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/chunked')

    const match = router.state.matches.find(
      (item) => item.routeId === chunkedRoute.id,
    )
    expect(response.status).toBe(404)
    expect(match?.status).toBe('notFound')
    expect(match?.error).toEqual(expect.objectContaining({ isNotFound: true }))
  })

  test('the first route-order chunk failure determines the response', async () => {
    const rootError = new Error('root component failed')
    const rootChunkGate = createControlledPromise<void>()
    const childConverted = createControlledPromise<void>()
    const RootComponent = Object.assign(() => null, {
      preload: () => rootChunkGate,
    })
    const ChildComponent = Object.assign(() => null, {
      preload: () => Promise.reject(new Error('child component failed')),
    })

    const rootRoute = new BaseRootRoute({
      component: RootComponent as any,
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      component: ChildComponent as any,
      onError: () => {
        childConverted.resolve()
        throw redirect({ to: '/elsewhere' })
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
      isServer: true,
    })

    const responsePromise = loadServerResponse(router, '/child')
    await childConverted
    rootChunkGate.reject(rootError)
    const response = await responsePromise

    expect(response.status).toBe(500)
    expect(response.headers.get('Location')).toBeNull()
    expect(router.state.matches).toHaveLength(2)
    expect(router.state.matches[0]).toMatchObject({
      routeId: rootRoute.id,
      status: 'error',
      error: rootError,
    })
  })

  test('does not leave later chunk rejections unhandled after request abort', async () => {
    const rootError = new Error('root component failed')
    const abortError = new Error('request closed')
    const rootChunkGate = createControlledPromise<void>()
    const childChunkGate = createControlledPromise<void>()
    const rootChunkStarted = createControlledPromise<void>()
    const childChunkStarted = createControlledPromise<void>()
    const RootComponent = Object.assign(() => null, {
      preload: () => {
        rootChunkStarted.resolve()
        return rootChunkGate
      },
    })
    const ChildComponent = Object.assign(() => null, {
      preload: () => {
        childChunkStarted.resolve()
        return childChunkGate
      },
    })
    const rootRoute = new BaseRootRoute({
      component: RootComponent as any,
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      component: ChildComponent as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
      isServer: true,
    })
    const controller = new AbortController()
    const unhandled: Array<unknown> = []
    const onUnhandled = (error: unknown) => {
      unhandled.push(error)
    }
    process.on('unhandledRejection', onUnhandled)
    onTestFinished(() => {
      process.off('unhandledRejection', onUnhandled)
    })

    const responsePromise = loadServerResponse(
      router,
      '/child',
      controller.signal,
    )
    await Promise.all([rootChunkStarted, childChunkStarted])

    rootChunkGate.reject(rootError)
    await expect(responsePromise).resolves.toMatchObject({ status: 500 })

    controller.abort(abortError)
    childChunkGate.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(unhandled).not.toContain(abortError)
  })

  test('a required ancestor lazy chunk failure wins over a deeper loader notFound', async () => {
    const chunkError = new Error('ancestor lazy chunk failed')
    const rootRoute = new BaseRootRoute({})
    const ancestorRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/ancestor',
      errorComponent: () => null,
    }).lazy(() => Promise.reject(chunkError))
    const childRoute = new BaseRoute({
      getParentRoute: () => ancestorRoute,
      path: '/child',
      loader: () => {
        throw notFound()
      },
      notFoundComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        ancestorRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/ancestor/child'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/ancestor/child')

    expect(response.status).toBe(500)
    expect(
      router.state.matches.find((match) => match.routeId === ancestorRoute.id),
    ).toMatchObject({ status: 'error', error: chunkError })
  })
})
