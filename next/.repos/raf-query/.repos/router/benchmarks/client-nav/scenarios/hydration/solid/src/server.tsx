import { RouterProvider } from '@tanstack/solid-router'
import {
  createRequestHandler,
  renderRouterToStream,
} from '@tanstack/solid-router/ssr/server'
import { isServer } from '@tanstack/router-core/isServer'
import { isServer as solidIsServer } from 'solid-js/web'
import { createDiagnostics, serverUrl } from '../fixture'
import { createFixtureRouter } from './app'

export async function renderFixture() {
  if ((isServer as boolean | undefined) !== true || !solidIsServer) {
    throw new Error('Fixture generation requires the production server build')
  }
  const diagnostics = createDiagnostics()
  const response = await createRequestHandler({
    createRouter: () => createFixtureRouter(true, diagnostics),
    request: new Request(`http://localhost${serverUrl}`),
  })(({ request, router, responseHeaders }) =>
    renderRouterToStream({
      request,
      router,
      responseHeaders,
      // The route shell owns the document, as in Solid Start. Using the same
      // provider tree on both sides preserves Solid's hydration key sequence.
      children: () => <RouterProvider router={router} />,
    }),
  )
  const html = await response.text()
  if (
    response.status !== 200 ||
    diagnostics.beforeLoads !== 3 ||
    diagnostics.loaders !== 2
  ) {
    throw new Error(
      'SSR fixture did not execute its beforeLoad and loader functions',
    )
  }
  return html
}
