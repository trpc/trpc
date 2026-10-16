/**
 * Deno implementation of the child process spawner service.
 *
 * This module uses `Deno.Command` and Web Streams directly. Deno cannot create
 * detached process groups, so killing a handle terminates only its direct child;
 * descendants spawned by that child are left running.
 *
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
import type * as Scope from "effect/Scope"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"

const commandString = (command: ChildProcess.Command): string => {
  const { commands } = flattenCommand(command)
  return commands.map((command) => `${command.command} ${command.args.join(" ")}`).join(" | ")
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
    syscall: `${method} ${commandString(command).trim()}`,
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

  const resolveEnvironment = (options: ChildProcess.CommandOptions) => {
    if (options.env === undefined) return undefined
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(options.env)) {
      if (value !== undefined) env[key] = value
    }
    return env
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
    config: ChildProcess.StdinConfig
  ) =>
    Effect.suspend(() => {
      if (inputToStdioOption(config.stream) !== "piped") return Effect.succeed(Sink.drain)
      const sink = Sink.fromWritableStream({
        evaluate: () => childProcess.stdin,
        onError: (cause) => toPlatformError("fromWritable(stdin)", cause, command),
        closeOnDone: config.endOnDone
      })
      return Stream.isStream(config.stream)
        ? Effect.as(Effect.forkScoped(Stream.run(config.stream, sink)), sink)
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

        let executable = cmd.command
        let args = cmd.args
        let windowsRawArguments = false
        if (cmd.options.shell) {
          const shellCommand = `${cmd.command} ${cmd.args.join(" ")}`
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
            ...(env === undefined ? undefined : { env }),
            clearEnv: cmd.options.env !== undefined && cmd.options.extendEnv !== true,
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
        const stdin = yield* setupChildStdin(cmd, childProcess, stdinConfig)
        const { all, stderr, stdout } = setupChildOutputStreams(cmd, childProcess, stdoutConfig, stderrConfig)
        const isRunning = Effect.map(Deferred.isDone(exitSignal), (done) => !done)
        const exitCode = Effect.flatMap(Deferred.await(exitSignal), (status) =>
          Predicate.isNull(status.signal)
            ? Effect.succeed(ExitCode(status.code))
            : Effect.fail(toPlatformError(
              "exitCode",
              new globalThis.Error(`Process interrupted due to receipt of signal: '${status.signal}'`),
              cmd
            )))
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
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<ChildProcessSpawner, never, Path.Path> = Layer.effect(ChildProcessSpawner, make)

/**
 * Result of flattening a pipeline of commands.
 *
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
