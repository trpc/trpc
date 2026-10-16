/**
 * @title Customizing logging
 *
 * Configure loggers & log-level filtering for production applications.
 */
import { NodeFileSystem } from "@effect/platform-node"
import { Config, Effect, Layer, Logger, References } from "effect"

// Build a logger layer that emits one JSON line per log entry.
export const JsonLoggerLayer = Logger.layer([Logger.consoleJson])

// Raise the minimum level to "Warn" to skip debug/info logs.
export const WarnAndAbove = Layer.succeed(References.MinimumLogLevel, "Warn")

// There is a built-in logger for writing to a file
export const FileLoggerLayer = Logger.layer([
  Logger.toFile(Logger.formatSimple, "app.log")
]).pipe(
  Layer.provide(NodeFileSystem.layer)
)

// Define a custom logger for app-specific formatting and routing.
export const appLogger = Effect.gen(function*() {
  // Here you could initialize a connection to an external logging service, set
  // up log file rotation, etc.
  yield* Effect.logDebug("initializing app logger")

  return yield* Logger.batched(Logger.formatStructured, {
    window: "1 second",
    flush: Effect.fn(function*(batch) {
      // In a real implementation, this is where you would send the batch of log entries to an external logging service or write them to a file.
      console.log(`Flushing ${batch.length} log entries`)
    })
  })
})

export const AppLoggerLayer = Logger.layer([appLogger]).pipe(
  Layer.provideMerge(WarnAndAbove) // Start with "Warn" level for the app logger.
)

// Create a logger layer that uses the default logger for development, and the
// custom logger for production
export const LoggerLayer = Layer.unwrap(Effect.gen(function*() {
  const env = yield* Config.String("NODE_ENV").pipe(Config.withDefault("development"))
  if (env === "production") {
    return AppLoggerLayer
  }
  return Logger.layer([Logger.defaultLogger])
}))

// Example effect that logs at various levels during a checkout flow.
export const logCheckoutFlow = Effect.gen(function*() {
  yield* Effect.logDebug("loading checkout state")

  yield* Effect.logInfo("validating cart")
  yield* Effect.logWarning("inventory is low for one line item")
  yield* Effect.logError("payment provider timeout")
}).pipe(
  // Attach structured metadata to all log lines emitted by this effect.
  Effect.annotateLogs({
    service: "checkout-api",
    route: "POST /checkout"
  }),
  // Add a duration span so each log line includes checkout=<N>ms metadata.
  Effect.withLogSpan("checkout")
)
