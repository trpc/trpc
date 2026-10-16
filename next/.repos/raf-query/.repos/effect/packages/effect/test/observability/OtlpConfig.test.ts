import { assert, describe, it } from "@effect/vitest"
import { Array as Arr, ConfigProvider, Context, Effect, Layer, Metric, Ref } from "effect"
import { HttpClient, type HttpClientError, HttpClientResponse } from "effect/http"
import { Otlp, OtlpSerialization } from "effect/observability"
import { TestClock } from "effect/testing"

describe("Otlp.layerFromConfig", () => {
  it.effect("configures exporters from OTEL environment variables", () =>
    Effect.gen(function*() {
      yield* Effect.log("configured log")
      yield* Metric.update(Metric.counter("otel_config_counter"), 1)
      yield* Effect.void.pipe(Effect.withSpan("configured-span"))

      yield* TestClock.adjust("1 second")

      const requests = yield* MockHttpClient.requests
      const logRequest = findRequest(requests, "http://logs.example/custom")
      const metricRequest = findRequest(requests, "http://collector.example/v1/metrics")
      const traceRequest = findRequest(requests, "http://collector.example/v1/traces")

      assert.isDefined(logRequest)
      assert.strictEqual(logRequest!.headers["x-signal"], "logs")
      assert.strictEqual(logRequest!.headers["x-shared"], undefined)

      assert.isDefined(metricRequest)
      assert.strictEqual(metricRequest!.headers["x-shared"], "shared")
      const metric = findMetric(metricRequest!.body as OtlpMetricsBody, "otel_config_counter")
      assert.strictEqual(metric?.sum?.aggregationTemporality, 1)

      assert.isDefined(traceRequest)
      assert.strictEqual(traceRequest!.headers["x-shared"], "shared")
    }).pipe(
      Effect.provide(testLayer({
        OTEL_SERVICE_NAME: "otel-config-test",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.example",
        OTEL_EXPORTER_OTLP_HEADERS: "x-shared=shared",
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "http://logs.example/custom",
        OTEL_EXPORTER_OTLP_LOGS_HEADERS: "x-signal=logs",
        OTEL_LOGS_EXPORTER: "console, OTLP",
        OTEL_METRICS_EXPORTER: " otlp ",
        OTEL_TRACES_EXPORTER: "otlp",
        OTEL_BLRP_MAX_EXPORT_BATCH_SIZE: "1",
        OTEL_BSP_MAX_EXPORT_BATCH_SIZE: "1",
        OTEL_METRIC_EXPORT_INTERVAL: "1000",
        OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: "delta"
      }))
    ))

  it.effect("does not install exporters when OTEL_SDK_DISABLED is true", () =>
    Effect.gen(function*() {
      yield* Effect.log("disabled log")
      yield* Metric.update(Metric.counter("otel_disabled_counter"), 1)
      yield* Effect.void.pipe(Effect.withSpan("disabled-span"))

      yield* TestClock.adjust("1 second")

      const requests = yield* MockHttpClient.requests
      assert.deepStrictEqual(requests, [])
    }).pipe(
      Effect.provide(testLayer({
        OTEL_SDK_DISABLED: "true",
        OTEL_SERVICE_NAME: "otel-config-test",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.example",
        OTEL_LOGS_EXPORTER: "otlp",
        OTEL_METRICS_EXPORTER: "otlp",
        OTEL_TRACES_EXPORTER: "otlp",
        OTEL_BLRP_MAX_EXPORT_BATCH_SIZE: "1",
        OTEL_BSP_MAX_EXPORT_BATCH_SIZE: "1",
        OTEL_METRIC_EXPORT_INTERVAL: "1000"
      }))
    ))
})

interface CapturedRequest {
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: unknown
}

interface OtlpMetricsBody {
  readonly resourceMetrics: Array<{
    readonly scopeMetrics: Array<{
      readonly metrics: Array<OtlpMetric>
    }>
  }>
}

interface OtlpMetric {
  readonly name: string
  readonly sum?: {
    readonly aggregationTemporality: number
  } | undefined
}

class MockHttpClient extends Context.Service<MockHttpClient, {
  readonly requests: Effect.Effect<ReadonlyArray<CapturedRequest>>
}>()("MockHttpClient") {
  static requests = Effect.service(MockHttpClient).pipe(
    Effect.flatMap((client) => client.requests)
  )
}

const testLayer = (env: Record<string, string>) =>
  Otlp.layerFromConfig({ loggerMergeWithExisting: false }).pipe(
    Layer.provide(OtlpSerialization.layerJson),
    Layer.provideMerge(HttpClientLayer),
    Layer.provideMerge(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))
  )

const HttpClientLayer = Layer.effectContext(Effect.gen(function*() {
  const capturedRequests = yield* Ref.make<ReadonlyArray<CapturedRequest>>([])

  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      const body = request.body._tag === "Uint8Array"
        ? JSON.parse(new TextDecoder().decode(request.body.body))
        : undefined
      yield* Ref.update(
        capturedRequests,
        Arr.append({
          url: request.url,
          headers: request.headers,
          body
        })
      )
      return HttpClientResponse.fromWeb(request, new Response())
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )

  return Context.make(HttpClient.HttpClient, httpClient).pipe(
    Context.add(MockHttpClient, MockHttpClient.of({ requests: Ref.get(capturedRequests) }))
  )
}))

const findRequest = (requests: ReadonlyArray<CapturedRequest>, url: string) =>
  requests.find((request) => request.url === url)

const findMetric = (request: OtlpMetricsBody, name: string): OtlpMetric | undefined => {
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
