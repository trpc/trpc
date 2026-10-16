/**
 * Connects Effect logging to the OpenTelemetry Logs SDK.
 *
 * This module turns Effect log events into OpenTelemetry log records. It maps
 * Effect log levels to OpenTelemetry severity numbers, provides the
 * `OtelLoggerProvider` service, creates an Effect `Logger` with `make`, and
 * offers layers for installing that logger or creating a scoped SDK
 * `LoggerProvider` from one or more `LogRecordProcessor`s.
 *
 * @stability unstable
 * @since 4.0.0
 */
import { SeverityNumber } from "@opentelemetry/api-logs"
import * as Otel from "@opentelemetry/sdk-logs"
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as Arr from "effect/Array"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import type * as LogLevel from "effect/LogLevel"
import * as Predicate from "effect/Predicate"
import * as Rec from "effect/Record"
import * as References from "effect/References"
import * as Tracer from "effect/Tracer"
import { nanosToHrTime, unknownToAttributeValue } from "./internal/attributes.ts"
import { Resource } from "./Resource.ts"

/**
 * Context service containing the OpenTelemetry `LoggerProvider` used to emit Effect log records.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class OtelLoggerProvider extends Context.Service<
  OtelLoggerProvider,
  Otel.LoggerProvider
>()("@effect/opentelemetry/Logger/OtelLoggerProvider") {}

/**
 * Maps an Effect `LogLevel` to the corresponding OpenTelemetry `SeverityNumber`.
 *
 * **Details**
 *
 * OpenTelemetry log severity numbers are in the range `1` through `24`. This
 * function maps from Effect's log levels instead of using
 * `LogLevel.getOrdinal`, whose internal sort ordinals, such as the `Info`
 * ordinal `20000`, fall outside the OpenTelemetry logs data model and can be
 * treated as `UNSPECIFIED` by validating backends.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const logLevelToSeverityNumber = (level: LogLevel.LogLevel): SeverityNumber => {
  switch (level) {
    case "Trace":
      return SeverityNumber.TRACE
    case "Debug":
      return SeverityNumber.DEBUG
    case "Info":
      return SeverityNumber.INFO
    case "Warn":
      return SeverityNumber.WARN
    case "Error":
      return SeverityNumber.ERROR
    case "Fatal":
      return SeverityNumber.FATAL
    default:
      return SeverityNumber.UNSPECIFIED
  }
}

/**
 * Creates an Effect logger that emits log records through the configured OpenTelemetry logger provider.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: Effect.Effect<
  Logger.Logger<unknown, void>,
  never,
  OtelLoggerProvider
> = Effect.gen(function*() {
  const loggerProvider = yield* OtelLoggerProvider
  const clock = yield* Clock.Clock
  const otelLogger = loggerProvider.getLogger("@effect/opentelemetry")

  return Logger.make((options) => {
    const attributes: Record<string, any> = {
      fiberId: options.fiber.id
    }

    for (const [key, value] of Object.entries(options.fiber.getRef(References.CurrentLogAnnotations))) {
      Rec.assignProperty(attributes, key, unknownToAttributeValue(value))
    }

    const span = Context.getOrUndefined(options.fiber.context, Tracer.ParentSpan)

    if (Predicate.isNotUndefined(span)) {
      attributes.spanId = span.spanId
      attributes.traceId = span.traceId
    }

    const now = options.date.getTime()
    for (const [label, startTime] of options.fiber.getRef(References.CurrentLogSpans)) {
      attributes[`logSpan.${label}`] = `${now - startTime}ms`
    }

    const message = Arr.ensure(options.message).map(unknownToAttributeValue)
    const hrTime = nanosToHrTime(clock.currentTimeNanosUnsafe())
    otelLogger.emit({
      body: message.length === 1 ? message[0] : message,
      severityText: options.logLevel,
      severityNumber: logLevelToSeverityNumber(options.logLevel),
      timestamp: hrTime,
      observedTimestamp: hrTime,
      attributes
    })
  })
})

/**
 * Creates a layer that installs the OpenTelemetry-backed Effect logger, merging with existing loggers by default.
 *
 * **When to use**
 *
 * Use to install the OpenTelemetry-backed Effect logger in an application that
 * has an `OtelLoggerProvider`, so standard Effect logging emits OpenTelemetry
 * log records.
 *
 * **Details**
 *
 * The layer installs the logger created by `make`. `mergeWithExisting` defaults
 * to `true`; set it to `false` to replace the current logger set.
 *
 * @see {@link make} for constructing the logger directly
 * @see {@link layerLoggerProvider} for creating the required logger provider
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: {
  /**
   * Whether to merge the OpenTelemetry logger with existing loggers.
   *
   * **Details**
   *
   * If set to `true`, the OpenTelemetry logger will be merged with existing
   * loggers in the application.
   *
   * If set to `false`, the OpenTelemetry logger will replace all existing
   * loggers in the application.
   *
   * Defaults to `true`.
   */
  readonly mergeWithExisting?: boolean | undefined
}): Layer.Layer<never, never, OtelLoggerProvider> =>
  Logger.layer([make], {
    mergeWithExisting: options.mergeWithExisting ?? true
  })

/**
 * Creates a scoped OpenTelemetry logger provider from one or more log record processors, using the current `Resource` and flushing and shutting down the provider when the layer is released.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerLoggerProvider = (
  processor: Otel.LogRecordProcessor | NonEmptyReadonlyArray<Otel.LogRecordProcessor>,
  config?: Omit<Otel.LoggerProviderConfig, "resource"> & {
    readonly shutdownTimeout?: Duration.Input | undefined
  }
): Layer.Layer<OtelLoggerProvider, never, Resource> =>
  Layer.effect(
    OtelLoggerProvider,
    Effect.gen(function*() {
      const resource = yield* Resource
      return yield* Effect.acquireRelease(
        Effect.sync(() =>
          new Otel.LoggerProvider({
            ...(config ?? undefined),
            processors: Arr.ensure(processor),
            resource
          })
        ),
        (provider) =>
          Effect.promise(() => provider.forceFlush().finally(() => provider.shutdown())).pipe(
            Effect.ignore,
            Effect.interruptible,
            Effect.timeoutOption(config?.shutdownTimeout ?? 3000)
          )
      )
    })
  )
