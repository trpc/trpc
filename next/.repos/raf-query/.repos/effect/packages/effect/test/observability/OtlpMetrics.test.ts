import { assert, describe, it } from "@effect/vitest"
import { Array, Context, Deferred, Effect, Fiber, Layer, Metric, Predicate, Ref } from "effect"
import { HttpClient, type HttpClientError, HttpClientResponse } from "effect/http"
import { OtlpExporter, OtlpMetrics, OtlpSerialization } from "effect/observability"
import { TestClock } from "effect/testing"

describe("OtlpMetrics", () => {
  it.effect("retains delta checkpoints after a failed export", () =>
    Effect.gen(function*() {
      const bodies = yield* Ref.make<ReadonlyArray<OtlpExportRequest>>([])
      const attempts = yield* Ref.make(0)
      const client = HttpClient.makeWith(
        Effect.fnUntraced(function*(requestEffect) {
          const request = yield* requestEffect
          if (request.body._tag === "Uint8Array") {
            const body = JSON.parse(new TextDecoder().decode(request.body.body)) as OtlpExportRequest
            yield* Ref.update(bodies, Array.append(body))
          }
          const attempt = yield* Ref.updateAndGet(attempts, (n) => n + 1)
          return HttpClientResponse.fromWeb(request, new Response(null, { status: attempt === 1 ? 400 : 200 }))
        }),
        Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
      )
      const layer = OtlpMetrics.layer({
        url: "http://localhost:4318/v1/metrics",
        resource: { serviceName: "repro" },
        temporality: "delta",
        exportInterval: "1 hour"
      }).pipe(
        Layer.provide(OtlpSerialization.layerJson),
        Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, client))
      )
      yield* Effect.gen(function*() {
        yield* Metric.update(Metric.counter("repro_counter"), 5)
        const histogram = Metric.histogram("repro_histogram", { boundaries: [10, 50, 100] })
        yield* Metric.update(histogram, 25)
        yield* Metric.update(histogram, 75)
        const frequency = Metric.frequency("repro_frequency")
        yield* Metric.update(frequency, "a")
        yield* Metric.update(frequency, "a")
        yield* Metric.update(frequency, "b")
        const summary = Metric.summary("repro_summary", {
          maxAge: "1 minute",
          maxSize: 100,
          quantiles: [0.5]
        })
        yield* Metric.update(summary, 10)
        yield* Metric.update(summary, 20)
        yield* Metric.update(summary, 30)
        const flusher = yield* OtlpExporter.Flusher
        yield* flusher.flush
        yield* TestClock.adjust("60 seconds")
        yield* flusher.flush
      }).pipe(Effect.provide(layer), Effect.provideService(Metric.MetricRegistry, new Map()))
      const [first, second] = yield* Ref.get(bodies)
      assert.strictEqual(findMetric(first, "repro_counter")?.sum?.dataPoints[0].asDouble, 5)
      assert.strictEqual(findMetric(second, "repro_counter")?.sum?.dataPoints[0].asDouble, 5)
      assert.strictEqual(findMetric(first, "repro_histogram")?.histogram?.dataPoints[0].count, 2)
      assert.strictEqual(findMetric(second, "repro_histogram")?.histogram?.dataPoints[0].count, 2)
      assert.strictEqual(findMetric(first, "repro_histogram")?.histogram?.dataPoints[0].sum, 100)
      assert.strictEqual(findMetric(second, "repro_histogram")?.histogram?.dataPoints[0].sum, 100)
      assert.strictEqual(findFrequencyValue(first, "repro_frequency", "a"), 2)
      assert.strictEqual(findFrequencyValue(second, "repro_frequency", "a"), 2)
      assert.strictEqual(findFrequencyValue(first, "repro_frequency", "b"), 1)
      assert.strictEqual(findFrequencyValue(second, "repro_frequency", "b"), 1)
      assert.strictEqual(findMetric(first, "repro_summary_count")?.sum?.dataPoints[0].asInt, 3)
      assert.strictEqual(findMetric(second, "repro_summary_count")?.sum?.dataPoints[0].asInt, 3)
      assert.strictEqual(findMetric(first, "repro_summary_sum")?.sum?.dataPoints[0].asDouble, 60)
      assert.strictEqual(findMetric(second, "repro_summary_sum")?.sum?.dataPoints[0].asDouble, 60)
      assert.strictEqual(
        findMetric(second, "repro_counter")?.sum?.dataPoints[0].startTimeUnixNano,
        findMetric(first, "repro_counter")?.sum?.dataPoints[0].startTimeUnixNano
      )
    }))

  it.effect("does not regress delta checkpoints when exports complete out of order", () =>
    Effect.scoped(Effect.gen(function*() {
      const bodies = yield* Ref.make<ReadonlyArray<OtlpExportRequest>>([])
      const started = yield* Effect.forEach([0, 1], () => Deferred.make<void>())
      const releases = yield* Effect.forEach([0, 1], () => Deferred.make<void>())
      let requestIndex = 0
      const client = HttpClient.makeWith(
        Effect.fnUntraced(function*(requestEffect) {
          const request = yield* requestEffect
          if (request.body._tag === "Uint8Array") {
            const body = JSON.parse(new TextDecoder().decode(request.body.body)) as OtlpExportRequest
            yield* Ref.update(bodies, Array.append(body))
          }
          const index = requestIndex++
          if (index < 2) {
            yield* Deferred.succeed(started[index], undefined)
            yield* Deferred.await(releases[index])
          }
          return HttpClientResponse.fromWeb(request, new Response())
        }),
        Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
      )
      const layer = OtlpMetrics.layer({
        url: "http://localhost:4318/v1/metrics",
        resource: { serviceName: "repro" },
        temporality: "delta",
        exportInterval: "1 hour"
      }).pipe(
        Layer.provide(OtlpSerialization.layerJson),
        Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, client))
      )
      yield* Effect.gen(function*() {
        const counter = Metric.counter("concurrent_delta")
        const flusher = yield* OtlpExporter.Flusher
        yield* Metric.update(counter, 1)
        const first = yield* Effect.forkChild(flusher.flush)
        yield* Deferred.await(started[0])

        yield* TestClock.adjust("1 second")
        yield* Metric.update(counter, 1)
        const second = yield* Effect.forkChild(flusher.flush)
        yield* Deferred.await(started[1])

        yield* Deferred.succeed(releases[1], undefined)
        yield* Fiber.join(second)
        yield* Deferred.succeed(releases[0], undefined)
        yield* Fiber.join(first)

        yield* TestClock.adjust("1 second")
        yield* flusher.flush
      }).pipe(Effect.provide(layer), Effect.provideService(Metric.MetricRegistry, new Map()))

      const requests = yield* Ref.get(bodies)
      assert.strictEqual(findMetric(requests[2], "concurrent_delta")?.sum?.dataPoints[0].asDouble, 0)
    })))

  describe("cumulative temporality", () => {
    it.effect("reports counter totals across export intervals", () =>
      Effect.gen(function*() {
        const metricName = "cumulative_counter_test"
        const counter = Metric.counter(metricName, {
          description: "Test counter"
        })

        // First interval: increment by 5
        yield* Metric.update(counter, 5)
        yield* triggerExport

        // Second interval: increment by 3 more (total: 8)
        yield* Metric.update(counter, 3)
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        assert.isAtLeast(requests.length, 2)

        const firstMetric = findMetric(requests[0], metricName)
        assert.strictEqual(firstMetric?.sum?.dataPoints[0].asDouble, 5)

        // Second export should report cumulative 8
        const secondMetric = findMetric(requests[1], metricName)
        assert.strictEqual(secondMetric?.sum?.dataPoints[0].asDouble, 8)
      }).pipe(Effect.provide(TestLayerCumulative)))

    it.effect("reports histogram count and sum across export intervals", () =>
      Effect.gen(function*() {
        const metricName = "cumulative_histogram_test"

        const histogram = Metric.histogram(metricName, {
          description: "Test histogram",
          boundaries: [10, 50, 100]
        })

        // First interval: observe values 25, 75 (count=2, sum=100)
        yield* Metric.update(histogram, 25)
        yield* Metric.update(histogram, 75)
        yield* triggerExport

        // Second interval: observe value 30 (cumulative count=3, sum=130)
        yield* Metric.update(histogram, 30)
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        assert.isAtLeast(requests.length, 2)

        const firstMetric = findMetric(requests[0], metricName)
        assert.strictEqual(firstMetric?.histogram?.dataPoints[0].count, 2)
        assert.strictEqual(firstMetric?.histogram?.dataPoints[0].sum, 100)

        const secondMetric = findMetric(requests[1], metricName)
        assert.isDefined(secondMetric)
        assert.strictEqual(secondMetric?.histogram?.dataPoints[0].count, 3)
        assert.strictEqual(secondMetric?.histogram?.dataPoints[0].sum, 130)
      }).pipe(Effect.provide(TestLayerCumulative)))

    it.effect("reports frequency counts across export intervals", () =>
      Effect.gen(function*() {
        const metricName = "cumulative_frequency_test"
        const frequency = Metric.frequency(metricName, {
          description: "Test frequency"
        })

        // First export interval: "a" x 2, "b" x 1
        yield* Metric.update(frequency, "a")
        yield* Metric.update(frequency, "a")
        yield* Metric.update(frequency, "b")
        yield* triggerExport

        // Second export interval: "a" x 1, "b" x 2 more (cumulative: "a"=3, "b"=3)
        yield* Metric.update(frequency, "a")
        yield* Metric.update(frequency, "b")
        yield* Metric.update(frequency, "b")
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        assert.isAtLeast(requests.length, 2)

        const firstMetric = findMetric(requests[0], metricName)
        const firstDataPoints = firstMetric?.sum?.dataPoints
        const firstA = firstDataPoints?.find((dp) =>
          dp.attributes.some((attr) =>
            attr.key === "key" &&
            Predicate.hasProperty(attr.value, "stringValue") &&
            attr.value.stringValue === "a"
          )
        )
        const firstB = firstDataPoints?.find((dp) =>
          dp.attributes.some((attr) =>
            attr.key === "key" &&
            Predicate.hasProperty(attr.value, "stringValue") &&
            attr.value.stringValue === "b"
          )
        )
        assert.strictEqual(firstA?.asInt, 2)
        assert.strictEqual(firstB?.asInt, 1)

        // Second export should report cumulative values
        const secondMetric = findMetric(requests[1], metricName)
        assert.isDefined(secondMetric)
        const secondDataPoints = secondMetric?.sum?.dataPoints
        const secondA = secondDataPoints?.find((dp) =>
          dp.attributes.some((attr) =>
            attr.key === "key" &&
            Predicate.hasProperty(attr.value, "stringValue") &&
            attr.value.stringValue === "a"
          )
        )
        const secondB = secondDataPoints?.find((dp) =>
          dp.attributes.some((attr) =>
            attr.key === "key" &&
            Predicate.hasProperty(attr.value, "stringValue") &&
            attr.value.stringValue === "b"
          )
        )
        assert.strictEqual(secondA?.asInt, 3) // Cumulative: 2+1=3
        assert.strictEqual(secondB?.asInt, 3) // Cumulative: 1+2=3
      }).pipe(Effect.provide(TestLayerCumulative)))

    it.effect("reports summary count and sum across export intervals", () =>
      Effect.gen(function*() {
        const metricName = "cumulative_summary_test"
        const summary = Metric.summary(metricName, {
          description: "Test summary",
          maxAge: "1 minute",
          maxSize: 100,
          quantiles: [0.5, 0.9, 0.99]
        })

        // First interval: observe 10, 20, 30 (count=3, sum=60)
        yield* Metric.update(summary, 10)
        yield* Metric.update(summary, 20)
        yield* Metric.update(summary, 30)
        yield* triggerExport

        // Second interval: observe 40 (cumulative count=4, sum=100)
        yield* Metric.update(summary, 40)
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        assert.isAtLeast(requests.length, 2)

        // First export - check count and sum metrics
        const firstCount = findMetric(requests[0], `${metricName}_count`)
        assert.strictEqual(firstCount?.sum?.dataPoints[0].asInt, 3)

        const firstSum = findMetric(requests[0], `${metricName}_sum`)
        assert.strictEqual(firstSum?.sum?.dataPoints[0].asDouble, 60)

        // Second export should report cumulative values
        const secondCount = findMetric(requests[1], `${metricName}_count`)
        assert.strictEqual(secondCount?.sum?.dataPoints[0].asInt, 4)

        const secondSum = findMetric(requests[1], `${metricName}_sum`)
        assert.strictEqual(secondSum?.sum?.dataPoints[0].asDouble, 100)
      }).pipe(Effect.provide(TestLayerCumulative)))
  })

  describe("delta temporality", () => {
    it.effect("reports counter deltas across export intervals", () =>
      Effect.gen(function*() {
        const metricName = "delta_counter_test"
        const counter = Metric.counter(metricName, {
          description: "Test counter"
        })

        // First export interval - increment the counter by 5
        yield* Metric.update(counter, 5)
        yield* triggerExport

        // Second export interval - increment the counter by 3 more (total: 8)
        yield* Metric.update(counter, 3)
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        assert.isAtLeast(requests.length, 2)

        const firstMetric = findMetric(requests[0], metricName)
        assert.strictEqual(firstMetric?.sum?.dataPoints[0].asDouble, 5)

        const secondMetric = findMetric(requests[1], metricName)
        assert.strictEqual(secondMetric?.sum?.dataPoints[0].asDouble, 3)
      }).pipe(Effect.provide(TestLayerDelta)))

    it.effect("reports histogram count and sum deltas across export intervals", () =>
      Effect.gen(function*() {
        const metricName = "delta_histogram_test"
        const histogram = Metric.histogram(metricName, {
          description: "Test histogram",
          boundaries: [10, 50, 100]
        })

        // First export interval: observe values 25, 75 (count=2, sum=100)
        yield* Metric.update(histogram, 25)
        yield* Metric.update(histogram, 75)
        yield* triggerExport

        // Second export interval: observe value 30 (delta count=1, delta sum=30)
        yield* Metric.update(histogram, 30)
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        assert.isAtLeast(requests.length, 2)

        const firstMetric = findMetric(requests[0], metricName)
        assert.strictEqual(firstMetric?.histogram?.dataPoints[0].count, 2)
        assert.strictEqual(firstMetric!.histogram!.dataPoints[0].sum, 100)

        const secondMetric = findMetric(requests[1], metricName)
        assert.strictEqual(secondMetric?.histogram?.dataPoints[0].count, 1)
        assert.strictEqual(secondMetric?.histogram?.dataPoints[0].sum, 30)
      }).pipe(Effect.provide(TestLayerDelta)))

    it.effect("reports frequency count deltas across export intervals", () =>
      Effect.gen(function*() {
        const metricName = "delta_frequency_test"
        const frequency = Metric.frequency(metricName, {
          description: "Test frequency"
        })

        // First export interval: "a" x 2, "b" x 1
        yield* Metric.update(frequency, "a")
        yield* Metric.update(frequency, "a")
        yield* Metric.update(frequency, "b")
        yield* triggerExport

        // Second export interval: "a" x 1, "b" x 2 more
        yield* Metric.update(frequency, "a")
        yield* Metric.update(frequency, "b")
        yield* Metric.update(frequency, "b")
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        assert.isAtLeast(requests.length, 2)

        const firstMetric = findMetric(requests[0], metricName)
        const firstDataPoints = firstMetric?.sum?.dataPoints
        const firstA = firstDataPoints?.find((dp) =>
          dp.attributes.some((attr) =>
            attr.key === "key" &&
            Predicate.hasProperty(attr.value, "stringValue") &&
            attr.value.stringValue === "a"
          )
        )
        const firstB = firstDataPoints?.find((dp) =>
          dp.attributes.some((attr) =>
            attr.key === "key" &&
            Predicate.hasProperty(attr.value, "stringValue") &&
            attr.value.stringValue === "b"
          )
        )
        assert.strictEqual(firstA?.asInt, 2)
        assert.strictEqual(firstB?.asInt, 1)

        const secondMetric = findMetric(requests[1], metricName)
        assert.isDefined(secondMetric)
        const secondDataPoints = secondMetric?.sum?.dataPoints
        const secondA = secondDataPoints?.find((dp) =>
          dp.attributes.some((attr) =>
            attr.key === "key" &&
            Predicate.hasProperty(attr.value, "stringValue") &&
            attr.value.stringValue === "a"
          )
        )
        const secondB = secondDataPoints?.find((dp) =>
          dp.attributes.some((attr) =>
            attr.key === "key" &&
            Predicate.hasProperty(attr.value, "stringValue") &&
            attr.value.stringValue === "b"
          )
        )
        assert.strictEqual(secondA?.asInt, 1) // Delta: 3-2=1
        assert.strictEqual(secondB?.asInt, 2) // Delta: 3-1=2
      }).pipe(Effect.provide(TestLayerDelta)))

    it.effect("reports summary count and sum deltas across export intervals", () =>
      Effect.gen(function*() {
        const metricName = "delta_summary_test"
        const summary = Metric.summary(metricName, {
          description: "Test summary",
          maxAge: "1 minute",
          maxSize: 100,
          quantiles: [0.5, 0.9, 0.99]
        })

        // First interval: observe 10, 20, 30 (count=3, sum=60)
        yield* Metric.update(summary, 10)
        yield* Metric.update(summary, 20)
        yield* Metric.update(summary, 30)
        yield* triggerExport

        // Second interval: observe 40 (delta count=1, delta sum=40)
        yield* Metric.update(summary, 40)
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        assert.isAtLeast(requests.length, 2)

        // First export
        const firstCount = findMetric(requests[0], `${metricName}_count`)
        assert.strictEqual(firstCount?.sum?.dataPoints[0].asInt, 3)

        const firstSum = findMetric(requests[0], `${metricName}_sum`)
        assert.strictEqual(firstSum?.sum?.dataPoints[0].asDouble, 60)

        // Second export should report delta values
        const secondCount = findMetric(requests[1], `${metricName}_count`)
        assert.strictEqual(secondCount?.sum?.dataPoints[0].asInt, 1) // Delta: 4-3=1

        const secondSum = findMetric(requests[1], `${metricName}_sum`)
        assert.strictEqual(secondSum?.sum?.dataPoints[0].asDouble, 40) // Delta: 100-60=40
      }).pipe(Effect.provide(TestLayerDelta)))
  })

  describe("Summary", () => {
    it.effect("exports quantile metrics", () =>
      Effect.gen(function*() {
        const metricName = "summary_quantiles_test"
        const summary = Metric.summary(metricName, {
          description: "Test summary",
          maxAge: "1 minute",
          maxSize: 100,
          quantiles: [0.5, 0.9]
        })

        yield* Metric.update(summary, 10)
        yield* Metric.update(summary, 20)
        yield* Metric.update(summary, 30)
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        assert.isAtLeast(requests.length, 1)

        // Check that quantiles metric exists
        const quantilesMetric = findMetric(requests[0], `${metricName}_quantiles`)
        assert.isDefined(quantilesMetric)
        assert.isDefined(quantilesMetric?.sum)

        // Should have data points for min, max, and each quantile (0.5, 0.9)
        const dataPoints = quantilesMetric?.sum?.dataPoints ?? []
        assert.isAtLeast(dataPoints.length, 4) // min, 0.5, 0.9, max

        // Find min and max quantile data points
        const minPoint = dataPoints.find((dp) =>
          dp.attributes.some((attr) =>
            attr.key === "quantile" &&
            Predicate.hasProperty(attr.value, "stringValue") &&
            attr.value.stringValue === "min"
          )
        )
        const maxPoint = dataPoints.find((dp) =>
          dp.attributes.some((attr) =>
            attr.key === "quantile" &&
            Predicate.hasProperty(attr.value, "stringValue") &&
            attr.value.stringValue === "max"
          )
        )
        assert.strictEqual(minPoint?.asDouble, 10)
        assert.strictEqual(maxPoint?.asDouble, 30)
      }).pipe(Effect.provide(TestLayerCumulative)))
  })

  describe("Gauge (no temporality)", () => {
    it.effect.each([
      ["cumulative", TestLayerCumulative] as const,
      ["delta", TestLayerDelta] as const
    ])("%s temporality reports current value", ([_, layer]) =>
      Effect.gen(function*() {
        const metricName = "delta_gauge_test"

        const gauge = Metric.gauge(metricName, {
          description: "Test gauge"
        })

        yield* Metric.update(gauge, 100)
        yield* triggerExport

        yield* Metric.update(gauge, 50)
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        assert.isAtLeast(requests.length, 2)

        // First export should report current value 100
        const firstMetric = findMetric(requests[0], metricName)
        assert.strictEqual(firstMetric?.gauge?.dataPoints[0].asDouble, 100)

        // Second export should report current value 50 (not delta -50)
        const secondMetric = findMetric(requests[1], metricName)
        assert.strictEqual(secondMetric?.gauge?.dataPoints[0].asDouble, 50)
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(Metric.MetricRegistry, new Map())
      ))
  })
})

interface OtlpExportRequest {
  readonly resourceMetrics: Array<{
    readonly resource?: unknown
    readonly scopeMetrics: Array<{
      readonly scope?: unknown | undefined
      readonly metrics: Array<OtlpMetric>
    }>
  }>
}

interface OtlpMetric {
  readonly name: string
  readonly description?: string | undefined
  readonly unit?: string | undefined
  readonly sum?: {
    readonly dataPoints: Array<OtlpNumberDataPoint>
    readonly aggregationTemporality: number
    readonly isMonotonic: boolean
  } | undefined
  readonly gauge?: {
    readonly dataPoints: Array<OtlpNumberDataPoint>
  } | undefined
  readonly histogram?: {
    readonly dataPoints: Array<OtlpHistogramDataPoint>
    readonly aggregationTemporality: number
  } | undefined
}

interface OtlpNumberDataPoint {
  readonly attributes: Array<{ key: string; value: unknown }>
  readonly startTimeUnixNano?: string | undefined
  readonly timeUnixNano?: string | undefined
  readonly asDouble?: number | undefined
  readonly asInt?: number | undefined
}

interface OtlpHistogramDataPoint {
  readonly attributes?: Array<{ key: string; value: unknown }>
  readonly startTimeUnixNano?: string | undefined
  readonly timeUnixNano?: string | undefined
  readonly count?: number | undefined
  readonly sum?: number | undefined
  readonly bucketCounts?: Array<number> | undefined
  readonly explicitBounds?: Array<number> | undefined
  readonly min?: number | undefined
  readonly max?: number | undefined
}

class MockHttpClient extends Context.Service<MockHttpClient, {
  readonly requests: Effect.Effect<ReadonlyArray<OtlpExportRequest>>
}>()("MockHttpClient") {
  static requests = Effect.service(MockHttpClient).pipe(
    Effect.flatMap((client) => client.requests)
  )
}

const makeHttpClient = Effect.gen(function*() {
  const capturedRequests = yield* Ref.make<ReadonlyArray<OtlpExportRequest>>([])

  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      const body = (request.body._tag === "Uint8Array"
        ? JSON.parse(new TextDecoder().decode(request.body.body))
        : {}) as OtlpExportRequest
      yield* Ref.update(capturedRequests, Array.append(body))
      return HttpClientResponse.fromWeb(request, new Response())
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )

  return Context.make(HttpClient.HttpClient, httpClient).pipe(
    Context.add(MockHttpClient, MockHttpClient.of({ requests: Ref.get(capturedRequests) }))
  )
})

const HttpClientLayer = Layer.effectContext(makeHttpClient)

const OtlpCumulativeMetricsLayer = OtlpMetrics.layer({
  url: "http://localhost:4318/v1/metrics",
  resource: { serviceName: "test-service" },
  exportInterval: "10 seconds"
})

const OtlpDeltaMetricsLayer = OtlpMetrics.layer({
  url: "http://localhost:4318/v1/metrics",
  resource: { serviceName: "test-service" },
  temporality: "delta",
  exportInterval: "10 seconds"
})

const TestLayerCumulative = OtlpCumulativeMetricsLayer.pipe(
  Layer.provideMerge(HttpClientLayer),
  Layer.provide(OtlpSerialization.layerJson)
)

const TestLayerDelta = OtlpDeltaMetricsLayer.pipe(
  Layer.provideMerge(HttpClientLayer),
  Layer.provide(OtlpSerialization.layerJson)
)

const triggerExport = TestClock.adjust("10 seconds")

const findMetric = (request: OtlpExportRequest, name: string): OtlpMetric | undefined => {
  for (const resourceMetrics of request.resourceMetrics) {
    for (const scopeMetrics of resourceMetrics.scopeMetrics) {
      for (const metric of scopeMetrics.metrics) {
        if (metric.name === name) {
          return metric
        }
      }
    }
  }
  return undefined
}

const findFrequencyValue = (request: OtlpExportRequest, name: string, key: string): number | undefined =>
  findMetric(request, name)?.sum?.dataPoints.find((dataPoint) =>
    dataPoint.attributes.some((attribute) =>
      attribute.key === "key" &&
      Predicate.hasProperty(attribute.value, "stringValue") &&
      attribute.value.stringValue === key
    )
  )?.asInt
