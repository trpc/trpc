import { assert, describe, it } from "@effect/vitest"
import { Cause, Clock, Effect, Layer, Tracer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import type { HttpClientError, HttpClientRequest } from "effect/http"
import { OtlpExporter, OtlpLogger, OtlpSerialization } from "effect/observability"
import { TestClock } from "effect/testing"
import * as Version from "effect/Version"

const capture = () => {
  const requests: Array<HttpClientRequest.HttpClientRequest> = []
  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      requests.push(request)
      return HttpClientResponse.fromWeb(request, new Response())
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )
  return { requests, httpClient } as const
}

const bodyOf = (request: HttpClientRequest.HttpClientRequest) => {
  assert(request.body._tag === "Uint8Array")
  return JSON.parse(new TextDecoder().decode(request.body.body))
}

const makeTestLayer = (httpClient: HttpClient.HttpClient) =>
  OtlpLogger.layer({
    url: "http://localhost:4318/v1/logs",
    resource: { serviceName: "test", serviceVersion: "service-version" },
    exportInterval: "1 hour",
    mergeWithExisting: false
  }).pipe(
    Layer.provide(OtlpSerialization.layerJson),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, httpClient))
  )

const logRecordOf = (request: HttpClientRequest.HttpClientRequest) =>
  bodyOf(request).resourceLogs[0].scopeLogs[0].logRecords[0]

const attributesOf = (request: HttpClientRequest.HttpClientRequest) =>
  Object.fromEntries(
    logRecordOf(request).attributes.map(
      (attribute: { key: string; value: Record<string, unknown> }) => [attribute.key, attribute.value]
    )
  )

describe("OtlpLogger", () => {
  it.effect("keeps event time separate from observed time", () => {
    const { httpClient, requests } = capture()
    return Effect.scoped(Effect.gen(function*() {
      const logger = yield* OtlpLogger.make({
        url: "http://localhost:4318/v1/logs",
        resource: { serviceName: "test" },
        exportInterval: "1 hour"
      })
      const fiber = yield* Effect.fiber
      const observedTime = yield* Clock.currentTimeNanos
      logger.log({
        fiber,
        message: "test",
        logLevel: "Info",
        cause: Cause.empty,
        date: new Date(1234)
      })
      yield* (yield* OtlpExporter.Flusher).flush

      const record = logRecordOf(requests[0])
      assert.strictEqual(record.timeUnixNano, "1234000000")
      assert.strictEqual(record.observedTimeUnixNano, observedTime.toString())
    })).pipe(
      Effect.provide(OtlpExporter.layerFlusher),
      Effect.provide(OtlpSerialization.layerJson),
      Effect.provideService(HttpClient.HttpClient, httpClient)
    )
  })

  it.effect("namespaces generated attributes and lets them override annotations", () => {
    const { httpClient, requests } = capture()
    return Effect.gen(function*() {
      const fiber = yield* Effect.fiber
      yield* Effect.gen(function*() {
        yield* TestClock.adjust("5 millis")
        yield* Effect.logError(
          "boom",
          Cause.fail(new TypeError("cause message", { cause: new Error("nested failure") }))
        )
      }).pipe(
        Effect.withLogSpan("op"),
        Effect.annotateLogs({
          "effect.fiberId": -1,
          "effect.log_span.op": -1,
          "exception.type": "annotated type",
          "exception.message": "annotated message",
          "exception.stacktrace": "annotated stack"
        })
      )
      yield* (yield* OtlpExporter.Flusher).flush

      const keys = logRecordOf(requests[0]).attributes.map((attribute: { key: string }) => attribute.key)
      assert.strictEqual(new Set(keys).size, keys.length)
      const attributes = attributesOf(requests[0])
      assert.deepStrictEqual(attributes["effect.fiberId"], { intValue: fiber.id })
      assert.deepStrictEqual(attributes["effect.log_span.op"], { intValue: 5 })
      assert.deepStrictEqual(attributes["exception.type"], { stringValue: "TypeError" })
      assert.deepStrictEqual(attributes["exception.message"], { stringValue: "cause message" })
      assert.include(attributes["exception.stacktrace"].stringValue, "nested failure")
      assert.deepStrictEqual(bodyOf(requests[0]).resourceLogs[0].scopeLogs[0].scope, {
        name: "effect",
        version: Version.getCurrentVersion()
      })
    }).pipe(Effect.provide(makeTestLayer(httpClient)))
  })

  it.effect("pads a 64-bit trace id to 32 hex characters", () => {
    const { httpClient, requests } = capture()
    return Effect.gen(function*() {
      yield* Effect.log("test").pipe(
        Effect.withParentSpan(Tracer.externalSpan({ traceId: "463ac35c9f6413ad", spanId: "0020000000000001" }))
      )
      yield* (yield* OtlpExporter.Flusher).flush

      assert.strictEqual(logRecordOf(requests[0]).traceId, "0000000000000000463ac35c9f6413ad")
    }).pipe(Effect.provide(makeTestLayer(httpClient)))
  })
})
