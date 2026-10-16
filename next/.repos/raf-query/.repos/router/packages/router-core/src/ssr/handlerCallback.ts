import type { AnyRouter } from '../router'

export type SsrResponse =
  | {
      response: Response
      serverSsrCleanup: 'none'
    }
  | {
      response: Response
      serverSsrCleanup: 'stream'
      dispose: (reason?: unknown) => undefined
    }

export type HandlerCallbackResult = Response | SsrResponse

export function isSsrResponse(value: unknown): value is SsrResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('response' in value) ||
    !(value.response instanceof Response) ||
    !('serverSsrCleanup' in value)
  ) {
    return false
  }

  if (value.serverSsrCleanup === 'none') {
    return true
  }

  return (
    value.serverSsrCleanup === 'stream' &&
    'dispose' in value &&
    typeof value.dispose === 'function'
  )
}

export function normalizeSsrResponse(
  result: HandlerCallbackResult,
): SsrResponse {
  if (result instanceof Response) {
    return { response: result, serverSsrCleanup: 'none' }
  }
  if (isSsrResponse(result)) {
    return result
  }

  throw new TypeError('Expected a Response from the SSR handler')
}

function cancelResponseBody(response: Response, reason?: unknown): void {
  const body = response.body
  if (!body) {
    return
  }
  void body.cancel(reason).catch(console.error)
}

export function disposeSsrResponse(
  result: HandlerCallbackResult,
  reason?: unknown,
): undefined {
  const response = normalizeSsrResponse(result)
  if (response.serverSsrCleanup === 'stream') {
    response.dispose(reason)
  } else {
    cancelResponseBody(response.response, reason)
  }
}

/** The HTTP status that Router's server load selected for this render. */
export function getSsrStatus(router: AnyRouter) {
  return router._serverResult?.type === 'render'
    ? router._serverResult.status
    : 200
}

export function createSsrStreamResponse(
  router: AnyRouter,
  response: Response,
): Extract<SsrResponse, { serverSsrCleanup: 'stream' }> {
  const body = response.body
  if (!body) {
    throw new Error('Invariant failed: SSR stream response requires a body')
  }

  return {
    response,
    serverSsrCleanup: 'stream',
    dispose(reason?: unknown): undefined {
      // Sever router ownership before asking user/renderer stream machinery to
      // cancel. A custom stream is allowed to ignore cancellation forever.
      router.serverSsr?.cleanup()

      void body.cancel(reason).catch(() => {})
    },
  }
}

export function bindSsrResponseToRequest(
  router: AnyRouter | undefined,
  result: HandlerCallbackResult,
  signal: AbortSignal,
): SsrResponse {
  const ssrResponse = normalizeSsrResponse(result)
  if (ssrResponse.serverSsrCleanup !== 'stream') {
    if (signal.aborted) {
      disposeSsrResponse(result, signal.reason)
    }
    return ssrResponse
  }

  const abort = () => {
    disposeSsrResponse(ssrResponse, signal.reason)
  }
  if (signal.aborted) {
    abort()
    return ssrResponse
  }

  const serverSsr = router?.serverSsr
  if (serverSsr?.hydrationScripts.requestSignal === signal) {
    // The transform already observes this request. Its cleanup must also
    // dispose the final response, including any middleware-owned body.
    serverSsr.onCleanup(() => {
      if (signal.aborted) {
        abort()
      }
    })
    return ssrResponse
  }

  signal.addEventListener('abort', abort, { once: true })
  if (!serverSsr) {
    return ssrResponse
  }

  serverSsr.onCleanup(() => {
    signal.removeEventListener('abort', abort)
  })
  return ssrResponse
}

export function replaceSsrResponse(
  result: HandlerCallbackResult,
  response: Response,
  reason?: unknown,
): Extract<SsrResponse, { serverSsrCleanup: 'none' }> {
  disposeSsrResponse(result, reason)
  return { response, serverSsrCleanup: 'none' }
}

export function stripSsrResponseBody(
  result: HandlerCallbackResult,
  reason?: unknown,
): Extract<SsrResponse, { serverSsrCleanup: 'none' }> {
  const ssrResponse = normalizeSsrResponse(result)
  disposeSsrResponse(ssrResponse, reason)
  return {
    response: new Response(null, ssrResponse.response),
    serverSsrCleanup: 'none',
  }
}

export interface HandlerCallback<TRouter extends AnyRouter> {
  (ctx: {
    request: Request
    router: TRouter
    responseHeaders: Headers
  }): HandlerCallbackResult | Promise<HandlerCallbackResult>
}

export function defineHandlerCallback<TRouter extends AnyRouter>(
  handler: HandlerCallback<TRouter>,
): HandlerCallback<TRouter> {
  return handler
}
