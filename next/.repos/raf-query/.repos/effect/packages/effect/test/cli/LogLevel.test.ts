import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, FileSystem, Layer, Logger, Option, Path, Stdio } from "effect"
import { CliOutput, Command, Flag, GlobalFlag } from "effect/cli"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as MockTerminal from "./services/MockTerminal.ts"

interface Log {
  readonly message: unknown
  readonly level: string
  readonly timestamp: Date
}

class MockLogger extends Context.Service<MockLogger, {
  readonly logs: Effect.Effect<ReadonlyArray<Log>>
}>()("MockLogger") {
  static logs = Effect.service(MockLogger).pipe(
    Effect.flatMap((logger) => logger.logs)
  )
}

const makeMockLogger = Effect.gen(function*() {
  const logs: Array<Log> = []

  const mockLogger = Logger.make((options) => {
    // Extract the actual message from the array wrapper
    const message = Array.isArray(options.message) && options.message.length === 1
      ? options.message[0]
      : options.message

    logs.push({
      message,
      level: options.logLevel,
      timestamp: options.date
    })
  })

  return Context.make(MockLogger, { logs: Effect.sync(() => logs) }).pipe(
    Context.add(Logger.CurrentLoggers, new Set([mockLogger]))
  )
})

const FileSystemLayer = FileSystem.layerNoop({})
const PathLayer = Path.layer
const TerminalLayer = MockTerminal.layer
const CliOutputLayer = CliOutput.layer(CliOutput.defaultFormatter({ colors: false }))
const SpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die("Not implemented"))
)
const LoggerLayer = Layer.effectContext(makeMockLogger)

const TestLayer = Layer.mergeAll(
  FileSystemLayer,
  PathLayer,
  TerminalLayer,
  CliOutputLayer,
  SpawnerLayer,
  LoggerLayer,
  Stdio.layerTest({})
)

describe("LogLevel", () => {
  // All possible logs in severity order
  const allLogs = [
    { level: "Fatal", message: "fatal" },
    { level: "Error", message: "error" },
    { level: "Warn", message: "warn" },
    { level: "Info", message: "info" },
    { level: "Debug", message: "debug" },
    { level: "Info", message: "trace" } // Effect.log() creates Info level
  ]

  // Log level severity order (higher index = less severe)
  const severityOrder = ["Fatal", "Error", "Warn", "Info", "Debug", "Trace"]

  // Filter logs based on minimum level
  const filterLogs = (minLevel: string) => {
    if (minLevel === "none") return []
    if (minLevel === "all") return allLogs.slice().reverse()

    const minSeverity = severityOrder.indexOf(
      minLevel === "warning" ? "Warn" : minLevel.charAt(0).toUpperCase() + minLevel.slice(1)
    )
    return allLogs
      .filter((log) => severityOrder.indexOf(log.level) <= minSeverity)
      .reverse()
  }

  // Test helper that logs at all levels and returns captured logs
  const testLogLevels = Effect.fnUntraced(function*(logLevel?: string) {
    const testCommand = Command.make("test").pipe(
      Command.withHandler(Effect.fnUntraced(function*() {
        // Log at all levels to test filtering
        yield* Effect.log("trace") // Info level by default
        yield* Effect.logDebug("debug")
        yield* Effect.logInfo("info")
        yield* Effect.logWarning("warn")
        yield* Effect.logError("error")
        yield* Effect.logFatal("fatal")
      }))
    )

    const runCommand = Command.runWith(testCommand, { version: "1.0.0" })
    yield* runCommand(logLevel ? ["--log-level", logLevel] : [])

    const logs = yield* MockLogger.logs
    return logs.map((log) => ({ level: log.level, message: log.message }))
  })

  // Test cases
  const testCases = [
    "all",
    "trace",
    "debug",
    "info",
    "warn",
    "warning",
    "error",
    "fatal",
    "none"
  ]

  it.effect.each(testCases)("level=%s", (level) =>
    Effect.gen(function*() {
      const logs = yield* testLogLevels(level)
      assert.deepStrictEqual(logs, filterLogs(level))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("uses Info as the default minimum when --log-level is omitted", () =>
    Effect.gen(function*() {
      const logs = yield* testLogLevels()
      // Default minimum log level filters out Debug but keeps Info and above
      const expected = allLogs.filter((log) => log.message !== "debug").reverse()
      assert.deepStrictEqual(logs, expected)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("exposes the built-in log-level setting value", () =>
    Effect.gen(function*() {
      const seen: Array<Option.Option<string>> = []
      const command = Command.make("test").pipe(
        Command.withHandler(Effect.fnUntraced(function*() {
          seen.push(Option.map(yield* GlobalFlag.LogLevel, (level) => level.toLowerCase()))
        }))
      )

      const runCommand = Command.runWith(command, { version: "1.0.0" })

      yield* runCommand([])
      yield* runCommand(["--log-level", "warn"])

      assert.deepStrictEqual(seen, [Option.none(), Option.some("warn")])
    }).pipe(Effect.provide(TestLayer)))

  it.effect("applies the selected log level to subcommands", () =>
    Effect.gen(function*() {
      const parentCommand = Command.make("parent", {
        verbose: Flag.Boolean("verbose")
      })

      const childCommand = Command.make("child", {}, () =>
        Effect.gen(function*() {
          yield* Effect.logDebug("debug from child")
          yield* Effect.logInfo("info from child")
          yield* Effect.logError("error from child")
        }))

      const combined = parentCommand.pipe(Command.withSubcommands([childCommand]))
      const runCommand = Command.runWith(combined, { version: "1.0.0" })

      yield* runCommand(["--log-level", "info", "child"]).pipe(Effect.provide(TestLayer))

      const logs = yield* MockLogger.logs

      assert.deepStrictEqual(
        logs.map((l) => ({ level: l.level, message: l.message })),
        [
          { level: "Info", message: "info from child" },
          { level: "Error", message: "error from child" }
        ]
      )
    }).pipe(Effect.provide(TestLayer)))

  it.effect("keeps concurrent command log levels scoped to each run", () =>
    Effect.gen(function*() {
      const testCommand = Command.make("test", {}, () => Effect.logInfo("Should not see this"))

      const runCommand = Command.runWith(testCommand, { version: "1.0.0" })

      const result = yield* Effect.flip(
        runCommand(["--log-level", "invalid"]).pipe(Effect.provide(TestLayer))
      )

      assert.strictEqual(result._tag, "InvalidValue")
      if (result._tag === "InvalidValue") {
        assert.strictEqual(result.option, "log-level")
        assert.strictEqual(result.value, "invalid")
      }

      const logs = yield* MockLogger.logs
      assert.strictEqual(logs.length, 0)
    }).pipe(Effect.provide(TestLayer)))
})
