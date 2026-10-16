import * as Solid from 'solid-js/web'
import { renderSsrHtmlResponse } from '@tanstack/router-core/ssr/server'
import { getSolidRenderOptions } from './renderOptions'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'

export const renderRouterToString = async ({
  router,
  responseHeaders,
  children,
}: {
  router: AnyRouter
  responseHeaders: Headers
  children: () => JSXElement
}) => {
  return renderSsrHtmlResponse({
    router,
    responseHeaders,
    render: () => Solid.renderToString(children, getSolidRenderOptions(router)),
  })
}
