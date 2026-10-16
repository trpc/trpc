/**
 * Exports Effect metrics over OTLP/HTTP.
 *
 * This module periodically snapshots metrics from the current Effect context,
 * serializes them as OTLP resource metrics, and posts them to a metrics
 * endpoint such as an OpenTelemetry Collector or vendor intake. It is meant for
 * long-running services that already update `Metric` counters, gauges,
 * histograms, frequencies, or summaries. The exporter supports cumulative
 * reporting from a fixed start time and delta reporting from the previous
 * export.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import { Clock } from "../Clock.ts"
import * as Config from "../Config.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import type * as Headers from "../http/Headers.ts"
import type { HttpBody } from "../http/HttpBody.ts"
import type * as HttpClient from "../http/HttpClient.ts"
import * as Layer from "../Layer.ts"
import * as Metric from "../Metric.ts"
import * as Option from "../Option.ts"
import type * as Scope from "../Scope.ts"
import * as OtlpEnv from "./internal/otlpEnv.ts"
import * as Exporter from "./OtlpExporter.ts"
import type { Fixed64, KeyValue } from "./OtlpResource.ts"
import * as OtlpResource from "./OtlpResource.ts"
import { OtlpSerialization } from "./OtlpSerialization.ts"

/**
 * Determines how metric values relate to the time interval over which they are aggregated.
 *
 * **Details**
 *
 * `"cumulative"` reports total since a fixed start time. Each data point depends on all previous measurements. This is the default behavior.
 *
 * `"delta"` reports changes since the last export. Each interval is independent with no dependency on previous measurements.
 *
 * **Example** (Configuring aggregation temporality)
 *
 * ```ts import.meta.vitest
 * import { Layer } from "effect"
 * import { OtlpMetrics } from "effect/observability"
 *
 * // Use delta temporality for backends that prefer it (e.g., Datadog, Dynatrace)
 * const metricsLayer = OtlpMetrics.layer({
 *   url: "http://localhost:4318/v1/metrics",
 *   temporality: "delta"
 * })
 *
 * // Use cumulative temporality for backends like Prometheus
 * const cumulativeLayer = OtlpMetrics.layer({
 *   url: "http://localhost:4318/v1/metrics",
 *   temporality: "cumulative" // This is the default
 * })
 *
 * const result = [Layer.isLayer(metricsLayer), Layer.isLayer(cumulativeLayer)] // => [true, true]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AggregationTemporality = "cumulative" | "delta"

/**
 * Starts a scoped OTLP metrics exporter.
 *
 * **Details**
 *
 * The exporter snapshots registered Effect metrics on the configured interval, serializes them with the selected aggregation temporality, and flushes during scope finalization up to `shutdownTimeout`.
 * Manual flushing also triggers a snapshot. With delta temporality, each
 * successful export advances the previous-export state, so frequent successful
 * flushes narrow the delta aggregation windows.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: (options: {
  readonly url: string
  readonly resource?: {
    readonly serviceName?: string | undefined
    readonly serviceVersion?: string | undefined
    readonly attributes?: Record<string, unknown>
  } | undefined
  readonly headers?: Headers.Input | undefined
  readonly exportInterval?: Duration.Input | undefined
  readonly shutdownTimeout?: Duration.Input | undefined
  readonly temporality?: AggregationTemporality | undefined
}) => Effect.Effect<
  void,
  never,
  Exporter.Flusher | HttpClient.HttpClient | OtlpSerialization | Scope.Scope
> = Effect.fnUntraced(function*(options) {
  const clock = yield* Clock
  const serialization = yield* OtlpSerialization
  const startTimeNanos = yield* clock.currentTimeNanos
  const startTime = String(startTimeNanos)
  const temporality = options.temporality ?? "cumulative"

  const resource = yield* OtlpResource.fromConfig(options.resource)
  const metricsScope: IInstrumentationScope = {
    name: OtlpResource.serviceNameUnsafe(resource)
  }

  const services = yield* Effect.context<never>()

  // State for delta temporality tracking
  let previousExportTimeNanos: bigint = startTimeNanos
  let previousCounterState = new Map<string, number | bigint>()
  let previousHistogramState = new Map<string, PreviousHistogramState>()
  let previousFrequencyState = new Map<string, Map<string, number>>()
  let previousSummaryState = new Map<string, PreviousSummaryState>()
  let snapshotSequence = 0
  let committedSnapshotSequence = -1

  const snapshot = (): readonly [body: HttpBody, onSuccess: Effect.Effect<void>] => {
    const snapshot = Metric.snapshotUnsafe(services)
    const currentSnapshotSequence = snapshotSequence++
    const nowNanos = clock.currentTimeNanosUnsafe()
    const nowTime = String(nowNanos)
    const nextCounterState = new Map(previousCounterState)
    const nextHistogramState = new Map(previousHistogramState)
    const nextFrequencyState = new Map(previousFrequencyState)
    const nextSummaryState = new Map(previousSummaryState)
    const metricData: Array<IMetric> = []
    const metricDataByName = new Map<string, IMetric>()
    const addMetricData = (data: IMetric) => {
      metricData.push(data)
      metricDataByName.set(data.name, data)
    }

    const isDelta = temporality === "delta"
    const aggregationTemporalityEnum = isDelta
      ? EAggregationTemporality.AGGREGATION_TEMPORALITY_DELTA
      : EAggregationTemporality.AGGREGATION_TEMPORALITY_CUMULATIVE
    const intervalStartTime = isDelta
      ? String(previousExportTimeNanos)
      : startTime

    for (let i = 0, len = snapshot.length; i < len; i++) {
      const state = snapshot[i]
      const unit = state.attributes?.unit ?? state.attributes?.time_unit ?? "1"
      const attributes = state.attributes ? OtlpResource.entriesToAttributes(Object.entries(state.attributes)) : []
      const metricKey = makeMetricKey(state.id, state.attributes)

      switch (state.type) {
        case "Counter": {
          const currentCount = state.state.count
          let reportValue: number | bigint = currentCount

          if (isDelta) {
            const previousCount = previousCounterState.get(metricKey)
            if (previousCount !== undefined) {
              if (typeof currentCount === "bigint" && typeof previousCount === "bigint") {
                reportValue = currentCount - previousCount
                // Handle reset: if current < previous, report current value
                if (state.state.incremental && reportValue < BigInt(0)) {
                  reportValue = currentCount
                }
              } else {
                const curr = Number(currentCount)
                const prev = Number(previousCount)
                reportValue = curr - prev
                // Handle reset
                if (state.state.incremental && reportValue < 0) {
                  reportValue = curr
                }
              }
            }
            nextCounterState.set(metricKey, currentCount)
          }

          const dataPoint: INumberDataPoint = {
            attributes,
            startTimeUnixNano: intervalStartTime,
            timeUnixNano: nowTime
          }
          if (typeof reportValue === "bigint") {
            dataPoint.asInt = Number(reportValue)
          } else {
            dataPoint.asDouble = reportValue
          }
          if (metricDataByName.has(state.id)) {
            metricDataByName.get(state.id)!.sum!.dataPoints.push(dataPoint)
          } else {
            addMetricData({
              name: state.id,
              description: state.description!,
              unit,
              sum: {
                aggregationTemporality: aggregationTemporalityEnum,
                isMonotonic: state.state.incremental,
                dataPoints: [dataPoint]
              }
            })
          }
          break
        }
        case "Gauge": {
          // Gauges don't have temporality - they always report current value
          const dataPoint: INumberDataPoint = {
            attributes,
            startTimeUnixNano: startTime,
            timeUnixNano: nowTime
          }
          if (typeof state.state.value === "bigint") {
            dataPoint.asInt = Number(state.state.value)
          } else {
            dataPoint.asDouble = state.state.value
          }
          if (metricDataByName.has(state.id)) {
            metricDataByName.get(state.id)!.gauge!.dataPoints.push(dataPoint)
          } else {
            addMetricData({
              name: state.id,
              description: state.description!,
              unit,
              gauge: {
                dataPoints: [dataPoint]
              }
            })
          }
          break
        }
        case "Histogram": {
          const size = state.state.buckets.length
          const currentBuckets = {
            boundaries: Arr.allocate(size - 1) as Array<number>,
            counts: Arr.allocate(size) as Array<number>
          }
          let idx = 0
          let prev = 0
          for (const [boundary, value] of state.state.buckets) {
            if (idx < size - 1) {
              currentBuckets.boundaries[idx] = boundary
            }
            currentBuckets.counts[idx] = value - prev
            prev = value
            idx++
          }

          let reportCount = state.state.count
          let reportSum = state.state.sum
          let reportBucketCounts = currentBuckets.counts
          const reportMin = state.state.min
          const reportMax = state.state.max

          if (isDelta) {
            const previousState = previousHistogramState.get(metricKey)
            if (previousState !== undefined) {
              reportCount = state.state.count - previousState.count
              reportSum = state.state.sum - previousState.sum
              reportBucketCounts = currentBuckets.counts.map((c, i) =>
                Math.max(0, c - (previousState.bucketCounts[i] ?? 0))
              )
              // For delta, min/max represent the interval's min/max
              // We can't compute these from cumulative state, so we use current values
              // Note: This is a limitation - true delta min/max would require tracking
              // observations within each interval
            }
            nextHistogramState.set(metricKey, {
              count: state.state.count,
              sum: state.state.sum,
              bucketCounts: currentBuckets.counts.slice(),
              min: state.state.min,
              max: state.state.max
            })
          }

          const dataPoint: IHistogramDataPoint = {
            attributes,
            startTimeUnixNano: intervalStartTime,
            timeUnixNano: nowTime,
            count: reportCount,
            min: reportMin,
            max: reportMax,
            sum: reportSum,
            bucketCounts: reportBucketCounts,
            explicitBounds: currentBuckets.boundaries
          }

          if (metricDataByName.has(state.id)) {
            metricDataByName.get(state.id)!.histogram!.dataPoints.push(dataPoint)
          } else {
            addMetricData({
              name: state.id,
              description: state.description!,
              unit,
              histogram: {
                aggregationTemporality: aggregationTemporalityEnum,
                dataPoints: [dataPoint]
              }
            })
          }
          break
        }
        case "Frequency": {
          const dataPoints: Array<INumberDataPoint> = []
          const currentOccurrences = new Map<string, number>()

          for (const [freqKey, value] of state.state.occurrences) {
            currentOccurrences.set(freqKey, value)
            let reportValue = value

            if (isDelta) {
              const previousOccurrences = previousFrequencyState.get(metricKey)
              if (previousOccurrences !== undefined) {
                const previousValue = previousOccurrences.get(freqKey) ?? 0
                reportValue = Math.max(0, value - previousValue)
              }
            }

            dataPoints.push({
              attributes: [...attributes, { key: "key", value: { stringValue: freqKey } }],
              startTimeUnixNano: intervalStartTime,
              timeUnixNano: nowTime,
              asInt: reportValue
            })
          }

          if (isDelta) {
            nextFrequencyState.set(metricKey, currentOccurrences)
          }

          if (metricDataByName.has(state.id)) {
            metricDataByName.get(state.id)!.sum!.dataPoints.push(...dataPoints)
          } else {
            addMetricData({
              name: state.id,
              description: state.description!,
              unit,
              sum: {
                aggregationTemporality: aggregationTemporalityEnum,
                isMonotonic: true,
                dataPoints
              }
            })
          }
          break
        }
        case "Summary": {
          // Quantiles are always computed fresh from the sliding window
          // They don't have temporality in the traditional sense
          const dataPoints: Array<INumberDataPoint> = [{
            attributes: [...attributes, { key: "quantile", value: { stringValue: "min" } }],
            startTimeUnixNano: intervalStartTime,
            timeUnixNano: nowTime,
            asDouble: state.state.min
          }]
          for (const [quantile, value] of state.state.quantiles) {
            dataPoints.push({
              attributes: [...attributes, { key: "quantile", value: { stringValue: quantile.toString() } }],
              startTimeUnixNano: intervalStartTime,
              timeUnixNano: nowTime,
              asDouble: value ?? 0
            })
          }
          dataPoints.push({
            attributes: [...attributes, { key: "quantile", value: { stringValue: "max" } }],
            startTimeUnixNano: intervalStartTime,
            timeUnixNano: nowTime,
            asDouble: state.state.max
          })

          let reportCount = state.state.count
          let reportSum = state.state.sum

          if (isDelta) {
            const previousState = previousSummaryState.get(metricKey)
            if (previousState !== undefined) {
              reportCount = state.state.count - previousState.count
              reportSum = state.state.sum - previousState.sum
            }
            nextSummaryState.set(metricKey, {
              count: state.state.count,
              sum: state.state.sum
            })
          }

          const countDataPoint: INumberDataPoint = {
            attributes,
            startTimeUnixNano: intervalStartTime,
            timeUnixNano: nowTime,
            asInt: reportCount
          }
          const sumDataPoint: INumberDataPoint = {
            attributes,
            startTimeUnixNano: intervalStartTime,
            timeUnixNano: nowTime,
            asDouble: reportSum
          }

          if (metricDataByName.has(`${state.id}_quantiles`)) {
            metricDataByName.get(`${state.id}_quantiles`)!.sum!.dataPoints.push(...dataPoints)
            metricDataByName.get(`${state.id}_count`)!.sum!.dataPoints.push(countDataPoint)
            metricDataByName.get(`${state.id}_sum`)!.sum!.dataPoints.push(sumDataPoint)
          } else {
            addMetricData({
              name: `${state.id}_quantiles`,
              description: state.description!,
              unit,
              sum: {
                aggregationTemporality: aggregationTemporalityEnum,
                isMonotonic: false,
                dataPoints
              }
            })
            addMetricData({
              name: `${state.id}_count`,
              description: state.description!,
              unit: "1",
              sum: {
                aggregationTemporality: aggregationTemporalityEnum,
                isMonotonic: true,
                dataPoints: [countDataPoint]
              }
            })
            addMetricData({
              name: `${state.id}_sum`,
              description: state.description!,
              unit: "1",
              sum: {
                aggregationTemporality: aggregationTemporalityEnum,
                isMonotonic: true,
                dataPoints: [sumDataPoint]
              }
            })
          }
          break
        }
      }
    }

    const body = serialization.metrics({
      resourceMetrics: [{
        resource,
        scopeMetrics: [{
          scope: metricsScope,
          metrics: metricData
        }]
      }]
    })
    const onSuccess = isDelta
      ? Effect.sync(() => {
        if (currentSnapshotSequence < committedSnapshotSequence) return
        previousCounterState = nextCounterState
        previousHistogramState = nextHistogramState
        previousFrequencyState = nextFrequencyState
        previousSummaryState = nextSummaryState
        previousExportTimeNanos = nowNanos
        committedSnapshotSequence = currentSnapshotSequence
      })
      : Effect.void
    return [body, onSuccess]
  }

  yield* Exporter.make({
    label: "OtlpMetrics",
    url: options.url,
    headers: options.headers,
    maxBatchSize: "disabled",
    exportEmpty: true,
    exportInterval: options.exportInterval ?? Duration.seconds(10),
    body: snapshot,
    shutdownTimeout: options.shutdownTimeout ?? Duration.seconds(3)
  })
})

/**
 * Layer that starts the OTLP metrics exporter created by `make`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: {
  readonly url: string
  readonly resource?: {
    readonly serviceName?: string | undefined
    readonly serviceVersion?: string | undefined
    readonly attributes?: Record<string, unknown>
  } | undefined
  readonly headers?: Headers.Input | undefined
  readonly exportInterval?: Duration.Input | undefined
  readonly shutdownTimeout?: Duration.Input | undefined
  readonly temporality?: AggregationTemporality | undefined
}): Layer.Layer<Exporter.Flusher, never, HttpClient.HttpClient | OtlpSerialization> =>
  Layer.effectDiscard(make(options)).pipe(Layer.provideMerge(Exporter.layerFlusher))

/**
 * Creates an OTLP metrics layer from OpenTelemetry configuration.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerFromConfig = (options?: {
  readonly resource?: {
    readonly serviceName?: string | undefined
    readonly serviceVersion?: string | undefined
    readonly attributes?: Record<string, unknown>
  } | undefined
  readonly headers?: Headers.Input | undefined
}): Layer.Layer<Exporter.Flusher, never, HttpClient.HttpClient | OtlpSerialization> =>
  Effect.gen(function*() {
    const { disabled, endpoint, exporters } = yield* Config.all({
      disabled: Config.Boolean("OTEL_SDK_DISABLED").pipe(Config.withDefault(false)),
      endpoint: OtlpEnv.endpoint("METRICS"),
      exporters: OtlpEnv.exporters("METRICS")
    })
    if (disabled || !endpoint || !exporters.includes("otlp")) {
      return Exporter.layerFlusher
    }

    const { baseTimeout, metricsTimeout, exportTimeout, exportInterval, temporalityPreference } = yield* Config.all({
      baseTimeout: Config.option(Config.Int("OTEL_EXPORTER_OTLP_TIMEOUT")),
      metricsTimeout: Config.option(Config.Int("OTEL_EXPORTER_OTLP_METRICS_TIMEOUT")),
      exportTimeout: Config.option(Config.Int("OTEL_METRIC_EXPORT_TIMEOUT")),
      exportInterval: Config.option(
        Config.Int("OTEL_METRIC_EXPORT_INTERVAL").pipe(
          Config.map(Duration.millis)
        )
      ),
      temporalityPreference: Config.option(
        Config.Literals(["delta", "cumulative"], "OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE")
      )
    })

    const shutdownTimeout = Option.firstSomeOf([metricsTimeout, baseTimeout, exportTimeout]).pipe(
      Option.map((_) => Duration.millis(_))
    )

    return layer({
      url: endpoint.toString(),
      resource: options?.resource,
      headers: options?.headers ?? (yield* OtlpEnv.headers("METRICS")),
      exportInterval: Option.getOrUndefined(exportInterval),
      shutdownTimeout: Option.getOrUndefined(shutdownTimeout),
      temporality: Option.getOrUndefined(temporalityPreference)
    })
  }).pipe(Effect.orDie, Layer.unwrap)

/**
 * OTLP metrics payload serialized by `OtlpMetrics`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MetricsData {
  readonly resourceMetrics: ReadonlyArray<IResourceMetrics>
}

// internal

/** Creates a unique key for a metric including its attributes */
const makeMetricKey = (id: string, attributes: Metric.Metric.AttributeSet | undefined): string => {
  if (attributes === undefined || Object.keys(attributes).length === 0) {
    return id
  }
  const sortedEntries = Object.entries(attributes).sort((a, b) => a[0].localeCompare(b[0]))
  return `${id}:${JSON.stringify(sortedEntries)}`
}

/** Previous state for histogram delta computation */
interface PreviousHistogramState {
  readonly count: number
  readonly sum: number
  readonly bucketCounts: Array<number>
  readonly min: number
  readonly max: number
}

/** Previous state for summary delta computation */
interface PreviousSummaryState {
  readonly count: number
  readonly sum: number
}

/** Properties of an InstrumentationScope. */
interface IInstrumentationScope {
  /** InstrumentationScope name */
  name: string
  /** InstrumentationScope version */
  version?: string
  /** InstrumentationScope attributes */
  attributes?: Array<KeyValue>
  /** InstrumentationScope droppedAttributesCount */
  droppedAttributesCount?: number
}

/** Properties of a ResourceMetrics. */
interface IResourceMetrics {
  /** ResourceMetrics resource */
  resource: OtlpResource.Resource
  /** ResourceMetrics scopeMetrics */
  scopeMetrics: Array<IScopeMetrics>
  /** ResourceMetrics schemaUrl */
  schemaUrl?: string | undefined
}
/** Properties of an IScopeMetrics. */
interface IScopeMetrics {
  /** ScopeMetrics scope */
  scope: IInstrumentationScope
  /** ScopeMetrics metrics */
  metrics: Array<IMetric>
  /** ScopeMetrics schemaUrl */
  schemaUrl?: string | undefined
}
/** Properties of a Metric. */
interface IMetric {
  /** Metric name */
  name: string
  /** Metric description */
  description?: string
  /** Metric unit */
  unit?: string
  /** Metric gauge */
  gauge?: IGauge
  /** Metric sum */
  sum?: ISum
  /** Metric histogram */
  histogram?: IHistogram
  /** Metric exponentialHistogram */
  exponentialHistogram?: IExponentialHistogram
  /** Metric summary */
  summary?: ISummary
}
/** Properties of a Gauge. */
interface IGauge {
  /** Gauge dataPoints */
  dataPoints: Array<INumberDataPoint>
}
/** Properties of a Sum. */
interface ISum {
  /** Sum dataPoints */
  dataPoints: Array<INumberDataPoint>
  /** Sum aggregationTemporality */
  aggregationTemporality: EAggregationTemporality
  /** Sum isMonotonic */
  isMonotonic: boolean
}
/** Properties of a Histogram. */
interface IHistogram {
  /** Histogram dataPoints */
  dataPoints: Array<IHistogramDataPoint>
  /** Histogram aggregationTemporality */
  aggregationTemporality?: EAggregationTemporality
}
/** Properties of an ExponentialHistogram. */
interface IExponentialHistogram {
  /** ExponentialHistogram dataPoints */
  dataPoints: Array<IExponentialHistogramDataPoint>
  /** ExponentialHistogram aggregationTemporality */
  aggregationTemporality?: EAggregationTemporality
}
/** Properties of a Summary. */
interface ISummary {
  /** Summary dataPoints */
  dataPoints: Array<ISummaryDataPoint>
}
/** Properties of a NumberDataPoint. */
interface INumberDataPoint {
  /** NumberDataPoint attributes */
  attributes: Array<KeyValue>
  /** NumberDataPoint startTimeUnixNano */
  startTimeUnixNano?: Fixed64
  /** NumberDataPoint timeUnixNano */
  timeUnixNano?: Fixed64
  /** NumberDataPoint asDouble */
  asDouble?: number | null
  /** NumberDataPoint asInt */
  asInt?: number
  /** NumberDataPoint exemplars */
  exemplars?: Array<IExemplar>
  /** NumberDataPoint flags */
  flags?: number
}
/** Properties of a HistogramDataPoint. */
interface IHistogramDataPoint {
  /** HistogramDataPoint attributes */
  attributes?: Array<KeyValue>
  /** HistogramDataPoint startTimeUnixNano */
  startTimeUnixNano?: Fixed64
  /** HistogramDataPoint timeUnixNano */
  timeUnixNano?: Fixed64
  /** HistogramDataPoint count */
  count?: number
  /** HistogramDataPoint sum */
  sum?: number
  /** HistogramDataPoint bucketCounts */
  bucketCounts?: Array<number>
  /** HistogramDataPoint explicitBounds */
  explicitBounds?: Array<number>
  /** HistogramDataPoint exemplars */
  exemplars?: Array<IExemplar>
  /** HistogramDataPoint flags */
  flags?: number
  /** HistogramDataPoint min */
  min?: number
  /** HistogramDataPoint max */
  max?: number
}
/** Properties of an ExponentialHistogramDataPoint. */
interface IExponentialHistogramDataPoint {
  /** ExponentialHistogramDataPoint attributes */
  attributes?: Array<KeyValue>
  /** ExponentialHistogramDataPoint startTimeUnixNano */
  startTimeUnixNano?: Fixed64
  /** ExponentialHistogramDataPoint timeUnixNano */
  timeUnixNano?: Fixed64
  /** ExponentialHistogramDataPoint count */
  count?: number
  /** ExponentialHistogramDataPoint sum */
  sum?: number
  /** ExponentialHistogramDataPoint scale */
  scale?: number
  /** ExponentialHistogramDataPoint zeroCount */
  zeroCount?: number
  /** ExponentialHistogramDataPoint positive */
  positive?: IBuckets
  /** ExponentialHistogramDataPoint negative */
  negative?: IBuckets
  /** ExponentialHistogramDataPoint flags */
  flags?: number
  /** ExponentialHistogramDataPoint exemplars */
  exemplars?: Array<IExemplar>
  /** ExponentialHistogramDataPoint min */
  min?: number
  /** ExponentialHistogramDataPoint max */
  max?: number
}
/** Properties of a SummaryDataPoint. */
interface ISummaryDataPoint {
  /** SummaryDataPoint attributes */
  attributes?: Array<KeyValue>
  /** SummaryDataPoint startTimeUnixNano */
  startTimeUnixNano?: number
  /** SummaryDataPoint timeUnixNano */
  timeUnixNano?: string
  /** SummaryDataPoint count */
  count?: number
  /** SummaryDataPoint sum */
  sum?: number
  /** SummaryDataPoint quantileValues */
  quantileValues?: Array<IValueAtQuantile>
  /** SummaryDataPoint flags */
  flags?: number
}
/** Properties of a ValueAtQuantile. */
interface IValueAtQuantile {
  /** ValueAtQuantile quantile */
  quantile?: number
  /** ValueAtQuantile value */
  value?: number
}
/** Properties of a Buckets. */
interface IBuckets {
  /** Buckets offset */
  offset?: number
  /** Buckets bucketCounts */
  bucketCounts?: Array<number>
}
/** Properties of an Exemplar. */
interface IExemplar {
  /** Exemplar filteredAttributes */
  filteredAttributes?: Array<KeyValue>
  /** Exemplar timeUnixNano */
  timeUnixNano?: string
  /** Exemplar asDouble */
  asDouble?: number
  /** Exemplar asInt */
  asInt?: number
  /** Exemplar spanId */
  spanId?: string | Uint8Array
  /** Exemplar traceId */
  traceId?: string | Uint8Array
}
/**
 * AggregationTemporality defines how a metric aggregator reports aggregated
 * values. It describes how those values relate to the time interval over
 * which they are aggregated.
 */
const EAggregationTemporality = {
  AGGREGATION_TEMPORALITY_UNSPECIFIED: 0,
  /** DELTA is an AggregationTemporality for a metric aggregator which reports
    changes since last report time. Successive metrics contain aggregation of
    values from continuous and non-overlapping intervals.

    The values for a DELTA metric are based only on the time interval
    associated with one measurement cycle. There is no dependency on
    previous measurements like is the case for CUMULATIVE metrics.

    For example, consider a system measuring the number of requests that
    it receives and reports the sum of these requests every second as a
    DELTA metric:

    1. The system starts receiving at time=t_0.
    2. A request is received, the system measures 1 request.
    3. A request is received, the system measures 1 request.
    4. A request is received, the system measures 1 request.
    5. The 1 second collection cycle ends. A metric is exported for the
        number of requests received over the interval of time t_0 to
        t_0+1 with a value of 3.
    6. A request is received, the system measures 1 request.
    7. A request is received, the system measures 1 request.
    8. The 1 second collection cycle ends. A metric is exported for the
        number of requests received over the interval of time t_0+1 to
        t_0+2 with a value of 2. */
  AGGREGATION_TEMPORALITY_DELTA: 1,
  /** CUMULATIVE is an AggregationTemporality for a metric aggregator which
    reports changes since a fixed start time. This means that current values
    of a CUMULATIVE metric depend on all previous measurements since the
    start time. Because of this, the sender is required to retain this state
    in some form. If this state is lost or invalidated, the CUMULATIVE metric
    values MUST be reset and a new fixed start time following the last
    reported measurement time sent MUST be used.

    For example, consider a system measuring the number of requests that
    it receives and reports the sum of these requests every second as a
    CUMULATIVE metric:

    1. The system starts receiving at time=t_0.
    2. A request is received, the system measures 1 request.
    3. A request is received, the system measures 1 request.
    4. A request is received, the system measures 1 request.
    5. The 1 second collection cycle ends. A metric is exported for the
        number of requests received over the interval of time t_0 to
        t_0+1 with a value of 3.
    6. A request is received, the system measures 1 request.
    7. A request is received, the system measures 1 request.
    8. The 1 second collection cycle ends. A metric is exported for the
        number of requests received over the interval of time t_0 to
        t_0+2 with a value of 5.
    9. The system experiences a fault and loses state.
    10. The system recovers and resumes receiving at time=t_1.
    11. A request is received, the system measures 1 request.
    12. The 1 second collection cycle ends. A metric is exported for the
        number of requests received over the interval of time t_1 to
        t_0+1 with a value of 1.

    Note: Even though, when reporting changes since last report time, using
    CUMULATIVE is valid, it is not recommended. This may cause problems for
    systems that do not use start_time to determine when the aggregation
    value was reset (e.g. Prometheus). */
  AGGREGATION_TEMPORALITY_CUMULATIVE: 2
} as const

type EAggregationTemporality = typeof EAggregationTemporality[keyof typeof EAggregationTemporality]
