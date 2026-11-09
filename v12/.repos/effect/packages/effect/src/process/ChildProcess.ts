/**
 * Describes child processes before they are started.
 *
 * A `Command` stores the executable, arguments, environment, standard streams,
 * working directory, and other process options. Commands can also be piped
 * together. A command is an `Effect`; running it asks the
 * `ChildProcessSpawner` service to start the process and returns a
 * `ChildProcessHandle`.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import type * as Duration from "../Duration.ts"
import type * as Effect from "../Effect.ts"
import * as Effectable from "../Effectable.ts"
import { dual } from "../Function.ts"
import type * as PlatformError from "../PlatformError.ts"
import * as Predicate from "../Predicate.ts"
import type * as Redacted from "../Redacted.ts"
import * as Result from "../Result.ts"
import type * as Scope from "../Scope.ts"
import type * as Sink from "../Sink.ts"
import type * as Stream from "../Stream.ts"
import { type ChildProcessHandle, ChildProcessSpawner } from "./ChildProcessSpawner.ts"
import * as CommandLine from "./CommandLine.ts"

const TypeId = "~effect/process/ChildProcess"

/**
 * A command that can be built using `make`, combined using `pipeTo`, and executed using `exec` or `spawn`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Command =
  | StandardCommand
  | PipedCommand

/**
 * A standard command with pre-parsed command and arguments.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StandardCommand extends
  Effect.Effect<
    ChildProcessHandle,
    PlatformError.PlatformError,
    ChildProcessSpawner | Scope.Scope
  >
{
  readonly _tag: "StandardCommand"
  readonly command: string
  readonly args: ReadonlyArray<CommandLine.Word>
  readonly options: CommandOptions
}

/**
 * A pipeline of commands where the output of one is piped to the input of the
 * next.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PipedCommand extends
  Effect.Effect<
    ChildProcessHandle,
    PlatformError.PlatformError,
    ChildProcessSpawner | Scope.Scope
  >
{
  readonly _tag: "PipedCommand"
  readonly left: Command
  readonly right: Command
  readonly options: PipeOptions
}

/**
 * Specifies which stream to pipe from the source subprocess.
 *
 * **Details**
 *
 * - `"stdout"`: Pipe stdout from the source (default)
 * - `"stderr"`: Pipe stderr from the source
 * - `"all"`: Pipe both stdout and stderr interleaved
 * - `` `fd${number}` ``: Pipe from a custom file descriptor (e.g., `"fd3"`)
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PipeFromOption = "stdout" | "stderr" | "all" | `fd${number}`

/**
 * Specifies which input to pipe to on the destination subprocess.
 *
 * **Details**
 *
 * - `"stdin"`: Pipe to stdin of the destination (default)
 * - `` `fd${number}` ``: Pipe to a custom file descriptor (e.g., `"fd3"`)
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PipeToOption = "stdin" | `fd${number}`

/**
 * Options for controlling how commands are piped together.
 *
 * **Example** (Piping stderr between commands)
 *
 * ```ts import.meta.vitest
 * import { ChildProcess } from "effect/process"
 *
 * // Pipe stderr instead of stdout
 * const pipeline = ChildProcess.make`my-program`.pipe(
 *   ChildProcess.pipeTo(ChildProcess.make`grep error`, { from: "stderr" })
 * )
 * const result = [pipeline._tag, pipeline.options.from] // => ["PipedCommand", "stderr"]
 * ```
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface PipeOptions {
  /**
   * Which stream to pipe from the source subprocess.
   *
   * **Details**
   *
   * - `"stdout"` (default): Pipe stdout from the source
   * - `"stderr"`: Pipe stderr from the source
   * - `"all"`: Pipe both stdout and stderr interleaved
   * - `"fd3"`, `"fd4"`, etc.: Pipe from a custom file descriptor
   */
  readonly from?: PipeFromOption | undefined

  /**
   * Which input to pipe to on the destination subprocess.
   *
   * **Details**
   *
   * - `"stdin"` (default): Pipe to stdin of the destination
   * - `"fd3"`, `"fd4"`, etc.: Pipe to a custom file descriptor. A descriptor
   *   configured as `"duplex"` stays duplex.
   */
  readonly to?: PipeToOption | undefined
}

/**
 * Input type for child process stdin.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CommandInput =
  | "pipe"
  | "inherit"
  | "ignore"
  | "overlapped"
  | Stream.Stream<Uint8Array, PlatformError.PlatformError>

/**
 * Output type for child process stdout/stderr.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CommandOutput =
  | "pipe"
  | "inherit"
  | "ignore"
  | "overlapped"
  | Sink.Sink<Uint8Array, Uint8Array, never, PlatformError.PlatformError>

/**
 * A signal that can be sent to a child process.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Signal =
  | "SIGABRT"
  | "SIGALRM"
  | "SIGBUS"
  | "SIGCHLD"
  | "SIGCONT"
  | "SIGFPE"
  | "SIGHUP"
  | "SIGILL"
  | "SIGINT"
  | "SIGIO"
  | "SIGIOT"
  | "SIGKILL"
  | "SIGPIPE"
  | "SIGPOLL"
  | "SIGPROF"
  | "SIGPWR"
  | "SIGQUIT"
  | "SIGSEGV"
  | "SIGSTKFLT"
  | "SIGSTOP"
  | "SIGSYS"
  | "SIGTERM"
  | "SIGTRAP"
  | "SIGTSTP"
  | "SIGTTIN"
  | "SIGTTOU"
  | "SIGUNUSED"
  | "SIGURG"
  | "SIGUSR1"
  | "SIGUSR2"
  | "SIGVTALRM"
  | "SIGWINCH"
  | "SIGXCPU"
  | "SIGXFSZ"
  | "SIGBREAK"
  | "SIGLOST"
  | "SIGINFO"

/**
 * The encoding format to use for binary data.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Encoding =
  | "ascii"
  | "utf8"
  | "utf-8"
  | "utf16le"
  | "utf-16le"
  | "ucs2"
  | "ucs-2"
  | "base64"
  | "base64url"
  | "latin1"
  | "binary"
  | "hex"

/**
 * Options that can be used to control how a child process is terminated.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface KillOptions {
  /**
   * The default signal used to terminate the child process. Defaults to `"SIGTERM"`.
   */
  readonly killSignal?: Signal | undefined
  /**
   * The duration of time to wait after the child process has been terminated
   * before forcefully killing the child process by sending it the `"SIGKILL"`
   * signal. Defaults to `undefined`, so `"SIGKILL"` is never sent and termination
   * waits for the process to exit with no time limit.
   *
   * **Details**
   *
   * The spawner decides whether to terminate descendants and how long to wait.
   * See its platform module documentation, such as `NodeChildProcessSpawner`.
   */
  readonly forceKillAfter?: Duration.Input | undefined
}

/**
 * Configuration for the child process standard input stream.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StdinConfig {
  /**
   * The configuration for the standard input stream of the child process.
   *
   * **Details**
   *
   * Can be a string indicating how the operating system should configure the
   * pipe established between the child process `stdin` and the parent process.
   *
   * Can also be a `Stream`, which will pipe all elements produced into the
   * `stdin` of the child process.
   *
   * Defaults to "pipe".
   */
  readonly stream: CommandInput
  /**
   * Whether or not the child process `stdin` should be closed after the input
   * stream is finished. Defaults to `true`.
   */
  readonly endOnDone?: boolean | undefined
  /**
   * The buffer encoding to use to decode string chunks. Defaults to `utf-8`.
   */
  readonly encoding?: Encoding | undefined
}

/**
 * Configuration for the child process standard output stream.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StdoutConfig {
  /**
   * The configuration for the standard output stream of the child process.
   *
   * **Details**
   *
   * Can be a string indicating how the operating system should configure the
   * pipe established between the child process `stdout` and the parent process.
   *
   * A `Sink` can also be passed. The output is transduced through the sink as
   * `handle.stdout` is consumed, and `handle.stdout` emits the results produced by
   * the sink instead of the raw output.
   *
   * Defaults to "pipe".
   *
   * **Gotchas**
   *
   * A `Sink` only receives data while `handle.stdout` is being consumed. If
   * it is never consumed, the sink receives nothing and a child process that
   * writes more than the pipe buffer can block before it exits.
   */
  readonly stream?: CommandOutput | undefined
}

/**
 * Configuration for the child process standard error stream.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StderrConfig {
  /**
   * The configuration for the standard error stream of the child process.
   *
   * **Details**
   *
   * Can be a string indicating how the operating system should configure the
   * pipe established between the child process `stderr` and the parent process.
   *
   * A `Sink` can also be passed. The output is transduced through the sink as
   * `handle.stderr` is consumed, and `handle.stderr` emits the results produced by
   * the sink instead of the raw output.
   *
   * Defaults to "pipe".
   *
   * **Gotchas**
   *
   * A `Sink` only receives data while `handle.stderr` is being consumed. If
   * it is never consumed, the sink receives nothing and a child process that
   * writes more than the pipe buffer can block before it exits.
   */
  readonly stream?: CommandOutput | undefined
}

/**
 * Configuration for additional file descriptors to expose to the child process.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AdditionalFdConfig =
  | {
    /**
     * The direction of data flow for this file descriptor.
     * - "input": Data flows from parent to child (writable by parent)
     * - "output": Data flows from child to parent (readable by parent)
     */
    readonly type: "input"
    /**
     * For input file descriptors, an optional stream to pipe into the file
     * descriptor..
     */
    readonly stream?: Stream.Stream<Uint8Array, PlatformError.PlatformError> | undefined
  }
  | {
    /**
     * The direction of data flow for this file descriptor.
     * - "input": Data flows from parent to child (writable by parent)
     * - "output": Data flows from child to parent (readable by parent)
     */
    readonly type: "output"
    /**
     * For output file descriptors, an optional sink which receives data from
     * the file descriptor.
     *
     * **Details**
     *
     * The data is transduced through the sink as `handle.getOutputFd(fd)` is
     * consumed, and that stream emits the results produced by the sink
     * instead of the raw output.
     *
     * **Gotchas**
     *
     * The sink only receives data while `handle.getOutputFd(fd)` is being
     * consumed. If it is never consumed, the sink receives nothing and a child
     * process that writes more than the pipe buffer can block before it exits.
     */
    readonly sink?: Sink.Sink<Uint8Array, Uint8Array, never, PlatformError.PlatformError> | undefined
  }
  | {
    /**
     * The direction of data flow for this file descriptor.
     * - "duplex": Data flows in both directions over the same file descriptor
     *   (writable and readable by parent)
     */
    readonly type: "duplex"
    /**
     * An optional stream to write into the file descriptor. The write side is
     * ended when the stream completes.
     */
    readonly stream?: Stream.Stream<Uint8Array, PlatformError.PlatformError> | undefined
    /**
     * An optional sink which receives data read from the file descriptor.
     */
    readonly sink?: Sink.Sink<Uint8Array, Uint8Array, never, PlatformError.PlatformError> | undefined
  }

/**
 * Options for command execution.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface CommandOptions extends KillOptions {
  /**
   * The current working directory of the child process.
   */
  readonly cwd?: string | undefined
  /**
   * The environment of the child process.
   *
   * **Details**
   *
   * If `extendEnv` is set to `true`, the value of `env` will be merged with
   * the value of `globalThis.process.env`, prioritizing the values in `env`
   * when conflicts exist. A variable set to `undefined` is then removed from
   * the child environment.
   *
   * `Redacted` values are passed to the child unchanged and are never shown in
   * errors.
   *
   * **Gotchas**
   *
   * Without `extendEnv: true`, providing `env` replaces the inherited child
   * environment. The child will not receive `PATH` unless `env` includes it.
   */
  readonly env?: Record<string, string | Redacted.Redacted<string> | undefined> | undefined
  /**
   * If set to `true`, the child process uses both the values in `env` as well
   * as the values in `globalThis.process.env`, prioritizing the values in `env`
   * when conflicts exist.
   *
   * **Details**
   *
   * If set to `false` and `env` is provided, only the value of `env` is used.
   *
   * @default false
   */
  readonly extendEnv?: boolean | undefined
  /**
   * If set to `true`, runs the command as a script inside of a shell,
   * defaulting to `/bin/sh` on UNIX systems and `cmd.exe` on Windows.
   *
   * **Details**
   *
   * Can also be set to a string representing the absolute path to a shell to
   * use on the system. The command is the whole script; build it with
   * `CommandLine.join` or `CommandLine.quote` when it contains values.
   *
   * This is also the way to run a command configured as shell text, such as
   * the `EDITOR` environment variable. The setting is trusted shell text and
   * runs as written, so use it as the start of the script and quote the values
   * that follow it. Name a POSIX shell, because `shell: true` runs `cmd.exe` on
   * Windows, which POSIX quoting does not protect.
   *
   * **Gotchas**
   *
   * - Running a command with both `shell` and arguments fails with a
   *   `BadArgument` error, because shells would join the arguments into the
   *   script without quoting them.
   * - On Windows the script runs in `cmd.exe`, which no `CommandLine` format
   *   quotes for. `CommandLine.join` with `format: "windows"` is only safe for
   *   arguments without `%`, `^`, `&`, `|`, `<` or `>`.
   * - It is generally disadvised to use this option.
   *
   * **Example** (Running a configured editor)
   *
   * ```ts import.meta.vitest
   * import { Result } from "effect"
   * import { ChildProcess, CommandLine } from "effect/process"
   *
   * const editor = "code --wait" // for example, process.env.EDITOR
   * const file = "notes from today.txt"
   *
   * const command = ChildProcess.make(`${editor} ${Result.getOrThrow(CommandLine.quote(file))}`, {
   *   shell: "/bin/sh"
   * })
   * command.command // => "code --wait 'notes from today.txt'"
   * ```
   */
  readonly shell?: boolean | string | undefined
  /**
   * If set to `true`, the child process will run independently of the parent
   * process.
   *
   * **Details**
   *
   * The specific behavior of this option depends upon the platform. For
   * example, the NodeJS documentation outlines the differences between Windows
   * and non-Windows platforms.
   *
   * See https://nodejs.org/api/child_process.html#child_process_options_detached.
   *
   * Defaults to `true` on non-Windows platforms and `false` on Windows platforms.
   */
  readonly detached?: boolean | undefined
  /**
   * If set to `true`, prevents the child process's console or GUI window from
   * becoming visible on Windows.
   *
   * **Details**
   *
   * Defaults to `true` unless `detached` is set to `true`. This option has no
   * effect on non-Windows platforms.
   */
  readonly windowsHide?: boolean | undefined
  /**
   * Configuration options for the standard input stream for the child process.
   */
  readonly stdin?: CommandInput | StdinConfig | undefined
  /**
   * Configuration options for the standard output stream for the child process.
   */
  readonly stdout?: CommandOutput | StdoutConfig | undefined
  /**
   * Configuration options for the standard error stream for the child process.
   */
  readonly stderr?: CommandOutput | StderrConfig | undefined
  /**
   * Additional file descriptors to expose to the child process beyond `stdin` /
   * `stdout` / `stderr`.
   *
   * **Details**
   *
   * Keys use the descriptor index: `"fd3"`, `"fd4"`, etc. (index >= 3).
   *
   * For `"duplex"`, use `getInputFd` to write and `getOutputFd` to read the same
   * descriptor. `pipeTo` preserves duplex targets, replacing only their input.
   *
   * Duplex request/response and half-close are verified on Linux with Node.js
   * and raw Deno `node:child_process` (not Effect's spawner). The same behavior
   * is expected on macOS; Windows request/response is expected but unverified.
   * Half-close is unsupported on Windows and Bun: keep the input open until
   * all responses are read. Bun extra descriptors on Windows are unverified.
   * Native `DenoChildProcessSpawner` does not support additional descriptors.
   *
   * Node.js and Deno children can use `new net.Socket({ fd: 3 })`. Deno children
   * cannot use `node:fs` on the raw descriptor; Bun children cannot use
   * `net.Socket` on it.
   *
   * **Example** (Configuring additional file descriptors)
   *
   * ```ts import.meta.vitest
   * import { ChildProcess } from "effect/process"
   *
   * // Output fd3 - read data from child
   * const cmd1 = ChildProcess.make("my-program", [], {
   *   additionalFds: {
   *     fd3: { type: "output" }
   *   }
   * })
   *
   * // Input fd3 - write data to child
   * const cmd2 = ChildProcess.make("my-program", [], {
   *   additionalFds: {
   *     fd3: { type: "input" }
   *   }
   * })
   * // Duplex fd3 - write and read over the same descriptor
   * const cmd3 = ChildProcess.make("my-program", [], {
   *   additionalFds: {
   *     fd3: { type: "duplex" }
   *   }
   * })
   * const result = [
   *   cmd1.options.additionalFds?.fd3?.type,
   *   cmd2.options.additionalFds?.fd3?.type,
   *   cmd3.options.additionalFds?.fd3?.type
   * ]
   * result // => ["output", "input", "duplex"]
   * ```
   */
  readonly additionalFds?: Record<`fd${number}`, AdditionalFdConfig> | undefined
}

// =============================================================================
// Constructors
// =============================================================================

const Proto = {
  ...Effectable.Prototype<Command>({
    label: "Command",
    evaluate(fiber) {
      return Context.getUnsafe(fiber.context, ChildProcessSpawner).spawn(this)
    }
  }),
  [TypeId]: TypeId
}

/**
 * Checks whether a value is a `Command`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isCommand = (u: unknown): u is Command => Predicate.hasProperty(u, TypeId)

/**
 * Checks whether a command is a `StandardCommand`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isStandardCommand = (command: Command): command is StandardCommand => command._tag === "StandardCommand"

/**
 * Checks whether a command is a `PipedCommand`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPipedCommand = (command: Command): command is PipedCommand => command._tag === "PipedCommand"

const makeStandardCommand = (
  command: string,
  args: ReadonlyArray<CommandLine.Word>,
  options: CommandOptions
): StandardCommand =>
  Object.assign(Object.create(Proto), {
    _tag: "StandardCommand",
    command,
    args,
    options
  })

const makePipedCommand = (
  left: Command,
  right: Command,
  options: PipeOptions = {}
): PipedCommand =>
  Object.assign(Object.create(Proto), {
    _tag: "PipedCommand",
    left,
    right,
    options
  })

/**
 * Create a command from a template literal, options + template, or array form.
 *
 * **Details**
 *
 * This function supports three calling conventions:
 * 1. Template literal: `make\`npm run build\``
 * 2. Options + template literal: `make({ cwd: "/app" })\`npm run build\``
 * 3. Array form: `make("npm", ["run", "build"], options?)`
 *
 * Templates are split with `CommandLine.template`: quotes group words, each
 * `${}` value is one literal argument, and an argument that contains a
 * `Redacted` value stays `Redacted`. Arguments in the array form can be
 * `Redacted` too.
 *
 * With the `shell` option, the template text is the shell script and is kept
 * as written.
 *
 * **Gotchas**
 *
 * - A template is parsed when `make` is called. Shell syntax such as `|`,
 *   `$HOME`, `*` or `~` throws a `CommandLine.CommandLineError`: quote it, or
 *   pass the value with `${}`.
 * - A template with the `shell` option cannot contain `${}` values, because
 *   their quoting depends on the shell. Build the script with
 *   `CommandLine.quote` and pass it as a string.
 * - The program name, the first word, cannot be `Redacted`.
 * - A NUL character in the command, an argument or an `env` value fails with
 *   a `BadArgument` error when the command is spawned.
 *
 * **Example** (Creating commands)
 *
 * ```ts import.meta.vitest
 * import { ChildProcess } from "effect/process"
 *
 * // Template literal form; quotes group words
 * const cmd1 = ChildProcess.make`echo "hello world"`
 *
 * // With options
 * const cmd2 = ChildProcess.make({ cwd: "/tmp" })`ls -la`
 *
 * // Array form
 * const cmd3 = ChildProcess.make("git", ["status"])
 *
 * const result = [cmd1.args[0], cmd2.options.cwd, cmd3.args[0]] // => ["hello world", "/tmp", "status"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: {
  (
    command: string,
    options?: CommandOptions
  ): StandardCommand
  (
    command: string,
    args: ReadonlyArray<CommandLine.Word>,
    options?: CommandOptions
  ): StandardCommand
  (
    options: CommandOptions
  ): (
    templates: TemplateStringsArray,
    ...expressions: ReadonlyArray<CommandLine.TemplateExpression>
  ) => StandardCommand
  (
    templates: TemplateStringsArray,
    ...expressions: ReadonlyArray<CommandLine.TemplateExpression>
  ): StandardCommand
} = function make(...args: Array<unknown>): any {
  // Template literal form: make`command`
  if (isTemplateString(args[0])) {
    const [templates, ...expressions] = args as [TemplateStringsArray, ...ReadonlyArray<CommandLine.TemplateExpression>]
    const [command, cmdArgs] = parseTemplate(templates, expressions)
    return makeStandardCommand(command, cmdArgs, {})
  }

  // Options form: make({ cwd: "/tmp" })`command`
  if (typeof args[0] === "object" && !Array.isArray(args[0]) && !isTemplateString(args[0])) {
    const options = args[0] as CommandOptions
    return function(
      templates: TemplateStringsArray,
      ...expressions: ReadonlyArray<CommandLine.TemplateExpression>
    ): StandardCommand {
      if (options.shell !== undefined && options.shell !== false) {
        return makeStandardCommand(shellScript(templates, expressions), [], options)
      }
      const [command, cmdArgs] = parseTemplate(templates, expressions)
      return makeStandardCommand(command, cmdArgs, options)
    }
  }

  // Standard form without arguments: make("command", options?)
  if (typeof args[0] === "string" && !Array.isArray(args[1])) {
    const [command, options = {}] = args as [string, CommandOptions?]
    return makeStandardCommand(command, [], options)
  }

  // Standard form with arguments: make("command", ["arg1", "arg2"], options?)
  const [command, cmdArgs = [], options = {}] = args as [
    string,
    ReadonlyArray<CommandLine.Word>?,
    CommandOptions?
  ]
  return makeStandardCommand(command, cmdArgs, options)
}

/**
 * Pipes the output of one command to the input of another.
 *
 * **Details**
 *
 * By default, pipes `stdout` from the source to `stdin` of the destination.
 * Use the `options` parameter to customize which streams are connected.
 *
 * **Example** (Piping command output)
 *
 * ```ts import.meta.vitest
 * import { ChildProcess } from "effect/process"
 *
 * // Pipe stdout (default)
 * const pipeline1 = ChildProcess.make`cat file.txt`.pipe(
 *   ChildProcess.pipeTo(ChildProcess.make`grep pattern`)
 * )
 *
 * // Pipe stderr instead of stdout
 * const pipeline2 = ChildProcess.make`my-program`.pipe(
 *   ChildProcess.pipeTo(ChildProcess.make`grep error`, { from: "stderr" })
 * )
 *
 * // Pipe combined stdout and stderr
 * const pipeline3 = ChildProcess.make`my-program`.pipe(
 *   ChildProcess.pipeTo(ChildProcess.make`tee output.log`, { from: "all" })
 * )
 *
 * const result = [pipeline1._tag, pipeline2.options.from, pipeline3.options.from]
 * result // => ["PipedCommand", "stderr", "all"]
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const pipeTo: {
  (that: Command, options?: PipeOptions): (self: Command) => PipedCommand
  (self: Command, that: Command, options?: PipeOptions): PipedCommand
} = dual(
  (args) => isCommand(args[0]) && isCommand(args[1]),
  (self: Command, that: Command, options?: PipeOptions) => makePipedCommand(self, that, options ?? {})
)

/**
 * Prepends another command to a command.
 *
 * **Details**
 *
 * For pipelines, only the leftmost command is prefixed.
 *
 * **Example** (Prefixing commands)
 *
 * ```ts import.meta.vitest
 * import { ChildProcess } from "effect/process"
 *
 * const command = ChildProcess.make`echo foo`
 *
 * const prefixed = command.pipe(
 *   ChildProcess.prefix`time`
 * )
 *
 * // now prefixed will execute `time echo "foo"`
 * const result = prefixed._tag === "StandardCommand" ? `${prefixed.command} ${prefixed.args[0]}` : prefixed._tag
 * result // => "time echo"
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const prefix: {
  (command: string, args?: ReadonlyArray<CommandLine.Word>): (self: Command) => Command
  (
    templates: TemplateStringsArray,
    ...expressions: ReadonlyArray<CommandLine.TemplateExpression>
  ): (self: Command) => Command
  (self: Command, command: string, args?: ReadonlyArray<CommandLine.Word>): Command
} = function prefix(...args: Array<unknown>): any {
  if (isCommand(args[0]) && args.length > 1) {
    const [self, ...rest] = args as [Command, ...Array<unknown>]
    const prefixSpec = parsePrefixArgs(rest)
    return applyPrefix(self, prefixSpec)
  }
  const prefixSpec = parsePrefixArgs(args)
  return (self: Command): Command => applyPrefix(self, prefixSpec)
}

type PrefixSpec = {
  readonly command: string
  readonly args: ReadonlyArray<CommandLine.Word>
}

const parsePrefixArgs = (args: ReadonlyArray<unknown>): PrefixSpec => {
  if (isTemplateString(args[0])) {
    const [templates, ...expressions] = args as [TemplateStringsArray, ...ReadonlyArray<CommandLine.TemplateExpression>]
    const [command, cmdArgs] = parseTemplate(templates, expressions)
    return { command, args: cmdArgs }
  }
  const [command, cmdArgs = []] = args as [string, ReadonlyArray<CommandLine.Word>?]
  return { command, args: cmdArgs }
}

const applyPrefix = (self: Command, prefixSpec: PrefixSpec): Command => {
  switch (self._tag) {
    case "StandardCommand": {
      return makeStandardCommand(
        prefixSpec.command,
        [...prefixSpec.args, self.command, ...self.args],
        self.options
      )
    }
    case "PipedCommand": {
      return makePipedCommand(applyPrefix(self.left, prefixSpec), self.right, self.options)
    }
  }
}

/**
 * Sets the current working directory for a command.
 *
 * **Details**
 *
 * For pipelines, applies to each command in the pipeline.
 *
 * **Example** (Setting command working directories)
 *
 * ```ts import.meta.vitest
 * import { ChildProcess } from "effect/process"
 *
 * const cmd = ChildProcess.make`ls -la`.pipe(
 *   ChildProcess.setCwd("/tmp")
 * )
 * const result = cmd._tag === "StandardCommand" && cmd.options.cwd // => "/tmp"
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setCwd: {
  (cwd: string): (self: Command) => Command
  (self: Command, cwd: string): Command
} = dual(
  2,
  (self: Command, cwd: string): Command => {
    switch (self._tag) {
      case "StandardCommand": {
        return makeStandardCommand(self.command, self.args, { ...self.options, cwd })
      }
      case "PipedCommand": {
        return makePipedCommand(setCwd(self.left, cwd), setCwd(self.right, cwd), self.options)
      }
    }
  }
)

/**
 * Adds environment variables to a command, merging them with any existing
 * command environment and overriding duplicate keys.
 *
 * **Details**
 *
 * For pipelines, applies to each command in the pipeline.
 *
 * **Example** (Setting command environment variables)
 *
 * ```ts import.meta.vitest
 * import { ChildProcess } from "effect/process"
 *
 * const cmd = ChildProcess.make`node script.js`.pipe(
 *   ChildProcess.setEnv({ NODE_ENV: "test" })
 * )
 * const result = cmd._tag === "StandardCommand" && cmd.options.env?.NODE_ENV // => "test"
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setEnv: {
  (env: Record<string, string | Redacted.Redacted<string>>): (self: Command) => Command
  (self: Command, env: Record<string, string | Redacted.Redacted<string>>): Command
} = dual(
  2,
  (self: Command, env: Record<string, string | Redacted.Redacted<string>>): Command => {
    switch (self._tag) {
      case "StandardCommand": {
        const nextEnv = self.options.env === undefined
          ? env
          : { ...self.options.env, ...env }
        return makeStandardCommand(self.command, self.args, { ...self.options, env: nextEnv })
      }
      case "PipedCommand": {
        return makePipedCommand(setEnv(self.left, env), setEnv(self.right, env), self.options)
      }
    }
  }
)

const isTemplateString = (u: unknown): u is TemplateStringsArray =>
  Array.isArray(u) && "raw" in u && Array.isArray(u.raw)

// =============================================================================
// Utilities
// =============================================================================

/**
 * Parses an fd name like "fd3" to its numeric index.
 * Returns undefined if the name is invalid.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const parseFdName = (name: string): number | undefined => {
  const match = /^fd(\d+)$/.exec(name)
  if (match === null) return undefined
  const fd = parseInt(match[1], 10)
  return fd >= 3 ? fd : undefined
}

/**
 * Create an fd name from its numeric index.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const fdName = (fd: number): string => `fd${fd}`

// =============================================================================
// Template Parsing
// =============================================================================

const parseTemplate = (
  templates: TemplateStringsArray,
  expressions: ReadonlyArray<CommandLine.TemplateExpression>
): [command: string, args: Array<CommandLine.Word>] => {
  const [program = "", ...args] = Result.getOrThrow(CommandLine.template(templates, ...expressions))
  if (typeof program !== "string") {
    throw new CommandLine.CommandLineError({
      reason: "InvalidArgument",
      message: "The program name of a command cannot be Redacted"
    })
  }
  return [program, args]
}

const shellScript = (
  templates: TemplateStringsArray,
  expressions: ReadonlyArray<CommandLine.TemplateExpression>
): string => {
  if (expressions.length > 0) {
    throw new CommandLine.CommandLineError({
      reason: "UnsupportedSyntax",
      message: "A shell template cannot interpolate values; build the script with CommandLine.quote"
    })
  }
  const script = templates[0]
  if (script === undefined) {
    throw new CommandLine.CommandLineError({
      reason: "InvalidEscape",
      message: "Template part 0 contains an invalid escape sequence"
    })
  }
  return script
}
