import * as Effect from "../../Effect.ts"
import type { PreResponseHandler } from "../HttpEffect.ts"
import type { HttpServerRequest } from "../HttpServerRequest.ts"

/**
 * @internal
 */
export const requestPreResponseHandlers = new WeakMap<object, PreResponseHandler>()

/**
 * @internal
 */
export const appendPreResponseHandlerUnsafe = (request: HttpServerRequest, handler: PreResponseHandler): void => {
  const prev = requestPreResponseHandlers.get(request.source)
  const next: PreResponseHandler = prev ?
    (request, response) => Effect.flatMap(prev(request, response), (response) => handler(request, response))
    : handler
  requestPreResponseHandlers.set(request.source, next)
}
