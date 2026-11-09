import * as internal from "@effect/opentelemetry/internal/metrics"
import * as OtelMetrics from "@effect/opentelemetry/OtelMetrics"
import { assert, describe, it } from "@effect/vitest"
import { ValueType } from "@opentelemetry/api"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { MetricReader } from "@opentelemetry/sdk-metrics"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Metric from "effect/Metric"

const findMetric = (metrics: any, name: string) =>
  metrics.resourceMetrics.scopeMetrics[0].metrics.find((_: any) => _.descriptor.name === name)

class ShutdownTrackingReader extends MetricReader {
  shutdowns = 0

  constructor(private readonly rejectShutdown = false) {
    super()
  }

  protected onShutdown(): Promise<void> {
    this.shutdowns++
    return this.rejectShutdown ? Promise.reject(new Error("shutdown failed")) : Promise.resolve()
  }

  protected onForceFlush(): Promise<void> {
    return Promise.resolve()
  }
}

describe("Metrics", () => {
  it.effect.each([false, true])(
    "rolls back bound readers and preserves the binding defect (shutdown rejects: %s)",
    (rejectShutdown) =>
      Effect.gen(function*() {
        const services = yield* Effect.context<never>()
        const producer = new internal.MetricProducerImpl(resourceFromAttributes({}), services)
        const fresh = new ShutdownTrackingReader(rejectShutdown)
        const alreadyBound = new ShutdownTrackingReader()
        alreadyBound.setMetricProducer(producer)

        const exit = yield* OtelMetrics.registerProducer(producer, () => [fresh, alreadyBound]).pipe(
          Effect.scoped,
          Effect.exit
        )

        assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause))
        assert.strictEqual(alreadyBound.shutdowns, 0)
        assert.strictEqual(fresh.shutdowns, 1)
        if (Exit.isFailure(exit)) {
          assert.include(Cause.pretty(exit.cause), "MetricReader can not be bound to a MeterProvider again.")
        }
      })
  )

  it.effect("gauge", () =>
    Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const resource = resourceFromAttributes({
        name: "test",
        version: "1.0.0"
      })
      const producer = new internal.MetricProducerImpl(resource, services)
      const gauge = Metric.gauge("rps")

      yield* Metric.withAttributes(gauge, {
        key: "value",
        unit: "requests"
      }).pipe(Metric.update(10))
      yield* Metric.withAttributes(gauge, {
        key: "value"
      }).pipe(Metric.update(10))
      yield* Metric.withAttributes(gauge, {
        key: "value"
      }).pipe(Metric.update(20))

      const results = yield* Effect.promise(() => producer.collect())
      const object = JSON.parse(JSON.stringify(results))
      assert.deepEqual(object.resourceMetrics.resource._rawAttributes, [
        ["name", "test"],
        ["version", "1.0.0"]
      ])
      assert.equal(object.resourceMetrics.scopeMetrics.length, 1)
      const metric = findMetric(object, "rps")
      assert.deepStrictEqual(metric, {
        "dataPointType": 2,
        "descriptor": {
          "advice": {},
          "name": "rps",
          "description": "",
          "unit": "requests",
          "type": "OBSERVABLE_GAUGE",
          "valueType": ValueType.DOUBLE
        },
        "aggregationTemporality": 1,
        "dataPoints": [
          {
            "startTime": metric.dataPoints[0].startTime,
            "endTime": metric.dataPoints[0].endTime,
            "attributes": {
              "unit": "requests",
              "key": "value"
            },
            "value": 10
          },
          {
            "startTime": metric.dataPoints[0].startTime,
            "endTime": metric.dataPoints[0].endTime,
            "attributes": {
              "key": "value"
            },
            "value": 20
          }
        ]
      })
    }))

  it.effect("gauge bigint", () =>
    Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const producer = new internal.MetricProducerImpl(
        resourceFromAttributes({
          name: "test",
          version: "1.0.0"
        }),
        services
      )
      const gauge = Metric.gauge("rps-bigint", { bigint: true })

      yield* Metric.withAttributes(gauge, {
        key: "value",
        unit: "requests"
      }).pipe(Metric.update(10n))
      yield* Metric.withAttributes(gauge, {
        key: "value"
      }).pipe(Metric.update(10n))
      yield* Metric.withAttributes(gauge, {
        key: "value"
      }).pipe(Metric.update(20n))

      const results = yield* Effect.promise(() => producer.collect())
      const object = JSON.parse(JSON.stringify(results))
      assert.deepEqual(object.resourceMetrics.resource._rawAttributes, [
        ["name", "test"],
        ["version", "1.0.0"]
      ])
      assert.equal(object.resourceMetrics.scopeMetrics.length, 1)
      const metric = findMetric(object, "rps-bigint")
      assert.deepEqual(metric, {
        "dataPointType": 2,
        "descriptor": {
          "advice": {},
          "name": "rps-bigint",
          "description": "",
          "unit": "requests",
          "type": "OBSERVABLE_GAUGE",
          "valueType": ValueType.INT
        },
        "aggregationTemporality": 1,
        "dataPoints": [
          {
            "startTime": metric.dataPoints[0].startTime,
            "endTime": metric.dataPoints[0].endTime,
            "attributes": {
              "unit": "requests",
              "key": "value"
            },
            "value": 10
          },
          {
            "startTime": metric.dataPoints[0].startTime,
            "endTime": metric.dataPoints[0].endTime,
            "attributes": {
              "key": "value"
            },
            "value": 20
          }
        ]
      })
    }))

  it.effect("counter", () =>
    Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const producer = new internal.MetricProducerImpl(
        resourceFromAttributes({
          name: "test",
          version: "1.0.0"
        }),
        services
      )
      const counter = Metric.counter("counter", { description: "Example" })

      yield* Metric.withAttributes(counter, {
        key: "value",
        unit: "requests"
      }).pipe(Metric.update(1))
      yield* Metric.withAttributes(counter, {
        key: "value"
      }).pipe(Metric.update(1))
      yield* Metric.withAttributes(counter, {
        key: "value"
      }).pipe(Metric.update(1))

      const results = yield* Effect.promise(() => producer.collect())
      const object = JSON.parse(JSON.stringify(results))
      assert.deepEqual(object.resourceMetrics.resource._rawAttributes, [
        ["name", "test"],
        ["version", "1.0.0"]
      ])
      assert.equal(object.resourceMetrics.scopeMetrics.length, 1)
      const metric = findMetric(object, "counter")
      assert.deepEqual(metric, {
        "dataPointType": 3,
        "descriptor": {
          "advice": {},
          "name": "counter",
          "description": "Example",
          "unit": "requests",
          "type": "UP_DOWN_COUNTER",
          "valueType": ValueType.DOUBLE
        },
        "isMonotonic": false,
        "aggregationTemporality": 1,
        "dataPoints": [
          {
            "startTime": metric.dataPoints[0].startTime,
            "endTime": metric.dataPoints[0].endTime,
            "attributes": {
              "unit": "requests",
              "key": "value"
            },
            "value": 1
          },
          {
            "startTime": metric.dataPoints[0].startTime,
            "endTime": metric.dataPoints[0].endTime,
            "attributes": {
              "key": "value"
            },
            "value": 2
          }
        ]
      })
    }))

  it.effect("counter-inc", () =>
    Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const producer = new internal.MetricProducerImpl(
        resourceFromAttributes({
          name: "test",
          version: "1.0.0"
        }),
        services
      )
      const counter = Metric.counter("counter-inc", {
        description: "Example",
        incremental: true
      })

      yield* Metric.withAttributes(counter, {
        key: "value",
        unit: "requests"
      }).pipe(Metric.update(1))
      yield* Metric.withAttributes(counter, {
        key: "value"
      }).pipe(Metric.update(1))
      yield* Metric.withAttributes(counter, {
        key: "value"
      }).pipe(Metric.update(1))

      const results = yield* Effect.promise(() => producer.collect())
      const object = JSON.parse(JSON.stringify(results))
      assert.deepEqual(object.resourceMetrics.resource._rawAttributes, [
        ["name", "test"],
        ["version", "1.0.0"]
      ])
      assert.equal(object.resourceMetrics.scopeMetrics.length, 1)
      const metric = findMetric(object, "counter-inc")
      assert.deepEqual(metric, {
        "dataPointType": 3,
        "descriptor": {
          "advice": {},
          "name": "counter-inc",
          "description": "Example",
          "unit": "requests",
          "type": "COUNTER",
          "valueType": ValueType.DOUBLE
        },
        "isMonotonic": true,
        "aggregationTemporality": 1,
        "dataPoints": [
          {
            "startTime": metric.dataPoints[0].startTime,
            "endTime": metric.dataPoints[0].endTime,
            "attributes": {
              "unit": "requests",
              "key": "value"
            },
            "value": 1
          },
          {
            "startTime": metric.dataPoints[0].startTime,
            "endTime": metric.dataPoints[0].endTime,
            "attributes": {
              "key": "value"
            },
            "value": 2
          }
        ]
      })
    }))

  it.effect("counter-bigint", () =>
    Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const producer = new internal.MetricProducerImpl(
        resourceFromAttributes({
          name: "test",
          version: "1.0.0"
        }),
        services
      )
      const counter = Metric.counter("counter-bigint", {
        description: "Example",
        incremental: true,
        bigint: true
      })

      yield* Metric.withAttributes(counter, {
        key: "value",
        unit: "requests"
      }).pipe(Metric.update(1n))
      yield* Metric.withAttributes(counter, {
        key: "value"
      }).pipe(Metric.update(1n))
      yield* Metric.withAttributes(counter, {
        key: "value"
      }).pipe(Metric.update(1n))

      const results = yield* Effect.promise(() => producer.collect())
      const object = JSON.parse(JSON.stringify(results))
      assert.deepEqual(object.resourceMetrics.resource._rawAttributes, [
        ["name", "test"],
        ["version", "1.0.0"]
      ])
      assert.equal(object.resourceMetrics.scopeMetrics.length, 1)
      const metric = findMetric(object, "counter-bigint")
      assert.deepEqual(metric, {
        "dataPointType": 3,
        "descriptor": {
          "advice": {},
          "name": "counter-bigint",
          "description": "Example",
          "unit": "requests",
          "type": "COUNTER",
          "valueType": ValueType.INT
        },
        "isMonotonic": true,
        "aggregationTemporality": 1,
        "dataPoints": [
          {
            "startTime": metric.dataPoints[0].startTime,
            "endTime": metric.dataPoints[0].endTime,
            "attributes": {
              "unit": "requests",
              "key": "value"
            },
            "value": 1
          },
          {
            "startTime": metric.dataPoints[0].startTime,
            "endTime": metric.dataPoints[0].endTime,
            "attributes": {
              "key": "value"
            },
            "value": 2
          }
        ]
      })
    }))

  it.effect("reports the same delta to every registered reader", () =>
    Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const producer = new internal.MetricProducerImpl(resourceFromAttributes({}), services, "delta")
      const first = new ShutdownTrackingReader()
      const second = new ShutdownTrackingReader()
      yield* OtelMetrics.registerProducer(producer, () => [first, second])
      yield* Metric.update(Metric.counter("requests", { incremental: true }), 1)

      const firstResult = yield* Effect.promise(() => first.collect())
      const secondResult = yield* Effect.promise(() => second.collect())
      const firstValue = (firstResult.resourceMetrics.scopeMetrics[0]!.metrics[0] as any).dataPoints[0].value
      const secondValue = (secondResult.resourceMetrics.scopeMetrics[0]!.metrics[0] as any).dataPoints[0].value
      assert.deepStrictEqual([firstValue, secondValue], [1, 1])
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())))

  it.effect("reports a removed and recreated series from zero with delta temporality", () =>
    Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const producer = new internal.MetricProducerImpl(resourceFromAttributes({}), services, "delta")
      const collect = Effect.promise(() => producer.collect())
      const counter = Metric.counter("requests")
      const histogram = Metric.histogram("latency", { boundaries: [10] })

      yield* Metric.update(counter, 5)
      yield* Metric.update(histogram, 5)
      yield* collect
      yield* Metric.remove(counter)
      yield* Metric.remove(histogram)
      yield* collect
      yield* Metric.update(counter, 7)
      yield* Metric.update(histogram, 7)
      const result = yield* collect

      assert.strictEqual(findMetric(result, "requests").dataPoints[0].value, 7)
      const histogramValue = findMetric(result, "latency").dataPoints[0].value
      assert.deepStrictEqual([histogramValue.count, histogramValue.sum], [1, 7])
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())))

  it.effect.each(["delta", "cumulative"] as const)(
    "histogram extrema with %s temporality",
    (temporality) =>
      Effect.gen(function*() {
        const services = yield* Effect.context<never>()
        const producer = new internal.MetricProducerImpl(resourceFromAttributes({}), services, temporality)
        const histogram = Metric.histogram("latency", {
          boundaries: Metric.linearBoundaries({ start: 0, width: 50, count: 3 })
        })

        yield* Metric.update(histogram, 1)
        yield* Metric.update(histogram, 100)
        const first = findMetric(yield* Effect.promise(() => producer.collect()), "latency").dataPoints[0].value
        assert.deepStrictEqual(first, {
          buckets: { boundaries: [50], counts: [1, 1] },
          count: 2,
          sum: 101,
          min: 1,
          max: 100
        })

        yield* Metric.update(histogram, 50)
        yield* Metric.update(histogram, 60)
        const second = findMetric(yield* Effect.promise(() => producer.collect()), "latency").dataPoints[0].value
        assert.deepStrictEqual(
          second,
          temporality === "delta"
            ? {
              buckets: { boundaries: [50], counts: [1, 1] },
              count: 2,
              sum: 110
            }
            : {
              buckets: { boundaries: [50], counts: [2, 2] },
              count: 4,
              sum: 211,
              min: 1,
              max: 100
            }
        )
      }).pipe(Effect.provideService(Metric.MetricRegistry, new Map()))
  )

  it.effect("histogram buckets above the last custom boundary", () =>
    Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const producer = new internal.MetricProducerImpl(resourceFromAttributes({}), services)
      const histogram = Metric.histogram("latency", { boundaries: [10, 50, 100] })

      yield* Metric.update(histogram, 25)
      yield* Metric.update(histogram, 75)
      yield* Metric.update(histogram, 500)
      const value = findMetric(yield* Effect.promise(() => producer.collect()), "latency").dataPoints[0].value
      assert.deepStrictEqual(value.buckets, { boundaries: [10, 50, 100], counts: [0, 1, 1, 1] })
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())))
})
