import * as Context from "../../Context.ts"
import * as Effect from "../../Effect.ts"
import type { PreResponseHandler } from "../HttpEffect.ts"

/**
 * Mutable state owned by the root that handles a single server request.
 *
 * @internal
 */
export class RequestState {
  preResponseHandler: PreResponseHandler | undefined = undefined
  loggerDisabled = false
}

/**
 * Provided by request roots alongside `HttpServerRequest`. It has no default,
 * so writes outside a request do not reach shared state.
 *
 * @internal
 */
export const CurrentRequestState = Context.Service<RequestState>("effect/http/HttpEffect/CurrentRequestState")

/**
 * @internal
 */
export const appendPreResponseHandlerUnsafe = (context: Context.Context<never>, handler: PreResponseHandler): void => {
  const state = Context.getOrUndefined(context, CurrentRequestState)
  if (state === undefined) return
  const prev = state.preResponseHandler
  state.preResponseHandler = prev ?
    (request, response) => Effect.flatMap(prev(request, response), (response) => handler(request, response))
    : handler
}
