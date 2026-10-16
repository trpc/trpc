import ReactDOMServer from 'react-dom/server'
import { renderSsrHtmlResponse } from '@tanstack/router-core/ssr/server'
import type { ReactNode } from 'react'
import type { AnyRouter } from '@tanstack/router-core'

export const renderRouterToString = async ({
  router,
  responseHeaders,
  children,
}: {
  router: AnyRouter
  responseHeaders: Headers
  children: ReactNode
}) => {
  return renderSsrHtmlResponse({
    router,
    responseHeaders,
    render: () => ReactDOMServer.renderToString(children),
  })
}
