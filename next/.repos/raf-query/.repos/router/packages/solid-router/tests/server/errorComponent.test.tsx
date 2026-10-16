import { Suspense, onCleanup } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import {
  Await,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '../../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToStream,
  renderRouterToString,
} from '../../src/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'

function createLazyErrorComponent() {
  return lazyRouteComponent(
    () =>
      Promise.resolve({
        ErrorComponent: ({ error }: { error: Error }) => (
          <div data-testid="error-component">Route error: {error.message}</div>
        ),
      }),
    'ErrorComponent',
  )
}

describe('errorComponent (server)', () => {
  it('cleans up components and router state after a synchronous string-render error', async () => {
    vi.useFakeTimers()
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      const rootRoute = createRootRoute()
      const handler = createRequestHandler({
        request: new Request('http://localhost/'),
        createRouter: () =>
          createRouter({ routeTree: rootRoute, isServer: true }),
      })
      let requestRouter: AnyRouter | undefined
      const componentCleanup = vi.fn()

      const response = await handler(({ router, responseHeaders }) => {
        requestRouter = router
        return renderRouterToString({
          router,
          responseHeaders,
          children: () => {
            onCleanup(componentCleanup)
            throw new Error('render boom')
          },
        })
      })

      expect(response.status).toBe(500)
      expect(requestRouter?.serverSsr).toBeUndefined()
      // Solid's synchronous renderer schedules disposal for the next task.
      await vi.runOnlyPendingTimersAsync()
      expect(componentCleanup).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      consoleError.mockRestore()
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it.each([
    ['Error', new Error('loader boom')],
    ['Error with cause', new Error('loader boom', { cause: false })],
    ['string', 'loader boom'],
    ['empty string', ''],
    ['false', false],
    ['zero', 0],
    ['negative zero', -0],
    ['bigint zero', 0n],
    ['null', null],
    ['undefined', undefined],
    ['NaN', NaN],
    ['object', { message: 'loader boom' }],
  ])(
    'normalizes a thrown %s for the SSR error component',
    async (_, thrown) => {
      const onError = vi.fn()
      let renderedError: Error | undefined
      const rootRoute = createRootRoute()

      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        loader: () => {
          throw thrown
        },
        component: () => <div>Index route</div>,
        onError,
        errorComponent: ({ error }) => {
          renderedError = error
          return (
            <div data-testid="error-component">
              Route error: {error.message}
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const handler = createRequestHandler({
        request: new Request('http://localhost/'),
        createRouter: () => createRouter({ routeTree, isServer: true }),
      })

      const response = await handler(async ({ router, responseHeaders }) => {
        const result = await renderRouterToString({
          router,
          responseHeaders,
          children: () => <RouterServer router={router} />,
        })
        const match = router.stores.matches
          .get()
          .find((match) => match.routeId === indexRoute.id)
        expect(match?.status).toBe('error')
        expect(match?.error).toBe(thrown)
        return result
      })

      expect(response.status).toBe(500)
      const html = await response.text()
      expect(html).toContain('data-testid="error-component"')
      expect(renderedError).toBeInstanceOf(Error)
      if (thrown instanceof Error) {
        expect(renderedError).toBe(thrown)
      } else {
        expect(renderedError?.message).toBe(
          typeof thrown === 'string' ? thrown : 'Unknown error',
        )
        expect(renderedError?.cause).toBe(thrown)
      }
      expect(onError).toHaveBeenCalledWith(thrown)
      expect(html).not.toContain('Index route')
    },
  )

  it.each(['string', 'stream'] as const)(
    'handles a lazy error component during %s rendering',
    async (mode) => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          throw new Error('render boom')
        },
        errorComponent: createLazyErrorComponent(),
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      const request = new Request('http://localhost/')
      const handler = createRequestHandler({
        request,
        createRouter: () => createRouter({ routeTree, isServer: true }),
      })

      const response = await handler(({ router, responseHeaders }) => {
        const children = () => <RouterServer router={router} />
        return mode === 'stream'
          ? renderRouterToStream({ request, router, responseHeaders, children })
          : renderRouterToString({ router, responseHeaders, children })
      })
      const html = await response.text()

      if (mode === 'stream') {
        expect(html).toContain('data-testid="error-component"')
        expect(html).toContain('render boom')
      } else {
        // The error boundary's Suspense fallback is blank during string rendering.
        expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
        expect(html).not.toContain('data-testid="error-component"')
      }
    },
  )

  it('renders the route error component when a streamed Await rejects', async () => {
    let rejectDeferred!: (error: Error) => void
    const deferred = new Promise<string>((_resolve, reject) => {
      rejectDeferred = reject
    })
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ deferred }),
      component: () => {
        const data = indexRoute.useLoaderData()
        return (
          <Suspense fallback={<span>pending</span>}>
            <Await promise={data().deferred}>
              {() => <span>resolved</span>}
            </Await>
          </Suspense>
        )
      },
      errorComponent: createLazyErrorComponent(),
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const request = new Request('http://localhost/')
    const handler = createRequestHandler({
      request,
      createRouter: () => createRouter({ routeTree, isServer: true }),
    })
    const response = await handler(({ router, responseHeaders }) =>
      renderRouterToStream({
        request,
        router,
        responseHeaders,
        children: () => <RouterServer router={router} />,
      }),
    )
    const htmlPromise = response.text()

    rejectDeferred(new Error('deferred boom'))
    const html = await htmlPromise

    expect(html).toContain('data-testid="error-component"')
    expect(html).toContain('deferred boom')
    expect(html).not.toContain('pending')
  })
})
