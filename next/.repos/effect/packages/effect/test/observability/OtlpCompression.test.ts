import { assert, describe, it } from "@effect/vitest"
import { Cause, ConfigProvider, Deferred, Effect, Exit, Fiber, Layer, Metric } from "effect"
import { HttpBody, HttpClient, type HttpClientError, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { Otlp, OtlpExporter, OtlpSerialization } from "effect/observability"
import { TestClock } from "effect/testing"

const signals = ["logs", "metrics", "traces"] as const
const largeServiceName = "compression-service-".repeat(150)
const capture = (respond: (attempt: number) => Response = () => new Response()) => {
  const requests: Array<HttpClientRequest.HttpClientRequest> = []
  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      requests.push(request)
      return HttpClientResponse.fromWeb(request, respond(requests.length))
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )
  return { requests, httpClient }
}

const emitAndFlush = Effect.gen(function*() {
  yield* Effect.log("compression log")
  yield* Metric.update(Metric.counter("compression_counter"), 1)
  yield* Effect.void.pipe(Effect.withSpan("compression span"))
  yield* (yield* OtlpExporter.Flusher).flush
})

const configuredLayer = (env: Record<string, string>) =>
  Otlp.layerFromConfig({
    loggerMergeWithExisting: false,
    resource: { serviceName: largeServiceName }
  }).pipe(
    Layer.provide(OtlpSerialization.layerJson),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({
      env: {
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_LOGS_EXPORTER: "otlp",
        OTEL_METRICS_EXPORTER: "otlp",
        OTEL_TRACES_EXPORTER: "otlp",
        OTEL_BLRP_SCHEDULE_DELAY: "3600000",
        OTEL_BSP_SCHEDULE_DELAY: "3600000",
        OTEL_METRIC_EXPORT_INTERVAL: "3600000",
        ...env
      }
    })))
  )

const checkRequests = (
  requests: ReadonlyArray<HttpClientRequest.HttpClientRequest>,
  format: "json" | "protobuf",
  compressed: ReadonlyArray<string>
) => {
  assert.strictEqual(requests.length, 3)
  for (const signal of signals) {
    const request = requests.find((request) => request.url.endsWith("/v1/" + signal))!
    assert.isDefined(request)
    assert.strictEqual(
      request.headers["content-type"],
      format === "json" ? "application/json" : "application/x-protobuf"
    )
    assert.strictEqual(request.headers["content-encoding"], compressed.includes(signal) ? "gzip" : undefined)
  }
}

describe("OTLP compression", () => {
  for (const [format, compression] of [["json", undefined], ["json", "gzip"], ["protobuf", "gzip"]] as const) {
    it.effect(
      format + " aggregate layer exports all signals with " + (compression ?? "default") + " compression",
      () => {
        const { httpClient, requests } = capture()
        const layer = (format === "json" ? Otlp.layerJson : Otlp.layerProtobuf)({
          baseUrl: "http://localhost:4318",
          resource: { serviceName: largeServiceName },
          compression,
          loggerMergeWithExisting: false,
          loggerExportInterval: "1 hour",
          metricsExportInterval: "1 hour",
          tracerExportInterval: "1 hour"
        })
        return Effect.gen(function*() {
          yield* emitAndFlush
          checkRequests(requests, format, compression === "gzip" ? signals : [])
        }).pipe(Effect.provide(layer), Effect.provideService(HttpClient.HttpClient, httpClient))
      }
    )
  }

  it.effect("config uses global compression unless a signal overrides it", () => {
    const { httpClient, requests } = capture()
    return Effect.gen(function*() {
      yield* emitAndFlush
      checkRequests(requests, "json", ["metrics", "traces"])
    }).pipe(
      Effect.provide(
        configuredLayer({
          OTEL_EXPORTER_OTLP_COMPRESSION: "gzip",
          OTEL_EXPORTER_OTLP_LOGS_COMPRESSION: "none",
          OTEL_EXPORTER_OTLP_TRACES_COMPRESSION: "gzip"
        })
      ),
      Effect.provideService(HttpClient.HttpClient, httpClient)
    )
  })

  it.effect("rejects invalid compression config", () => {
    const { httpClient } = capture()
    return Effect.gen(function*() {
      const exit = yield* Effect.exit(Effect.void.pipe(
        Effect.provide(configuredLayer({ OTEL_EXPORTER_OTLP_COMPRESSION: "brotli" })),
        Effect.provideService(HttpClient.HttpClient, httpClient)
      ))
      assert(Exit.isFailure(exit))
      assert.include(Cause.pretty(exit.cause), "OTEL_EXPORTER_OTLP_COMPRESSION")
    })
  })

  it.effect("retries reuse the identical compressed request body", () =>
    Effect.gen(function*() {
      const firstAttempt = yield* Deferred.make<void>()
      const { httpClient, requests } = capture((attempt) => {
        if (attempt === 1) Deferred.doneUnsafe(firstAttempt, Exit.void)
        return new Response(null, { status: attempt === 1 ? 429 : 200, headers: { "retry-after": "1" } })
      })
      yield* Effect.gen(function*() {
        const exporter = yield* OtlpExporter.make({
          label: "CompressionTest",
          url: "http://localhost:4318/v1/logs",
          headers: undefined,
          compression: "gzip",
          exportInterval: "1 hour",
          maxBatchSize: 100,
          shutdownTimeout: "1 second",
          body: () => [HttpBody.text(largeServiceName, "application/json"), Effect.void]
        })
        exporter.push(1)
        const fiber = yield* Effect.forkChild((yield* OtlpExporter.Flusher).flush)
        yield* Deferred.await(firstAttempt)
        yield* TestClock.adjust("1 second")
        yield* Fiber.join(fiber)
        assert.strictEqual(requests.length, 2)
        assert.strictEqual(requests[0].headers["content-encoding"], "gzip")
        assert.strictEqual(requests[0].body, requests[1].body)
      }).pipe(
        Effect.scoped,
        Effect.provide(OtlpExporter.layerFlusher),
        Effect.provideService(HttpClient.HttpClient, httpClient)
      )
    }))
})
