import { PassThrough, Readable } from 'node:stream'
import ReactDOMServer from 'react-dom/server'
import { isbot } from 'isbot'
import {
  createSsrStreamResponse,
  getSsrStatus,
  transformReadableStreamWithRouter,
  waitForRequest,
} from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { ReactNode } from 'react'

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: ReactNode
}) => {
  const signal = request.signal
  if (signal.aborted) {
    router.serverSsr?.cleanup()
    throw signal.reason
  }
  let rendererTeardown = false
  const bot = isbot(request.headers.get('User-Agent'))
  const onError =
    (
      renderer: string,
    ): ReactDOMServer.RenderToPipeableStreamOptions['onError'] =>
    (error, info) => {
      if (!rendererTeardown && !signal.aborted) {
        console.error(`Error in ${renderer}:`, error, info)
      }
    }

  try {
    if (typeof ReactDOMServer.renderToReadableStream === 'function') {
      const stream = await ReactDOMServer.renderToReadableStream(children, {
        signal,
        nonce: router.options.ssr?.nonce,
        progressiveChunkSize: Number.POSITIVE_INFINITY,
        onError: onError('renderToReadableStream'),
      })
      // The transform owns the reader and bounds bot readiness by its lifetime.
      const rendererAbort = bot ? new AbortController() : undefined
      const responseStream = transformReadableStreamWithRouter(router, stream, {
        rendererSafePoint: 'script-close',
        signal,
        onAbort: (reason) => {
          rendererTeardown = true
          rendererAbort?.abort(reason)
        },
      })
      if (rendererAbort) {
        await waitForRequest(stream.allReady, rendererAbort.signal)
      }
      return createSsrStreamResponse(
        router,
        new Response(responseStream, {
          status: getSsrStatus(router),
          headers: responseHeaders,
        }),
      )
    }

    if (typeof ReactDOMServer.renderToPipeableStream === 'function') {
      const reactAppPassthrough = new PassThrough()
      let pipeable:
        | ReturnType<typeof ReactDOMServer.renderToPipeableStream>
        | undefined
      let resolveReady!: () => void
      const ready = new Promise<void>((resolve) => {
        resolveReady = resolve
      })
      const rendererAbort = new AbortController()
      const abortPipeable = (reason?: unknown) => {
        if (rendererTeardown) {
          return
        }
        rendererTeardown = true
        rendererAbort.abort(reason)
        try {
          pipeable?.abort(reason)
        } catch {
          // ignore — React may throw if already aborted/finished
        }
      }
      try {
        pipeable = ReactDOMServer.renderToPipeableStream(children, {
          nonce: router.options.ssr?.nonce,
          progressiveChunkSize: Number.POSITIVE_INFINITY,
          ...(bot
            ? { onAllReady: resolveReady }
            : { onShellReady: resolveReady }),
          onError: onError('renderToPipeableStream'),
          onShellError: (error) => rendererAbort.abort(error),
        })
        const responseStream = transformReadableStreamWithRouter(
          router,
          Readable.toWeb(reactAppPassthrough),
          {
            rendererSafePoint: 'script-close',
            signal,
            onAbort: abortPipeable,
          },
        )

        await waitForRequest(ready, rendererAbort.signal)
        pipeable.pipe(reactAppPassthrough)

        return createSsrStreamResponse(
          router,
          new Response(responseStream, {
            status: getSsrStatus(router),
            headers: responseHeaders,
          }),
        )
      } catch (error) {
        abortPipeable(error)
        throw error
      }
    }

    throw new Error(
      'No renderToReadableStream or renderToPipeableStream found in react-dom/server. Ensure you are using a version of react-dom that supports streaming.',
    )
  } catch (error) {
    router.serverSsr?.cleanup()
    throw error
  }
}
