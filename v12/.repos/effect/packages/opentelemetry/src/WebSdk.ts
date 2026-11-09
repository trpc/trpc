/**
 * Browser OpenTelemetry setup for Effect applications.
 *
 * This module exports a `Configuration` type and layers for installing
 * tracing, metrics, and logging in browser runtimes. The main `layer` builds
 * the shared OpenTelemetry resource from explicit service metadata, then
 * enables only the signal types that have processors or readers configured.
 * `layerTracerProvider` creates a scoped `WebTracerProvider`.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Otel from "@opentelemetry/api"
import type { LoggerProviderConfig, LogRecordProcessor } from "@opentelemetry/sdk-logs"
import type { MetricReader } from "@opentelemetry/sdk-metrics"
import type { SpanProcessor, TracerConfig } from "@opentelemetry/sdk-trace-base"
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web"
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as Effect from "effect/Effect"
import { constant, type LazyArg } from "effect/Function"
import * as Layer from "effect/Layer"
import { isNonEmpty } from "./internal/utilities.ts"
import * as Logger from "./OtelLogger.ts"
import * as Metrics from "./OtelMetrics.ts"
import * as Tracer from "./OtelTracer.ts"
import * as Resource from "./Resource.ts"

/**
 * Configuration for the Web OpenTelemetry layer, including resource metadata and optional tracing, metrics, and logging settings.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Configuration {
  readonly spanProcessor?: SpanProcessor | ReadonlyArray<SpanProcessor> | undefined
  readonly tracerConfig?: Omit<TracerConfig, "resource">
  readonly metricReader?: MetricReader | ReadonlyArray<MetricReader> | undefined
  readonly metricTemporality?: Metrics.TemporalityPreference | undefined
  readonly logRecordProcessor?: LogRecordProcessor | ReadonlyArray<LogRecordProcessor> | undefined
  readonly loggerProviderConfig?: Omit<LoggerProviderConfig, "resource"> | undefined
  readonly loggerMergeWithExisting?: boolean | undefined
  readonly resource: {
    readonly serviceName: string
    readonly serviceVersion?: string
    readonly attributes?: Otel.Attributes
  }
}

/**
 * Creates a scoped Web OpenTelemetry tracer provider from one or more span processors and shuts it down when the layer is released.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerTracerProvider = (
  processor: SpanProcessor | NonEmptyReadonlyArray<SpanProcessor>,
  config?: Omit<TracerConfig, "resource">
): Layer.Layer<Tracer.OtelTracerProvider, never, Resource.Resource> =>
  Layer.effect(
    Tracer.OtelTracerProvider,
    Effect.gen(function*() {
      const resource = yield* Resource.Resource
      return yield* Effect.acquireRelease(
        Effect.sync(() => {
          const provider = new WebTracerProvider({
            ...(config ?? undefined),
            resource,
            spanProcessors: Array.isArray(processor) ? (processor as any) : [processor]
          })
          return provider
        }),
        (provider) =>
          Effect.promise(() => provider.forceFlush()).pipe(
            Effect.ensuring(Effect.promise(() => provider.shutdown())),
            Effect.ignore
          )
      )
    })
  )

/**
 * Creates a Web OpenTelemetry layer from configuration, providing the resource and enabling tracing, metrics, and logging when configured.
 *
 * **When to use**
 *
 * Use to install browser OpenTelemetry support when service metadata is
 * configured in code and telemetry processors or readers are supplied directly.
 *
 * **Details**
 *
 * The configuration can be provided lazily or effectfully. The layer always
 * provides `Resource.Resource`; tracing, metrics, and logging are installed only
 * when the corresponding processors or readers are non-empty.
 *
 * **Gotchas**
 *
 * Browser resource metadata is explicit; this layer does not read
 * OpenTelemetry environment variables. Empty processor or reader arrays are
 * treated as not configured.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: {
  (evaluate: LazyArg<Configuration>): Layer.Layer<Resource.Resource>
  <E, R>(evaluate: Effect.Effect<Configuration, E, R>): Layer.Layer<Resource.Resource, E, R>
} = (
  evaluate: LazyArg<Configuration> | Effect.Effect<Configuration, any, any>
): Layer.Layer<Resource.Resource> =>
  Layer.unwrap(
    Effect.gen(function*() {
      const config = yield* Effect.isEffect(evaluate)
        ? evaluate as Effect.Effect<Configuration>
        : Effect.sync(evaluate)

      const ResourceLayer = Resource.layer(config.resource)

      const TracerLayer = isNonEmpty(config.spanProcessor)
        ? Layer.provide(
          Tracer.layer,
          layerTracerProvider(config.spanProcessor, config.tracerConfig)
        )
        : Layer.empty

      const LoggerLayer = isNonEmpty(config.logRecordProcessor)
        ? Layer.provide(
          Logger.layer({ mergeWithExisting: config.loggerMergeWithExisting }),
          Logger.layerLoggerProvider(config.logRecordProcessor, config.loggerProviderConfig)
        )
        : Layer.empty

      const MetricsLayer = isNonEmpty(config.metricReader)
        ? Metrics.layer(constant(config.metricReader), {
          temporality: config.metricTemporality
        })
        : Layer.empty

      return Layer.mergeAll(TracerLayer, MetricsLayer, LoggerLayer).pipe(
        Layer.provideMerge(ResourceLayer)
      )
    })
  )
