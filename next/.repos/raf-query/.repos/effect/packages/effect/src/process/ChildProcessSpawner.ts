/**
 * Service boundary for starting and controlling child processes.
 *
 * `ChildProcessSpawner` is the service used by `ChildProcess` commands to start
 * operating-system processes. A spawner turns a command description into a
 * handle that can write to stdin, read stdout and stderr, wait for exit, kill
 * the process, and manage whether the process keeps its parent alive. Platform
 * backends implement this service, while most application code uses the higher
 * level `ChildProcess` module.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Brand from "../Brand.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Inspectable from "../Inspectable.ts"
import type * as PlatformError from "../PlatformError.ts"
import type * as Scope from "../Scope.ts"
import type * as Sink from "../Sink.ts"
import * as Stream from "../Stream.ts"
import type { Command, KillOptions } from "./ChildProcess.ts"

/**
 * Branded number representing the exit code reported by a child process.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ExitCode = Brand.Branded<number, "ExitCode">

/**
 * Constructs branded child process `ExitCode` values.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const ExitCode: Brand.Constructor<ExitCode> = Brand.nominal<ExitCode>()

/**
 * Branded number representing the operating system process identifier of a
 * child process.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ProcessId = Brand.Branded<number, "ProcessId">

/**
 * Constructs branded child process `ProcessId` values.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const ProcessId: Brand.Constructor<ProcessId> = Brand.nominal<ProcessId>()

/**
 * An `Effect` that adds an unrefed child process back into the parent
 * process's reference count.
 *
 * **Details**
 *
 * This value is returned by `ChildProcessHandle.unref` and can be run later to
 * restore the default behavior where the child process keeps the parent
 * process alive.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Reref = Effect.Effect<void, PlatformError.PlatformError>

const HandleTypeId = "~effect/process/ChildProcessSpawner/ChildProcessHandle"

/**
 * A handle to a running child process.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ChildProcessHandle {
  readonly [HandleTypeId]: typeof HandleTypeId
  /**
   * The child process process identifier.
   */
  readonly pid: ProcessId
  /**
   * Waits for the child process to exit and returns the `ExitCode` of the
   * command that was run.
   */
  readonly exitCode: Effect.Effect<ExitCode, PlatformError.PlatformError>
  /**
   * Returns `true` if the child process is still running, otherwise returns
   * `false`.
   */
  readonly isRunning: Effect.Effect<boolean, PlatformError.PlatformError>
  /**
   * Kills the child process with the provided signal.
   *
   * **Details**
   *
   * If no signal option is provided, the signal defaults to `SIGTERM`.
   */
  readonly kill: (options?: KillOptions | undefined) => Effect.Effect<void, PlatformError.PlatformError>
  /**
   * The standard input sink for the child process.
   */
  readonly stdin: Sink.Sink<void, Uint8Array, never, PlatformError.PlatformError>
  /**
   * The standard output stream for the child process.
   *
   * **Gotchas**
   *
   * Using this stream alongside `all` may cause interleaving of output and
   * unexpected results.
   */
  readonly stdout: Stream.Stream<Uint8Array, PlatformError.PlatformError>
  /**
   * The standard error stream for the child process.
   *
   * **Gotchas**
   *
   * Using this stream alongside `all` may cause interleaving of output and
   * unexpected results.
   */
  readonly stderr: Stream.Stream<Uint8Array, PlatformError.PlatformError>
  /**
   * A stream which combines and interleaves all messages output by the child
   * process `stdout` and `stderr` streams.
   */
  readonly all: Stream.Stream<Uint8Array, PlatformError.PlatformError>
  /**
   * Get an input `Sink` for writing to a file descriptor configured via
   * `ChildProcessOptions.additionalFds`.
   *
   * **Details**
   *
   * If a file descriptor is accessed that was not configured, returns a drain
   * `Sink`.
   */
  readonly getInputFd: (fd: number) => Sink.Sink<void, Uint8Array, never, PlatformError.PlatformError>
  /**
   * Get an output `Stream` for reading from a file descriptor configured via
   * `ChildProcessOptions.additionalFds`.
   *
   * **Details**
   *
   * If a file descriptor is accessed that was not configured, returns an empty
   * `Stream`.
   */
  readonly getOutputFd: (fd: number) => Stream.Stream<Uint8Array, PlatformError.PlatformError>
  /**
   * Allows the parent process to exit independently of this child process.
   *
   * **Details**
   *
   * Running this `Effect` removes this child process from the parent process's
   * reference count, so the parent process is allowed to exit without waiting
   * for the child process to finish.
   *
   * The returned `Reref` effect adds the child process back into the parent
   * process's reference count when run, restoring the default behavior.
   *
   * **Gotchas**
   *
   * This is the only supported way to re-reference a child process after it
   * has been unrefed.
   *
   * **Example** (Temporarily unreferencing a child process)
   *
   * ```ts import.meta.vitest
   * import { Effect } from "effect"
   * import type { ChildProcessSpawner } from "effect/process"
   *
   * let referenced = true
   *
   * const unref: ChildProcessSpawner.ChildProcessHandle["unref"] = Effect.sync(() => {
   *   referenced = false
   *   const reref: ChildProcessSpawner.Reref = Effect.sync(() => {
   *     referenced = true
   *   })
   *   return reref
   * })
   *
   * const program = Effect.gen(function*() {
   *   const states = [] as Array<boolean>
   *   const reref = yield* unref
   *   states.push(referenced)
   *
   *   yield* reref
   *   states.push(referenced)
   *   return states
   * })
   *
   * Effect.runSync(program) // => [false, true]
   * ```
   */
  readonly unref: Effect.Effect<Reref, PlatformError.PlatformError>
}

const HandleProto = {
  [HandleTypeId]: HandleTypeId,
  ...Inspectable.BaseProto,
  toJSON(this: ChildProcessHandle) {
    return { _id: "ChildProcessHandle", pid: this.pid }
  }
}

/**
 * Constructs a new `ChildProcessHandle`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeHandle = (params: Omit<ChildProcessHandle, typeof HandleTypeId>): ChildProcessHandle =>
  Object.setPrototypeOf({ ...params }, HandleProto)

/**
 * Creates a `ChildProcessSpawner` service from a `spawn` function, deriving
 * helpers for exit codes and output collection from that implementation.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (spawn: ChildProcessSpawner["Service"]["spawn"]): ChildProcessSpawner["Service"] => {
  const streamString: ChildProcessSpawner["Service"]["streamLines"] = (command, options) =>
    spawn(command).pipe(
      Effect.map((handle) =>
        Stream.decodeText(
          options?.includeStderr === true ? handle.all : handle.stdout
        )
      ),
      Stream.unwrap
    )
  const streamLines: ChildProcessSpawner["Service"]["streamLines"] = (command, options) =>
    Stream.splitLines(streamString(command, options))

  return ChildProcessSpawner.of({
    spawn,
    exitCode: (command) => Effect.scoped(Effect.flatMap(spawn(command), (handle) => handle.exitCode)),
    streamString,
    streamLines,
    lines: (command, options) => Stream.runCollect(streamLines(command, options)),
    string: (command, options) => Stream.mkString(streamString(command, options))
  })
}

/**
 * Service tag for child process spawning.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ChildProcessSpawner extends Context.Service<ChildProcessSpawner, {
  /**
   * Spawn a command and return a handle for interaction.
   */
  spawn(
    command: Command
  ): Effect.Effect<ChildProcessHandle, PlatformError.PlatformError, Scope.Scope>

  /**
   * Run a command and return its exit code.
   */
  exitCode(
    command: Command
  ): Effect.Effect<ExitCode, PlatformError.PlatformError>

  /**
   * Stream the output of a command as strings. Optionally include stderr output
   * interleaved with stdout.
   */
  streamString(command: Command, options?: {
    readonly includeStderr?: boolean | undefined
  }): Stream.Stream<string, PlatformError.PlatformError>

  /**
   * Stream the output of a command as lines. Optionally include stderr output
   * interleaved with stdout.
   */
  streamLines(command: Command, options?: {
    readonly includeStderr?: boolean | undefined
  }): Stream.Stream<string, PlatformError.PlatformError>

  /**
   * Run a command and return the lines of its output as an array of strings.
   */
  lines(command: Command, options?: {
    readonly includeStderr?: boolean | undefined
  }): Effect.Effect<Array<string>, PlatformError.PlatformError>

  /**
   * Run a command and return its output as a string.
   */
  string(command: Command, options?: {
    readonly includeStderr?: boolean | undefined
  }): Effect.Effect<string, PlatformError.PlatformError>
}>()("effect/process/ChildProcessSpawner") {}
