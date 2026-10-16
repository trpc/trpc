/**
 * Normalized errors for platform APIs.
 *
 * Platform services such as file systems, terminals, and sockets use
 * `PlatformError` to report host-level failures in a consistent shape. The
 * wrapper records whether the problem came from an invalid argument or from the
 * operating system, while preserving useful details such as the module, method,
 * path, descriptor, description, and original cause when available.
 *
 * @since 4.0.0
 */
import * as Data from "./Data.ts"
import * as Predicate from "./Predicate.ts"

const TypeId = "~effect/PlatformError"

/**
 * Error data for an invalid argument passed to a platform API.
 *
 * **When to use**
 *
 * Use when you need to model caller input rejected before a platform operation
 * runs, including invalid-argument reason data.
 *
 * **Details**
 *
 * The error records the module and method that rejected the argument, with an
 * optional description and cause. It is usually wrapped in `PlatformError`.
 *
 * @see {@link badArgument} for creating a wrapped `PlatformError` whose reason is `BadArgument`
 * @see {@link SystemError} for failures reported by the host platform or operating system
 * @see {@link PlatformError} for the wrapper used by most platform APIs
 *
 * @category errors
 * @since 4.0.0
 */
export class BadArgument extends Data.TaggedError("BadArgument")<{
  module: string
  method: string
  description?: string | undefined
  cause?: unknown
}> {
  /**
   * Formats the module, method, and optional description that rejected the argument.
   *
   * **When to use**
   *
   * Use to read the formatted error message for a rejected platform argument.
   *
   * @since 4.0.0
   */
  override get message(): string {
    return `${this.module}.${this.method}${this.description ? `: ${this.description}` : ""}`
  }
}

/**
 * Normalized category for failures reported by platform or system operations.
 *
 * **When to use**
 *
 * Use to type or match the normalized `_tag` on `SystemError` values reported
 * by platform operations.
 *
 * **Details**
 *
 * The tags group lower-level platform errors into a stable set such as
 * `NotFound`, `PermissionDenied`, `TimedOut`, and `Unknown`.
 *
 * @see {@link SystemError} for the error data that carries this tag on its `_tag` field
 * @see {@link systemError} for creating a `PlatformError` from a system failure with one of these tags
 *
 * @category errors
 * @since 4.0.0
 */
export type SystemErrorTag =
  | "AlreadyExists"
  | "BadResource"
  | "Busy"
  | "InvalidData"
  | "NotFound"
  | "PermissionDenied"
  | "TimedOut"
  | "UnexpectedEof"
  | "Unknown"
  | "WouldBlock"
  | "WriteZero"

/**
 * Error data for a platform or system operation failure.
 *
 * **When to use**
 *
 * Use when you need normalized reason data for a platform or system operation
 * failure, including the operation details.
 *
 * **Details**
 *
 * The error records a normalized `_tag`, the module and method that failed,
 * and optional details such as the syscall, path or descriptor, description,
 * and original cause. It is usually wrapped in `PlatformError`.
 *
 * @see {@link systemError} for creating the usual `PlatformError` wrapper from this reason data
 * @see {@link BadArgument} for platform API failures caused by rejected caller input before an operation runs
 * @see {@link SystemErrorTag} for the normalized tag values stored in `_tag`
 *
 * @category errors
 * @since 4.0.0
 */
export class SystemError extends Data.Error<{
  _tag: SystemErrorTag
  module: string
  method: string
  description?: string | undefined
  syscall?: string | undefined
  pathOrDescriptor?: string | number | undefined
  cause?: unknown
}> {
  /**
   * Formats the normalized system error tag with operation and path details.
   *
   * **When to use**
   *
   * Use to read the formatted error message for a normalized system failure.
   *
   * @since 4.0.0
   */
  override get message(): string {
    return `${this._tag}: ${this.module}.${this.method}${
      this.pathOrDescriptor !== undefined ? ` (${this.pathOrDescriptor})` : ""
    }${this.description ? `: ${this.description}` : ""}`
  }
}

/**
 * Tagged error used by platform APIs to report either invalid arguments or
 * system-level failures.
 *
 * **When to use**
 *
 * Use as the shared error type for platform APIs that expose invalid arguments
 * and host or operating-system failures through a single `Effect` error
 * channel.
 *
 * **Details**
 *
 * The `reason` field contains the underlying `BadArgument` or `SystemError`.
 * When that reason has a cause, the cause is preserved on the wrapper.
 *
 * @see {@link BadArgument} for invalid inputs rejected before an operation runs
 * @see {@link SystemError} for failures reported by the host platform or operating system
 * @see {@link badArgument} for creating this wrapper from rejected caller input
 * @see {@link systemError} for creating this wrapper from a host or operating-system failure
 *
 * @category errors
 * @since 4.0.0
 */
export class PlatformError extends Data.TaggedError("PlatformError")<{
  reason: BadArgument | SystemError
}> {
  constructor(reason: BadArgument | SystemError) {
    if ("cause" in reason) {
      super({ reason, cause: reason.cause } as any)
    } else {
      super({ reason })
    }
  }

  /**
   * Marks this value as a platform error wrapper for runtime guards.
   *
   * **When to use**
   *
   * Use to identify `PlatformError` values through their runtime type marker.
   *
   * @since 4.0.0
   */
  readonly [TypeId]: typeof TypeId = TypeId

  override get message(): string {
    return this.reason.message
  }
}

/**
 * Returns `true` if a value is a `PlatformError`.
 *
 * **When to use**
 *
 * Use to narrow a caught defect, or an error channel typed more loosely than
 * the platform APIs, to `PlatformError`.
 *
 * **Example** (Checking a caught value)
 *
 * ```ts import.meta.vitest
 * import { PlatformError } from "effect"
 *
 * const error = PlatformError.badArgument({
 *   module: "FileSystem",
 *   method: "readFile"
 * })
 *
 * PlatformError.isPlatformError(error) // => true
 * PlatformError.isPlatformError(new Error("boom")) // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isPlatformError = (u: unknown): u is PlatformError => Predicate.hasProperty(u, TypeId)

/**
 * Creates a `PlatformError` whose reason is a `SystemError`.
 *
 * **When to use**
 *
 * Use to adapt an operating-system or platform failure into the normalized
 * platform error model.
 *
 * @category constructors
 * @since 4.0.0
 */
export const systemError = (options: {
  readonly _tag: SystemErrorTag
  readonly module: string
  readonly method: string
  readonly description?: string | undefined
  readonly syscall?: string | undefined
  readonly pathOrDescriptor?: string | number | undefined
  readonly cause?: unknown
}): PlatformError => new PlatformError(new SystemError(options))

/**
 * Creates a `PlatformError` whose reason is a `BadArgument`.
 *
 * **When to use**
 *
 * Use to report a platform API rejecting caller input before performing the
 * underlying operation.
 *
 * @category constructors
 * @since 4.0.0
 */
export const badArgument = (options: {
  readonly module: string
  readonly method: string
  readonly description?: string | undefined
  readonly cause?: unknown
}): PlatformError => new PlatformError(new BadArgument(options))
