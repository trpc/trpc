/**
 * Service contract for servers that accept socket connections.
 *
 * `SocketServer` exposes the bound server `address` and a long-running `run`
 * loop that hands each accepted connection to a handler as a `Socket.Socket`.
 * Bound addresses use the shared `NetAddress.SocketAddress` model. This module also
 * defines server-level errors reported while opening or running a server.
 * Platform layers provide concrete implementations of this service.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import type * as Effect from "../Effect.ts"
import type * as NetAddress from "../net/NetAddress.ts"
import type * as Socket from "./Socket.ts"

/**
 * Context service for a socket server, exposing its bound address and a run
 * loop that handles each accepted `Socket`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class SocketServer extends Context.Service<SocketServer, {
  readonly address: NetAddress.SocketAddress
  readonly run: <R, E, _>(
    handler: (socket: Socket.Socket) => Effect.Effect<_, E, R>
  ) => Effect.Effect<never, SocketServerError, R>
}>()("@effect/platform/SocketServer") {}

/**
 * Runtime type identifier attached to `SocketServerError` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const ErrorTypeId: ErrorTypeId = "@effect/platform/SocketServer/SocketServerError"

/**
 * Type-level identifier used to mark `SocketServerError` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type ErrorTypeId = "@effect/platform/SocketServer/SocketServerError"

/**
 * Error reason for failures that occur while opening a socket server.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class SocketServerOpenError extends Data.TaggedError("SocketServerOpenError")<{
  readonly cause: unknown
}> {
  override get message(): string {
    return "Open"
  }
}

/**
 * Error reason for uncategorized socket server failures.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class SocketServerUnknownError extends Data.TaggedError("SocketServerUnknownError")<{
  readonly cause: unknown
}> {
  override get message(): string {
    return "Unknown"
  }
}

/**
 * Union of socket server error reasons.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type SocketServerErrorReason = SocketServerOpenError | SocketServerUnknownError

/**
 * Tagged socket server error that wraps a server error reason and exposes its
 * cause.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class SocketServerError extends Data.TaggedError("SocketServerError")<{
  readonly reason: SocketServerErrorReason
}> {
  constructor(props: {
    readonly reason: SocketServerErrorReason
  }) {
    super({
      ...props,
      cause: props.reason.cause
    } as any)
  }
  /**
   * Marks this value as a socket server error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ErrorTypeId]: ErrorTypeId = ErrorTypeId

  /**
   * Delegates the public message to the underlying socket server error reason.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message(): string {
    return this.reason.message
  }
}
