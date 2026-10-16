/**
 * Accessors for the Node.js objects behind an Effect HTTP server request.
 *
 * `toIncomingMessage` returns the underlying Node `http.IncomingMessage`.
 * `toServerResponse` returns the underlying Node `http.ServerResponse`,
 * evaluating the stored response thunk when the response was created lazily.
 *
 * @since 4.0.0
 */
import type { HttpServerRequest } from "effect/http/HttpServerRequest"
import type * as Http from "node:http"

/**
 * Returns the underlying Node `IncomingMessage` for a platform Node
 * `HttpServerRequest`.
 *
 * @category accessors
 * @since 4.0.0
 */
export const toIncomingMessage = (self: HttpServerRequest): Http.IncomingMessage => self.source as any

/**
 * Returns the underlying Node `ServerResponse` for a platform Node
 * `HttpServerRequest`, evaluating the stored response thunk when the response
 * was created lazily.
 *
 * @category accessors
 * @since 4.0.0
 */
export const toServerResponse = (self: HttpServerRequest): Http.ServerResponse => {
  const res = (self as any).response
  return typeof res === "function" ? res() : res
}
