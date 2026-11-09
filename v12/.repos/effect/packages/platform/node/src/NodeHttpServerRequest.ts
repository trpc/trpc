/**
 * Accessors for the Node.js objects behind an Effect HTTP server request.
 *
 * `toIncomingMessage` returns the underlying Node `http.IncomingMessage`, or
 * `http2.Http2ServerRequest` for an HTTP/2 request. `toServerResponse` returns
 * the underlying Node `http.ServerResponse` or `http2.Http2ServerResponse`,
 * evaluating the stored response thunk when the response was created lazily.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { HttpServerRequest } from "effect/http/HttpServerRequest"
import type * as Http from "node:http"
import type * as Http2 from "node:http2"

/**
 * Returns the underlying Node `IncomingMessage` for a platform Node
 * `HttpServerRequest`, or the `Http2ServerRequest` when it was received over
 * HTTP/2.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const toIncomingMessage = (self: HttpServerRequest): Http.IncomingMessage | Http2.Http2ServerRequest =>
  self.source as any

/**
 * Returns the underlying Node `ServerResponse` for a platform Node
 * `HttpServerRequest`, or the `Http2ServerResponse` when it was received over
 * HTTP/2, evaluating the stored response thunk when the response was created
 * lazily.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const toServerResponse = (self: HttpServerRequest): Http.ServerResponse | Http2.Http2ServerResponse => {
  const res = (self as any).response
  return typeof res === "function" ? res() : res
}
