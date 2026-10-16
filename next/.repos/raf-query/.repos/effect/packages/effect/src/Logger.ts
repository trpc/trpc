/**
 * Defines loggers and log-event data for Effect programs.
 *
 * A `Logger<Message, Output>` receives each log event as `Options` and turns it
 * into output such as a formatted string, structured object, console write,
 * file write, JSON line, or trace span event. This module also includes active
 * logger references, console routing helpers, built-in formatters, batching,
 * file logging, and layers for installing loggers.
 *
 * @since 2.0.0
 */
import * as Array from "./Array.ts"
import type * as Cause from "./Cause.ts"
import type * as Context from "./Context.ts"
import type * as Duration from "./Duration.ts"
import type * as Effect from "./Effect.ts"
import type * as Fiber from "./Fiber.ts"
import * as FileSystem from "./FileSystem.ts"
import * as Formatter from "./Formatter.ts"
import { dual } from "./Function.ts"
import { isEffect, withFiber } from "./internal/core.ts"
import * as effect from "./internal/effect.ts"
import * as InternalRecord from "./internal/record.ts"
import * as Layer from "./Layer.ts"
import type * as LogLevel from "./LogLevel.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { PlatformError } from "./PlatformError.ts"
import * as Predicate from "./Predicate.ts"
import { CurrentLogAnnotations, CurrentLogSpans } from "./References.ts"
import type * as Scope from "./Scope.ts"

const TypeId = "~effect/Logger"

/**
 * A logger that transforms a runtime log event into an output value.
 *
 * **Details**
 *
 * The runtime calls `log` with the message, level, cause, fiber, and timestamp
 * for each log event. Use `Logger.layer` to install one or more loggers for an
 * effect.
 *
 * **Example** (Creating custom loggers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const messages: Array<string> = []
 * const stringLogger = Logger.make<unknown, void>((options) => {
 *   messages.push(`[${options.logLevel}] ${options.message}`)
 * })
 *
 * const program = Effect.log("Hello World").pipe(
 *   Effect.provide(Logger.layer([stringLogger]))
 * )
 *
 * Effect.runSync(program)
 * messages // => ["[Info] Hello World"]
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Logger<in Message, out Output> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  log(options: Options<Message>): Output
}

/**
 * Information supplied to a `Logger` for a single log event.
 *
 * **Details**
 *
 * Includes the logged message, log level, cause, current fiber, and timestamp.
 *
 * **Example** (Accessing logger options)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const outputs: Array<unknown> = []
 * const detailedLogger = Logger.make((options) => {
 *   outputs.push({
 *     message: options.message,
 *     level: options.logLevel,
 *     hasCause: options.cause.reasons.length > 0
 *   })
 * })
 *
 * const program = Effect.log("Processing request").pipe(
 *   Effect.provide(Logger.layer([detailedLogger]))
 * )
 *
 * Effect.runSync(program)
 * outputs // => [{ message: ["Processing request"], level: "Info", hasCause: false }]
 * ```
 *
 * @category options
 * @since 2.0.0
 */
export interface Options<out Message> {
  readonly message: Message
  readonly logLevel: LogLevel.LogLevel
  readonly cause: Cause.Cause<unknown>
  readonly fiber: Fiber.Fiber<unknown, unknown>
  readonly date: Date
}

/**
 * Returns `true` if the specified value is a `Logger`, otherwise returns `false`.
 *
 * **Example** (Checking logger values)
 *
 * ```ts import.meta.vitest
 * import { Logger } from "effect"
 *
 * const myLogger = Logger.make(() => undefined)
 *
 * Logger.isLogger(myLogger) // => true
 * Logger.isLogger("not a logger") // => false
 * Logger.isLogger({ log: () => {} }) // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isLogger = (u: unknown): u is Logger<unknown, unknown> => Predicate.hasProperty(u, TypeId)

/**
 * Context reference containing the active loggers for the current fiber.
 *
 * **Details**
 *
 * By default this set includes the default logger and the tracer logger.
 * Providing `Logger.layer` replaces or merges with this set depending on its
 * options.
 *
 * **Example** (Accessing current loggers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const messages: Array<unknown> = []
 * const customLogger = Logger.make((options) => {
 *   messages.push(options.message)
 * })
 * const program = Effect.gen(function*() {
 *   const currentLoggers = yield* Effect.service(Logger.CurrentLoggers)
 *   yield* Effect.log("Hello from custom logger").pipe(
 *     Effect.provide(Logger.layer([customLogger]))
 *   )
 *   return currentLoggers.has(Logger.defaultLogger)
 * })
 *
 * Effect.runSync(program) // => true
 * messages // => [["Hello from custom logger"]]
 * ```
 *
 * @category services
 * @since 4.0.0
 */
export const CurrentLoggers: Context.Reference<ReadonlySet<Logger<unknown, any>>> = effect.CurrentLoggers

/**
 * Context reference that routes the built-in default logger and TTY pretty
 * console logger to stderr.
 *
 * **When to use**
 *
 * Use to route built-in logger output to stderr while keeping stdout reserved
 * for protocol messages or data output.
 *
 * **Details**
 *
 * The reference defaults to `false`. Providing `true` makes the affected
 * loggers call `console.error` instead of `console.log`.
 *
 * @see {@link defaultLogger} for the runtime logger affected by this reference
 * @see {@link consolePretty} for the TTY-mode pretty console logger affected by this reference
 * @see {@link withConsoleError} for routing a specific formatter logger to `console.error`
 *
 * @category services
 * @since 4.0.0
 */
export const LogToStderr: Context.Reference<boolean> = effect.LogToStderr

/**
 * Transforms the output of a `Logger` using the provided function.
 *
 * **When to use**
 *
 * Use when an existing logger's output should be transformed without recreating the
 * logging logic.
 *
 * **Example** (Transforming logger output)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const outputs: Array<unknown> = []
 * const structuredLogger = Logger.make((options) => ({
 *   message: options.message
 * }))
 *
 * // Transform to uppercase messages
 * const uppercaseLogger = Logger.map(
 *   structuredLogger,
 *   (output) => ({ ...output, message: String(output.message).toUpperCase() })
 * )
 *
 * const collector = Logger.make((options) => outputs.push(uppercaseLogger.log(options)))
 * const program = Effect.log("hello").pipe(Effect.provide(Logger.layer([collector])))
 * Effect.runSync(program)
 * outputs // => [{ message: "HELLO" }]
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const map = dual<
  <Output, Output2>(
    f: (output: Output) => Output2
  ) => <Message>(
    self: Logger<Message, Output>
  ) => Logger<Message, Output2>,
  <Message, Output, Output2>(
    self: Logger<Message, Output>,
    f: (output: Output) => Output2
  ) => Logger<Message, Output2>
>(2, (self, f) => effect.loggerMake((options) => f(self.log(options))))

/**
 * Returns a new `Logger` that writes all output of the specified `Logger` to
 * the console using `console.log`.
 *
 * **When to use**
 *
 * Use when a logger's string or object output should be routed to `console.log` for
 * development or debugging.
 *
 * **Example** (Writing logger output with console.log)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * import { TestConsole } from "effect/testing"
 *
 * // Create a custom formatter
 * const customFormatter = Logger.make((options) =>
 *   `${options.logLevel}: ${options.message}`
 * )
 *
 * const consoleLogger = Logger.withConsoleLog(customFormatter)
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.log("Hello World").pipe(Effect.provide(Logger.layer([consoleLogger])))
 *   return yield* TestConsole.logLines
 * }).pipe(Effect.provide(TestConsole.layer))
 *
 * await Effect.runPromise(program) // => ["Info: Hello World"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const withConsoleLog = <Message, Output>(
  self: Logger<Message, Output>
): Logger<Message, void> =>
  effect.loggerMake((options) => {
    const console = options.fiber.getRef(effect.ConsoleRef)
    return console.log(self.log(options))
  })
/**
 * Returns a new `Logger` that writes all output of the specified `Logger` to
 * the console using `console.error`.
 *
 * **When to use**
 *
 * Use when logger output should be routed to `console.error`, such as error logs that
 * should appear on stderr instead of stdout.
 *
 * **Example** (Writing logger output with console.error)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * import { TestConsole } from "effect/testing"
 *
 * // Create an error-specific formatter
 * const errorFormatter = Logger.make((options) =>
 *   `ERROR: ${options.message}`
 * )
 *
 * const errorLogger = Logger.withConsoleError(errorFormatter)
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.logError("Database connection failed").pipe(Effect.provide(Logger.layer([errorLogger])))
 *   return yield* TestConsole.errorLines
 * }).pipe(Effect.provide(TestConsole.layer))
 *
 * await Effect.runPromise(program) // => ["ERROR: Database connection failed"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const withConsoleError = <Message, Output>(
  self: Logger<Message, Output>
): Logger<Message, void> =>
  effect.loggerMake((options) => {
    const console = options.fiber.getRef(effect.ConsoleRef)
    return console.error(self.log(options))
  })
/**
 * Returns a new `Logger` that writes all output of the specified `Logger` to
 * the console.
 *
 * **Details**
 *
 * Will use the appropriate console method (i.e. `console.log`, `console.error`,
 * etc.) based upon the current `LogLevel`.
 *
 * `Debug` uses `console.debug`, `Info` uses `console.info`, `Trace` uses
 * `console.trace`, `Warn` uses `console.warn`, `Error` and `Fatal` use
 * `console.error`, and all other levels use `console.log`.
 *
 * **Example** (Writing logs with level-based console methods)
 *
 * ```ts import.meta.vitest
 * import { Console, Effect, Logger } from "effect"
 *
 * const messages: Array<ReadonlyArray<unknown>> = []
 * const testConsole: Console.Console = Object.assign(Object.create(console), {
 *   info: (message: unknown) => messages.push(["info", message]),
 *   warn: (message: unknown) => messages.push(["warn", message]),
 *   error: (message: unknown) => messages.push(["error", message])
 * })
 * const formatter = Logger.make((options) =>
 *   `[${options.logLevel}] ${options.message}`
 * )
 *
 * const leveledLogger = Logger.withLeveledConsole(formatter)
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.logInfo("Info message") // -> console.info
 *   yield* Effect.logWarning("Warning") // -> console.warn
 *   yield* Effect.logError("Error occurred") // -> console.error
 * }).pipe(Effect.provide(Logger.layer([leveledLogger])))
 * Effect.runSync(Effect.provideService(program, Console.Console, testConsole))
 * const expected = [
 *   ["info", "[Info] Info message"],
 *   ["warn", "[Warn] Warning"],
 *   ["error", "[Error] Error occurred"]
 * ]
 * messages // => expected
 * ```
 *
 * @category logging
 * @since 3.8.0
 */
export const withLeveledConsole = <Message, Output>(
  self: Logger<Message, Output>
): Logger<Message, void> =>
  effect.loggerMake((options) => {
    const console = options.fiber.getRef(effect.ConsoleRef)
    const output = self.log(options)
    switch (options.logLevel) {
      case "Debug":
        return console.debug(output)
      case "Info":
        return console.info(output)
      case "Trace":
        return console.trace(output)
      case "Warn":
        return console.warn(output)
      case "Error":
      case "Fatal":
        return console.error(output)
      default:
        return console.log(output)
    }
  })

/**
 * Match strings that do not contain any whitespace characters, double quotes,
 * or equal signs.
 */
const textOnly = /^[^\s"=]*$/

/**
 * Escapes double quotes in a string.
 */
const escapeDoubleQuotes = (s: string) => `"${s.replace(/\\([\s\S])|(")/g, "\\$1$2")}"`

/**
 * Formats the identifier of a `Fiber` by prefixing it with a hash tag.
 */
const formatFiberId = (fiberId: number) => `#${fiberId}`

/**
 * Used by both {@link formatSimple} and {@link formatLogFmt} to render a log
 * message.
 *
 * @internal
 */
const format = (
  quoteValue: (s: string) => string,
  space?: number | string | undefined
) =>
({ cause, date, fiber, logLevel, message }: Options<unknown>): string => {
  const formatUnknown = (value: unknown): string =>
    typeof value === "string" ? value : Formatter.format(value, { space })
  const formatValue = (value: string): string => value.match(textOnly) ? value : quoteValue(value)
  const format = (label: string, value: string): string => `${effect.formatLabel(label)}=${formatValue(value)}`
  const append = (label: string, value: string): string => " " + format(label, value)

  let out = format("timestamp", date.toISOString())
  out += append("level", logLevel.toUpperCase())
  out += append("fiber", formatFiberId(fiber.id))

  const messages = Array.ensure(message)
  for (let i = 0; i < messages.length; i++) {
    out += append("message", formatUnknown(messages[i]))
  }

  if (cause.reasons.length > 0) {
    out += append("cause", effect.causePretty(cause))
  }

  const now = date.getTime()
  const spans = fiber.getRef(CurrentLogSpans)
  for (const span of spans) {
    out += " " + effect.formatLogSpan(span, now)
  }

  const annotations = fiber.getRef(CurrentLogAnnotations)
  for (const [label, value] of Object.entries(annotations)) {
    out += append(label, formatUnknown(value))
  }

  return out
}

/**
 * Creates a new `Logger` from a log function.
 *
 * **Details**
 *
 * The log function receives an options object containing the message, log level,
 * cause, fiber information, and timestamp, and should return the desired output.
 *
 * **Example** (Creating loggers from functions)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const outputs: Array<string> = []
 * const textLogger = Logger.make((options) =>
 *   `${options.logLevel}: ${options.message}`
 * )
 * const collector = Logger.make((options) => outputs.push(textLogger.log(options)))
 *
 * const program = Effect.log("Hello World").pipe(
 *   Effect.provide(Logger.layer([collector]))
 * )
 * Effect.runSync(program)
 * outputs // => ["Info: Hello World"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make: <Message, Output>(
  log: (options: Options<Message>) => Output
) => Logger<Message, Output> = effect.loggerMake

/**
 * The default logging implementation used by the Effect runtime.
 *
 * **Example** (Referencing the default logger)
 *
 * ```ts import.meta.vitest
 * import { Logger } from "effect"
 *
 * Logger.isLogger(Logger.defaultLogger) // => true
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const defaultLogger: Logger<unknown, void> = effect.defaultLogger

/**
 * A `Logger` which outputs logs as a string.
 *
 * **Details**
 *
 * For example, a simple log entry is rendered as
 * `timestamp=2025-01-03T14:22:47.570Z level=INFO fiber=#1 message=hello`.
 *
 * **Example** (Formatting logs as simple strings)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * import { TestConsole } from "effect/testing"
 *
 * // Use the simple format logger
 * const stableSimple = Logger.map(Logger.formatSimple, (output) =>
 *   output
 *     .replace(/timestamp=\S+ /, "")
 *     .replace(/fiber=#\d+ /, "")
 * )
 * const program = Effect.gen(function*() {
 *   yield* Effect.log("Application started").pipe(
 *     Effect.provide(Logger.layer([Logger.withConsoleLog(stableSimple)]))
 *   )
 *   return yield* TestConsole.logLines
 * }).pipe(Effect.provide(TestConsole.layer))
 *
 * await Effect.runPromise(program) // => ["level=INFO message=\"Application started\""]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const formatSimple = effect.loggerMake(format(escapeDoubleQuotes))

/**
 * A `Logger` which outputs logs using the [logfmt](https://brandur.org/logfmt)
 * style.
 *
 * **Details**
 *
 * For example, a logfmt entry is rendered as
 * `timestamp=2025-01-03T14:22:47.570Z level=INFO fiber=#1 message=hello`.
 *
 * **Example** (Formatting logs as logfmt)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * import { TestConsole } from "effect/testing"
 *
 * const stableLogFmt = Logger.map(Logger.formatLogFmt, (output) =>
 *   output
 *     .replace(/timestamp=\S+ /, "")
 *     .replace(/fiber=#\d+ /, "")
 * )
 * const program = Effect.gen(function*() {
 *   yield* Effect.log("User login").pipe(
 *     Effect.provide(Logger.layer([Logger.withConsoleLog(stableLogFmt)]))
 *   )
 *   return yield* TestConsole.logLines
 * }).pipe(Effect.provide(TestConsole.layer))
 *
 * await Effect.runPromise(program) // => ["level=INFO message=\"User login\""]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const formatLogFmt = effect.loggerMake(format(JSON.stringify, 0))

/**
 * A `Logger` which outputs logs using a structured format.
 *
 * **Details**
 *
 * For example, a structured entry can contain `message: [ "hello" ]`,
 * `level: "INFO"`, `timestamp: "2025-01-03T14:25:39.666Z"`,
 * `annotations: { key: "value" }`, `spans: { label: 0 }`, and
 * `fiberId: "#1"`.
 *
 * **Example** (Formatting logs as structured objects)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * import { TestConsole } from "effect/testing"
 *
 * const stableStructured = Logger.map(Logger.formatStructured, (output) => ({
 *   message: output.message,
 *   level: output.level
 * }))
 * const program = Effect.gen(function*() {
 *   yield* Effect.log("User action").pipe(
 *     Effect.provide(Logger.layer([Logger.withConsoleLog(stableStructured)]))
 *   )
 *   return yield* TestConsole.logLines
 * }).pipe(Effect.provide(TestConsole.layer))
 *
 * await Effect.runPromise(program) // => [{ message: "User action", level: "INFO" }]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const formatStructured: Logger<unknown, {
  readonly level: string
  readonly fiberId: string
  readonly timestamp: string
  readonly message: unknown
  readonly cause: string | undefined
  readonly annotations: Record<string, unknown>
  readonly spans: Record<string, number>
}> = effect.loggerMake(({ cause, date, fiber, logLevel, message }) => {
  const annotationsObj: Record<string, unknown> = {}
  const spansObj: Record<string, number> = {}

  const annotations = fiber.getRef(CurrentLogAnnotations)
  for (const [key, value] of Object.entries(annotations)) {
    InternalRecord.assignProperty(annotationsObj, key, effect.structuredMessage(value))
  }

  const now = date.getTime()
  const spans = fiber.getRef(CurrentLogSpans)
  for (const [label, timestamp] of spans) {
    InternalRecord.assignProperty(spansObj, label, now - timestamp)
  }

  const messageArr = Array.ensure(message)
  return {
    message: messageArr.length === 1
      ? effect.structuredMessage(messageArr[0])
      : messageArr.map(effect.structuredMessage),
    level: logLevel.toUpperCase(),
    timestamp: date.toISOString(),
    cause: cause.reasons.length > 0 ? effect.causePretty(cause) : undefined,
    annotations: annotationsObj,
    spans: spansObj,
    fiberId: formatFiberId(fiber.id)
  }
})

/**
 * A `Logger` which outputs logs using a structured format serialized as JSON
 * on a single line.
 *
 * **Details**
 *
 * For example, a JSON entry can render as `{"message":["hello"],"level":"INFO",
 * "timestamp":"2025-01-03T14:28:57.508Z","annotations":{"key":"value"},
 * "spans":{"label":0},"fiberId":"#1"}`.
 *
 * **Example** (Formatting logs as JSON)
 *
 * ```ts import.meta.vitest
 * import { Effect, Formatter, Logger } from "effect"
 * import { TestConsole } from "effect/testing"
 *
 * const stableJson = Logger.map(Logger.formatJson, (json) => {
 *   const output = JSON.parse(json)
 *   return Formatter.formatJson({ message: output.message, level: output.level })
 * })
 * const program = Effect.gen(function*() {
 *   yield* Effect.log("Server started").pipe(
 *     Effect.provide(Logger.layer([Logger.withConsoleLog(stableJson)]))
 *   )
 *   return yield* TestConsole.logLines
 * }).pipe(Effect.provide(TestConsole.layer))
 *
 * await Effect.runPromise(program) // => ["{\"message\":\"Server started\",\"level\":\"INFO\"}"]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const formatJson = map(formatStructured, Formatter.formatJson)

/**
 * Creates a scoped logger that batches the output of another logger.
 *
 * **Details**
 *
 * The returned effect starts a scoped background process that periodically
 * passes buffered outputs to `flush`. When the scope closes, the background
 * process is interrupted and any remaining buffered entries are flushed.
 *
 * **Example** (Batching logger output)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const flushed: Array<ReadonlyArray<string>> = []
 * const messageLogger = Logger.make((options) => String(options.message))
 * const batchedLogger = Logger.batched(messageLogger, {
 *   window: "1 hour",
 *   flush: (messages) =>
 *     Effect.sync(() => {
 *       flushed.push(messages)
 *     })
 * })
 *
 * const program = Effect.scoped(Effect.gen(function*() {
 *   const logger = yield* batchedLogger
 *   yield* Effect.log("Event 1").pipe(Effect.provide(Logger.layer([logger])))
 *   yield* Effect.log("Event 2").pipe(Effect.provide(Logger.layer([logger])))
 * }))
 * await Effect.runPromise(program)
 * flushed // => [["Event 1", "Event 2"]]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const batched = dual<
  <Output>(options: {
    readonly window: Duration.Input
    readonly flush: (messages: Array<NoInfer<Output>>) => Effect.Effect<void>
  }) => <Message>(
    self: Logger<Message, Output>
  ) => Effect.Effect<Logger<Message, void>, never, Scope.Scope>,
  <Message, Output>(
    self: Logger<Message, Output>,
    options: {
      readonly window: Duration.Input
      readonly flush: (messages: Array<NoInfer<Output>>) => Effect.Effect<void>
    }
  ) => Effect.Effect<Logger<Message, void>, never, Scope.Scope>
>(2, <Message, Output>(
  self: Logger<Message, Output>,
  options: {
    readonly window: Duration.Input
    readonly flush: (messages: Array<NoInfer<Output>>) => Effect.Effect<void>
  }
): Effect.Effect<Logger<Message, void>, never, Scope.Scope> =>
  effect.flatMap(effect.scope, (scope) => {
    let buffer: Array<Output> = []
    const flush = effect.suspend(() => {
      if (buffer.length === 0) {
        return effect.void
      }
      const arr = buffer
      buffer = []
      return options.flush(arr)
    })

    return effect.uninterruptibleMask((restore) =>
      restore(
        effect.sleep(options.window).pipe(
          effect.andThen(flush),
          effect.forever
        )
      ).pipe(
        effect.forkDetach,
        effect.flatMap((fiber) => effect.scopeAddFinalizerExit(scope, () => effect.fiberInterrupt(fiber))),
        effect.andThen(effect.addFinalizer(() => flush)),
        effect.as(
          effect.loggerMake((options) => {
            buffer.push(self.log(options))
          })
        )
      )
    )
  }))

/**
 * A `Logger` which outputs logs in a "pretty" format and writes them to the
 * console. Chooses between tty and browser implementation. If the runtime
 * platform is known and fixed, prefer {@link consolePrettyBrowser} or
 * {@link consolePrettyTty}.
 *
 * **Details**
 *
 * For example, pretty output can render as
 * `[09:37:17.579] INFO (#1) label=0ms: hello` followed by an annotation line
 * such as `key: value`.
 *
 * **Example** (Logging with pretty console output)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const prettyLogger = Logger.layer([Logger.consolePretty()])
 *
 * Effect.log("hello").pipe(
 *   Effect.withLogSpan('label'),
 *   Effect.annotateLogs('key', 'value'),
 *   Effect.provide(prettyLogger),
 *   Effect.runSync
 * )
 * ```
 *
 * **Example** (Logging with console.error, when the environment has TTY)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Logger } from "effect"
 *
 * const prettyLoggerLayer = Layer.merge(
 *   Logger.layer([Logger.consolePretty()]),
 *   Layer.succeed(Logger.LogToStderr, true)
 * )
 *
 * Effect.log('hello').pipe(
 *   Effect.provide(prettyLoggerLayer),
 *   Effect.runSync
 * )
 * ```
 *
 * @see {@link consolePrettyBrowser} for browser-specific implementation
 * @see {@link consolePrettyTty} for the TTY-mode implementation
 * @category constructors
 * @since 4.0.0
 */
export const consolePretty: (
  options?: {
    readonly colors?: "auto" | boolean | undefined
    readonly formatDate?: ((date: Date) => string) | undefined
    readonly mode?: "browser" | "tty" | "auto" | undefined
  }
) => Logger<unknown, void> = effect.consolePretty

/**
 * A `Logger` which outputs logs in a "pretty" format and writes them to the
 * console. Intended to be used on platforms with a browser console.
 *
 * **Details**
 *
 * For example, pretty output can render as
 * `[09:37:17.579] INFO (#1) label=0ms: hello` followed by an annotation line
 * such as `key: value`.
 *
 * **Example** (Logging with pretty console output)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const prettyLogger = Logger.layer([Logger.consolePrettyBrowser()])
 *
 * Effect.log("hello").pipe(
 *   Effect.withLogSpan('label'),
 *   Effect.annotateLogs('key', 'value'),
 *   Effect.provide(prettyLogger),
 *   Effect.runSync
 * )
 * ```
 *
 * @see {@link consolePretty} for the platform-independent implementation
 * @category constructors
 * @since 4.0.0
 */
export const consolePrettyBrowser: (
  options?: {
    readonly colors?: boolean | undefined
    readonly formatDate?: ((date: Date) => string) | undefined
  }
) => Logger<unknown, void> = effect.prettyLoggerBrowser

/**
 * A `Logger` which outputs logs in a "pretty" format and writes them to the
 * console. Intended to be used on platforms with tty console.
 *
 * **Details**
 *
 * For example, pretty output can render as
 * `[09:37:17.579] INFO (#1) label=0ms: hello` followed by an annotation line
 * such as `key: value`.
 *
 * **Example** (Logging with pretty console output)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const prettyLogger = Logger.layer([Logger.consolePrettyTty()])
 *
 * Effect.log("hello").pipe(
 *   Effect.withLogSpan('label'),
 *   Effect.annotateLogs('key', 'value'),
 *   Effect.provide(prettyLogger),
 *   Effect.runSync
 * )
 * ```
 *
 * **Example** (Logging with console.error)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Logger } from "effect"
 *
 * const prettyLoggerLayer = Layer.merge(
 *   Logger.layer([Logger.consolePrettyTty()]),
 *   Layer.succeed(Logger.LogToStderr, true)
 * )
 *
 * Effect.log('hello').pipe(
 *   Effect.provide(prettyLoggerLayer),
 *   Effect.runSync
 * )
 * ```
 *
 * @see {@link consolePretty} for the platform-independent implementation
 * @category constructors
 * @since 4.0.0
 */
export const consolePrettyTty: (
  options?: {
    readonly colors?: boolean | undefined
    readonly formatDate?: ((date: Date) => string) | undefined
  }
) => Logger<unknown, void> = effect.prettyLoggerTty

/**
 * A `Logger` which outputs logs using the [logfmt](https://brandur.org/logfmt)
 * style and writes them to the console.
 *
 * **Details**
 *
 * For example, a console logfmt entry is rendered as
 * `timestamp=2025-01-03T14:22:47.570Z level=INFO fiber=#1 message=info`.
 *
 * **Example** (Logging logfmt output to the console)
 *
 * ```ts import.meta.vitest
 * import { Logger } from "effect"
 *
 * Logger.isLogger(Logger.consoleLogFmt) // => true
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const consoleLogFmt: Logger<unknown, void> = withConsoleLog(formatLogFmt)

/**
 * A `Logger` which outputs logs using a structured format and writes them to
 * the console.
 *
 * **Details**
 *
 * For example, console structured output can contain
 * `message: [ "info", "message" ]`, `level: "INFO"`,
 * `timestamp: "2025-01-03T14:25:39.666Z"`,
 * `annotations: { key: "value" }`, `spans: { label: 0 }`, and
 * `fiberId: "#1"`.
 *
 * **Example** (Logging structured output to the console)
 *
 * ```ts import.meta.vitest
 * import { Logger } from "effect"
 *
 * Logger.isLogger(Logger.consoleStructured) // => true
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const consoleStructured: Logger<unknown, void> = withConsoleLog(formatStructured)

/**
 * A `Logger` which outputs logs using a structured format serialized as JSON
 * on a single line and writes them to the console.
 *
 * **Details**
 *
 * For example, console JSON output can render as
 * `{"message":["hello"],"level":"INFO","timestamp":"2025-01-03T14:28:57.508Z",
 * "annotations":{"key":"value"},"spans":{"label":0},"fiberId":"#1"}`.
 *
 * **Example** (Logging JSON output to the console)
 *
 * ```ts import.meta.vitest
 * import { Logger } from "effect"
 *
 * Logger.isLogger(Logger.consoleJson) // => true
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const consoleJson: Logger<unknown, void> = withConsoleLog(formatJson)

/**
 * A `Logger` which includes log messages as tracer span events.
 *
 * **Details**
 *
 * This logger integrates logging with distributed tracing by recording
 * all log messages as events on the current trace span, making them visible
 * in tracing tools like OpenTelemetry, Jaeger, or Zipkin.
 *
 * This logger is included in the default set of loggers for all Effect programs,
 * so log messages automatically appear as span events unless you override the
 * default loggers.
 *
 * **Example** (Recording logs as trace span events)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const program = Effect.log("span event").pipe(
 *   Effect.withSpan("operation"),
 *   Effect.provide(Logger.layer([Logger.tracerLogger]))
 * )
 * Effect.runSync(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const tracerLogger: Logger<unknown, void> = effect.tracerLogger

/**
 * Creates a `Layer` which will overwrite the current set of loggers with the
 * specified array of `loggers`.
 *
 * **Details**
 *
 * If the specified array of `loggers` should be _merged_ with the current set
 * of loggers (instead of overwriting them), set `mergeWithExisting` to `true`.
 *
 * **Example** (Providing logger layers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 *
 * const messages: Array<unknown> = []
 * const customLogger = Logger.make((options) => {
 *   messages.push(options.message)
 * })
 * const CustomLoggerLayer = Logger.layer([customLogger])
 *
 * const program = Effect.log("Application started").pipe(
 *   Effect.provide(CustomLoggerLayer)
 * )
 * Effect.runSync(program)
 * messages // => [["Application started"]]
 * ```
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = <
  const Loggers extends ReadonlyArray<Logger<unknown, unknown> | Effect.Effect<Logger<unknown, unknown>, any, any>>
>(
  loggers: Loggers,
  options?: { readonly mergeWithExisting?: boolean | undefined } | undefined
): Layer.Layer<
  never,
  Loggers extends readonly [] ? never : Effect.Error<Loggers[number]>,
  Exclude<
    Loggers extends readonly [] ? never : Effect.Services<Loggers[number]>,
    Scope.Scope
  >
> =>
  Layer.effect(
    CurrentLoggers,
    withFiber(effect.fnUntraced(function*(fiber) {
      const currentLoggers = new Set(options?.mergeWithExisting === true ? fiber.getRef(effect.CurrentLoggers) : [])
      for (const logger of loggers) {
        currentLoggers.add(isEffect(logger) ? yield* logger : logger)
      }
      return currentLoggers
    }))
  )

/**
 * Creates a scoped logger that writes string logger output to a file.
 *
 * **Details**
 *
 * The returned effect requires `FileSystem` and `Scope`. The file logger batches
 * string output, writes each batch to the specified path, and flushes remaining
 * entries when the scope closes.
 *
 * **Example** (Writing JSON logs to a file)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Logger } from "effect"
 *
 * const writes: Array<string> = []
 * const file = {
 *   writeAll: (buffer: Uint8Array) => Effect.sync(() => {
 *     writes.push(new TextDecoder().decode(buffer).trim())
 *   })
 * } as unknown as FileSystem.File
 * const fileSystem = FileSystem.makeNoop({ open: () => Effect.succeed(file) })
 * const messageLogger = Logger.make((options) => String(options.message))
 *
 * const program = Effect.scoped(Effect.gen(function*() {
 *   const fileLogger = yield* Logger.toFile(messageLogger, "/tmp/log.txt")
 *   yield* Effect.log("a").pipe(Effect.provide(Logger.layer([fileLogger])))
 *   yield* Effect.log("b").pipe(Effect.provide(Logger.layer([fileLogger])))
 *   yield* Effect.log("c").pipe(Effect.provide(Logger.layer([fileLogger])))
 * })).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem))
 *
 * await Effect.runPromise(program)
 * writes // => ["a\nb\nc"]
 * ```
 *
 * **Example** (Writing logs to files)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Logger } from "effect"
 *
 * const writes: Array<string> = []
 * const file = {
 *   writeAll: (buffer: Uint8Array) => Effect.sync(() => {
 *     writes.push(new TextDecoder().decode(buffer).trim())
 *   })
 * } as unknown as FileSystem.File
 * const fileSystem = FileSystem.makeNoop({ open: () => Effect.succeed(file) })
 * const messageLogger = Logger.make((options) => String(options.message))
 *
 * const program = Effect.scoped(Effect.gen(function*() {
 *   const fileLogger = yield* Logger.toFile(messageLogger, "/tmp/app.log", {
 *     batchWindow: "1 hour"
 *   })
 *   yield* Effect.log("Application started").pipe(
 *     Effect.provide(Logger.layer([fileLogger]))
 *   )
 * })).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem))
 *
 * await Effect.runPromise(program)
 * writes // => ["Application started"]
 * ```
 *
 * @category logging
 * @since 4.0.0
 */
export const toFile = dual<
  (
    path: string,
    options?: {
      readonly flag?: FileSystem.OpenFlag | undefined
      readonly mode?: number | undefined
      readonly batchWindow?: Duration.Input | undefined
    } | undefined
  ) => <Message>(
    self: Logger<Message, string>
  ) => Effect.Effect<Logger<Message, void>, PlatformError, Scope.Scope | FileSystem.FileSystem>,
  <Message>(
    self: Logger<Message, string>,
    path: string,
    options?: {
      readonly flag?: FileSystem.OpenFlag | undefined
      readonly mode?: number | undefined
      readonly batchWindow?: Duration.Input | undefined
    } | undefined
  ) => Effect.Effect<Logger<Message, void>, PlatformError, Scope.Scope | FileSystem.FileSystem>
>(
  (args) => isLogger(args[0]),
  (self, path, options) =>
    effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const logFile = yield* fs.open(path, { flag: "a+", ...options })
      const encoder = new TextEncoder()
      return yield* batched(self, {
        window: options?.batchWindow ?? 1000,
        flush: (output) => effect.ignore(logFile.writeAll(encoder.encode(output.join("\n") + "\n")))
      })
    })
)
