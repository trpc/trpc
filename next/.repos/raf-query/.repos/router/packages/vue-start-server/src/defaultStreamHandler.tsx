import {
  defineHandlerCallback,
  renderRouterToStream,
} from '@tanstack/vue-router/ssr/server'
import { StartServer } from './StartServer'

export const defaultStreamHandler = defineHandlerCallback(
  ({ request, router, responseHeaders }) =>
    renderRouterToStream({
      request,
      router,
      responseHeaders,
      App: StartServer,
    }),
)
