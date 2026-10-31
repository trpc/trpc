/**
 * Deno implementation of the child process spawner service.
 *
 * This module uses `Deno.Command` and Web Streams directly. Deno cannot create
 * detached process groups, so killing a handle terminates only its direct child;
 * descendants spawned by that child are left running.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Arr from "effect/Array"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import * as Predicate from "effect/Predicate"
import * as ChildProcess from "effect/process/ChildProcess"
import type { ChildProcessHandle } from "effect/process/ChildProcessSpawner"
import {
  ChildProcessSpawner,
  ExitCode,
  make as makeSpawner,
  makeHandle,
  ProcessId
} from "effect/process/ChildProcessSpawner"
import * as CommandLine from "effect/process/CommandLine"
import * as Redacted from "effect/Redacted"
import type * as Scope from "effect/Scope"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"

const unwrap = (value: string | Redacted.Redacted<string>): string =>
  Redacted.isRedacted(value) ? Redacted.value(value) : value

// Deno cannot pass NUL characters to a process. They are rejected before
// spawning so that the error does not depend on Deno's message.
const findNulCharacter = (command: ChildProcess.StandardCommand): string | undefined => {
  if (command.command.includes("\0")) return "The command contains a NUL character"
  const index = command.args.findIndex((arg) => unwrap(arg).includes("\0"))
  if (index !== -1) return `Argument ${index + 1} contains a NUL character`
  for (const [name, value] of Object.entries(command.options.env ?? {})) {
    if (value !== undefined && unwrap(value).includes("\0")) {
      return `The environment variable ${name} contains a NUL character`
    }
  }
  return undefined
}

const commandString = (command: ChildProcess.Command): string => {
  const { commands } = flattenCommand(command)
  const format = Deno.build.os === "windows" ? "windows" : "posix"
  return commands.map((command) => CommandLine.display([command.command, ...command.args], { format })).join(" | ")
}

const toPlatformError = (
  method: string,
  cause: unknown,
  command: ChildProcess.Command
): PlatformError.PlatformError => {
  const errorName = Predicate.hasProperty(cause, "name") ? cause.name : undefined
  const tag = errorName === "NotFound" ?
    "NotFound" :
    errorName === "PermissionDenied" ?
    "PermissionDenied" :
    errorName === "TimedOut"
    ? "TimedOut"
    : "Unknown"
  return PlatformError.systemError({
    _tag: tag,
    module: "ChildProcess",
    method,
    pathOrDescriptor: commandString(command),
    syscall: `${method} ${commandString(command)}`,
    cause
  })
}

const unsupported = (option: "additionalFds" | "detached") =>
  PlatformError.badArgument({
    module: "ChildProcessSpawner",
    method: "spawn",
    description: `The ${option} option is unsupported because Deno has no equivalent`
  })

const make = Effect.gen(function*() {
  const path = yield* Path.Path

  const resolveWorkingDirectory = (options: ChildProcess.CommandOptions) =>
    options.cwd === undefined ? undefined : path.resolve(options.cwd)

  const resolveEnvironment = (
    options: ChildProcess.CommandOptions
  ): { readonly env: Record<string, string>; readonly clearEnv: boolean } | undefined => {
    if (options.env === undefined) return undefined
    const extend = options.extendEnv === true
    // Deno can only add variables to the inherited environment, so removing
    // one needs the whole environment.
    const removes = Object.values(options.env).some((value) => value === undefined)
    const env: Record<string, string> = extend && removes ? Deno.env.toObject() : {}
    for (const [key, value] of Object.entries(options.env)) {
      if (value === undefined) delete env[key]
      else env[key] = unwrap(value)
    }
    return { env, clearEnv: !extend || removes }
  }

  const resolveStdinOption = (options: ChildProcess.CommandOptions): ChildProcess.StdinConfig => {
    const defaultConfig: ChildProcess.StdinConfig = { stream: "pipe", encoding: "utf-8", endOnDone: true }
    if (options.stdin === undefined) {
      return defaultConfig
    }
    if (typeof options.stdin === "string") {
      return { ...defaultConfig, stream: options.stdin }
    }
    if (Stream.isStream(options.stdin)) {
      return { ...defaultConfig, stream: options.stdin }
    }
    return {
      stream: options.stdin.stream,
      encoding: options.stdin.encoding ?? defaultConfig.encoding,
      endOnDone: options.stdin.endOnDone ?? defaultConfig.endOnDone
    }
  }

  const resolveOutputOption = (
    options: ChildProcess.CommandOptions,
    streamName: "stdout" | "stderr"
  ): ChildProcess.StdoutConfig => {
    const option = options[streamName]
    if (option === undefined) return { stream: "pipe" }
    if (typeof option === "string" || Sink.isSink(option)) return { stream: option }
    return { stream: option.stream }
  }

  const inputToStdioOption = (
    input: ChildProcess.CommandInput
  ): "piped" | "inherit" | "null" =>
    Stream.isStream(input) || input === "pipe" || input === "overlapped" ?
      "piped" :
      input === "ignore"
      ? "null"
      : "inherit"

  const outputToStdioOption = (
    output: ChildProcess.CommandOutput | undefined
  ): "piped" | "inherit" | "null" =>
    Sink.isSink(output) || output === "pipe" || output === "overlapped" || output === undefined ?
      "piped" :
      output === "ignore"
      ? "null"
      : "inherit"

  const setupChildStdin = (
    command: ChildProcess.StandardCommand,
    childProcess: Deno.ChildProcess,
    config: ChildProcess.StdinConfig,
    inputFailure: Deferred.Deferred<never, PlatformError.PlatformError>
  ) =>
    Effect.suspend(() => {
      if (inputToStdioOption(config.stream) !== "piped") return Effect.succeed(Sink.drain)
      const sink = Sink.fromWritableStream({
        evaluate: () => childProcess.stdin,
        onError: (cause) => toPlatformError("fromWritable(stdin)", cause, command),
        closeOnDone: config.endOnDone
      })
      return Stream.isStream(config.stream)
        ? Effect.as(
          Effect.forkScoped(
            // Record a failure of the source stream so that it can be surfaced
            // by the process exit code
            Stream.run(Stream.tapError(config.stream, (error) => Deferred.fail(inputFailure, error)), sink)
          ),
          sink
        )
        : Effect.succeed(sink)
    })

  const setupChildOutputStreams = (
    command: ChildProcess.StandardCommand,
    childProcess: Deno.ChildProcess,
    stdoutConfig: ChildProcess.StdoutConfig,
    stderrConfig: ChildProcess.StderrConfig
  ) => {
    let stdout: Stream.Stream<Uint8Array, PlatformError.PlatformError> =
      outputToStdioOption(stdoutConfig.stream) === "piped"
        ? Stream.fromReadableStream({
          evaluate: () => childProcess.stdout,
          onError: (cause) => toPlatformError("fromReadable(stdout)", cause, command)
        })
        : Stream.empty
    let stderr: Stream.Stream<Uint8Array, PlatformError.PlatformError> =
      outputToStdioOption(stderrConfig.stream) === "piped"
        ? Stream.fromReadableStream({
          evaluate: () => childProcess.stderr,
          onError: (cause) => toPlatformError("fromReadable(stderr)", cause, command)
        })
        : Stream.empty

    if (Sink.isSink(stdoutConfig.stream)) stdout = Stream.transduce(stdout, stdoutConfig.stream)
    if (Sink.isSink(stderrConfig.stream)) stderr = Stream.transduce(stderr, stderrConfig.stream)

    return { stdout, stderr, all: Stream.merge(stdout, stderr) }
  }

  const spawn = (
    command: ChildProcess.StandardCommand,
    executable: string,
    args: ReadonlyArray<string>,
    options: Deno.CommandOptions
  ) =>
    Effect.try({
      try: () => {
        const childProcess = new Deno.Command(executable, { ...options, args: [...args] }).spawn()
        const exitSignal = Deferred.makeUnsafe<Deno.CommandStatus, PlatformError.PlatformError>()
        childProcess.status.then(
          (status) => Deferred.doneUnsafe(exitSignal, Exit.succeed(status)),
          (cause) => Deferred.doneUnsafe(exitSignal, Exit.fail(toPlatformError("status", cause, command)))
        )
        return [childProcess, exitSignal] as const
      },
      catch: (cause) => toPlatformError("spawn", cause, command)
    })

  const killProcess = (
    command: ChildProcess.StandardCommand,
    childProcess: Deno.ChildProcess,
    signal: ChildProcess.Signal
  ) =>
    Effect.try({
      try: () => childProcess.kill(signal as Deno.Signal),
      catch: (cause) => toPlatformError("kill", cause, command)
    })

  const withTimeout = (
    childProcess: Deno.ChildProcess,
    command: ChildProcess.StandardCommand,
    options: ChildProcess.KillOptions | undefined
  ) =>
  <A, E, R>(
    kill: (
      command: ChildProcess.StandardCommand,
      childProcess: Deno.ChildProcess,
      signal: ChildProcess.Signal
    ) => Effect.Effect<A, E, R>
  ) => {
    const killSignal = options?.killSignal ?? "SIGTERM"
    return options?.forceKillAfter === undefined
      ? kill(command, childProcess, killSignal)
      : Effect.timeoutOrElse(kill(command, childProcess, killSignal), {
        duration: options.forceKillAfter,
        orElse: () => kill(command, childProcess, "SIGKILL")
      })
  }

  const getSourceStream = (
    handle: ChildProcessHandle,
    from: "stdout" | "stderr" | "all"
  ): Stream.Stream<Uint8Array, PlatformError.PlatformError> => {
    switch (from) {
      case "stdout":
        return handle.stdout
      case "stderr":
        return handle.stderr
      case "all":
        return handle.all
    }
  }

  const spawnCommand: (
    command: ChildProcess.Command
  ) => Effect.Effect<ChildProcessHandle, PlatformError.PlatformError, Scope.Scope> = Effect.fnUntraced(function*(cmd) {
    switch (cmd._tag) {
      case "StandardCommand": {
        if (cmd.options.additionalFds !== undefined) {
          return yield* Effect.fail(unsupported("additionalFds"))
        }
        if (cmd.options.detached !== undefined) {
          return yield* Effect.fail(unsupported("detached"))
        }

        const stdinConfig = resolveStdinOption(cmd.options)
        const stdoutConfig = resolveOutputOption(cmd.options, "stdout")
        const stderrConfig = resolveOutputOption(cmd.options, "stderr")
        let isReferenced = true

        if (cmd.options.shell !== undefined && cmd.options.shell !== false && cmd.args.length > 0) {
          return yield* Effect.fail(PlatformError.badArgument({
            module: "ChildProcess",
            method: "spawn",
            description: "The shell option cannot be combined with arguments; pass the whole script as the command"
          }))
        }
        const nulCharacter = findNulCharacter(cmd)
        if (nulCharacter !== undefined) {
          return yield* Effect.fail(PlatformError.badArgument({
            module: "ChildProcess",
            method: "spawn",
            description: nulCharacter
          }))
        }

        let executable = cmd.command
        let args: ReadonlyArray<string> = cmd.args.map(unwrap)
        let windowsRawArguments = false
        if (cmd.options.shell) {
          const shellCommand = cmd.command
          if (Deno.build.os === "windows") {
            executable = typeof cmd.options.shell === "string" ? cmd.options.shell : "cmd.exe"
            args = ["/d", "/s", "/c", shellCommand]
            windowsRawArguments = true
          } else {
            executable = typeof cmd.options.shell === "string" ? cmd.options.shell : "/bin/sh"
            args = ["-c", shellCommand]
          }
        }

        const cwd = resolveWorkingDirectory(cmd.options)
        const env = resolveEnvironment(cmd.options)
        const [childProcess, exitSignal] = yield* Effect.acquireRelease(
          spawn(cmd, executable, args, {
            ...(cwd === undefined ? undefined : { cwd }),
            ...(env === undefined ? undefined : { env: env.env }),
            clearEnv: env?.clearEnv ?? false,
            stdin: inputToStdioOption(stdinConfig.stream),
            stdout: outputToStdioOption(stdoutConfig.stream),
            stderr: outputToStdioOption(stderrConfig.stream),
            windowsRawArguments
          }),
          Effect.fnUntraced(function*([childProcess, exitSignal]) {
            const exited = yield* Deferred.isDone(exitSignal)
            if (exited || !isReferenced) return
            const killWithTimeout = withTimeout(childProcess, cmd, cmd.options)
            yield* killWithTimeout((command, childProcess, signal) =>
              killProcess(command, childProcess, signal).pipe(
                Effect.andThen(Deferred.await(exitSignal))
              )
            ).pipe(Effect.ignore)
          })
        )

        const reref = Effect.sync(() => {
          if (!isReferenced) {
            childProcess.ref()
            isReferenced = true
          }
        })
        const unref = Effect.sync(() => {
          if (isReferenced) {
            childProcess.unref()
            isReferenced = false
          }
          return reref
        })
        const inputFailure = Deferred.makeUnsafe<never, PlatformError.PlatformError>()
        const stdin = yield* setupChildStdin(cmd, childProcess, stdinConfig, inputFailure)
        const { all, stderr, stdout } = setupChildOutputStreams(cmd, childProcess, stdoutConfig, stderrConfig)
        const isRunning = Effect.map(Deferred.isDone(exitSignal), (done) => !done)
        // A failed input stream truncates the input of the child process, so
        // its failure takes precedence over the exit status and is surfaced
        // without waiting for the child process to exit
        const exitCode = Effect.flatMap(
          Effect.raceFirst(Deferred.await(exitSignal), Deferred.await(inputFailure)),
          (status) => {
            if (Deferred.isDoneUnsafe(inputFailure)) {
              return Deferred.await(inputFailure)
            }
            if (Predicate.isNull(status.signal)) {
              return Effect.succeed(ExitCode(status.code))
            }
            const error = new globalThis.Error(`Process interrupted due to receipt of signal: '${status.signal}'`)
            return Effect.fail(toPlatformError("exitCode", error, cmd))
          }
        )
        const kill = (options?: ChildProcess.KillOptions | undefined) => {
          const killWithTimeout = withTimeout(childProcess, cmd, options)
          return killWithTimeout((command, childProcess, signal) =>
            killProcess(command, childProcess, signal).pipe(
              Effect.andThen(Deferred.await(exitSignal))
            )
          ).pipe(Effect.asVoid)
        }

        return makeHandle({
          pid: ProcessId(childProcess.pid),
          exitCode,
          isRunning,
          kill,
          stdin,
          stdout,
          stderr,
          all,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref
        })
      }
      case "PipedCommand": {
        const { commands, pipeOptions } = flattenCommand(cmd)
        const [root, ...pipeline] = commands
        const handles = [yield* spawnCommand(root)]

        for (let i = 0; i < pipeline.length; i++) {
          const command = pipeline[i]
          const options = pipeOptions[i] ?? {}
          const stdinConfig = resolveStdinOption(command.options)
          const from = options.from ?? "stdout"

          if (
            (from !== "stdout" && from !== "stderr" && from !== "all") ||
            (options.to ?? "stdin") !== "stdin"
          ) {
            return yield* Effect.fail(unsupported("additionalFds"))
          }
          const sourceStream = getSourceStream(handles[handles.length - 1], from)
          handles.push(
            yield* spawnCommand(ChildProcess.make(command.command, command.args, {
              ...command.options,
              stdin: { ...stdinConfig, stream: sourceStream }
            }))
          )
        }

        const handle = handles[handles.length - 1]
        const kill = (options?: ChildProcess.KillOptions | undefined) =>
          Effect.forEach([...handles].reverse(), (handle) => Effect.ignore(handle.kill(options)), { discard: true })
        const unref = Effect.gen(function*() {
          const rerefs: Array<Effect.Effect<void, PlatformError.PlatformError>> = []
          for (const handle of handles) rerefs.push(yield* handle.unref)
          return Effect.forEach([...rerefs].reverse(), (reref) => reref, { discard: true })
        })

        return makeHandle({
          pid: handle.pid,
          exitCode: handle.exitCode,
          isRunning: handle.isRunning,
          kill,
          stdin: handle.stdin,
          stdout: handle.stdout,
          stderr: handle.stderr,
          all: handle.all,
          getInputFd: handle.getInputFd,
          getOutputFd: handle.getOutputFd,
          unref
        })
      }
    }
  })

  return makeSpawner(spawnCommand)
})

/**
 * Layer that provides the Deno child process spawner.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<ChildProcessSpawner, never, Path.Path> = Layer.effect(ChildProcessSpawner, make)

/**
 * Result of flattening a pipeline of commands.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FlattenedPipeline {
  readonly commands: Arr.NonEmptyReadonlyArray<ChildProcess.StandardCommand>
  readonly pipeOptions: ReadonlyArray<ChildProcess.PipeOptions>
}

/**
 * Flattens a command into standard commands and their pipe options.
 *
 * @stability unstable
 * @category transforming
 * @since 4.0.0
 */
export const flattenCommand = (command: ChildProcess.Command): FlattenedPipeline => {
  const commands: Array<ChildProcess.StandardCommand> = []
  const pipeOptions: Array<ChildProcess.PipeOptions> = []

  const flatten = (command: ChildProcess.Command): void => {
    switch (command._tag) {
      case "StandardCommand":
        commands.push(command)
        break
      case "PipedCommand":
        flatten(command.left)
        pipeOptions.push(command.options)
        flatten(command.right)
        break
    }
  }
  flatten(command)

  const [first, ...rest] = commands
  if (first === undefined) throw new Error("flattenCommand produced empty commands array")
  return { commands: [first, ...rest], pipeOptions }
}
