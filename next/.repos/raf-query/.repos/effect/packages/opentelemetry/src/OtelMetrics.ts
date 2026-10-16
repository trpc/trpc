/**
 * OpenTelemetry support for Effect metrics.
 *
 * This module exposes Effect metrics as an OpenTelemetry `MetricProducer`.
 * `makeProducer` creates the producer, `registerProducer` attaches it to one
 * or more SDK `MetricReader`s, and `layer` manages that setup in a scoped
 * layer. The `TemporalityPreference` type lets callers choose cumulative or
 * delta metric values.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { MetricProducer, MetricReader } from "@opentelemetry/sdk-metrics"
import type * as Arr from "effect/Array"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import type { LazyArg } from "effect/Function"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import { MetricProducerImpl } from "./internal/metrics.ts"
import { Resource } from "./Resource.ts"

/**
 * Determines how metric values relate to the time interval over which they
 * are aggregated.
 *
 * **Details**
 *
 * `cumulative` reports total since a fixed start time. Each data point depends
 * on all previous measurements. This is the default behavior. `delta` reports
 * changes since the last export. Each interval is independent with no
 * dependency on previous measurements.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type TemporalityPreference = "cumulative" | "delta"

/**
 * Creates an OpenTelemetry metric producer from Effect metrics.
 *
 * **When to use**
 *
 * Use when you need a `MetricProducer` for manually wiring Effect metrics into
 * OpenTelemetry instead of using the scoped `layer` helper.
 *
 * **Details**
 *
 * Requires the current OpenTelemetry `Resource`, captures the current Effect
 * context, and uses cumulative temporality by default. Pass `"delta"` for
 * interval-based values.
 *
 * @see {@link registerProducer} for attaching a producer to metric readers
 * @see {@link layer} for creating and registering a producer in a scoped layer
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeProducer = (temporality?: TemporalityPreference): Effect.Effect<MetricProducer, never, Resource> =>
  Effect.gen(function*() {
    const resource = yield* Resource
    const services = yield* Effect.context<never>()
    return new MetricProducerImpl(resource, services, temporality)
  })

/**
 * Registers a metric producer with one or more metric readers.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const registerProducer = (
  self: MetricProducer,
  metricReader: LazyArg<MetricReader | Arr.NonEmptyReadonlyArray<MetricReader>>,
  options?: {
    readonly shutdownTimeout?: Duration.Input | undefined
  }
): Effect.Effect<Array<any>, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const reader = metricReader()
      const readers: Array<MetricReader> = Array.isArray(reader) ? reader : [reader] as any
      readers.forEach((reader) => reader.setMetricProducer(self instanceof MetricProducerImpl ? self.fork() : self))
      return readers
    }),
    (readers) =>
      Effect.promise(() =>
        Promise.all(
          readers.map((reader) => reader.shutdown())
        )
      ).pipe(
        Effect.ignore,
        Effect.interruptible,
        Effect.timeoutOption(options?.shutdownTimeout ?? 3000)
      )
  )

/**
 * Creates a Layer that registers a metric producer with metric readers.
 *
 * **Example** (Exporting delta metrics)
 *
 * ```ts import.meta.vitest
 * import { OtelMetrics, Resource } from "@effect/opentelemetry"
 * import {
 *   AggregationTemporality,
 *   InMemoryMetricExporter,
 *   PeriodicExportingMetricReader
 * } from "@opentelemetry/sdk-metrics"
 * import { Effect, Layer, Metric } from "effect"
 *
 * const exporter = new InMemoryMetricExporter(AggregationTemporality.DELTA)
 * const reader = new PeriodicExportingMetricReader({
 *   exporter,
 *   exportIntervalMillis: 60_000
 * })
 * const metricsLayer = OtelMetrics.layer(() => reader, { temporality: "delta" }).pipe(
 *   Layer.provide(Resource.layerEmpty)
 * )
 *
 * const program = Effect.gen(function*() {
 *   yield* Metric.update(Metric.counter("docs.requests", { incremental: true }), 2)
 *   yield* Effect.promise(() => reader.forceFlush())
 *
 *   const metric = exporter.getMetrics()[0]?.scopeMetrics[0]?.metrics.find(
 *     (metric) => metric.descriptor.name === "docs.requests"
 *   )
 *   return [metric?.descriptor.name, metric?.aggregationTemporality, metric?.dataPoints[0]?.value] as const
 * }).pipe(
 *   Effect.provide(metricsLayer),
 *   Effect.provideService(Metric.MetricRegistry, new Map())
 * )
 *
 * await Effect.runPromise(program) // => ["docs.requests", AggregationTemporality.DELTA, 2]
 * ```
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  evaluate: LazyArg<MetricReader | Arr.NonEmptyReadonlyArray<MetricReader>>,
  options?: {
    readonly shutdownTimeout?: Duration.Input | undefined
    readonly temporality?: TemporalityPreference | undefined
  }
): Layer.Layer<never, never, Resource> =>
  Layer.effectDiscard(Effect.flatMap(
    makeProducer(options?.temporality),
    (producer) => registerProducer(producer, evaluate, options)
  ))
