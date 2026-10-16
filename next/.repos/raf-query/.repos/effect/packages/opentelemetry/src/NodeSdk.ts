/**
 * Node.js OpenTelemetry setup for Effect applications.
 *
 * This module exports a `Configuration` type and layers for installing
 * tracing, metrics, and logging in Node.js. The main `layer` builds the shared
 * OpenTelemetry resource from environment variables and optional service
 * metadata, then enables only the signal types that have processors or readers
 * configured. `layerTracerProvider` creates a scoped Node tracer provider, and
 * `layerEmpty` provides an empty resource.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Otel from "@opentelemetry/api"
import type { LoggerProviderConfig, LogRecordProcessor } from "@opentelemetry/sdk-logs"
import type { MetricReader } from "@opentelemetry/sdk-metrics"
import type { SpanProcessor, TracerConfig } from "@opentelemetry/sdk-trace-base"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import type { NonEmptyReadonlyArray } from "effect/Array"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { constant, type LazyArg } from "effect/Function"
import * as Layer from "effect/Layer"
import { isNonEmpty } from "./internal/utilities.ts"
import * as Logger from "./OtelLogger.ts"
import * as Metrics from "./OtelMetrics.ts"
import * as Tracer from "./OtelTracer.ts"
import * as Resource from "./Resource.ts"

/**
 * Configuration for the Node OpenTelemetry layer, including optional tracing, metrics, logging, resource, and shutdown settings.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Configuration {
  readonly spanProcessor?: SpanProcessor | ReadonlyArray<SpanProcessor> | undefined
  readonly tracerConfig?: Omit<TracerConfig, "resource"> | undefined
  readonly metricReader?: MetricReader | ReadonlyArray<MetricReader> | undefined
  readonly metricTemporality?: Metrics.TemporalityPreference | undefined
  readonly logRecordProcessor?: LogRecordProcessor | ReadonlyArray<LogRecordProcessor> | undefined
  readonly loggerProviderConfig?: Omit<LoggerProviderConfig, "resource"> | undefined
  readonly loggerMergeWithExisting?: boolean | undefined
  readonly resource?: {
    readonly serviceName: string
    readonly serviceVersion?: string
    readonly attributes?: Otel.Attributes
  } | undefined
  readonly shutdownTimeout?: Duration.Input | undefined
}

/**
 * Creates a scoped Node OpenTelemetry tracer provider from one or more span processors and shuts it down when the layer is released.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerTracerProvider = (
  processor: SpanProcessor | NonEmptyReadonlyArray<SpanProcessor>,
  config?: Omit<TracerConfig, "resource"> & {
    readonly shutdownTimeout?: Duration.Input | undefined
  }
): Layer.Layer<Tracer.OtelTracerProvider, never, Resource.Resource> =>
  Layer.effect(
    Tracer.OtelTracerProvider,
    Effect.gen(function*() {
      const resource = yield* Resource.Resource
      return yield* Effect.acquireRelease(
        Effect.sync(() => {
          const provider = new NodeTracerProvider({
            ...(config ?? undefined),
            resource,
            spanProcessors: Array.isArray(processor) ? (processor as any) : [processor]
          })
          return provider
        }),
        (provider) =>
          Effect.promise(() => provider.forceFlush().finally(() => provider.shutdown())).pipe(
            Effect.ignore,
            Effect.interruptible,
            Effect.timeoutOption(config?.shutdownTimeout ?? 3000)
          )
      )
    })
  )

/**
 * Creates a Node OpenTelemetry layer from configuration, enabling tracing, metrics, and logging only when their processors or readers are supplied.
 *
 * **When to use**
 *
 * Use to install OpenTelemetry support for a Node.js Effect application from
 * one configuration object, enabling tracing, metrics, logging, or any
 * combination of those signals based on the processors and readers supplied.
 *
 * **Details**
 *
 * The configuration can be provided lazily or effectfully. The layer always
 * provides `Resource.Resource`, building it from environment variables and any
 * explicit resource metadata in the configuration.
 *
 * **Gotchas**
 *
 * Register Node auto-instrumentations before importing modules that should be
 * patched, because many Node instrumentations hook module loading.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: {
  (evaluate: LazyArg<Configuration>): Layer.Layer<Resource.Resource>
  <R, E>(evaluate: Effect.Effect<Configuration, E, R>): Layer.Layer<Resource.Resource, E, R>
} = (
  evaluate: LazyArg<Configuration> | Effect.Effect<Configuration, any, any>
): Layer.Layer<Resource.Resource> =>
  Layer.unwrap(
    Effect.gen(function*() {
      const config = yield* Effect.isEffect(evaluate)
        ? evaluate as Effect.Effect<Configuration>
        : Effect.sync(evaluate)

      const ResourceLayer = Resource.layerFromEnv(config.resource && Resource.configToAttributes(config.resource))

      const TracerLayer = isNonEmpty(config.spanProcessor)
        ? Layer.provide(
          Tracer.layer,
          layerTracerProvider(config.spanProcessor, {
            ...config.tracerConfig,
            shutdownTimeout: config.shutdownTimeout
          })
        )
        : Layer.empty

      const MetricsLayer = isNonEmpty(config.metricReader)
        ? Metrics.layer(constant(config.metricReader), {
          shutdownTimeout: config.shutdownTimeout,
          temporality: config.metricTemporality
        })
        : Layer.empty

      const LoggerLayer = isNonEmpty(config.logRecordProcessor)
        ? Layer.provide(
          Logger.layer({ mergeWithExisting: config.loggerMergeWithExisting }),
          Logger.layerLoggerProvider(config.logRecordProcessor, {
            ...config.loggerProviderConfig,
            shutdownTimeout: config.shutdownTimeout
          })
        )
        : Layer.empty

      return Layer.mergeAll(TracerLayer, MetricsLayer, LoggerLayer).pipe(
        Layer.provideMerge(ResourceLayer)
      )
    })
  )

/**
 * Layer that provides an empty OpenTelemetry `Resource`.
 *
 * @stability unstable
 * @category layers
 * @since 2.0.0
 */
export const layerEmpty: Layer.Layer<Resource.Resource> = Resource.layerEmpty
