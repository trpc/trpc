import { Suspense } from 'solid-js'
import { expect, it } from 'vitest'
import { Await, createRootRoute, createRoute, createRouter } from '../../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../../src/ssr/server'

it('renders the Suspense fallback while finishing deferred hydration data', async () => {
  let resolveDeferred!: (value: string) => void
  const deferred = new Promise<string>((resolve) => {
    resolveDeferred = resolve
  })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => ({ deferred }),
    component: () => {
      const data = indexRoute.useLoaderData()
      queueMicrotask(() => resolveDeferred('deferred value'))
      return (
        <Suspense fallback={<span data-testid="pending">pending</span>}>
          <Await promise={data().deferred}>
            {(value) => <span data-testid="resolved">{String(value)}</span>}
          </Await>
        </Suspense>
      )
    },
  })
  const routeTree = rootRoute.addChildren([indexRoute])
  const handler = createRequestHandler({
    request: new Request('http://localhost/'),
    createRouter: () => createRouter({ routeTree, isServer: true }),
  })

  const response = await handler(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: () => <RouterServer router={router} />,
    }),
  )
  const html = await response.text()

  expect(response.status).toBe(200)
  expect(html).toContain('data-testid="pending"')
  expect(html).not.toContain('data-testid="resolved"')
  expect(html).toContain('deferred value')
  expect(html).toContain('$_TSR.e()')
})
