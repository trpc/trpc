import { type HrTime, ValueType } from "@opentelemetry/api"
import type * as Resources from "@opentelemetry/resources"
import type {
  CollectionResult,
  DataPoint,
  Histogram,
  MetricCollectOptions,
  MetricData,
  MetricProducer
} from "@opentelemetry/sdk-metrics"
import { AggregationTemporality, DataPointType, InstrumentType } from "@opentelemetry/sdk-metrics"
import type { InstrumentDescriptor } from "@opentelemetry/sdk-metrics/build/src/InstrumentDescriptor.js"
import * as Arr from "effect/Array"
import type * as Context from "effect/Context"
import * as Metric from "effect/Metric"
import * as Rec from "effect/Record"
import type * as Metrics from "../OtelMetrics.ts"

const sdkName = "@effect/opentelemetry/Metrics"

type MetricDataWithInstrumentDescriptor = MetricData & {
  readonly descriptor: InstrumentDescriptor
}

interface PreviousHistogramState {
  readonly count: number
  readonly sum: number
  readonly bucketCounts: ReadonlyArray<number>
  readonly min: number
  readonly max: number
}

interface PreviousSummaryState {
  readonly count: number
  readonly sum: number
}

/** @internal */
export class MetricProducerImpl implements MetricProducer {
  resource: Resources.Resource
  context: Context.Context<never>
  temporality: Metrics.TemporalityPreference
  startTimes: Map<string, HrTime>
  startTimeNanos: HrTime
  previousExportTimeNanos: HrTime
  previousCounterState: Map<string, number | bigint>
  previousHistogramState: Map<string, PreviousHistogramState>
  previousFrequencyState: Map<string, Map<string, number>>
  previousSummaryState: Map<string, PreviousSummaryState>

  constructor(
    resource: Resources.Resource,
    context: Context.Context<never>,
    temporality: Metrics.TemporalityPreference = "cumulative"
  ) {
    this.resource = resource
    this.context = context
    this.temporality = temporality
    this.startTimes = new Map()
    this.startTimeNanos = currentHrTime()
    this.previousExportTimeNanos = this.startTimeNanos
    this.previousCounterState = new Map()
    this.previousHistogramState = new Map()
    this.previousFrequencyState = new Map()
    this.previousSummaryState = new Map()
  }

  fork(): MetricProducerImpl {
    return new MetricProducerImpl(this.resource, this.context, this.temporality)
  }

  startTimeFor(name: string, hrTime: HrTime) {
    if (this.startTimes.has(name)) {
      return this.startTimes.get(name)!
    }
    this.startTimes.set(name, hrTime)
    return hrTime
  }

  collect(_options?: MetricCollectOptions): Promise<CollectionResult> {
    const snapshot = Metric.snapshotUnsafe(this.context)
    const hrTimeNow = currentHrTime()
    const metricData: Array<MetricData> = []
    const metricDataByName = new Map<string, MetricData>()
    const addMetricData = (data: MetricDataWithInstrumentDescriptor) => {
      metricData.push(data)
      metricDataByName.set(data.descriptor.name, data)
    }

    const isDelta = this.temporality === "delta"
    const aggregationTemporality = isDelta
      ? AggregationTemporality.DELTA
      : AggregationTemporality.CUMULATIVE
    const intervalStartTime = isDelta
      ? this.previousExportTimeNanos
      : this.startTimeNanos

    for (let i = 0, len = snapshot.length; i < len; i++) {
      const state = snapshot[i]
      const attributes = state.attributes
        ? Arr.reduce(Object.entries(state.attributes), {} as Record<string, string>, (acc, [key, value]) => {
          Rec.assignProperty(acc, key, String(value))
          return acc
        })
        : {}
      const metricKey = makeMetricKey(state.id, state.attributes)

      switch (state.type) {
        case "Counter": {
          const currentCount = state.state.count
          let reportValue: number | bigint = currentCount

          if (isDelta) {
            const previousCount = this.previousCounterState.get(metricKey)
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
            this.previousCounterState.set(metricKey, currentCount)
          }

          const descriptor = descriptorFromState(state, attributes)
          const startTime = isDelta ? intervalStartTime : this.startTimeFor(descriptor.name, intervalStartTime)
          const dataPoint: DataPoint<number> = {
            startTime,
            endTime: hrTimeNow,
            attributes,
            value: Number(reportValue)
          }
          if (metricDataByName.has(state.id)) {
            metricDataByName.get(state.id)!.dataPoints.push(dataPoint as any)
          } else {
            addMetricData({
              dataPointType: DataPointType.SUM,
              descriptor,
              isMonotonic: state.state.incremental,
              aggregationTemporality,
              dataPoints: [dataPoint]
            })
          }
          break
        }
        case "Gauge": {
          // Gauges don't have temporality - they always report current value
          const descriptor = descriptorFromState(state, attributes)
          const startTime = this.startTimeFor(descriptor.name, this.startTimeNanos)
          const dataPoint: DataPoint<number> = {
            startTime,
            endTime: hrTimeNow,
            attributes,
            value: Number(state.state.value)
          }
          if (metricDataByName.has(state.id)) {
            metricDataByName.get(state.id)!.dataPoints.push(dataPoint as any)
          } else {
            addMetricData({
              dataPointType: DataPointType.GAUGE,
              descriptor,
              aggregationTemporality: AggregationTemporality.CUMULATIVE,
              dataPoints: [dataPoint]
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
            const previousState = this.previousHistogramState.get(metricKey)
            if (previousState !== undefined) {
              reportCount = state.state.count - previousState.count
              reportSum = state.state.sum - previousState.sum
              reportBucketCounts = currentBuckets.counts.map((c, i) =>
                Math.max(0, c - (previousState.bucketCounts[i] ?? 0))
              )
            }
            this.previousHistogramState.set(metricKey, {
              count: state.state.count,
              sum: state.state.sum,
              bucketCounts: currentBuckets.counts.slice(),
              min: state.state.min,
              max: state.state.max
            })
          }

          const descriptor = descriptorFromState(state, attributes)
          const startTime = isDelta ? intervalStartTime : this.startTimeFor(descriptor.name, intervalStartTime)
          const dataPoint: DataPoint<Histogram> = {
            startTime,
            endTime: hrTimeNow,
            attributes,
            value: {
              buckets: {
                boundaries: currentBuckets.boundaries,
                counts: reportBucketCounts
              },
              count: reportCount,
              min: reportMin,
              max: reportMax,
              sum: reportSum
            }
          }

          if (metricDataByName.has(state.id)) {
            metricDataByName.get(state.id)!.dataPoints.push(dataPoint as any)
          } else {
            addMetricData({
              dataPointType: DataPointType.HISTOGRAM,
              descriptor,
              aggregationTemporality,
              dataPoints: [dataPoint]
            })
          }
          break
        }
        case "Frequency": {
          const dataPoints: Array<DataPoint<number>> = []
          const currentOccurrences = new Map<string, number>()

          for (const [freqKey, value] of state.state.occurrences) {
            currentOccurrences.set(freqKey, value)
            let reportValue = value

            if (isDelta) {
              const previousOccurrences = this.previousFrequencyState.get(metricKey)
              if (previousOccurrences !== undefined) {
                const previousValue = previousOccurrences.get(freqKey) ?? 0
                reportValue = Math.max(0, value - previousValue)
              }
            }

            const descriptor = descriptorFromState(state, attributes)
            const startTime = isDelta ? intervalStartTime : this.startTimeFor(descriptor.name, intervalStartTime)
            dataPoints.push({
              startTime,
              endTime: hrTimeNow,
              attributes: {
                ...attributes,
                key: freqKey
              },
              value: reportValue
            })
          }

          if (isDelta) {
            this.previousFrequencyState.set(metricKey, currentOccurrences)
          }

          if (metricDataByName.has(state.id)) {
            // oxlint-disable-next-line no-restricted-syntax
            metricDataByName.get(state.id)!.dataPoints.push(...dataPoints as any)
          } else {
            const descriptor = descriptorFromState(state, attributes)
            addMetricData({
              dataPointType: DataPointType.SUM,
              descriptor,
              aggregationTemporality,
              isMonotonic: true,
              dataPoints
            })
          }
          break
        }
        case "Summary": {
          // Quantiles are always computed fresh from the sliding window
          const dataPoints: Array<DataPoint<number>> = [{
            startTime: intervalStartTime,
            endTime: hrTimeNow,
            attributes: { ...attributes, quantile: "min" },
            value: state.state.min
          }]
          for (const [quantile, value] of state.state.quantiles) {
            dataPoints.push({
              startTime: intervalStartTime,
              endTime: hrTimeNow,
              attributes: { ...attributes, quantile: quantile.toString() },
              value: value ?? 0
            })
          }
          dataPoints.push({
            startTime: intervalStartTime,
            endTime: hrTimeNow,
            attributes: { ...attributes, quantile: "max" },
            value: state.state.max
          })

          let reportCount = state.state.count
          let reportSum = state.state.sum

          if (isDelta) {
            const previousState = this.previousSummaryState.get(metricKey)
            if (previousState !== undefined) {
              reportCount = state.state.count - previousState.count
              reportSum = state.state.sum - previousState.sum
            }
            this.previousSummaryState.set(metricKey, {
              count: state.state.count,
              sum: state.state.sum
            })
          }

          const countDataPoint: DataPoint<number> = {
            startTime: intervalStartTime,
            endTime: hrTimeNow,
            attributes,
            value: reportCount
          }
          const sumDataPoint: DataPoint<number> = {
            startTime: intervalStartTime,
            endTime: hrTimeNow,
            attributes,
            value: reportSum
          }

          if (metricDataByName.has(`${state.id}_quantiles`)) {
            // oxlint-disable-next-line no-restricted-syntax
            metricDataByName.get(`${state.id}_quantiles`)!.dataPoints.push(...dataPoints as any)
            metricDataByName.get(`${state.id}_count`)!.dataPoints.push(countDataPoint as any)
            metricDataByName.get(`${state.id}_sum`)!.dataPoints.push(sumDataPoint as any)
          } else {
            const descriptor = descriptorFromState(state, attributes)
            addMetricData({
              dataPointType: DataPointType.SUM,
              descriptor: {
                ...descriptor,
                name: `${descriptor.name}_quantiles`
              },
              aggregationTemporality,
              isMonotonic: false,
              dataPoints
            })
            addMetricData({
              dataPointType: DataPointType.SUM,
              descriptor: {
                name: `${state.id}_count`,
                description: state.description ?? "",
                unit: "1",
                type: InstrumentType.COUNTER,
                valueType: ValueType.INT,
                advice: {}
              },
              aggregationTemporality,
              isMonotonic: true,
              dataPoints: [countDataPoint]
            })
            addMetricData({
              dataPointType: DataPointType.SUM,
              descriptor: {
                name: `${state.id}_sum`,
                description: state.description ?? "",
                unit: "1",
                type: InstrumentType.COUNTER,
                valueType: ValueType.DOUBLE,
                advice: {}
              },
              aggregationTemporality,
              isMonotonic: true,
              dataPoints: [sumDataPoint]
            })
          }
          break
        }
      }
    }

    // Update the previous export time for delta calculations
    if (isDelta) {
      this.previousExportTimeNanos = hrTimeNow
    }

    return Promise.resolve({
      resourceMetrics: {
        resource: this.resource,
        scopeMetrics: [{
          scope: { name: sdkName },
          metrics: metricData
        }]
      },
      errors: []
    })
  }
}

/** Creates a unique key for a metric including its attributes */
const makeMetricKey = (id: string, attributes: Metric.Metric.AttributeSet | undefined): string => {
  if (attributes === undefined || Object.keys(attributes).length === 0) {
    return id
  }
  const sortedEntries = Object.entries(attributes).sort((a, b) => a[0].localeCompare(b[0]))
  return `${id}:${JSON.stringify(sortedEntries)}`
}

const currentHrTime = (): HrTime => {
  const now = Date.now()
  return [Math.floor(now / 1000), (now % 1000) * 1000000]
}

const descriptorFromState = (
  state: Metric.Metric.Snapshot,
  attributes: Record<string, string>
): InstrumentDescriptor => {
  const unit = attributes.unit ?? attributes.time_unit ?? "1"
  return {
    name: state.id,
    description: state.description ?? "",
    unit,
    type: instrumentTypeFromSnapshot(state),
    valueType: determineValueType(state),
    advice: {}
  }
}

const instrumentTypeFromSnapshot = (state: Metric.Metric.Snapshot): InstrumentType => {
  switch (state.type) {
    case "Histogram":
      return InstrumentType.HISTOGRAM
    case "Gauge":
      return InstrumentType.OBSERVABLE_GAUGE
    case "Frequency":
      return InstrumentType.COUNTER
    case "Counter":
      return state.state.incremental ? InstrumentType.COUNTER : InstrumentType.UP_DOWN_COUNTER
    case "Summary":
      return InstrumentType.COUNTER
  }
}

const determineValueType = (state: Metric.Metric.Snapshot): ValueType => {
  if (state.type === "Counter") {
    return typeof state.state.count === "bigint" ? ValueType.INT : ValueType.DOUBLE
  } else if (state.type === "Gauge") {
    return typeof state.state.value === "bigint" ? ValueType.INT : ValueType.DOUBLE
  }
  return ValueType.DOUBLE
}
