/**
 * Service contract for command-line arguments and standard input, output, and
 * error output. It lets programs depend on standard I/O through the Effect
 * environment instead of reading from or writing to global process handles
 * directly.
 *
 * The service exposes arguments as an `Effect`, stdout and stderr as `Sink`s
 * that accept strings or bytes, and stdin as a byte `Stream`. This module also
 * provides a constructor for service values and a small test layer with
 * overridable defaults.
 *
 * @since 4.0.0
 */
import * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"
import * as Layer from "./Layer.ts"
import type { PlatformError } from "./PlatformError.ts"
import * as Sink from "./Sink.ts"
import * as Stream from "./Stream.ts"

/**
 * String literal type used as the unique brand for the `Stdio` service.
 *
 * **When to use**
 *
 * Use to type the runtime identifier stored on `Stdio` service implementations.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/Stdio"

/**
 * Runtime identifier stored on `Stdio` service implementations.
 *
 * **Details**
 *
 * This marker is part of the runtime representation of `Stdio` service
 * implementations.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/Stdio"

/**
 * Defines the service interface for process standard I/O.
 *
 * **When to use**
 *
 * Use to depend on command-line arguments and standard I/O through the Effect
 * environment.
 *
 * **Details**
 *
 * The service provides command-line arguments, sinks for standard output and
 * standard error, and a stream of standard input bytes. I/O operations can fail
 * with `PlatformError`.
 *
 * @category services
 * @since 4.0.0
 */
export interface Stdio {
  readonly [TypeId]: TypeId
  readonly args: Effect.Effect<ReadonlyArray<string>>
  /**
   * Whether standard input is attached to a terminal.
   *
   * @since 4.0.0
   */
  readonly stdinIsTerminal: Effect.Effect<boolean>
  /**
   * Whether standard output is attached to a terminal.
   *
   * @since 4.0.0
   */
  readonly stdoutIsTerminal: Effect.Effect<boolean>
  stdout(options?: {
    readonly endOnDone?: boolean | undefined
  }): Sink.Sink<void, string | Uint8Array, never, PlatformError>
  stderr(options?: {
    readonly endOnDone?: boolean | undefined
  }): Sink.Sink<void, string | Uint8Array, never, PlatformError>
  readonly stdin: Stream.Stream<Uint8Array, PlatformError>
}
/**
 * Service tag for process standard I/O.
 *
 * **When to use**
 *
 * Use when you need command-line arguments or standard I/O streams supplied by
 * an effect's environment.
 *
 * @see {@link make} for constructing a `Stdio` service directly
 * @see {@link layerTest} for a test layer with defaults and overrides
 *
 * @category services
 * @since 4.0.0
 */
export const Stdio: Context.Service<Stdio, Stdio> = Context.Service<Stdio>(TypeId)

/**
 * Creates a `Stdio` service implementation from the provided fields and
 * attaches the `Stdio` type identifier.
 *
 * **When to use**
 *
 * Use when you need to assemble a concrete `Stdio` service from command-line
 * arguments and standard I/O implementations.
 *
 * **Details**
 *
 * The returned service reuses the supplied fields unchanged and adds the
 * `Stdio` type identifier. Omitted terminal-detection fields default to
 * effects that succeed with `false`.
 *
 * @see {@link layerTest} for a test layer with default fields that can be overridden
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options:
    & Omit<Stdio, TypeId | "stdinIsTerminal" | "stdoutIsTerminal">
    & Partial<Pick<Stdio, "stdinIsTerminal" | "stdoutIsTerminal">>
): Stdio => ({
  [TypeId]: TypeId,
  stdinIsTerminal: Effect.succeed(false),
  stdoutIsTerminal: Effect.succeed(false),
  ...options
})

/**
 * Creates a test layer for `Stdio`.
 *
 * **When to use**
 *
 * Use to provide deterministic standard I/O in tests while overriding only the
 * command-line arguments, input stream, or output sinks relevant to the case.
 *
 * **Details**
 *
 * Any provided fields override defaults. By default, arguments are empty,
 * standard output and error are draining sinks, and standard input is an empty
 * stream, and terminal-detection effects succeed with `false`.
 *
 * @see {@link make} for constructing a `Stdio` service directly without a `Layer` or defaults
 *
 * @category layers
 * @since 4.0.0
 */
export const layerTest = (impl: Partial<Stdio>): Layer.Layer<Stdio> =>
  Layer.succeed(
    Stdio,
    make({
      args: Effect.succeed([]),
      stdout: () => Sink.drain,
      stderr: () => Sink.drain,
      stdin: Stream.empty,
      ...impl
    })
  )
