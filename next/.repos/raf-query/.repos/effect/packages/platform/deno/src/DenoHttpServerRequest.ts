/**
 * Accessor for the web-standard request behind a Deno HTTP server request.
 *
 * Unlike Bun's accessor, this function has no route-pattern generic because
 * `Deno.serve` always receives a standard `Request`. Connection information is
 * intentionally kept internal to `DenoHttpServer`.
 *
 * @since 4.0.0
 */
import type { HttpServerRequest } from "effect/http/HttpServerRequest"

/**
 * Returns the underlying web-standard `Request` from an Effect `HttpServerRequest`.
 *
 * @category accessors
 * @since 4.0.0
 */
export const toDenoServerRequest = (self: HttpServerRequest): Request => (self as any).source
