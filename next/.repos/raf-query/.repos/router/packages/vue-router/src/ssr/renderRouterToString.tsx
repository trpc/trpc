import * as Vue from 'vue'
import { renderToString as vueRenderToString } from 'vue/server-renderer'
import { renderSsrHtmlResponse } from '@tanstack/router-core/ssr/server'
import { warnUnlessHtmlRoot } from './renderRouterToStream'
import type { AnyRouter } from '@tanstack/router-core'
import type { Component } from 'vue'

export const renderRouterToString = async ({
  router,
  responseHeaders,
  App,
}: {
  router: AnyRouter
  responseHeaders: Headers
  App: Component
}) => {
  return renderSsrHtmlResponse({
    router,
    responseHeaders,
    render: async () => {
      const app = Vue.createSSRApp(App, { router })
      const rendered = await vueRenderToString(app)
      warnUnlessHtmlRoot(rendered)
      return rendered
    },
  })
}
