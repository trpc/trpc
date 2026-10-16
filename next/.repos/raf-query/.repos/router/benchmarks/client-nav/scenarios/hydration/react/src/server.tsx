import {
  createRequestHandler,
  defaultStreamHandler,
} from '@tanstack/react-router/ssr/server'
import { isServer } from '@tanstack/router-core/isServer'
import { createDiagnostics, serverUrl } from '../fixture'
import { createFixtureRouter } from './app'

export async function renderFixture() {
  if ((isServer as boolean | undefined) !== true) {
    throw new Error('Fixture generation requires the production server build')
  }
  const diagnostics = createDiagnostics()
  const response = await createRequestHandler({
    createRouter: () => createFixtureRouter(true, diagnostics),
    request: new Request(`http://localhost${serverUrl}`),
  })(defaultStreamHandler)
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
