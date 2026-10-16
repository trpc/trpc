import { defineHandlerCallback } from '@tanstack/router-core/ssr/server'
import { renderRouterToStream } from './renderRouterToStream'
import { RouterServer } from './RouterServer'

export const defaultStreamHandler = defineHandlerCallback(
  ({ request, router, responseHeaders }) =>
    renderRouterToStream({
      request,
      router,
      responseHeaders,
      App: RouterServer,
    }),
)
