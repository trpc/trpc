import { assert, describe, it } from "@effect/vitest"
import { Array, Context, Deferred, Duration, Effect, Fiber, Layer, Metric, Predicate, Ref } from "effect"
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
        assert.strictEqual(firstMetric?.histogram?.dataPoints[0].min, 25)
        assert.strictEqual(firstMetric?.histogram?.dataPoints[0].max, 75)

        const secondMetric = findMetric(requests[1], metricName)
        assert.isDefined(secondMetric)
        assert.strictEqual(secondMetric?.histogram?.dataPoints[0].count, 3)
        assert.strictEqual(secondMetric?.histogram?.dataPoints[0].sum, 130)
        assert.strictEqual(secondMetric?.histogram?.dataPoints[0].min, 25)
        assert.strictEqual(secondMetric?.histogram?.dataPoints[0].max, 75)
      }).pipe(Effect.provide(TestLayerCumulative)))

    it.effect("reports histogram buckets above the last boundary", () =>
      Effect.gen(function*() {
        const custom = Metric.histogram("custom_boundaries_histogram", { boundaries: [10, 50, 100] })
        const linear = Metric.histogram("linear_boundaries_histogram", {
          boundaries: Metric.linearBoundaries({ start: 0, width: 50, count: 3 })
        })

        for (const value of [25, 75, 500]) {
          yield* Metric.update(custom, value)
          yield* Metric.update(linear, value)
        }
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        const customPoint = findMetric(requests[0], "custom_boundaries_histogram")?.histogram?.dataPoints[0]
        assert.deepStrictEqual(customPoint?.explicitBounds, [10, 50, 100])
        assert.deepStrictEqual(customPoint?.bucketCounts, [0, 1, 1, 1])

        const linearPoint = findMetric(requests[0], "linear_boundaries_histogram")?.histogram?.dataPoints[0]
        assert.deepStrictEqual(linearPoint?.explicitBounds, [50])
        assert.deepStrictEqual(linearPoint?.bucketCounts, [1, 2])
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

    it.effect("reports a removed and recreated series from zero", () =>
      Effect.gen(function*() {
        const counter = Metric.counter("delta_removed_counter_test")
        const histogram = Metric.histogram("delta_removed_histogram_test", { boundaries: [10] })

        yield* Metric.update(counter, 5)
        yield* Metric.update(histogram, 5)
        yield* triggerExport
        yield* Metric.remove(counter)
        yield* Metric.remove(histogram)
        yield* triggerExport
        yield* Metric.update(counter, 7)
        yield* Metric.update(histogram, 7)
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        const last = requests[requests.length - 1]
        assert.strictEqual(findMetric(last, "delta_removed_counter_test")?.sum?.dataPoints[0].asDouble, 7)
        const histogramPoint = findMetric(last, "delta_removed_histogram_test")?.histogram?.dataPoints[0]
        assert.deepStrictEqual([histogramPoint?.count, histogramPoint?.sum], [1, 7])
      }).pipe(Effect.provide(TestLayerDelta), Effect.provideService(Metric.MetricRegistry, new Map())))

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
        assert.strictEqual(firstMetric?.histogram?.dataPoints[0].min, 25)
        assert.strictEqual(firstMetric?.histogram?.dataPoints[0].max, 75)

        const secondMetric = findMetric(requests[1], metricName)
        assert.strictEqual(secondMetric?.histogram?.dataPoints[0].count, 1)
        assert.strictEqual(secondMetric?.histogram?.dataPoints[0].sum, 30)
        assert.notProperty(secondMetric!.histogram!.dataPoints[0], "min")
        assert.notProperty(secondMetric!.histogram!.dataPoints[0], "max")
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
  })

  describe("Summary", () => {
    it.effect("exports a cumulative Summary with window quantiles", () =>
      Effect.gen(function*() {
        const summary = Metric.summary("summary_test", { maxAge: "15 seconds", maxSize: 100, quantiles: [0.5] })
        yield* Metric.update(summary, 10)
        yield* Metric.update(summary, 20)
        yield* Metric.update(summary, 30)
        yield* triggerExport
        yield* Metric.update(summary, 40)
        yield* triggerExport
        // Every observation is now older than maxAge
        yield* triggerExport

        const requests = yield* MockHttpClient.requests
        const metrics = requests[0].resourceMetrics.flatMap((r) => r.scopeMetrics.flatMap((s) => s.metrics))
        assert.deepStrictEqual(metrics.map((metric) => metric.name), ["summary_test"])
        const points = requests.map((request) => findMetric(request, "summary_test")?.summary?.dataPoints[0])
        assert.deepStrictEqual(
          points.map((point) => ({ count: point?.count, sum: point?.sum, quantileValues: point?.quantileValues })),
          [
            { count: 3, sum: 60, quantileValues: [{ quantile: 0.5, value: 20 }] },
            { count: 4, sum: 100, quantileValues: [{ quantile: 0.5, value: 40 }] },
            { count: 4, sum: 100, quantileValues: [] }
          ]
        )
        assert.strictEqual(points[2]?.startTimeUnixNano, points[0]?.startTimeUnixNano)
      }).pipe(Effect.provide(TestLayerDelta), Effect.provideService(Metric.MetricRegistry, new Map())))
  })

  it.effect("maps unit attributes to UCUM", () =>
    Effect.gen(function*() {
      yield* Metric.update(Metric.timer("unit_timer_test", { boundaries: [10, 100] }), Duration.millis(5))
      yield* Metric.update(Metric.gauge("unit_custom_test", { attributes: { unit: "{request}" } }), 1)
      yield* triggerExport

      const [request] = yield* MockHttpClient.requests
      assert.strictEqual(findMetric(request, "unit_timer_test")?.unit, "ms")
      assert.strictEqual(findMetric(request, "unit_custom_test")?.unit, "{request}")
    }).pipe(Effect.provide(TestLayerCumulative), Effect.provideService(Metric.MetricRegistry, new Map())))

  it.effect("keeps bigint precision beyond 2^53", () =>
    Effect.gen(function*() {
      const counter = Metric.counter("bigint_counter_test", { bigint: true })
      yield* Metric.update(counter, 9007199254740993n)
      yield* Metric.update(Metric.gauge("bigint_gauge_test", { bigint: true }), -9007199254740993n)
      yield* triggerExport
      yield* Metric.update(counter, 9007199254740993n)
      yield* triggerExport

      const [first, second] = yield* MockHttpClient.requests
      assert.strictEqual(findMetric(first, "bigint_counter_test")?.sum?.dataPoints[0].asInt, "9007199254740993")
      assert.strictEqual(findMetric(second, "bigint_counter_test")?.sum?.dataPoints[0].asInt, "9007199254740993")
      assert.strictEqual(findMetric(first, "bigint_gauge_test")?.gauge?.dataPoints[0].asInt, "-9007199254740993")
    }).pipe(Effect.provide(TestLayerDelta), Effect.provideService(Metric.MetricRegistry, new Map())))

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
  readonly summary?: {
    readonly dataPoints: Array<OtlpSummaryDataPoint>
  } | undefined
}

interface OtlpSummaryDataPoint {
  readonly startTimeUnixNano?: string | undefined
  readonly count?: number | undefined
  readonly sum?: number | undefined
  readonly quantileValues?: Array<{ quantile: number; value: number }> | undefined
}

interface OtlpNumberDataPoint {
  readonly attributes: Array<{ key: string; value: unknown }>
  readonly startTimeUnixNano?: string | undefined
  readonly timeUnixNano?: string | undefined
  readonly asDouble?: number | undefined
  readonly asInt?: number | string | undefined
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

const findFrequencyValue = (request: OtlpExportRequest, name: string, key: string): number | string | undefined =>
  findMetric(request, name)?.sum?.dataPoints.find((dataPoint) =>
    dataPoint.attributes.some((attribute) =>
      attribute.key === "key" &&
      Predicate.hasProperty(attribute.value, "stringValue") &&
      attribute.value.stringValue === key
    )
  )?.asInt
