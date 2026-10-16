/**
 * Accessor for the Bun request behind an Effect HTTP server request.
 *
 * This module exports `toBunServerRequest`, which returns the underlying
 * `Bun.BunRequest` stored inside a Bun-backed `HttpServerRequest`. It is meant
 * for code that needs to interoperate with Bun-specific request APIs.
 *
 * @since 4.0.0
 */
import type { HttpServerRequest } from "effect/http/HttpServerRequest"

/**
 * Returns the underlying `Bun.BunRequest` from an Effect `HttpServerRequest`.
 *
 * @category accessors
 * @since 4.0.0
 */
export const toBunServerRequest = <T extends string = string>(self: HttpServerRequest): Bun.BunRequest<T> =>
  (self as any).source
