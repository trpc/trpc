import * as Vue from 'vue'
import { renderToString, renderToWebStream } from 'vue/server-renderer'
import { isbot } from 'isbot'
import {
  createSsrStreamResponse,
  getSsrStatus,
  transformHtmlStringWithRouter,
  transformReadableStreamWithRouter,
  waitForRequest,
} from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { Component } from 'vue'

const DOCTYPE = new TextEncoder().encode('<!DOCTYPE html>')

/** The router transport needs `<html>` as the outer root, not a fragment. */
export function warnUnlessHtmlRoot(html: string) {
  if (process.env.NODE_ENV !== 'production' && !html.startsWith('<html')) {
    console.warn(
      'TanStack Router: the Vue root component must render <html> as its outer element. A fragment or array root breaks streamed hydration scripts.',
    )
  }
}

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  App,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  App: Component
}) => {
  const signal = request.signal
  if (signal.aborted) {
    router.serverSsr?.cleanup()
    throw signal.reason
  }

  try {
    const app = Vue.createSSRApp(App, { router })

    if (isbot(request.headers.get('User-Agent'))) {
      let fullHtml = await waitForRequest(renderToString(app), signal)
      warnUnlessHtmlRoot(fullHtml)
      fullHtml = await transformHtmlStringWithRouter(router, fullHtml, {
        signal,
      })
      return new Response(fullHtml, {
        status: getSsrStatus(router),
        headers: responseHeaders,
      })
    }

    const readable = renderToWebStream(app).pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        start(controller) {
          controller.enqueue(DOCTYPE)
        },
      }),
    )
    const responseStream = transformReadableStreamWithRouter(router, readable, {
      signal,
    })

    return createSsrStreamResponse(
      router,
      new Response(responseStream, {
        status: getSsrStatus(router),
        headers: responseHeaders,
      }),
    )
  } catch (error) {
    router.serverSsr?.cleanup()
    throw error
  }
}
