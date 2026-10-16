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
import type * as Scope from "../Scope.ts"
import type * as Sink from "../Sink.ts"
import type * as Stream from "../Stream.ts"
import { type ChildProcessHandle, ChildProcessSpawner } from "./ChildProcessSpawner.ts"

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
  readonly args: ReadonlyArray<string>
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
   * - `"fd3"`, `"fd4"`, etc.: Pipe to a custom file descriptor
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
   * signal. Defaults to `undefined`, so `"SIGKILL"` is never sent.
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
   * A `Sink` can also be passed, which will receive all elements produced by
   * the `stdout` of the child process.
   *
   * Defaults to "pipe".
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
   * A `Sink` can also be passed, which will receive all elements produced by
   * the `stderr` of the child process.
   *
   * Defaults to "pipe".
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
   * when conflicts exist.
   *
   * **Gotchas**
   *
   * Without `extendEnv: true`, providing `env` replaces the inherited child
   * environment. The child will not receive `PATH` unless `env` includes it.
   */
  readonly env?: Record<string, string | undefined> | undefined
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
   * If set to `true`, runs the command inside of a shell, defaulting to `/bin/sh`
   * on UNIX systems and `cmd.exe` on Windows.
   *
   * **Details**
   *
   * Can also be set to a string representing the absolute path to a shell to
   * use on the system.
   *
   * **Gotchas**
   *
   * It is generally disadvised to use this option.
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
   * Keys must be in the format `"fd3"`, `"fd4"`, etc. with a file descriptor
   * index >= 3.
   *
   * The file descriptor index is determined by the numeric suffix (i.e. `fd3`
   * has a file descriptor index of 3).
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
   * const result = [cmd1.options.additionalFds?.fd3?.type, cmd2.options.additionalFds?.fd3?.type]
   * result // => ["output", "input"]
   * ```
   */
  readonly additionalFds?: Record<`fd${number}`, AdditionalFdConfig> | undefined
}

/**
 * Valid template expression item types.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type TemplateExpressionItem = string | number | boolean

/**
 * Template expression type for interpolated values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type TemplateExpression = TemplateExpressionItem | ReadonlyArray<TemplateExpressionItem>

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
  args: ReadonlyArray<string>,
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
 * Template literals are not parsed until execution time, allowing parsing
 * errors to flow through Effect's error channel.
 *
 * **Example** (Creating commands)
 *
 * ```ts import.meta.vitest
 * import { ChildProcess } from "effect/process"
 *
 * // Template literal form
 * const cmd1 = ChildProcess.make`echo "hello"`
 *
 * // With options
 * const cmd2 = ChildProcess.make({ cwd: "/tmp" })`ls -la`
 *
 * // Array form
 * const cmd3 = ChildProcess.make("git", ["status"])
 *
 * const result = [cmd1.command, cmd2.options.cwd, cmd3.args[0]] // => ["echo", "/tmp", "status"]
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
    args: ReadonlyArray<string>,
    options?: CommandOptions
  ): StandardCommand
  (
    options: CommandOptions
  ): (
    templates: TemplateStringsArray,
    ...expressions: ReadonlyArray<TemplateExpression>
  ) => StandardCommand
  (
    templates: TemplateStringsArray,
    ...expressions: ReadonlyArray<TemplateExpression>
  ): StandardCommand
} = function make(...args: Array<unknown>): any {
  // Template literal form: make`command`
  if (isTemplateString(args[0])) {
    const [templates, ...expressions] = args as [TemplateStringsArray, ...ReadonlyArray<TemplateExpression>]
    const tokens = parseTemplates(templates, expressions)
    return makeStandardCommand(tokens[0] ?? "", tokens.slice(1), {})
  }

  // Options form: make({ cwd: "/tmp" })`command`
  if (typeof args[0] === "object" && !Array.isArray(args[0]) && !isTemplateString(args[0])) {
    const options = args[0] as CommandOptions
    return function(
      templates: TemplateStringsArray,
      ...expressions: ReadonlyArray<TemplateExpression>
    ): StandardCommand {
      const tokens = parseTemplates(templates, expressions)
      return makeStandardCommand(tokens[0] ?? "", tokens.slice(1), options)
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
    ReadonlyArray<string>?,
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
 * const command = ChildProcess.make`echo "foo"`
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
  (command: string, args?: ReadonlyArray<string>): (self: Command) => Command
  (templates: TemplateStringsArray, ...expressions: ReadonlyArray<TemplateExpression>): (self: Command) => Command
  (self: Command, command: string, args?: ReadonlyArray<string>): Command
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
  readonly args: ReadonlyArray<string>
}

const parsePrefixArgs = (args: ReadonlyArray<unknown>): PrefixSpec => {
  if (isTemplateString(args[0])) {
    const [templates, ...expressions] = args as [TemplateStringsArray, ...ReadonlyArray<TemplateExpression>]
    const tokens = parseTemplates(templates, expressions)
    return { command: tokens[0] ?? "", args: tokens.slice(1) }
  }
  const [command, cmdArgs = []] = args as [string, ReadonlyArray<string>?]
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
  (env: Record<string, string>): (self: Command) => Command
  (self: Command, env: Record<string, string>): Command
} = dual(
  2,
  (self: Command, env: Record<string, string>): Command => {
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

const parseTemplates = (
  templates: TemplateStringsArray,
  expressions: ReadonlyArray<TemplateExpression>
): ReadonlyArray<string> => {
  let tokens: ReadonlyArray<string> = []
  for (const [index, template] of templates.entries()) {
    tokens = parseTemplate(templates, expressions, tokens, template, index)
  }
  return tokens
}

const parseTemplate = (
  templates: TemplateStringsArray,
  expressions: ReadonlyArray<TemplateExpression>,
  prevTokens: ReadonlyArray<string>,
  template: string,
  index: number
): ReadonlyArray<string> => {
  const rawTemplate = templates.raw[index]

  if (rawTemplate === undefined) {
    throw new Error(`Invalid backslash sequence: ${templates.raw[index]}`)
  }

  const { hasLeadingWhitespace, hasTrailingWhitespace, tokens } = splitByWhitespaces(template, rawTemplate)
  const nextTokens = concatTokens(prevTokens, tokens, hasLeadingWhitespace)

  if (index === expressions.length) {
    return nextTokens
  }

  const expression = expressions[index]
  const expressionTokens = Array.isArray(expression)
    ? expression.map((expression: TemplateExpressionItem) => parseExpression(expression))
    : [parseExpression(expression as TemplateExpressionItem)]

  return concatTokens(nextTokens, expressionTokens, hasTrailingWhitespace)
}

/**
 * Convert valid expressions defined in a template string command (i.e. using
 * `${expression}` into strings.
 */
const parseExpression = (expression: TemplateExpression): string => {
  const type = typeof expression
  if (type === "string") {
    return expression as string // Return strings directly
  }
  return String(expression) // Convert numbers to strings
}

const DELIMITERS = new Set([" ", "\t", "\r", "\n"])

/**
 * Number of characters in backslash escape sequences: \0 \xXX or \uXXXX
 * \cX is allowed in RegExps but not in strings
 * Octal sequences are not allowed in strict mode
 */
const ESCAPE_LENGTH: Record<string, number> = { x: 3, u: 5 }

/**
 * Splits a template string by whitespace while also properly handling escape
 * sequences.
 *
 * As an example, let's review the following valid commands:
 *
 * ```ts
 * ChildProcess.exec`echo foo\n bar`
 * // We should run `["echo", "foo\n", "bar"]`
 *
 * ChildProcess.exec`echo foo
 *  bar`
 * // We should run `["echo", "foo", "bar]`
 * ```
 *
 * The problem is that when we evaluate the template string for both of the above
 * commands, we will end up with the same string "echo foo\n bar".
 *
 * What we really want is to include the escaped character in the arguments for
 * the first command, since it was written explicitly by the user.
 *
 * This is why also having access to the raw template string is useful - in a
 * template string, there are two representations of the same string:
 * 1. `template`     - The processed string (escape sequences are evaluated).
 * 2. `template.raw` - The raw string (escape sequences are literal).
 */
const splitByWhitespaces = (template: string, rawTemplate: string): {
  readonly tokens: ReadonlyArray<string>
  readonly hasLeadingWhitespace: boolean
  readonly hasTrailingWhitespace: boolean
} => {
  if (rawTemplate.length === 0) {
    return {
      tokens: [],
      hasLeadingWhitespace: false,
      hasTrailingWhitespace: false
    }
  }

  const hasLeadingWhitespace = DELIMITERS.has(rawTemplate[0])
  const tokens: Array<string> = []

  // Given that escape sequences will have different lengths in the template
  // versus the raw template, we must maintain two indices:
  // - One for the index into the template string
  // - One for the index into the raw template string
  // We also maintain the current cursor position for where we are in the template
  let templateCursor = 0
  for (
    let templateIndex = 0, rawIndex = 0;
    templateIndex < template.length;
    templateIndex += 1, rawIndex += 1
  ) {
    // Use the raw template character to check for actual whitespace
    const rawCharacter = rawTemplate[rawIndex]

    if (DELIMITERS.has(rawCharacter)) {
      // Whitespace found, extract token from template if necessary
      if (templateCursor !== templateIndex) {
        tokens.push(template.slice(templateCursor, templateIndex))
      }
      // Advance the template start index to the current position
      templateCursor = templateIndex + 1
    } else if (rawCharacter === "\\") {
      // Escape sequence detected, check the next raw character
      const nextRawCharacter = rawTemplate[rawIndex + 1]

      if (nextRawCharacter === "\n") {
        // Handle `\` character followed by a newline (i.e. a line continuation) by:
        // - Reversing the template index (backslash-newline is erased in template)
        // - Advancing the raw template index past the line continuation
        templateIndex -= 1
        rawIndex += 1
      } else if (nextRawCharacter === "u" && rawTemplate[rawIndex + 2] === "{") {
        // Handle variable-length unicode escape sequences (i.e. `\u{1F600}`) by:
        // - Advancing the template index an extra code unit for astral code points
        // - Advancing the raw template index past the unicode escape sequence
        const end = rawTemplate.indexOf("}", rawIndex + 3)
        if (parseInt(rawTemplate.slice(rawIndex + 3, end), 16) > 0xffff) {
          templateIndex += 1
        }
        rawIndex = end
      } else {
        // Advance raw template index past fixed-length escape sequences:
        // - \n    → 2 chars (backslash + n)
        // - \t    → 2 chars (backslash + t)
        // - \xHH  → 4 chars (backslash + x + H + H)
        // - \uHHHH → 6 chars (backslash + u + H + H + H + H)
        rawIndex += ESCAPE_LENGTH[nextRawCharacter] ?? 1
      }
    }
  }

  // Trailing whitespace only exists if the template cursor is equivalent to the
  // length of the template
  const hasTrailingWhitespace = templateCursor === template.length

  // If we did not end with trailing whitespace, ensure the final token is added
  if (!hasTrailingWhitespace) {
    tokens.push(template.slice(templateCursor))
  }

  return {
    tokens,
    hasLeadingWhitespace,
    hasTrailingWhitespace
  }
}

/**
 * Concatenates two separate sets of string tokens together.
 *
 * If either set is empty or `isSeparated=false`, the last element of `prevTokens`
 * and the first element of `nextTokens` will be joined into a single token.
 */
const concatTokens = (
  prevTokens: ReadonlyArray<string>,
  nextTokens: ReadonlyArray<string>,
  isSeparated: boolean
): ReadonlyArray<string> =>
  isSeparated || prevTokens.length === 0 || nextTokens.length === 0
    // Keep the previous and next tokens separate from one another
    ? [...prevTokens, ...nextTokens]
    // Join the last token from the previous set and the first token from the next set
    : [...prevTokens.slice(0, -1), `${prevTokens.at(-1)}${nextTokens.at(0)}`, ...nextTokens.slice(1)]
