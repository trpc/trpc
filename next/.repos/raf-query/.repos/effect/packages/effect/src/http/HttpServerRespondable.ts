/**
 * Converts supported values into HTTP server responses.
 *
 * Server-side errors and helper values can implement `Respondable` when they
 * know which status, headers, cookies, or body should be sent to the client.
 * This module detects those values and converts them to `HttpServerResponse`
 * values, with fallback handling for schema errors and missing values.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Effect from "../Effect.ts"
import * as Schema from "../internal/schemaError.ts"
import { hasProperty } from "../Predicate.ts"
import type { HttpServerResponse } from "./HttpServerResponse.ts"
import * as Response from "./HttpServerResponse.ts"

/**
 * Protocol key used by values that can render themselves as
 * `HttpServerResponse` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const symbol = "~effect/http/HttpServerRespondable"

/**
 * Protocol for values that can be converted into an `HttpServerResponse`.
 *
 * **Details**
 *
 * Implement the protocol method to describe the response that should be sent for
 * the value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Respondable {
  [symbol](): Effect.Effect<HttpServerResponse, unknown>
}

/**
 * Returns `true` when the supplied value implements the `Respondable` protocol.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isRespondable = (u: unknown): u is Respondable => hasProperty(u, symbol)

const badRequest = Response.empty({ status: 400 })
const notFound = Response.empty({ status: 404 })

/**
 * Converts a `Respondable` value into an `HttpServerResponse`.
 *
 * **Details**
 *
 * If the value is already an HTTP server response it is returned directly; errors
 * from the response conversion are converted to defects.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const toResponse = (self: Respondable): Effect.Effect<HttpServerResponse> => {
  if (Response.isHttpServerResponse(self)) {
    return Effect.succeed(self)
  }
  return Effect.orDie(self[symbol]())
}

/**
 * Attempts to convert an unknown value into an `HttpServerResponse`, falling back
 * to the supplied response when no conversion is available.
 *
 * **Details**
 *
 * `HttpServerResponse` and `Respondable` values are used directly, schema errors
 * become `400` responses, and no-such-element errors become `404` responses.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const toResponseOrElse = (u: unknown, orElse: HttpServerResponse): Effect.Effect<HttpServerResponse> => {
  if (Response.isHttpServerResponse(u)) {
    return Effect.succeed(u)
  } else if (isRespondable(u)) {
    return Effect.catchCause(u[symbol](), () => Effect.succeed(orElse))
    // add support for some commmon types
  } else if (Schema.isSchemaError(u)) {
    return Effect.succeed(badRequest)
  } else if (Cause.isNoSuchElementError(u)) {
    return Effect.succeed(notFound)
  }
  return Effect.succeed(orElse)
}

/**
 * Attempts to convert an unknown defect into an `HttpServerResponse`, falling
 * back to the supplied response when no conversion is available.
 *
 * **Details**
 *
 * Only `HttpServerResponse` and `Respondable` values receive special handling.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const toResponseOrElseDefect = (u: unknown, orElse: HttpServerResponse): Effect.Effect<HttpServerResponse> => {
  if (Response.isHttpServerResponse(u)) {
    return Effect.succeed(u)
  } else if (isRespondable(u)) {
    return Effect.catchCause(u[symbol](), () => Effect.succeed(orElse))
  }
  return Effect.succeed(orElse)
}
