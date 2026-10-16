import { describe, expect, test } from 'vitest'
import { createRootRoute, createRouter } from '../../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToStream,
  renderRouterToString,
} from '../../src/ssr/server'

async function renderDocument(mode: 'stream' | 'string') {
  const request = new Request('http://localhost/')
  const rootRoute = createRootRoute({
    component: () => <main>home</main>,
  })
  const handler = createRequestHandler({
    request,
    createRouter: () => createRouter({ routeTree: rootRoute, isServer: true }),
  })

  return handler(({ router, responseHeaders }) => {
    const children = () => <RouterServer router={router} />
    return mode === 'stream'
      ? renderRouterToStream({
          request,
          router,
          responseHeaders,
          children,
        })
      : renderRouterToString({ router, responseHeaders, children })
  })
}

describe('document type', () => {
  test.each(['stream', 'string'] as const)(
    '%s output contains one document type',
    async (mode) => {
      const response = await renderDocument(mode)
      const html = await response.text()

      expect(html.startsWith('<!DOCTYPE html><html')).toBe(true)
      expect(html.match(/<!DOCTYPE html>/g)).toHaveLength(1)
    },
  )
})
