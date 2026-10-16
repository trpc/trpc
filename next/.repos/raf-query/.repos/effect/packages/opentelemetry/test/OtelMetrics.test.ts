import * as internal from "@effect/opentelemetry/internal/metrics"
import * as OtelMetrics from "@effect/opentelemetry/OtelMetrics"
import { assert, describe, it } from "@effect/vitest"
import { ValueType } from "@opentelemetry/api"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { MetricReader } from "@opentelemetry/sdk-metrics"
import * as Effect from "effect/Effect"
import * as Metric from "effect/Metric"

const findMetric = (metrics: any, name: string) =>
  metrics.resourceMetrics.scopeMetrics[0].metrics.find((_: any) => _.descriptor.name === name)

describe("Metrics", () => {
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
      class Reader extends MetricReader {
        protected onShutdown(): Promise<void> {
          return Promise.resolve()
        }
        protected onForceFlush(): Promise<void> {
          return Promise.resolve()
        }
      }

      const services = yield* Effect.context<never>()
      const producer = new internal.MetricProducerImpl(resourceFromAttributes({}), services, "delta")
      const first = new Reader()
      const second = new Reader()
      yield* OtelMetrics.registerProducer(producer, () => [first, second])
      yield* Metric.update(Metric.counter("requests", { incremental: true }), 1)

      const firstResult = yield* Effect.promise(() => first.collect())
      const secondResult = yield* Effect.promise(() => second.collect())
      const firstValue = (firstResult.resourceMetrics.scopeMetrics[0]!.metrics[0] as any).dataPoints[0].value
      const secondValue = (secondResult.resourceMetrics.scopeMetrics[0]!.metrics[0] as any).dataPoints[0].value
      assert.deepStrictEqual([firstValue, secondValue], [1, 1])
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())))
})
